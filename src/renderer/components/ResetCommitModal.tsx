import { useState } from 'react';
import type { CommitSummary, GraphSnapshot } from '../../core/models';
import { vscode } from '../vscode';

type ResetMode = 'soft' | 'mixed' | 'hard';

interface ResetCommitModalProps {
    snapshot: GraphSnapshot;
    commit: CommitSummary;
    onClose: () => void;
}

const MODE_COPY: Record<ResetMode, { title: string; detail: string }> = {
    soft: {
        title: 'Soft',
        detail: 'Move HEAD only and keep changes staged.'
    },
    mixed: {
        title: 'Mixed',
        detail: 'Move HEAD and keep changes in the working tree.'
    },
    hard: {
        title: 'Hard',
        detail: 'Move HEAD and discard local changes.'
    }
};

export function ResetCommitModal({ snapshot, commit, onClose }: ResetCommitModalProps) {
    const [mode, setMode] = useState<ResetMode>('mixed');

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        vscode.postMessage({
            type: 'resetToMode',
            payload: {
                repoRoot: snapshot.repoRoot,
                commitHash: commit.hash,
                mode
            }
        });
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal" role="dialog" aria-modal="true" aria-label="Reset To Commit">
                <header className="modal__header modal__header--hero">
                    <div className="modal__title-group">
                        <span className="modal__eyebrow">History rewrite</span>
                        <h2>Reset To Commit</h2>
                    </div>
                    <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                        <i className="codicon codicon-close" aria-hidden="true" />
                    </button>
                </header>

                <form className="modal__body" onSubmit={handleSubmit}>
                    <section className="settings-section">
                        <h3 className="settings-section__title">Target</h3>
                        <div className="commit-modal__summary-card commit-modal__summary-card--stack">
                            <strong>{commit.shortHash}</strong>
                            <span>{commit.subject}</span>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h3 className="settings-section__title">Reset Mode</h3>
                        <div className="reset-modal__options">
                            {(Object.keys(MODE_COPY) as ResetMode[]).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    className={`reset-modal__option${mode === option ? ' reset-modal__option--active' : ''}${option === 'hard' ? ' reset-modal__option--danger' : ''}`}
                                    onClick={() => setMode(option)}
                                >
                                    <strong>{MODE_COPY[option].title}</strong>
                                    <span>{MODE_COPY[option].detail}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="delete-confirm">
                        <i className="codicon codicon-warning delete-confirm__icon" aria-hidden="true" />
                        <div>
                            <strong>{mode === 'hard' ? 'Hard reset can discard local work.' : 'This rewrites the current branch pointer.'}</strong>
                            <p>{MODE_COPY[mode].detail}</p>
                        </div>
                    </div>

                    <div className="pr-actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="pr-actions__submit">
                            <i className="codicon codicon-debug-restart" aria-hidden="true" />
                            Reset ({MODE_COPY[mode].title})
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
