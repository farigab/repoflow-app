import { useEffect, useRef, useState } from 'react';

interface GraphToolbarProps {
    onOpenSettings: () => void;
    onOpenPR: () => void;
    onOpenBranches: () => void;
    onOpenDeleteBranches: () => void;
    onOpenStashModal: () => void;
    onOpenWorktreeModal: () => void;
    onOpenBranchCompareModal: () => void;
    onOpenUndoModal: () => void;
}

export function GraphToolbar({
    onOpenSettings,
    onOpenPR,
    onOpenBranches,
    onOpenDeleteBranches,
    onOpenStashModal,
    onOpenWorktreeModal,
    onOpenBranchCompareModal,
    onOpenUndoModal
}: GraphToolbarProps) {
    const [moreActionsOpen, setMoreActionsOpen] = useState(false);
    const moreActionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onPointerDown = (event: globalThis.MouseEvent) => {
            if (!moreActionsRef.current) {
                return;
            }

            if (!moreActionsRef.current.contains(event.target as Node)) {
                setMoreActionsOpen(false);
            }
        };

        const onEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMoreActionsOpen(false);
            }
        };

        window.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onEscape);
        return () => {
            window.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onEscape);
        };
    }, []);

    const runMenuAction = (action: () => void) => {
        setMoreActionsOpen(false);
        action();
    };

    return (
        <div className="panel__header-actions" ref={moreActionsRef}>
            <button
                type="button"
                className="panel__settings-btn"
                onClick={onOpenPR}
                title="Create Pull Request"
                aria-label="Create Pull Request"
            >
                <i className="codicon codicon-git-pull-request-create" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="panel__settings-btn"
                onClick={onOpenWorktreeModal}
                title="Worktree Manager"
                aria-label="Worktree Manager"
            >
                <i className="codicon codicon-repo-clone" aria-hidden="true" />
            </button>
            <button
                type="button"
                className="panel__settings-btn"
                onClick={onOpenStashModal}
                title="Git Stash"
                aria-label="Git Stash"
            >
                <i className="codicon codicon-archive" aria-hidden="true" />
            </button>
            <button
                type="button"
                className={`panel__settings-btn${moreActionsOpen ? ' panel__settings-btn--active' : ''}`}
                onClick={() => setMoreActionsOpen((open) => !open)}
                title="More Actions"
                aria-label="More Actions"
                aria-expanded={moreActionsOpen}
                aria-haspopup="menu"
            >
                <i className="codicon codicon-ellipsis" aria-hidden="true" />
            </button>
            {moreActionsOpen ? (
                <div className="panel-actions-menu" role="menu">
                    <button type="button" onClick={() => runMenuAction(onOpenBranches)} role="menuitem">
                        <i className="codicon codicon-git-branch" aria-hidden="true" /> Branches
                    </button>
                    <button type="button" onClick={() => runMenuAction(onOpenBranchCompareModal)} role="menuitem">
                        <i className="codicon codicon-git-compare" aria-hidden="true" /> Compare Branches
                    </button>
                    <button type="button" onClick={() => runMenuAction(onOpenUndoModal)} role="menuitem">
                        <i className="codicon codicon-history" aria-hidden="true" /> Undo Last Operation
                    </button>
                    <button type="button" onClick={() => runMenuAction(onOpenDeleteBranches)} role="menuitem">
                        <i className="codicon codicon-trash" aria-hidden="true" /> Delete Local Branches
                    </button>
                    <button type="button" onClick={() => runMenuAction(onOpenSettings)} role="menuitem">
                        <i className="codicon codicon-settings-gear" aria-hidden="true" /> Repository Settings
                    </button>
                </div>
            ) : null}
        </div>
    );
}
