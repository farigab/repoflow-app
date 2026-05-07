import { useMemo, useState } from 'react';
import type { GraphSnapshot } from '../../core/models';
import { vscode } from '../vscode';

interface CommitChangesModalProps {
    snapshot: GraphSnapshot;
    onClose: () => void;
}

export function CommitChangesModal({ snapshot, onClose }: CommitChangesModalProps) {
    const stagedCount = snapshot.localChanges.staged.length;
    const [message, setMessage] = useState('');
    const [amend, setAmend] = useState(false);

    const placeholder = useMemo(() => {
        const branch = snapshot.localChanges.currentBranch?.trim();
        return branch ? `Update ${branch}` : 'Describe this commit';
    }, [snapshot.localChanges.currentBranch]);

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            return;
        }

        vscode.postMessage({
            type: 'commitChanges',
            payload: {
                repoRoot: snapshot.repoRoot,
                message: trimmedMessage,
                amend
            }
        });
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Commit Changes">
                <header className="modal__header modal__header--hero">
                    <div className="modal__title-group">
                        <span className="modal__eyebrow">Working tree</span>
                        <h2>Commit Changes</h2>
                    </div>
                    <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                        <i className="codicon codicon-close" aria-hidden="true" />
                    </button>
                </header>

                <form className="modal__body" onSubmit={handleSubmit}>
                    <section className="settings-section">
                        <h3 className="settings-section__title">Summary</h3>
                        <div className="commit-modal__summary">
                            <div className="commit-modal__summary-card">
                                <span className="commit-modal__summary-label">Staged files</span>
                                <strong>{stagedCount}</strong>
                            </div>
                            <div className="commit-modal__summary-card">
                                <span className="commit-modal__summary-label">Branch</span>
                                <strong>{snapshot.localChanges.currentBranch ?? 'detached HEAD'}</strong>
                            </div>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h3 className="settings-section__title">Message</h3>
                        <label className="commit-modal__field" htmlFor="commit-message">
                            <span className="settings-row__label">Commit message</span>
                            <textarea
                                id="commit-message"
                                className="pr-description commit-modal__textarea"
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                placeholder={placeholder}
                                rows={4}
                                autoFocus
                            />
                        </label>
                        <label className="stash-form__checkbox commit-modal__checkbox">
                            <input
                                type="checkbox"
                                checked={amend}
                                onChange={(event) => setAmend(event.target.checked)}
                            />
                            <span>Amend the latest commit</span>
                        </label>
                    </section>

                    <div className="pr-actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="pr-actions__submit" disabled={!message.trim() || stagedCount === 0}>
                            <i className="codicon codicon-check" aria-hidden="true" />
                            {amend ? 'Amend Commit' : 'Create Commit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
