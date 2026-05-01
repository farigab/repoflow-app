import { useEffect, useMemo, useState } from 'react';
import type { DiffViewPayload } from '../../core/models';

type DiffRowKind = 'context' | 'added' | 'removed' | 'modified' | 'hunk';
type BlockAction = 'revert' | 'stage';

interface DiffViewerProps {
    diff: DiffViewPayload;
    onClose: () => void;
}

interface DiffSideLine {
    number: number;
    text: string;
}

interface SideBySideRow {
    kind: DiffRowKind;
    left?: DiffSideLine;
    right?: DiffSideLine;
    hunk?: string;
    blockId?: number;
    blockStart?: boolean;
}

function splitLines(content: string): string[] {
    if (!content) {
        return [''];
    }

    return content.split(/\r?\n/);
}

function formatHunkLabel(line: string, hiddenLines: number): string {
    const suffix = line.replace(/^@@[^@]+@@\s*/, '').trim();
    const hidden = hiddenLines > 0 ? `${hiddenLines} hidden line${hiddenLines === 1 ? '' : 's'}` : 'changed block';
    return suffix ? `${hidden} | ${suffix}` : `${hidden} | ${line}`;
}

function parseSideBySideRows(unifiedDiff: string): SideBySideRow[] {
    const rows: SideBySideRow[] = [];
    const lines = splitLines(unifiedDiff);
    let leftLine = 0;
    let rightLine = 0;
    let previousLeftEnd = 1;
    let removed: DiffSideLine[] = [];
    let added: DiffSideLine[] = [];
    let blockId = 0;

    const flushChanges = () => {
        if (removed.length === 0 && added.length === 0) {
            return;
        }

        blockId += 1;
        const length = Math.max(removed.length, added.length);
        for (let index = 0; index < length; index += 1) {
            const left = removed[index];
            const right = added[index];
            rows.push({
                kind: left && right ? 'modified' : left ? 'removed' : 'added',
                left,
                right,
                blockId,
                blockStart: index === 0
            });
        }

        removed = [];
        added = [];
    };

    for (const line of lines) {
        const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunkMatch) {
            flushChanges();
            const hunkLeftStart = Number.parseInt(hunkMatch[1], 10);
            const hunkLeftLength = Number.parseInt(hunkMatch[2] ?? '1', 10);
            const hunkRightStart = Number.parseInt(hunkMatch[3], 10);
            const hiddenLines = Math.max(0, hunkLeftStart - previousLeftEnd);

            leftLine = hunkLeftStart;
            rightLine = hunkRightStart;
            previousLeftEnd = hunkLeftStart + hunkLeftLength;
            rows.push({ kind: 'hunk', hunk: formatHunkLabel(line, hiddenLines) });
            continue;
        }

        if (
            !line.startsWith(' ') &&
            !line.startsWith('+') &&
            !line.startsWith('-') &&
            !line.startsWith('\\')
        ) {
            continue;
        }

        if (line.startsWith('---') || line.startsWith('+++')) {
            continue;
        }

        if (line.startsWith(' ')) {
            flushChanges();
            const text = line.slice(1);
            rows.push({
                kind: 'context',
                left: { number: leftLine, text },
                right: { number: rightLine, text }
            });
            leftLine += 1;
            rightLine += 1;
            continue;
        }

        if (line.startsWith('-')) {
            removed.push({ number: leftLine, text: line.slice(1) });
            leftLine += 1;
            continue;
        }

        if (line.startsWith('+')) {
            added.push({ number: rightLine, text: line.slice(1) });
            rightLine += 1;
        }
    }

    flushChanges();
    return rows.length > 0 ? rows : [{ kind: 'context', left: { number: 1, text: 'No textual changes detected.' } }];
}

function copyText(text: string): void {
    if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
        return;
    }

    copyTextFallback(text);
}

