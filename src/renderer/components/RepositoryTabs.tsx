import type { GraphSnapshot } from '../../core/models';
import type { RepositoryTabDescriptor } from '../../shared/protocol';

interface RepositoryTabsProps {
  entries: RepositoryTabDescriptor[];
  activeRepoRoot?: string;
  snapshotsByRepo: Record<string, GraphSnapshot>;
  onSelect: (repoRoot: string) => void;
  onClose: (repoRoot: string) => void;
  onOpenSingle: () => void;
}

function buildTabMeta(snapshot?: GraphSnapshot): { branch: string; changeCount: number; hasConflicts: boolean } {
  if (!snapshot) {
    return {
      branch: 'Loading...',
      changeCount: 0,
      hasConflicts: false
    };
  }

  const branch = snapshot.localChanges.currentBranch ?? 'HEAD';
  const changeCount =
    snapshot.localChanges.staged.length +
    snapshot.localChanges.unstaged.length +
    snapshot.localChanges.conflicted.length;

  return {
    branch,
    changeCount,
    hasConflicts: snapshot.localChanges.conflicted.length > 0
  };
}

function buildStatusClassName(meta: { changeCount: number; hasConflicts: boolean }): string {
  if (meta.hasConflicts) {
    return 'repo-tab__status repo-tab__status--warning';
  }

  if (meta.changeCount > 0) {
    return 'repo-tab__status repo-tab__status--dirty';
  }

  return 'repo-tab__status';
}

function buildMetaLabel(meta: { branch: string; changeCount: number }): string {
  if (meta.changeCount === 0) {
    return meta.branch;
  }

  const suffix = meta.changeCount > 1 ? 's' : '';
  return `${meta.branch} - ${meta.changeCount} change${suffix}`;
}

export function RepositoryTabs({
  entries,
  activeRepoRoot,
  snapshotsByRepo,
  onSelect,
  onClose,
  onOpenSingle
}: Readonly<RepositoryTabsProps>) {
  return (
    <header className="repo-tabs">
      <div className="repo-tabs__scroller" role="tablist" aria-label="Open repositories">
        {entries.map((entry) => {
          const meta = buildTabMeta(snapshotsByRepo[entry.repoRoot]);
          const statusClassName = buildStatusClassName(meta);
          const metaLabel = buildMetaLabel(meta);
          const isActive = entry.repoRoot === activeRepoRoot;

          return (
            <div key={entry.repoRoot} className={`repo-tab${isActive ? ' repo-tab--active' : ''}`}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="repo-tab__select"
                title={entry.repoRoot}
                onClick={() => onSelect(entry.repoRoot)}
              >
                <span className={statusClassName} />
                <span className="repo-tab__text">
                  <span className="repo-tab__title">{entry.name}</span>
                  <span className="repo-tab__meta">{metaLabel}</span>
                </span>
              </button>
              <button
                type="button"
                className="repo-tab__close"
                title={`Close ${entry.name}`}
                aria-label={`Close ${entry.name}`}
                onClick={() => onClose(entry.repoRoot)}
              >
                <i className="codicon codicon-close" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="repo-tabs__actions">
        <button type="button" className="repo-tabs__action" onClick={onOpenSingle} title="Open repository">
          <i className="codicon codicon-folder-opened" aria-hidden="true" /> Open repository
        </button>
      </div>
    </header>
  );
}
