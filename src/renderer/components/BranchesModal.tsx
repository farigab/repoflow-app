import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { BranchSummary, GraphSnapshot } from '../../core/models';
import { vscode } from '../vscode';

interface BranchesModalProps {
  snapshot: GraphSnapshot;
  onClose: () => void;
}

type BranchTreeNode = BranchTreeFolderNode | BranchTreeLeafNode;
type GitflowBranchType = 'feature' | 'hotfix' | 'release' | 'other';

interface BranchTreeFolderNode {
  key: string;
  label: string;
  type: 'section' | 'folder';
  children: BranchTreeNode[];
  branchCount: number;
}

interface BranchTreeLeafNode {
  key: string;
  label: string;
  type: 'branch';
  branch: BranchSummary;
}

interface BranchContextMenuState {
  branch: BranchSummary;
  x: number;
  y: number;
}

interface BranchActionState {
  canCheckout: boolean;
  canMerge: boolean;
  canDelete: boolean;
}

function compareLabel(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareBranches(left: BranchSummary, right: BranchSummary): number {
  if (left.current && !right.current) return -1;
  if (!left.current && right.current) return 1;
  return compareLabel(left.shortName, right.shortName);
}

function sortTreeNodes(nodes: BranchTreeNode[]): BranchTreeNode[] {
  const folders = nodes
    .filter((node): node is BranchTreeFolderNode => node.type !== 'branch')
    .sort((left, right) => compareLabel(left.label, right.label))
    .map((node) => ({
      ...node,
      children: sortTreeNodes(node.children)
    }));

  const branches = nodes
    .filter((node): node is BranchTreeLeafNode => node.type === 'branch')
    .sort((left, right) => compareBranches(left.branch, right.branch));

  return [...folders, ...branches];
}

function buildBranchTree(branches: BranchSummary[]): BranchTreeFolderNode[] {
  const localRoot: BranchTreeFolderNode = {
    key: 'local-root',
    label: 'Local',
    type: 'section',
    children: [],
    branchCount: 0
  };

  const remoteRoot: BranchTreeFolderNode = {
    key: 'remote-root',
    label: 'Remote',
    type: 'section',
    children: [],
    branchCount: 0
  };

  const insertBranch = (root: BranchTreeFolderNode, branch: BranchSummary, parts: string[]) => {
    root.branchCount += 1;

    let currentFolder = root;
    for (let i = 0; i < parts.length; i += 1) {
      const segment = parts[i];
      const isLeaf = i === parts.length - 1;
      const nextKey = `${currentFolder.key}/${segment}`;

      if (isLeaf) {
        currentFolder.children.push({
          key: nextKey,
          label: segment,
          type: 'branch',
          branch
        });
        return;
      }

      let nextFolder = currentFolder.children.find(
        (child): child is BranchTreeFolderNode => child.type !== 'branch' && child.label === segment
      );

      if (!nextFolder) {
        nextFolder = {
          key: nextKey,
          label: segment,
          type: 'folder',
          children: [],
          branchCount: 0
        };
        currentFolder.children.push(nextFolder);
      }

      nextFolder.branchCount += 1;
      currentFolder = nextFolder;
    }
  };

  for (const branch of branches) {
    const parts = branch.shortName.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    insertBranch(branch.remote ? remoteRoot : localRoot, branch, parts);
  }

  return [localRoot, remoteRoot]
    .filter((root) => root.branchCount > 0)
    .map((root) => ({
      ...root,
      children: sortTreeNodes(root.children)
    }));
}

function buildDefaultExpandedKeys(branches: BranchSummary[], roots: BranchTreeFolderNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const root of roots) {
    expanded.add(root.key);
  }

  const currentBranch = branches.find((branch) => branch.current && !branch.remote);
  if (currentBranch) {
    let prefix = 'local-root';
    expanded.add(prefix);
    for (const segment of currentBranch.shortName.split('/').slice(0, -1)) {
      prefix = `${prefix}/${segment}`;
      expanded.add(prefix);
    }
  }

  const upstream = currentBranch?.upstream?.replace(/^refs\/remotes\//, '');
  if (upstream) {
    let prefix = 'remote-root';
    expanded.add(prefix);
    for (const segment of upstream.split('/').slice(0, -1)) {
      prefix = `${prefix}/${segment}`;
      expanded.add(prefix);
    }
  }

  const remoteNames = Array.from(new Set(
    branches.filter((branch) => branch.remote).map((branch) => branch.shortName.split('/')[0]).filter(Boolean)
  ));
  if (remoteNames.length <= 2) {
    for (const remoteName of remoteNames) {
      expanded.add(`remote-root/${remoteName}`);
    }
  }

  return expanded;
}

function flattenFolderKeys(nodes: BranchTreeNode[], keys = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type === 'branch') {
      continue;
    }
    keys.add(node.key);
    flattenFolderKeys(node.children, keys);
  }
  return keys;
}