function copyTextFallback(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function getBlockText(rows: SideBySideRow[], blockId: number, action: BlockAction): string {
    return rows
        .filter((row) => row.blockId === blockId)
        .map((row) => action === 'revert' ? row.left?.text : row.right?.text)
        .filter((line): line is string => line !== undefined)
        .join('\n');
}

export function DiffViewer({ diff, onClose }: DiffViewerProps) {
    const [actionStatus, setActionStatus] = useState<string | null>(null);
    const rows = useMemo(() => parseSideBySideRows(diff.unifiedDiff), [diff.unifiedDiff]);

    useEffect(() => {
        setActionStatus(null);
    }, [diff]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleBlockAction = (blockId: number, action: BlockAction) => {
        const blockText = getBlockText(rows, blockId, action);
        copyText(blockText);
        setActionStatus(action === 'revert'
            ? 'Before block copied'
            : 'Changed block copied');
        window.setTimeout(() => setActionStatus(null), 1600);
    };

    const renderSide = (side?: DiffSideLine, sideName?: 'left' | 'right', kind?: DiffRowKind) => (
        <div className={`diff-side diff-side--${sideName ?? 'blank'}${kind ? ` diff-side--${kind}` : ''}`}>
            <span className="diff-side__number">{side?.number ?? ''}</span>
            <code className="diff-side__text">{side?.text ?? ' '}</code>
        </div>
    );

    const renderGutter = (row: SideBySideRow) => {
        if (!row.blockId || !row.blockStart) {
            return <div className="diff-change-gutter" aria-hidden="true" />;
        }

        return (
            <div className="diff-change-gutter diff-change-gutter--actions">
                <button
                    type="button"
                    className="diff-gutter-btn"
                    title="Copy before block for revert"
                    aria-label="Copy before block for revert"
                    onClick={() => handleBlockAction(row.blockId ?? 0, 'revert')}
                >
                    <span className="codicon codicon-discard" />
                </button>
                <button
                    type="button"
                    className="diff-gutter-btn"
                    title="Copy changed block for staging"
                    aria-label="Copy changed block for staging"
                    onClick={() => handleBlockAction(row.blockId ?? 0, 'stage')}
                >
                    <span className="codicon codicon-add" />
                </button>
            </div>
        );
    };

    return (
        <div className="modal-backdrop diff-backdrop" onClick={onClose}>
            <section className="modal diff-modal diff-editor-shell" onClick={(event) => event.stopPropagation()}>
                <header className="diff-editor-titlebar">
                    <div className="diff-tab-title diff-tab-title--left">
                        <span className="codicon codicon-diff" aria-hidden="true" />
                        <span>{diff.filePath}</span>
                        <span className="diff-tab-title__muted">{diff.leftLabel}</span>
                    </div>
                    <div className="diff-tab-title diff-tab-title--right">
                        <span className="codicon codicon-diff-added" aria-hidden="true" />
                        <span>{diff.filePath}</span>
                        <span className="diff-tab-title__muted">{diff.rightLabel}</span>
                    </div>
                    <button type="button" className="diff-editor-close" onClick={onClose} aria-label="Close diff">
                        <span className="codicon codicon-close" />
                    </button>
                </header>

                <div className="diff-breadcrumbs">
                    <span>{diff.request.repoRoot}</span>
                    <span className="codicon codicon-chevron-right" aria-hidden="true" />
                    <span>{diff.originalPath && diff.originalPath !== diff.filePath ? `${diff.originalPath} -> ${diff.filePath}` : diff.filePath}</span>
                </div>

                <div className="diff-editor-header" role="row">
                    <div className="diff-pane-title">
                        <span>{diff.leftLabel}</span>
                        <span className="diff-pane-title__path">{diff.originalPath ?? diff.filePath}</span>
                    </div>
                    <div className="diff-center-spacer" aria-hidden="true" />
                    <div className="diff-pane-title">
                        <span>{diff.rightLabel}</span>
                        <span className="diff-pane-title__path">{diff.filePath}</span>
                    </div>
                </div>

                <div className="diff-body diff-body--editor">
                    <div className="diff-side-by-side" role="table" aria-label={diff.title}>
                        {rows.map((row, index) => {
                            if (row.kind === 'hunk') {
                                return (
                                    <div className="diff-sbs-hunk" role="row" key={`hunk:${index}:${row.hunk}`}>
                                        <span className="codicon codicon-chevron-up" aria-hidden="true" />
                                        <span>{row.hunk}</span>
                                    </div>
                                );
                            }

                            return (
                                <div className={`diff-sbs-row diff-sbs-row--${row.kind}`} role="row" key={`row:${index}:${row.left?.number ?? ''}:${row.right?.number ?? ''}`}>
                                    {renderSide(row.left, 'left', row.kind)}
                                    {renderGutter(row)}
                                    {renderSide(row.right, 'right', row.kind)}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {actionStatus ? <div className="diff-action-status">{actionStatus}</div> : null}
            </section>
        </div>
    );
}
