interface RepositorySelectionScreenProps {
  hero?: string;
  onOpenSingle: () => void;
}

export function RepositorySelectionScreen({
  hero,
  onOpenSingle
}: Readonly<RepositorySelectionScreenProps>) {
  return (
    <section className="repo-selector">
      <div className="repo-selector__panel panel">
        <div className="repo-selector__content">
          <div className="repo-selector__intro">
            {hero ? <img className="repo-selector__hero" src={hero} alt="RepoFlow" /> : null}
            <span className="panel__eyebrow">Workspace</span>
            <h1>Open a repository</h1>
            <p>
              Start with one repository. When you open more later, RepoFlow keeps them organized as tabs in the same window.
            </p>
          </div>

          <div className="repo-selector__actions">
            <button type="button" className="repo-selector__action repo-selector__action--primary" onClick={onOpenSingle}>
              <span className="repo-selector__action-icon">
                <i className="codicon codicon-folder-opened" aria-hidden="true" />
              </span>
              <span className="repo-selector__action-copy">
                <strong>Open repository</strong>
                <span>Pick a local folder and switch between repositories from the tab bar.</span>
              </span>
              <span className="repo-selector__action-trailing" aria-hidden="true">
                <i className="codicon codicon-arrow-right" />
              </span>
            </button>
          </div>
        </div>

        <div className="repo-selector__footer" aria-label="Highlights">
          <span>Local-first desktop workflow</span>
          <span>Multi-repository tabs</span>
          <span>Focused Git history view</span>
        </div>
      </div>
    </section>
  );
}
