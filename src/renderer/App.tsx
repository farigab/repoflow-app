import type { CSSProperties, ReactNode, RefObject } from 'react';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BranchCompareResult,
  CommitDetail,
  CommitFileChange,
  CommitSummary,
  DiffRequest,
  DiffViewPayload,
  GraphFilters,
  GraphSnapshot,
  StashEntry,
  UndoEntry,
  WorkingTreeFile,
  WorktreeEntry
} from '../core/models';
import type { ExtensionToWebviewMessage, RepositoryTabDescriptor } from '../shared/protocol';
import { BranchCompareModal } from './components/BranchCompareModal';
import { BranchesModal } from './components/BranchesModal';
import { CommitChangesModal } from './components/CommitChangesModal';
import { CommitDetails } from './components/CommitDetails';
import { CreateBranchFromCommitModal } from './components/CreateBranchFromCommitModal';
import { CreatePRModal } from './components/CreatePRModal';
import { DeleteBranchesModal } from './components/DeleteBranchesModal';
import { DiffViewer } from './components/DiffViewer';
import { GraphCanvas } from './components/GraphCanvas';
import { LocalChangesPanel } from './components/LocalChangesPanel';
import { RepoSettingsModal } from './components/RepoSettingsModal';
import { RepositorySelectionScreen } from './components/RepositorySelectionScreen';
import { RepositoryTabs } from './components/RepositoryTabs';
import { ResetCommitModal } from './components/ResetCommitModal';
import { StashModal } from './components/StashModal';
import { UndoModal } from './components/UndoModal';
import { WorktreeModal } from './components/WorktreeModal';
import { useResizableSplit } from './hooks/useResizableSplit';
import { vscode } from './vscode';

interface ContextMenuState {
  commit: CommitSummary;
  x: number;
  y: number;
}

const DEFAULT_FILTERS: GraphFilters = {
  includeRemotes: true,
  limit: 200
};

function areFiltersEqual(left: GraphFilters, right: GraphFilters): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pruneSnapshots(
  snapshots: Record<string, GraphSnapshot>,
  entries: RepositoryTabDescriptor[]
): Record<string, GraphSnapshot> {
  const allowedRoots = new Set(entries.map((entry) => entry.repoRoot));
  const next: Record<string, GraphSnapshot> = {};

  for (const [repoRoot, snapshot] of Object.entries(snapshots)) {
    if (allowedRoots.has(repoRoot)) {
      next[repoRoot] = snapshot;
    }
  }

  return next;
}