function buildBranchMeta(branch: BranchSummary): string | undefined {
  const parts: string[] = [];

  if (branch.current) {
    parts.push('current');
  }

  if (branch.upstream) {
    parts.push(`-> ${branch.upstream.replace(/^refs\/remotes\//, '')}`);
  }

  if (branch.ahead && branch.ahead > 0) {
    parts.push(`${branch.ahead} ahead`);
  }

  if (branch.behind && branch.behind > 0) {
    parts.push(`${branch.behind} behind`);
  }

  return parts.length > 0 ? parts.join('  ') : undefined;
}

function getBranchRefForCheckout(branch: BranchSummary): string {
  return branch.remote ? branch.name : branch.shortName;
}

function getBranchRefForMerge(branch: BranchSummary): string {
  return branch.remote ? branch.name : branch.shortName;
}

function getBranchRefForCreate(branch: BranchSummary): string {
  return branch.shortName;
}

function splitRemoteBranch(branch: BranchSummary): { remote: string; branchName: string } | undefined {
  if (!branch.remote) {
    return undefined;
  }

  const [remote, ...rest] = branch.shortName.split('/');
  if (!remote || rest.length === 0) {
    return undefined;
  }

  return {
    remote,
    branchName: rest.join('/')
  };
}

function normalizeGitflowSuffix(type: Exclude<GitflowBranchType, 'other'>, raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, '');
  const normalizedPrefix = `${type}/`;
  if (trimmed.toLowerCase().startsWith(normalizedPrefix)) {
    return trimmed.slice(normalizedPrefix.length);
  }
  return trimmed;
}

function buildGitflowBranchName(type: GitflowBranchType, value: string): string {
  if (type === 'other') {
    return value.trim();
  }

  const suffix = normalizeGitflowSuffix(type, value);
  return suffix ? `${type}/${suffix}` : '';
}

function getBranchActionState(branch: BranchSummary): BranchActionState {
  const isCurrentLocal = branch.current && !branch.remote;

  return {
    canCheckout: !isCurrentLocal,
    canMerge: !isCurrentLocal,
    canDelete: !isCurrentLocal
  };
}

function getDeleteLabel(branch: BranchSummary): string {
  return branch.remote ? 'Delete Remote Branch' : 'Delete Branch';
}

function getCreatePanelTitle(fromRef: string): string {
  return fromRef ? `Create from ${fromRef}` : 'Create branch';
}

interface TreeRendererParams {
  expandedKeys: Set<string>;
  menuBranchName?: string;
  onToggle: (key: string) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, branch: BranchSummary) => void;
  onCheckoutBranch: (branch: BranchSummary) => void;
  onMergeBranch: (branch: BranchSummary) => void;
  onDeleteBranch: (branch: BranchSummary) => void;
}

