interface RepositorySelectionScreenProps {
  hero?: string;
  onOpenSingle: () => void;
  onOpenMultiple: () => void;
}

export function RepositorySelectionScreen({
  hero,
  onOpenSingle,
  onOpenMultiple
}: RepositorySelectionScreenProps) {
  return (
    <section className="repo-selector">
      <div className="repo-selector__panel panel">
        <div className="repo-selector__intro">
          {hero ? <img className="repo-selector__hero" src={hero} alt="RepoFlow" /> : null}
          <span className="panel__eyebrow">Workspace</span>
          <h1>Choose what to open</h1>
          <p>
            Start with one repository or open several repositories and move between them with tabs.
          </p>
        </div>

        <div className="repo-selector__actions">
          <button type="button" className="repo-selector__action repo-selector__action--primary" onClick={onOpenSingle}>
            <span className="repo-selector__action-icon">
              <i className="codicon codicon-folder-opened" aria-hidden="true" />
            </span>
            <span className="repo-selector__action-copy">
              <strong>Open one repository</strong>
              <span>Ideal when you want to focus on a single history graph.</span>
            </span>
          </button>

          <button type="button" className="repo-selector__action" onClick={onOpenMultiple}>
            <span className="repo-selector__action-icon">
              <i className="codicon codicon-files" aria-hidden="true" />
            </span>
            <span className="repo-selector__action-copy">
              <strong>Open multiple repositories</strong>
              <span>Compare and navigate across repositories through tabs in the same window.</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
