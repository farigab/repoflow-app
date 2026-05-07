import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { GraphSnapshot, StashEntry, WorkingTreeFile } from '../../core/models';
import { vscode } from '../vscode';

interface StashModalProps {
    snapshot: GraphSnapshot;
    stashes: StashEntry[];
    onClose: () => void;
}

type ActiveTab = 'list' | 'create';
type LocalFileBucket = 'conflict' | 'staged' | 'unstaged';

interface LocalSelectableFile extends WorkingTreeFile {
    buckets: LocalFileBucket[];
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});

function formatDate(input: string): string {
    try {
        return shortDateFormatter.format(new Date(input));
    } catch {
        return input;
    }
}

export function StashModal({ snapshot, stashes, onClose }: StashModalProps) {
    const repoName = snapshot.repoRoot.split(/[/\\]/).pop() ?? snapshot.repoRoot;
    const [activeTab, setActiveTab] = useState<ActiveTab>('list');
    const [stashMessage, setStashMessage] = useState('');
    const [includeUntracked, setIncludeUntracked] = useState(false);
    const [selectedCreateFiles, setSelectedCreateFiles] = useState<string[]>([]);
    const [selectedStashFiles, setSelectedStashFiles] = useState<Record<string, string[]>>({});
    const [expandedCreateFiles, setExpandedCreateFiles] = useState(false);
    const [expandedStashEntries, setExpandedStashEntries] = useState<Record<string, boolean>>({});
    const messageInputRef = useRef<HTMLInputElement>(null);

    const localFiles = useMemo(() => buildLocalFiles(snapshot), [snapshot]);
    const localFileKey = useMemo(() => localFiles.map((file) => `${file.path}:${file.indexStatus}${file.workTreeStatus}`).join('\n'), [localFiles]);
    const untrackedPaths = useMemo(() => localFiles.filter(isUntracked).map((file) => file.path), [localFiles]);
    const eligibleCreatePaths = useMemo(
        () => localFiles.filter((file) => includeUntracked || !isUntracked(file)).map((file) => file.path),
        [includeUntracked, localFiles]
    );
    const eligibleCreateSet = useMemo(() => new Set(eligibleCreatePaths), [eligibleCreatePaths]);
    const selectedCreateCount = selectedCreateFiles.filter((filePath) => eligibleCreateSet.has(filePath)).length;
    const allCreateSelected = eligibleCreatePaths.length > 0 && selectedCreateCount === eligibleCreatePaths.length;
    const shouldAutoExpandCreateFiles = localFiles.length <= 8 || snapshot.localChanges.conflicted.length > 0;

    useEffect(() => {
        if (activeTab === 'create') {
            window.setTimeout(() => messageInputRef.current?.focus(), 0);
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'create' && shouldAutoExpandCreateFiles) {
            setExpandedCreateFiles(true);
        }
    }, [activeTab, shouldAutoExpandCreateFiles]);

    useEffect(() => {
        setSelectedCreateFiles((previous) => {
            const next = previous.filter((filePath) => eligibleCreateSet.has(filePath));
            if (next.length > 0 || eligibleCreatePaths.length === 0) {
                return next;
            }
            return eligibleCreatePaths;
        });
    }, [eligibleCreatePaths, eligibleCreateSet, localFileKey]);

    useEffect(() => {
        setSelectedStashFiles((previous) => {
            const next: Record<string, string[]> = {};
            stashes.forEach((entry) => {
                const available = new Set(entry.files.map((file) => file.path));
                const previousSelection = previous[entry.ref];
                next[entry.ref] = previousSelection
                    ? previousSelection.filter((filePath) => available.has(filePath))
                    : entry.files.map((file) => file.path);
            });
            return next;
        });
    }, [stashes]);

    const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const handleCreateFileToggle = (filePath: string, checked: boolean) => {
        setSelectedCreateFiles((previous) => checked
            ? unique([...previous, filePath])
            : previous.filter((path) => path !== filePath)
        );
    };

    const handleCreateSelectAll = () => {
        setSelectedCreateFiles(allCreateSelected ? [] : eligibleCreatePaths);
    };

    const handleIncludeUntracked = (checked: boolean) => {
        setIncludeUntracked(checked);
        setSelectedCreateFiles((previous) => checked
            ? unique([...previous, ...untrackedPaths])
            : previous.filter((filePath) => !untrackedPaths.includes(filePath))
        );
    };

    const handleStashFileToggle = (entry: StashEntry, filePath: string, checked: boolean) => {
        setSelectedStashFiles((previous) => {
            const current = selectedOrAll(entry, previous);
            return {
                ...previous,
                [entry.ref]: checked
                    ? unique([...current, filePath])
                    : current.filter((path) => path !== filePath)
            };
        });
    };

    const handleStashSelectAll = (entry: StashEntry) => {
        setSelectedStashFiles((previous) => {
            const current = selectedOrAll(entry, previous);
            const allSelected = entry.files.length > 0 && current.length === entry.files.length;
            return {
                ...previous,
                [entry.ref]: allSelected ? [] : entry.files.map((file) => file.path)
            };
        });
    };

    const toggleExpandedEntry = (entryRef: string) => {
        setExpandedStashEntries((previous) => ({
            ...previous,
            [entryRef]: !previous[entryRef]
        }));
    };

    const handleStash = () => {
        vscode.postMessage({
            type: 'stashChanges',
            payload: {
                repoRoot: snapshot.repoRoot,
                message: stashMessage.trim() || undefined,
                includeUntracked,
                paths: selectedCreateFiles.filter((filePath) => eligibleCreateSet.has(filePath))
            }
        });
        setStashMessage('');
        setIncludeUntracked(false);
        setActiveTab('list');
    };

    const handleApply = (entry: StashEntry) => {
        const selectedPaths = selectedOrAll(entry, selectedStashFiles);
        vscode.postMessage({
            type: 'applyStash',
            payload: { repoRoot: snapshot.repoRoot, ref: entry.ref, paths: payloadPathsForStashEntry(entry, selectedPaths) }
        });
    };

    const handlePreview = (entry: StashEntry) => {
        const selectedPaths = selectedOrAll(entry, selectedStashFiles);
        vscode.postMessage({
            type: 'previewStash',
            payload: { repoRoot: snapshot.repoRoot, ref: entry.ref, paths: payloadPathsForStashEntry(entry, selectedPaths) }
        });
    };

    const handlePop = (entry: StashEntry) => {
        const selectedPaths = selectedOrAll(entry, selectedStashFiles);
        vscode.postMessage({
            type: 'popStash',
            payload: { repoRoot: snapshot.repoRoot, ref: entry.ref, paths: payloadPathsForStashEntry(entry, selectedPaths) }
        });
    };

    const handleDrop = (entry: StashEntry) => {
        vscode.postMessage({
            type: 'dropStash',
            payload: { repoRoot: snapshot.repoRoot, ref: entry.ref }
        });
    };

    const stagedCount = snapshot.localChanges.staged.length;
    const unstagedCount = snapshot.localChanges.unstaged.length;
    const conflictedCount = snapshot.localChanges.conflicted.length;
    const hasLocalChanges = localFiles.length > 0;
    const canStash = hasLocalChanges && selectedCreateCount > 0;

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal stash-modal" role="dialog" aria-modal="true" aria-label="Git Stash">
                <header className="modal__header modal__header--hero">
                    <div className="modal__title-group">
                        <span className="modal__eyebrow">{repoName}</span>
                        <h2>Git Stash</h2>
                    </div>
                    <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                        <i className="codicon codicon-close" aria-hidden="true" />
                    </button>
                </header>

                {/* Tab bar */}
                <div className="stash-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'list'}
                        className={`stash-tab${activeTab === 'list' ? ' stash-tab--active' : ''}`}
                        onClick={() => setActiveTab('list')}
                    >
                        <i className="codicon codicon-list-unordered" aria-hidden="true" />
                        Saved stashes
                        {stashes.length > 0 && (
                            <span className="stash-tab__badge">{stashes.length}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'create'}
                        className={`stash-tab${activeTab === 'create' ? ' stash-tab--active' : ''}`}
                        onClick={() => setActiveTab('create')}
                    >
                        <i className="codicon codicon-add" aria-hidden="true" />
                        New stash
                        {hasLocalChanges && (
                            <span className="stash-tab__badge stash-tab__badge--warning">
                                {stagedCount + unstagedCount + conflictedCount}
                            </span>
                        )}
                    </button>
                </div>

                {/* Stash list */}
                {activeTab === 'list' && (
                    <div className="stash-body">
                        {stashes.length === 0 ? (
                            <div className="stash-empty">
                                <i className="codicon codicon-inbox" aria-hidden="true" />
                                <span>No stashes yet</span>
                                <p>Use <strong>New stash</strong> to save your current changes.</p>
                            </div>
                        ) : (
                            <ul className="stash-list" aria-label="Stash entries">
                                {stashes.map((entry) => {
                                    const selectedPaths = selectedOrAll(entry, selectedStashFiles);
                                    const selectedCount = selectedPaths.length;
                                    const hasFileList = entry.files.length > 0;
                                    const canApplySelection = !hasFileList || selectedCount > 0;
                                    const allFilesSelected = hasFileList && selectedCount === entry.files.length;
                                    const filesExpanded = Boolean(expandedStashEntries[entry.ref]);
                                    const selectionStateLabel = !hasFileList
                                        ? 'No file list'
                                        : allFilesSelected
                                            ? 'All files selected'
                                            : selectedCount === 0
                                                ? 'No files selected'
                                                : 'Partial selection';
                                    const selectionStateClassName = !hasFileList || allFilesSelected
                                        ? 'stash-selection-state stash-selection-state--full'
                                        : selectedCount === 0
                                            ? 'stash-selection-state stash-selection-state--empty'
                                            : 'stash-selection-state stash-selection-state--partial';

                                    return (
                                        <li key={entry.ref} className="stash-entry">
                                            <div className="stash-entry__left">
                                                <i className="codicon codicon-archive stash-entry__icon" aria-hidden="true" />
                                            </div>
                                            <div className="stash-entry__info">
                                                <div className="stash-entry__top">
                                                    <code className="stash-entry__ref">{entry.ref}</code>
                                                    {entry.branch && (
                                                        <span className="ref-pill ref-pill--localBranch">
                                                            {entry.branch}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="stash-entry__message">{entry.message}</span>
                                                <span className="stash-entry__date">
                                                    <i className="codicon codicon-calendar" aria-hidden="true" />
                                                    {formatDate(entry.date)}
                                                </span>
                                                {hasFileList ? (
                                                    <div className="stash-entry__files">
                                                        <div className="stash-entry__files-summary">
                                                            <span>
                                                                <strong>{selectedCount}</strong> of <strong>{entry.files.length}</strong> files selected
                                                            </span>
                                                            <span className={selectionStateClassName}>{selectionStateLabel}</span>
                                                            <button type="button" className="stash-inline-btn" onClick={() => toggleExpandedEntry(entry.ref)}>
                                                                <i className={`codicon ${filesExpanded ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} aria-hidden="true" />
                                                                {filesExpanded ? 'Hide files' : 'Choose files'}
                                                            </button>
                                                        </div>
                                                        {filesExpanded ? (
                                                            <div className="stash-selection-card stash-selection-card--nested">
                                                                <div className="stash-selection-card__header">
                                                                    <label className="stash-selection-card__label">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={allFilesSelected}
                                                                            onChange={() => handleStashSelectAll(entry)}
                                                                        />
                                                                        <span>Select all files in this stash</span>
                                                                    </label>
                                                                </div>
                                                                <div className="stash-file-list">
                                                                    {entry.files.map((file) => {
                                                                        const checked = selectedPaths.includes(file.path);
                                                                        const badge = getStatusBadge(file.status);
                                                                        return (
                                                                            <label key={`${entry.ref}:${file.path}`} className={`stash-file${checked ? '' : ' stash-file--disabled'}`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    onChange={(event) => handleStashFileToggle(entry, file.path, event.target.checked)}
                                                                                />
                                                                                <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                                                                                <FilePathText path={file.path} originalPath={file.originalPath} />
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="stash-entry__actions">
                                                <button
                                                    type="button"
                                                    className="stash-action-btn"
                                                    onClick={() => handlePreview(entry)}
                                                    title="Preview selected changes"
                                                    disabled={!canApplySelection}
                                                >
                                                    <i className="codicon codicon-diff" aria-hidden="true" />
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    className="stash-action-btn stash-action-btn--primary"
                                                    onClick={() => handleApply(entry)}
                                                    title="Apply — restore changes without removing from stash list"
                                                    disabled={!canApplySelection}
                                                >
                                                    <i className="codicon codicon-run" aria-hidden="true" />
                                                    Apply
                                                </button>
                                                <button
                                                    type="button"
                                                    className="stash-action-btn"
                                                    onClick={() => handlePop(entry)}
                                                    title="Pop — restore changes and remove from stash list"
                                                    disabled={!canApplySelection}
                                                >
                                                    <i className="codicon codicon-arrow-up" aria-hidden="true" />
                                                    Pop
                                                </button>
                                                <button
                                                    type="button"
                                                    className="stash-action-btn stash-action-btn--danger"
                                                    onClick={() => handleDrop(entry)}
                                                    title="Drop — permanently delete this stash"
                                                >
                                                    <i className="codicon codicon-trash" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                {/* New stash form */}
                {activeTab === 'create' && (
                    <div className="stash-body stash-body--form">
                        {hasLocalChanges ? (
                            <>
                                <div className="stash-changes-summary">
                                    {stagedCount > 0 && (
                                        <span className="stash-changes-summary__item stash-changes-summary__item--staged">
                                            <i className="codicon codicon-diff-added" aria-hidden="true" />
                                            {stagedCount} staged
                                        </span>
                                    )}
                                    {unstagedCount > 0 && (
                                        <span className="stash-changes-summary__item stash-changes-summary__item--unstaged">
                                            <i className="codicon codicon-diff-modified" aria-hidden="true" />
                                            {unstagedCount} unstaged
                                        </span>
                                    )}
                                    {conflictedCount > 0 && (
                                        <span className="stash-changes-summary__item stash-changes-summary__item--conflict">
                                            <i className="codicon codicon-warning" aria-hidden="true" />
                                            {conflictedCount} conflicted
                                        </span>
                                    )}
                                </div>
                                <div className="stash-selection-card">
                                    <div className="stash-selection-card__header">
                                        <label className="stash-selection-card__label">
                                            <input type="checkbox" checked={allCreateSelected} onChange={handleCreateSelectAll} />
                                            <span><strong>{selectedCreateCount}</strong> of <strong>{eligibleCreatePaths.length}</strong> files selected</span>
                                        </label>
                                        <button type="button" className="stash-inline-btn" onClick={() => setExpandedCreateFiles((expanded) => !expanded)}>
                                            <i className={`codicon ${expandedCreateFiles ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} aria-hidden="true" />
                                            {expandedCreateFiles ? 'Hide files' : 'Review files'}
                                        </button>
                                    </div>
                                    {expandedCreateFiles ? (
                                        <div className="stash-file-list">
                                            {localFiles.map((file) => {
                                                const disabled = !includeUntracked && isUntracked(file);
                                                const checked = selectedCreateFiles.includes(file.path) && !disabled;
                                                const badge = getStatusBadge(file.indexStatus === '?' || file.workTreeStatus === '?' ? '?' : (file.indexStatus !== '.' ? file.indexStatus : file.workTreeStatus));
                                                return (
                                                    <label key={`local-${file.path}`} className={`stash-file${disabled ? ' stash-file--disabled' : ''}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={disabled}
                                                            onChange={(event) => handleCreateFileToggle(file.path, event.target.checked)}
                                                        />
                                                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                                                        <FilePathText path={file.path} originalPath={file.originalPath} />
                                                        <span className="stash-file__tags">
                                                            {file.buckets.includes('staged') ? <span className="stash-file__tag stash-file__tag--staged">staged</span> : null}
                                                            {file.buckets.includes('unstaged') ? <span className="stash-file__tag stash-file__tag--unstaged">unstaged</span> : null}
                                                            {file.buckets.includes('conflict') ? <span className="stash-file__tag stash-file__tag--conflict">conflict</span> : null}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    {!includeUntracked && untrackedPaths.length > 0 ? (
                                        <p className="stash-file-note">Enable “Include untracked files” to select untracked paths.</p>
                                    ) : null}
                                </div>
                            </>
                        ) : (
                            <div className="stash-no-changes">
                                <i className="codicon codicon-check" aria-hidden="true" />
                                <span>Working tree is clean — nothing to stash.</span>
                            </div>
                        )}

                        <div className="stash-form">
                            <label className="stash-form__label" htmlFor="stash-message">
                                Message
                                <span className="stash-form__hint">optional</span>
                            </label>
                            <input
                                ref={messageInputRef}
                                id="stash-message"
                                type="text"
                                className="stash-form__input"
                                placeholder="Describe what you are stashing…"
                                value={stashMessage}
                                onChange={(e) => setStashMessage(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && hasLocalChanges) handleStash(); }}
                                disabled={!hasLocalChanges}
                            />

                            <label className="stash-form__checkbox">
                                <input
                                    type="checkbox"
                                    checked={includeUntracked}
                                    onChange={(e) => handleIncludeUntracked(e.target.checked)}
                                    disabled={!hasLocalChanges}
                                />
                                <span>Include untracked files</span>
                            </label>
                        </div>

                        <footer className="stash-footer">
                            <button type="button" className="stash-footer__cancel" onClick={onClose}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="stash-footer__submit"
                                onClick={handleStash}
                                disabled={!canStash}
                            >
                                <i className="codicon codicon-archive" aria-hidden="true" />
                                Stash Changes
                            </button>
                        </footer>
                    </div>
                )}
            </div>
        </div>
    );
}

function splitPath(filePath: string): { dir: string; name: string } {
    const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return index === -1
        ? { dir: '', name: filePath }
        : { dir: filePath.slice(0, index + 1), name: filePath.slice(index + 1) };
}

function getStatusBadge(status: string): { label: string; cls: string } {
    const code = status.trim().replace(/\d+/g, '').toUpperCase()[0] ?? '?';
    switch (code) {
        case 'M': return { label: 'M', cls: 'status-badge--m' };
        case 'A': return { label: 'A', cls: 'status-badge--a' };
        case 'D': return { label: 'D', cls: 'status-badge--d' };
        case 'R': return { label: 'R', cls: 'status-badge--r' };
        case 'C': return { label: 'C', cls: 'status-badge--r' };
        case 'U': return { label: 'U', cls: 'status-badge--u' };
        case '?': return { label: '?', cls: 'status-badge--u' };
        default: return { label: code, cls: 'status-badge--u' };
    }
}

function isUntracked(file: WorkingTreeFile): boolean {
    return file.indexStatus === '?' || file.workTreeStatus === '?';
}

function addLocalFile(target: Map<string, LocalSelectableFile>, file: WorkingTreeFile, bucket: LocalFileBucket): void {
    const existing = target.get(file.path);
    if (!existing) {
        target.set(file.path, { ...file, buckets: [bucket] });
        return;
    }

    if (!existing.buckets.includes(bucket)) {
        existing.buckets.push(bucket);
    }
    if (existing.indexStatus === '.' && file.indexStatus !== '.') {
        existing.indexStatus = file.indexStatus;
    }
    if (existing.workTreeStatus === '.' && file.workTreeStatus !== '.') {
        existing.workTreeStatus = file.workTreeStatus;
    }
    existing.conflicted = existing.conflicted || file.conflicted;
}

function buildLocalFiles(snapshot: GraphSnapshot): LocalSelectableFile[] {
    const files = new Map<string, LocalSelectableFile>();
    snapshot.localChanges.conflicted.forEach((file) => addLocalFile(files, file, 'conflict'));
    snapshot.localChanges.staged.forEach((file) => addLocalFile(files, file, 'staged'));
    snapshot.localChanges.unstaged.forEach((file) => addLocalFile(files, file, 'unstaged'));
    return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function unique(paths: string[]): string[] {
    return [...new Set(paths)];
}

function selectedOrAll(entry: StashEntry, selected: Record<string, string[]>): string[] {
    return selected[entry.ref] ?? entry.files.map((file) => file.path);
}

function payloadPathsForStashEntry(entry: StashEntry, selectedPaths: string[]): string[] | undefined {
    if (entry.files.length === 0 || selectedPaths.length === entry.files.length) {
        return undefined;
    }
    return selectedPaths;
}

function FilePathText({ path: filePath, originalPath }: { path: string; originalPath?: string }) {
    const { dir, name } = splitPath(filePath);
    return (
        <span className="stash-file__path">
            <strong>{name}</strong>
            {dir ? <span>{dir}</span> : null}
            {originalPath ? <span className="stash-file__rename">from {originalPath}</span> : null}
        </span>
    );
}