function renderTreeNode(
  node: BranchTreeNode,
  depth: number,
  params: TreeRendererParams
): ReactNode {
  const paddingLeft = `${0.8 + depth * 1.1}rem`;

  if (node.type === 'branch') {
    const meta = buildBranchMeta(node.branch);
    const actions = getBranchActionState(node.branch);
    const isMenuTarget = params.menuBranchName === node.branch.name;

    return (
      <li
        key={node.key}
        className={`branch-tree__item branch-tree__item--branch${node.branch.current ? ' branch-tree__item--current' : ''}${isMenuTarget ? ' branch-tree__item--menu-target' : ''}`}
      >
        <div
          className="branch-tree__row branch-tree__row--branch"
          style={{ paddingLeft }}
          onContextMenu={(event) => params.onOpenContextMenu(event, node.branch)}
        >
          <span className="branch-tree__chevron branch-tree__chevron--placeholder" aria-hidden="true" />
          <i className={`codicon ${node.branch.remote ? 'codicon-remote' : 'codicon-git-branch'} branch-tree__icon`} aria-hidden="true" />
          <span className="branch-tree__label" title={node.branch.shortName}>{node.label}</span>
          {meta ? <span className="branch-tree__meta">{meta}</span> : null}
          <div className="branch-tree__actions">
            <button
              type="button"
              className="branch-tree__action-btn"
              title="Checkout Branch"
              aria-label="Checkout Branch"
              disabled={!actions.canCheckout}
              onClick={(event) => {
                event.stopPropagation();
                params.onCheckoutBranch(node.branch);
              }}
            >
              <i className="codicon codicon-arrow-right" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="branch-tree__action-btn"
              title="Merge Branch into Current"
              aria-label="Merge Branch into Current"
              disabled={!actions.canMerge}
              onClick={(event) => {
                event.stopPropagation();
                params.onMergeBranch(node.branch);
              }}
            >
              <i className="codicon codicon-git-merge" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="branch-tree__action-btn branch-tree__action-btn--danger"
              title={getDeleteLabel(node.branch)}
              aria-label={getDeleteLabel(node.branch)}
              disabled={!actions.canDelete}
              onClick={(event) => {
                event.stopPropagation();
                params.onDeleteBranch(node.branch);
              }}
            >
              <i className="codicon codicon-trash" aria-hidden="true" />
            </button>
          </div>
        </div>
      </li>
    );
  }

  const expanded = params.expandedKeys.has(node.key);

  return (
    <li key={node.key} className="branch-tree__item">
      <button
        type="button"
        className={`branch-tree__row branch-tree__row--folder${node.type === 'section' ? ' branch-tree__row--section' : ''}`}
        style={{ paddingLeft }}
        onClick={() => params.onToggle(node.key)}
        aria-expanded={expanded}
      >
        <i className={`codicon ${expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'} branch-tree__chevron`} aria-hidden="true" />
        <i
          className={`codicon ${
            node.type === 'section'
              ? node.label === 'Remote'
                ? 'codicon-remote'
                : 'codicon-source-control'
              : expanded
                ? 'codicon-folder-opened'
                : 'codicon-folder'
          } branch-tree__icon`}
          aria-hidden="true"
        />
        <span className="branch-tree__label">{node.label}</span>
        <span className="branch-tree__count">{node.branchCount}</span>
      </button>

      {expanded ? (
        <ul className="branch-tree__list">
          {node.children.map((child) => renderTreeNode(child, depth + 1, params))}
        </ul>
      ) : null}
    </li>
  );
}

