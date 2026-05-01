export interface DiffRequest {
  repoRoot: string;
  commitHash: string;
  parentHash?: string;
  filePath: string;
  originalPath?: string;
}

export interface DiffViewPayload {
  request: DiffRequest;
  title: string;
  filePath: string;
  originalPath?: string;
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  unifiedDiff: string;
}
