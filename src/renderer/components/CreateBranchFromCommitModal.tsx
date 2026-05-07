import { useMemo, useState } from 'react';
import type { CommitSummary, GraphSnapshot } from '../../core/models';
import { vscode } from '../vscode';

type BranchKind = 'feature' | 'hotfix' | 'release' | 'other';

interface CreateBranchFromCommitModalProps {
    snapshot: GraphSnapshot;
    commit: CommitSummary;
    onClose: () => void;
}

function buildBranchName(kind: BranchKind, rawValue: string): string {
    const trimmed = rawValue.trim().replace(/^\/+/, '');
    if (!trimmed) {
        return '';
    }

    if (kind === 'other') {
        return trimmed;
    }

    const prefix = `${kind}/`;
    return trimmed.toLowerCase().startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
}

export function CreateBranchFromCommitModal({ snapshot, commit, onClose }: CreateBranchFromCommitModalProps) {
    const [kind, setKind] = useState<BranchKind>('feature');
    const [value, setValue] = useState('');
    const branchName = useMemo(() => buildBranchName(kind, value), [kind, value]);

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!branchName) {
            return;
        }

        vscode.postMessage({
            type: 'createBranch',
            payload: {
                repoRoot: snapshot.repoRoot,
                branchName,
                fromRef: commit.hash
            }
        });
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Create Branch From Commit">
                <header className="modal__header modal__header--hero">
                    <div className="modal__title-group">
                        <span className="modal__eyebrow">Commit action</span>
                        <h2>Create Branch</h2>
                    </div>
                    <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                        <i className="codicon codicon-close" aria-hidden="true" />
                    </button>
                </header>

                <form className="modal__body" onSubmit={handleSubmit}>
                    <section className="settings-section">
                        <h3 className="settings-section__title">Base Commit</h3>
                        <div className="commit-modal__summary-card commit-modal__summary-card--stack">
                            <strong>{commit.shortHash}</strong>
                            <span>{commit.subject}</span>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h3 className="settings-section__title">Branch Name</h3>
                        <div className="branches-create-popover__types" role="group" aria-label="Branch type">
                            {(['feature', 'hotfix', 'release', 'other'] as BranchKind[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    className={`branches-create-popover__type${kind === item ? ' branches-create-popover__type--active' : ''}`}
                                    onClick={() => setKind(item)}
                                >
                                    {item === 'other' ? 'Other' : `${item}/`}
                                </button>
                            ))}
                        </div>

                        <label className="commit-modal__field" htmlFor="create-branch-from-commit">
                            <span className="settings-row__label">Name</span>
                            <input
                                id="create-branch-from-commit"
                                className="settings-input settings-input--wide"
                                type="text"
                                value={value}
                                onChange={(event) => setValue(event.target.value)}
                                placeholder={kind === 'other' ? 'chore/update-deps' : `name after ${kind}/`}
                                autoFocus
                                spellCheck={false}
                            />
                        </label>

                        <div className="branches-create-popover__preview">
                            <span className="branches-create-popover__preview-label">Preview</span>
                            <code>{branchName || 'Type a branch name'}</code>
                        </div>
                    </section>

                    <div className="pr-actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="pr-actions__submit" disabled={!branchName}>
                            <i className="codicon codicon-git-branch-create" aria-hidden="true" />
                            Create and checkout
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
