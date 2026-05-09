interface RepositorySelectionScreenProps {
  onOpenSingle: () => void;
}

export function RepositorySelectionScreen({
  onOpenSingle
}: Readonly<RepositorySelectionScreenProps>) {
  return (
    <section className="repo-selector">
      <div className="repo-selector__panel panel">
        <div className="repo-selector__content">
          <div className="repo-selector__main">
            <div className="repo-selector__brand">
              <span className="repo-selector__mark" aria-hidden="true">
                <i className="codicon codicon-source-control" />
              </span>
              <span>RepoFlow</span>
            </div>

            <div className="repo-selector__intro">
              <span className="panel__eyebrow">Git desktop</span>
              <h1>Open a repository</h1>
              <p>
                Work from a local repository with history, branches, worktrees, and pending changes in one focused surface.
              </p>
            </div>

            <div className="repo-selector__actions">
              <button type="button" className="repo-selector__action repo-selector__action--primary" onClick={onOpenSingle}>
                <span className="repo-selector__action-icon">
                  <i className="codicon codicon-folder-opened" aria-hidden="true" />
                </span>
                <span className="repo-selector__action-copy">
                  <strong>Open repository</strong>
                  <span>Choose a folder from this machine.</span>
                </span>
                <span className="repo-selector__action-trailing" aria-hidden="true">
                  <i className="codicon codicon-arrow-right" />
                </span>
              </button>
            </div>

            <div className="repo-selector__footer" aria-label="Highlights">
              <span>Local repositories</span>
              <span>Commit graph</span>
              <span>Working tree</span>
            </div>
          </div>

          <div className="repo-selector__preview" aria-hidden="true">
            <div className="repo-selector__preview-toolbar">
              <span />
              <span />
              <span />
            </div>
            <div className="repo-selector__preview-body">
              <div className="repo-selector__preview-rail">
                <span className="repo-selector__preview-line repo-selector__preview-line--a" />
                <span className="repo-selector__preview-line repo-selector__preview-line--b" />
                <span className="repo-selector__preview-node repo-selector__preview-node--one" />
                <span className="repo-selector__preview-node repo-selector__preview-node--two" />
                <span className="repo-selector__preview-node repo-selector__preview-node--three" />
                <span className="repo-selector__preview-node repo-selector__preview-node--four" />
              </div>
              <span className="repo-selector__preview-row repo-selector__preview-row--active">
                <span>Update branch compare flow</span>
                <small>main - 4m ago</small>
              </span>
              <span className="repo-selector__preview-row">
                <span>Refine worktree actions</span>
                <small>feature/worktrees - 18m ago</small>
              </span>
              <span className="repo-selector__preview-row">
                <span>Normalize repository state</span>
                <small>main - 1h ago</small>
              </span>
              <span className="repo-selector__preview-row">
                <span>Render diff viewer controls</span>
                <small>ui/diff - 2h ago</small>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