export function BranchesModal({ snapshot, onClose }: BranchesModalProps) {
  const sortedBranches = useMemo(() => [...snapshot.branches].sort(compareBranches), [snapshot.branches]);
  const localBranchOptions = useMemo(
    () => sortedBranches.filter((branch) => !branch.remote),
    [sortedBranches]
  );
  const remoteBranchOptions = useMemo(
    () => sortedBranches.filter((branch) => branch.remote),
    [sortedBranches]
  );
  const currentLocalBranch = useMemo(
    () => localBranchOptions.find((branch) => branch.current),
    [localBranchOptions]
  );
  const roots = useMemo(() => buildBranchTree(sortedBranches), [sortedBranches]);
  const validFolderKeys = useMemo(() => flattenFolderKeys(roots), [roots]);
  const defaultExpandedKeys = useMemo(
    () => buildDefaultExpandedKeys(sortedBranches, roots),
    [sortedBranches, roots]
  );

  const initialFromRef = currentLocalBranch?.shortName
    ?? localBranchOptions[0]?.shortName
    ?? remoteBranchOptions[0]?.shortName
    ?? '';

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(defaultExpandedKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFromRef, setCreateFromRef] = useState<string>(initialFromRef);
  const [createType, setCreateType] = useState<GitflowBranchType>('feature');
  const [createSuffix, setCreateSuffix] = useState('');
  const [customBranchName, setCustomBranchName] = useState('');
  const [branchMenu, setBranchMenu] = useState<BranchContextMenuState | null>(null);

  const createdBranchName = useMemo(
    () => buildGitflowBranchName(createType, createType === 'other' ? customBranchName : createSuffix),
    [createType, createSuffix, customBranchName]
  );

  useEffect(() => {
    setExpandedKeys((current) => {
      const next = new Set<string>();

      for (const key of current) {
        if (validFolderKeys.has(key)) {
          next.add(key);
        }
      }

      for (const key of defaultExpandedKeys) {
        next.add(key);
      }

      return next;
    });
  }, [defaultExpandedKeys, validFolderKeys]);

  useEffect(() => {
    if (!createFromRef && initialFromRef) {
      setCreateFromRef(initialFromRef);
    }
  }, [createFromRef, initialFromRef]);

  useEffect(() => {
    const closeMenus = () => setBranchMenu(null);
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleToggle = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCheckoutBranch = (branch: BranchSummary) => {
    const actions = getBranchActionState(branch);
    if (!actions.canCheckout) {
      return;
    }

    setBranchMenu(null);
    vscode.postMessage({
      type: 'checkoutBranch',
      payload: {
        repoRoot: snapshot.repoRoot,
        ref: getBranchRefForCheckout(branch)
      }
    });
  };

  const handleMergeBranch = (branch: BranchSummary) => {
    const actions = getBranchActionState(branch);
    if (!actions.canMerge) {
      return;
    }

    setBranchMenu(null);
    vscode.postMessage({
      type: 'mergeBranch',
      payload: {
        repoRoot: snapshot.repoRoot,
        ref: getBranchRefForMerge(branch)
      }
    });
  };

  const handleDeleteBranch = (branch: BranchSummary) => {
    const actions = getBranchActionState(branch);
    if (!actions.canDelete) {
      return;
    }

    setBranchMenu(null);

    if (branch.remote) {
      const remoteInfo = splitRemoteBranch(branch);
      if (!remoteInfo) {
        return;
      }

      vscode.postMessage({
        type: 'deleteRemoteBranch',
        payload: {
          repoRoot: snapshot.repoRoot,
          remote: remoteInfo.remote,
          branchName: remoteInfo.branchName
        }
      });
      return;
    }

    vscode.postMessage({
      type: 'deleteBranch',
      payload: {
        repoRoot: snapshot.repoRoot,
        branchName: branch.shortName
      }
    });
  };

  const openCreatePanel = (fromRef?: string) => {
    if (fromRef) {
      setCreateFromRef(fromRef);
    } else if (!createFromRef) {
      setCreateFromRef(initialFromRef);
    }

    setBranchMenu(null);
    setCreateOpen(true);
  };

  const closeCreatePanel = () => {
    setCreateOpen(false);
    setCreateSuffix('');
    setCustomBranchName('');
  };

  const handleCreateBranch = () => {
    if (!createdBranchName) {
      return;
    }

    vscode.postMessage({
      type: 'createBranch',
      payload: {
        repoRoot: snapshot.repoRoot,
        branchName: createdBranchName,
        fromRef: createFromRef || undefined
      }
    });

    closeCreatePanel();
  };

  const handleCreateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && createdBranchName && createFromRef) {
      event.preventDefault();
      handleCreateBranch();
    }
  };

  const handleOpenContextMenu = (event: MouseEvent<HTMLDivElement>, branch: BranchSummary) => {
    event.preventDefault();
    setBranchMenu({
      branch,
      x: event.clientX,
      y: event.clientY
    });
  };

  const contextActions = branchMenu ? getBranchActionState(branchMenu.branch) : undefined;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal branches-modal" role="dialog" aria-modal="true" aria-label="Branches">
        <header className="modal__header">
          <h2>Branches</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            <i className="codicon codicon-close" aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          <section className="settings-section">
            <div className="branches-summary">
              <div className="branches-summary__card">
                <span className="branches-summary__label">Local</span>
                <strong>{localBranchOptions.length}</strong>
              </div>
              <div className="branches-summary__card">
                <span className="branches-summary__label">Remote</span>
                <strong>{remoteBranchOptions.length}</strong>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="branches-tree-header">
              <h3 className="settings-section__title branches-tree-header__title">Tree</h3>
              <button
                type="button"
                className={`branches-tree-header__add${createOpen ? ' branches-tree-header__add--active' : ''}`}
                onClick={() => {
                  if (createOpen) {
                    closeCreatePanel();
                  } else {
                    openCreatePanel();
                  }
                }}
                title="Create Branch"
                aria-label="Create Branch"
              >
                <i className="codicon codicon-add" aria-hidden="true" />
              </button>
            </div>

            {createOpen ? (
              <div className="branches-create-popover">
                <div className="branches-create-popover__header">
                  <strong>{getCreatePanelTitle(createFromRef)}</strong>
                  <button
                    type="button"
                    className="branches-create-popover__close"
                    onClick={closeCreatePanel}
                    aria-label="Close branch creation"
                  >
                    <i className="codicon codicon-close" aria-hidden="true" />
                  </button>
                </div>

                <div className="branches-create-popover__body">
                  <div className="branches-create-popover__row">
                    <label className="settings-row__label" htmlFor="branch-create-from">From</label>
                    <select
                      id="branch-create-from"
                      className="branches-create-popover__select"
                      value={createFromRef}
                      onChange={(event) => setCreateFromRef(event.target.value)}
                    >
                      {localBranchOptions.length > 0 ? (
                        <optgroup label="Local">
                          {localBranchOptions.map((branch) => (
                            <option key={branch.name} value={branch.shortName}>
                              {branch.shortName}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {remoteBranchOptions.length > 0 ? (
                        <optgroup label="Remote">
                          {remoteBranchOptions.map((branch) => (
                            <option key={branch.name} value={branch.shortName}>
                              {branch.shortName}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </div>

                  <div className="branches-create-popover__types" role="group" aria-label="GitFlow branch type">
                    {(['feature', 'hotfix', 'release', 'other'] as GitflowBranchType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`branches-create-popover__type${createType === type ? ' branches-create-popover__type--active' : ''}`}
                        onClick={() => setCreateType(type)}
                      >
                        {type === 'other' ? 'Other' : `${type}/`}
                      </button>
                    ))}
                  </div>

                  {createType === 'other' ? (
                    <input
                      className="branches-create-popover__input"
                      type="text"
                      placeholder="Custom branch name, e.g. chore/update-deps"
                      value={customBranchName}
                      onChange={(event) => setCustomBranchName(event.target.value)}
                      onKeyDown={handleCreateKeyDown}
                      spellCheck={false}
                    />
                  ) : (
                    <input
                      className="branches-create-popover__input"
                      type="text"
                      placeholder={`Name after ${createType}/`}
                      value={createSuffix}
                      onChange={(event) => setCreateSuffix(event.target.value)}
                      onKeyDown={handleCreateKeyDown}
                      spellCheck={false}
                    />
                  )}

                  <div className="branches-create-popover__footer">
                    <div className="branches-create-popover__preview">
                      <span className="branches-create-popover__preview-label">Preview</span>
                      <code>{createdBranchName || 'Type a branch name'}</code>
                    </div>
                    <button
                      type="button"
                      className="branches-create-popover__submit"
                      onClick={handleCreateBranch}
                      disabled={!createdBranchName || !createFromRef}
                    >
                      Create and checkout
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {roots.length === 0 ? (
              <div className="branches-empty">
                <i className="codicon codicon-git-branch" aria-hidden="true" />
                <span>No branches available for this repository.</span>
              </div>
            ) : (
              <div className="branch-tree">
                <ul className="branch-tree__list">
                  {roots.map((root) => renderTreeNode(root, 0, {
                    expandedKeys,
                    menuBranchName: branchMenu?.branch.name,
                    onToggle: handleToggle,
                    onOpenContextMenu: handleOpenContextMenu,
                    onCheckoutBranch: handleCheckoutBranch,
                    onMergeBranch: handleMergeBranch,
                    onDeleteBranch: handleDeleteBranch
                  }))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {branchMenu ? (
          <div
            className="context-menu branches-context-menu"
            style={{ left: branchMenu.x, top: branchMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              disabled={!contextActions?.canCheckout}
              onClick={() => handleCheckoutBranch(branchMenu.branch)}
            >
              Checkout Branch
            </button>
            <button
              type="button"
              onClick={() => openCreatePanel(getBranchRefForCreate(branchMenu.branch))}
            >
              Create Branch From Here...
            </button>
            <button
              type="button"
              disabled={!contextActions?.canMerge}
              onClick={() => handleMergeBranch(branchMenu.branch)}
            >
              Merge Branch into Current
            </button>
            <div className="context-menu__separator" />
            <button
              type="button"
              disabled={!contextActions?.canDelete}
              onClick={() => handleDeleteBranch(branchMenu.branch)}
            >
              {getDeleteLabel(branchMenu.branch)}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