export function App() {
  const [repositoryTabs, setRepositoryTabs] = useState<RepositoryTabDescriptor[]>([]);
  const [activeRepoRoot, setActiveRepoRoot] = useState<string>();
  const [snapshotsByRepo, setSnapshotsByRepo] = useState<Record<string, GraphSnapshot>>({});
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string>();
  const [selectedCommit, setSelectedCommit] = useState<CommitDetail | null>(null);
  const [busy, setBusy] = useState<{ value: boolean; label?: string }>({ value: false });
  const [notification, setNotification] = useState<{ kind: 'info' | 'error'; message: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [deleteBranchesOpen, setDeleteBranchesOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [branchCompareOpen, setBranchCompareOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [createBranchCommit, setCreateBranchCommit] = useState<CommitSummary | null>(null);
  const [resetCommit, setResetCommit] = useState<CommitSummary | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([]);
  const [compareResult, setCompareResult] = useState<BranchCompareResult | null>(null);
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const [worktreeError, setWorktreeError] = useState<{ message: string; path?: string; canForce?: boolean } | null>(null);
  const [diffView, setDiffView] = useState<DiffViewPayload | null>(null);
  const [isUncommittedSelected, setIsUncommittedSelected] = useState(false);
  const [isCommitDetailsOpen, setIsCommitDetailsOpen] = useState(false);
  const requestedCommitHashRef = useRef<string | undefined>(undefined);
  const activeRepoRootRef = useRef<string | undefined>(undefined);

  const activeSnapshot = activeRepoRoot ? snapshotsByRepo[activeRepoRoot] ?? null : null;

  const deferredFilters = {
    ...filters,
    search: useDeferredValue(filters.search),
    author: useDeferredValue(filters.author)
  } satisfies GraphFilters;

  useEffect(() => {
    activeRepoRootRef.current = activeRepoRoot;
  }, [activeRepoRoot]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'repositoryTabs':
          setRepositoryTabs(message.payload.entries);
          setActiveRepoRoot(message.payload.activeRepoRoot);
          setSnapshotsByRepo((current) => pruneSnapshots(current, message.payload.entries));
          return;
        case 'graphSnapshot':
          setSnapshotsByRepo((current) => ({
            ...current,
            [message.payload.repoRoot]: message.payload
          }));

          if (!activeRepoRootRef.current || activeRepoRootRef.current === message.payload.repoRoot) {
            setFilters(message.payload.filters);
          }
          return;
        case 'commitDetail':
          if (message.payload.repoRoot !== activeRepoRootRef.current) {
            return;
          }
          if (requestedCommitHashRef.current && requestedCommitHashRef.current !== message.payload.detail.hash) {
            return;
          }
          setSelectedCommit(message.payload.detail);
          setSelectedCommitHash(message.payload.detail.hash);
          setIsCommitDetailsOpen(true);
          return;
        case 'diffView':
          setDiffView(message.payload);
          return;
        case 'revealCommit': {
          const { commitHash } = message.payload;
          requestedCommitHashRef.current = commitHash;
          setSelectedCommitHash(commitHash);
          setIsCommitDetailsOpen(true);
          window.setTimeout(() => {
            document.querySelector(`[data-hash="${commitHash}"]`)
              ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 50);
          return;
        }
        case 'busy':
          setBusy(message.payload);
          return;
        case 'notification':
          setNotification(message.payload);
          window.setTimeout(() => setNotification(null), 3000);
          return;
        case 'stashList':
          if (message.payload.repoRoot !== activeRepoRootRef.current) {
            return;
          }
          setStashes(message.payload.entries);
          return;
        case 'worktreeList':
          if (message.payload.repoRoot !== activeRepoRootRef.current) {
            return;
          }
          setWorktrees(message.payload.entries);
          setWorktreeError(null);
          return;
        case 'worktreeError':
          if (message.payload.repoRoot !== activeRepoRootRef.current) {
            return;
          }
          setWorktreeError(message.payload);
          return;
        case 'branchCompareResult':
          setCompareResult(message.payload);
          return;
        case 'undoEntries':
          setUndoEntries(message.payload.entries);
          return;
        default:
          return;
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    requestedCommitHashRef.current = undefined;
    setSelectedCommit(null);
    setSelectedCommitHash(undefined);
    setIsUncommittedSelected(false);
    setIsCommitDetailsOpen(false);
    setContextMenu(null);
    setSettingsOpen(false);
    setPrOpen(false);
    setBranchesOpen(false);
    setDeleteBranchesOpen(false);
    setStashOpen(false);
    setStashes([]);
    setWorktreeOpen(false);
    setWorktrees([]);
    setBranchCompareOpen(false);
    setUndoOpen(false);
    setCommitModalOpen(false);
    setCreateBranchCommit(null);
    setResetCommit(null);
    setCompareResult(null);
    setUndoEntries([]);
    setWorktreeError(null);
  }, [activeRepoRoot]);

  useEffect(() => {
    if (activeSnapshot) {
      setFilters(activeSnapshot.filters);
      return;
    }

    setFilters(DEFAULT_FILTERS);
  }, [activeSnapshot]);

  useEffect(() => {
    if (!activeSnapshot || isUncommittedSelected) {
      return;
    }

    if (!selectedCommitHash || !activeSnapshot.rows.some((row) => row.commit.hash === selectedCommitHash)) {
      setSelectedCommitHash(undefined);
      return;
    }
  }, [activeSnapshot, selectedCommitHash, isUncommittedSelected]);

  useEffect(() => {
    if (!activeSnapshot) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (!areFiltersEqual(activeSnapshot.filters, deferredFilters)) {
        startTransition(() => {
          vscode.postMessage({
            type: 'applyFilters',
            payload: { repoRoot: activeSnapshot.repoRoot, filters: deferredFilters }
          });
        });
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [deferredFilters, activeSnapshot]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const assets = useMemo(() => window.__REPOFLOW_ASSETS__ ?? {}, []);
  const { leftPercent, containerRef, onDividerMouseDown } = useResizableSplit(62);
  const showSidebar = Boolean(activeSnapshot) && (isUncommittedSelected || isCommitDetailsOpen);

  const handleOpenSingleRepository = useCallback((): void => {
    vscode.postMessage({ type: 'openRepositoryPicker', payload: { allowMultiple: false } });
  }, []);

  const handleOpenMultipleRepositories = useCallback((): void => {
    vscode.postMessage({ type: 'openRepositoryPicker', payload: { allowMultiple: true } });
  }, []);

  const handleSwitchRepository = useCallback((repoRoot: string): void => {
    vscode.postMessage({ type: 'switchRepositoryTab', payload: { repoRoot } });
  }, []);

  const handleCloseRepository = useCallback((repoRoot: string): void => {
    vscode.postMessage({ type: 'closeRepositoryTab', payload: { repoRoot } });
  }, []);

  const handleSelectCommit = useCallback((commit: CommitSummary): void => {
    if (!activeSnapshot) {
      return;
    }

    if (requestedCommitHashRef.current === commit.hash && isCommitDetailsOpen) {
      setIsCommitDetailsOpen(false);
      setSelectedCommit(null);
      setSelectedCommitHash(undefined);
      requestedCommitHashRef.current = undefined;
      vscode.postMessage({ type: 'clearSelectedCommit', payload: { repoRoot: activeSnapshot.repoRoot } });
      return;
    }

    setIsUncommittedSelected(false);
    requestedCommitHashRef.current = commit.hash;
    setSelectedCommitHash(commit.hash);
    setIsCommitDetailsOpen(true);
    vscode.postMessage({
      type: 'selectCommit',
      payload: { repoRoot: activeSnapshot.repoRoot, commitHash: commit.hash }
    });
  }, [activeSnapshot, isCommitDetailsOpen]);

  const handleOpenDiff = useCallback((file: CommitFileChange, detail: CommitDetail): void => {
    if (!activeSnapshot) {
      return;
    }

    const request: DiffRequest = {
      repoRoot: activeSnapshot.repoRoot,
      commitHash: detail.hash,
      parentHash: detail.parentHashes[0],
      filePath: file.path,
      originalPath: file.originalPath
    };

    vscode.postMessage({ type: 'openDiff', payload: request });
  }, [activeSnapshot]);

  const handleSelectUncommitted = useCallback((): void => {
    if (!activeSnapshot) {
      return;
    }

    setIsUncommittedSelected(true);
    setIsCommitDetailsOpen(false);
    setSelectedCommit(null);
    requestedCommitHashRef.current = undefined;
    setSelectedCommitHash(undefined);
    vscode.postMessage({ type: 'clearSelectedCommit', payload: { repoRoot: activeSnapshot.repoRoot } });
  }, [activeSnapshot]);

  const handleStageFile = useCallback((file: WorkingTreeFile): void => {
    if (!activeSnapshot) return;
    vscode.postMessage({ type: 'stageFile', payload: { repoRoot: activeSnapshot.repoRoot, file } });
  }, [activeSnapshot]);

  const handleUnstageFile = useCallback((file: WorkingTreeFile): void => {
    if (!activeSnapshot) return;
    vscode.postMessage({ type: 'unstageFile', payload: { repoRoot: activeSnapshot.repoRoot, file } });
  }, [activeSnapshot]);

  const handleDiscardFile = useCallback((file: WorkingTreeFile): void => {
    if (!activeSnapshot) return;
    vscode.postMessage({ type: 'discardFile', payload: { repoRoot: activeSnapshot.repoRoot, file } });
  }, [activeSnapshot]);

  const handleCommit = useCallback((): void => {
    if (!activeSnapshot) return;
    setCommitModalOpen(true);
  }, [activeSnapshot]);

  const handleContextAction = useCallback((action: 'checkout' | 'cherryPick' | 'revert' | 'drop' | 'createBranch' | 'merge' | 'rebase' | 'reset' | 'copyHash' | 'copySubject' | 'openTerminal'): void => {
    if (!activeSnapshot || !contextMenu) {
      return;
    }

    switch (action) {
      case 'createBranch':
        setCreateBranchCommit(contextMenu.commit);
        break;
      case 'checkout':
        vscode.postMessage({ type: 'checkoutCommit', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'cherryPick':
        vscode.postMessage({ type: 'cherryPick', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'revert':
        vscode.postMessage({ type: 'revertCommit', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'drop':
        vscode.postMessage({ type: 'dropCommit', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'merge':
        vscode.postMessage({ type: 'mergeCommit', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'rebase':
        vscode.postMessage({ type: 'rebaseOnCommit', payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash } });
        break;
      case 'reset':
        setResetCommit(contextMenu.commit);
        break;
      case 'copyHash':
        vscode.postMessage({ type: 'copyHash', payload: { hash: contextMenu.commit.hash } });
        break;
      case 'copySubject':
        vscode.postMessage({ type: 'copySubject', payload: { subject: contextMenu.commit.subject } });
        break;
      case 'openTerminal':
        vscode.postMessage({
          type: 'openInTerminal',
          payload: { repoRoot: activeSnapshot.repoRoot, commitHash: contextMenu.commit.hash }
        });
        break;
      default:
        break;
    }

    setContextMenu(null);
  }, [activeSnapshot, contextMenu]);

  const handleOpenContextMenu = useCallback((commit: CommitSummary, point: { x: number; y: number }) => {
    setContextMenu({ commit, ...point });
  }, []);

  const handleLoadMore = useCallback((limit: number) => {
    if (!activeSnapshot) {
      return;
    }

    vscode.postMessage({ type: 'loadMore', payload: { repoRoot: activeSnapshot.repoRoot, limit } });
  }, [activeSnapshot]);

  const handleBannerAction = useCallback((action: 'continue' | 'skip' | 'abort' | 'pull' | 'push' | 'fetch') => {
    if (!activeSnapshot) return;
    const repoRoot = activeSnapshot.repoRoot;
    const state = activeSnapshot.localChanges.specialState ?? '';
    if (action === 'continue') vscode.postMessage({ type: 'continueOperation', payload: { repoRoot, state } });
    else if (action === 'skip') vscode.postMessage({ type: 'skipOperation', payload: { repoRoot } });
    else if (action === 'abort') vscode.postMessage({ type: 'abortOperation', payload: { repoRoot, state } });
    else if (action === 'pull') vscode.postMessage({ type: 'pullRepo', payload: { repoRoot } });
    else if (action === 'push') vscode.postMessage({ type: 'pushRepo', payload: { repoRoot } });
    else if (action === 'fetch') vscode.postMessage({ type: 'fetchRepo', payload: { repoRoot } });
  }, [activeSnapshot]);

  const handleOpenConflictFile = useCallback((filePath: string) => {
    if (!activeSnapshot) return;
    vscode.postMessage({ type: 'openFile', payload: { repoRoot: activeSnapshot.repoRoot, filePath } });
  }, [activeSnapshot]);

  const handleOpenStashModal = useCallback(() => {
    if (activeSnapshot) {
      vscode.postMessage({ type: 'listStashes', payload: { repoRoot: activeSnapshot.repoRoot } });
    }
    setStashOpen(true);
  }, [activeSnapshot]);

  const handleOpenWorktreeModal = useCallback(() => {
    if (activeSnapshot) {
      vscode.postMessage({ type: 'listWorktrees', payload: { repoRoot: activeSnapshot.repoRoot } });
    }
    setWorktreeOpen(true);
  }, [activeSnapshot]);

  const handleOpenBranchCompareModal = useCallback(() => {
    setCompareResult(null);
    setBranchCompareOpen(true);
  }, []);

  const handleOpenUndoModal = useCallback(() => {
    if (activeSnapshot) {
      vscode.postMessage({ type: 'listUndoEntries', payload: { repoRoot: activeSnapshot.repoRoot } });
    }
    setUndoOpen(true);
  }, [activeSnapshot]);

  const handleCloseCommitDetails = useCallback(() => {
    if (activeSnapshot) {
      vscode.postMessage({ type: 'clearSelectedCommit', payload: { repoRoot: activeSnapshot.repoRoot } });
    }
    setIsCommitDetailsOpen(false);
    setSelectedCommit(null);
    setSelectedCommitHash(undefined);
    requestedCommitHashRef.current = undefined;
  }, [activeSnapshot]);

  let content: ReactNode;

  if (!activeRepoRoot) {
    content = (
      <RepositorySelectionScreen
        hero={assets.hero}
        onOpenSingle={handleOpenSingleRepository}
      />
    );
  } else if (!activeSnapshot) {
    content = (
      <section className="repo-content repo-content--loading">
        <div className="loading-card panel">
          {assets.hero ? <img className="loading-card__hero" src={assets.hero} alt="RepoFlow" /> : null}
          <h1>RepoFlow</h1>
          <p>Loading repository graph...</p>
        </div>
      </section>
    );
  } else {
    content = (
      <section
        className={`layout${showSidebar ? '' : ' layout--details-collapsed'}`}
        ref={containerRef as RefObject<HTMLElement>}
        style={{
          '--layout-left': `${showSidebar ? leftPercent : 100}%`,
          '--layout-right': `${showSidebar ? 100 - leftPercent : 0}%`
        } as CSSProperties}
      >
        <GraphCanvas
          snapshot={activeSnapshot}
          selectedCommitHash={selectedCommitHash}
          selectedUncommitted={isUncommittedSelected}
          onSelectCommit={handleSelectCommit}
          onSelectUncommitted={handleSelectUncommitted}
          onOpenContextMenu={handleOpenContextMenu}
          onLoadMore={handleLoadMore}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPR={() => setPrOpen(true)}
          onOpenBranches={() => setBranchesOpen(true)}
          onOpenDeleteBranches={() => setDeleteBranchesOpen(true)}
          onOpenStashModal={handleOpenStashModal}
          onOpenWorktreeModal={handleOpenWorktreeModal}
          onOpenBranchCompareModal={handleOpenBranchCompareModal}
          onOpenUndoModal={handleOpenUndoModal}
          onBannerAction={handleBannerAction}
          onOpenConflictFile={handleOpenConflictFile}
        />

        {showSidebar ? <div className="resizer" onMouseDown={onDividerMouseDown} /> : null}
        {showSidebar ? (
          <aside className="sidebar">
            {isUncommittedSelected && (activeSnapshot.localChanges.staged.length + activeSnapshot.localChanges.unstaged.length + activeSnapshot.localChanges.conflicted.length) > 0
              ? <LocalChangesPanel
                status={activeSnapshot.localChanges}
                onStage={handleStageFile}
                onUnstage={handleUnstageFile}
                onDiscard={handleDiscardFile}
                onCommit={handleCommit}
              />
              : <CommitDetails
                detail={selectedCommit}
                repoRoot={activeSnapshot.repoRoot}
                onOpenDiff={handleOpenDiff}
                onClose={handleCloseCommitDetails}
              />
            }
          </aside>
        ) : null}
      </section>
    );
  }

  return (
    <main className="shell">
      {repositoryTabs.length > 0 ? (
        <RepositoryTabs
          entries={repositoryTabs}
          activeRepoRoot={activeRepoRoot}
          snapshotsByRepo={snapshotsByRepo}
          onSelect={handleSwitchRepository}
          onClose={handleCloseRepository}
          onOpenSingle={handleOpenSingleRepository}
          onOpenMultiple={handleOpenMultipleRepositories}
        />
      ) : null}

      {content}

      {contextMenu && activeSnapshot ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => handleContextAction('checkout')}>
            Checkout...
          </button>
          <button type="button" onClick={() => handleContextAction('createBranch')}>
            Create Branch...
          </button>
          <div className="context-menu__separator" />
          <button type="button" onClick={() => handleContextAction('cherryPick')}>
            Cherry Pick...
          </button>
          <button type="button" onClick={() => handleContextAction('revert')}>
            Revert...
          </button>
          <button type="button" onClick={() => handleContextAction('drop')}>
            Drop...
          </button>
          <div className="context-menu__separator" />
          <button type="button" onClick={() => handleContextAction('merge')}>
            Merge into current branch...
          </button>
          <button type="button" onClick={() => handleContextAction('rebase')}>
            Rebase current branch on this Commit...
          </button>
          <button type="button" onClick={() => handleContextAction('reset')}>
            Reset current branch to this Commit...
          </button>
          <div className="context-menu__separator" />
          <button type="button" onClick={() => handleContextAction('copyHash')}>
            Copy Commit Hash to Clipboard
          </button>
          <button type="button" onClick={() => handleContextAction('copySubject')}>
            Copy Commit Subject to Clipboard
          </button>
        </div>
      ) : null}

      {busy.value ? <div className="busy-indicator">{busy.label ?? 'Processing...'}</div> : null}
      {notification ? <div className={`toast toast--${notification.kind}`}>{notification.message}</div> : null}
      {diffView ? (
        <DiffViewer
          diff={diffView}
          onClose={() => setDiffView(null)}
        />
      ) : null}
      {settingsOpen && activeSnapshot ? (
        <RepoSettingsModal
          snapshot={activeSnapshot}
          filters={filters}
          onChangeFilters={setFilters}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {prOpen && activeSnapshot ? (
        <CreatePRModal
          snapshot={activeSnapshot}
          onClose={() => setPrOpen(false)}
        />
      ) : null}
      {branchesOpen && activeSnapshot ? (
        <BranchesModal
          snapshot={activeSnapshot}
          onClose={() => setBranchesOpen(false)}
        />
      ) : null}
      {deleteBranchesOpen && activeSnapshot ? (
        <DeleteBranchesModal
          snapshot={activeSnapshot}
          onClose={() => setDeleteBranchesOpen(false)}
        />
      ) : null}
      {stashOpen && activeSnapshot ? (
        <StashModal
          snapshot={activeSnapshot}
          stashes={stashes}
          onClose={() => setStashOpen(false)}
        />
      ) : null}
      {worktreeOpen && activeSnapshot ? (
        <WorktreeModal
          repoRoot={activeSnapshot.repoRoot}
          entries={worktrees}
          branches={activeSnapshot.branches}
          busy={busy.value}
          worktreeError={worktreeError}
          onClose={() => { setWorktreeOpen(false); setWorktreeError(null); }}
        />
      ) : null}
      {branchCompareOpen && activeSnapshot ? (
        <BranchCompareModal
          snapshot={activeSnapshot}
          result={compareResult}
          onClose={() => setBranchCompareOpen(false)}
        />
      ) : null}
      {undoOpen && activeSnapshot ? (
        <UndoModal
          snapshot={activeSnapshot}
          entries={undoEntries}
          onClose={() => setUndoOpen(false)}
        />
      ) : null}
      {commitModalOpen && activeSnapshot ? (
        <CommitChangesModal
          snapshot={activeSnapshot}
          onClose={() => setCommitModalOpen(false)}
        />
      ) : null}
      {createBranchCommit && activeSnapshot ? (
        <CreateBranchFromCommitModal
          snapshot={activeSnapshot}
          commit={createBranchCommit}
          onClose={() => setCreateBranchCommit(null)}
        />
      ) : null}
      {resetCommit && activeSnapshot ? (
        <ResetCommitModal
          snapshot={activeSnapshot}
          commit={resetCommit}
          onClose={() => setResetCommit(null)}
        />
      ) : null}
    </main>
  );
}
