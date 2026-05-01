import { BrowserWindow, clipboard, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { DiffRequest, GraphFilters, RepoSpecialState } from '../core/models';
import { GitCliRepository } from '../infrastructure/git/GitCliRepository';
import type {
  ExtensionToWebviewMessage,
  RepositoryTabDescriptor,
  WebviewToExtensionMessage
} from '../shared/protocol';
import { buildPrUrl, resolvePreferredRemoteForPullRequest } from '../presentation/webview/GitGraphUtils';
import type { DesktopLogger } from './logger';

type MessageType = WebviewToExtensionMessage['type'];
type PayloadFor<T extends MessageType> =
  Extract<WebviewToExtensionMessage, { type: T }> extends { payload: infer P } ? P : undefined;

interface RepositorySession {
  repoRoot: string;
  filters: GraphFilters;
  selectedCommitHash?: string;
  pendingRevealHash?: string;
}

const DEFAULT_FILTERS: GraphFilters = {
  includeRemotes: true,
  limit: 200
};

export class DesktopMessageController {
  private readonly repositorySessions = new Map<string, RepositorySession>();
  private activeRepoRoot?: string;

  public constructor(
    private readonly window: BrowserWindow,
    private readonly repository: GitCliRepository,
    private readonly logger: DesktopLogger
  ) { }

  public getCurrentRepositoryRoot(): string | undefined {
    return this.activeRepoRoot;
  }

  public async openRepository(preferredPath?: string): Promise<boolean> {
    const selectedPaths = preferredPath ? [preferredPath] : await this.pickRepositoryPaths(false);
    return this.openResolvedRepositories(selectedPaths);
  }

  public async openRepositories(preferredPaths?: string[]): Promise<boolean> {
    const selectedPaths = preferredPaths ?? await this.pickRepositoryPaths(true);
    return this.openResolvedRepositories(selectedPaths);
  }

  public async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    const handlers: Partial<{ [K in MessageType]: (payload: PayloadFor<K>) => Promise<void> }> = {
      ready: async () => this.handleReady(),
      openRepositoryPicker: async (p) => this.handleOpenRepositoryPicker(p),
      switchRepositoryTab: async (p) => this.handleSwitchRepositoryTab(p),
      closeRepositoryTab: async (p) => this.handleCloseRepositoryTab(p),
      loadMore: async (p) => this.handleLoadMore(p),
      applyFilters: async (p) => this.handleApplyFilters(p),
      selectCommit: async (p) => this.handleSelectCommit(p),
      clearSelectedCommit: async (p) => this.handleClearSelectedCommit(p),
      openDiff: async (p) => this.showDiff(p),
      createBranchPrompt: async () => this.handleFeatureNeedsModal('Create Branch'),
      deleteBranch: async (p) => this.handleDeleteBranch(p),
      checkoutCommit: async (p) => this.handleCheckoutCommit(p),
      cherryPick: async (p) => this.handleCherryPick(p),
      revertCommit: async (p) => this.handleRevertCommit(p),
      dropCommit: async (p) => this.handleDropCommit(p),
      mergeCommit: async (p) => this.handleMergeCommit(p),
      rebaseOnCommit: async (p) => this.handleRebaseOnCommit(p),
      resetToCommit: async () => this.handleFeatureNeedsModal('Reset Commit'),
      copyHash: async (p) => this.handleCopyHash(p),
      copySubject: async (p) => this.handleCopySubject(p),
      openInTerminal: async (p) => this.handleOpenInTerminal(p),
      stageFile: async (p) => this.handleStageFile(p),
      unstageFile: async (p) => this.handleUnstageFile(p),
      discardFile: async (p) => this.handleDiscardFile(p),
      commitChangesPrompt: async () => this.handleFeatureNeedsModal('Commit Changes'),
      setGitUserName: async (p) => this.handleSetGitUserName(p),
      setGitUserEmail: async (p) => this.handleSetGitUserEmail(p),
      setRemoteUrl: async (p) => this.handleSetRemoteUrl(p),
      openPullRequest: async (p) => this.handleOpenPullRequest(p),
      listStashes: async (p) => this.handleListStashes(p),
      stashChanges: async (p) => this.handleStashChanges(p),
      applyStash: async (p) => this.handleApplyStash(p),
      popStash: async (p) => this.handlePopStash(p),
      dropStash: async (p) => this.handleDropStash(p),
      listWorktrees: async (p) => this.handleListWorktrees(p),
      addWorktree: async (p) => this.handleAddWorktree(p),
      removeWorktree: async (p) => this.handleRemoveWorktree(p),
      openWorktreeInWindow: async (p) => this.handleOpenWorktreeInWindow(p),
      revealWorktreeInOs: async (p) => this.handleRevealWorktreeInOs(p),
      copyWorktreePath: async (p) => this.handleCopyWorktreePath(p),
      lockWorktree: async (p) => this.handleLockWorktree(p),
      unlockWorktree: async (p) => this.handleUnlockWorktree(p),
      moveWorktree: async (p) => this.handleMoveWorktree(p),
      addWorktreeAtCommit: async (p) => this.handleAddWorktreeAtCommit(p),
      continueOperation: async (p) => this.handleContinueOperation(p),
      skipOperation: async (p) => this.handleSkipOperation(p),
      abortOperation: async (p) => this.handleAbortOperation(p),
      pullRepo: async (p) => this.handlePullRepo(p),
      pushRepo: async (p) => this.handlePushRepo(p),
      fetchRepo: async (p) => this.handleFetchRepo(p),
      openFile: async (p) => this.handleOpenFile(p)
    };

    const handler = handlers[message.type];
    if (!handler) {
      return;
    }

    const payload = (message as WebviewToExtensionMessage & { payload?: unknown }).payload;
    await (handler as (p: unknown) => Promise<void>)(payload);
  }

  public async refresh(repoRoot = this.activeRepoRoot): Promise<void> {
    if (repoRoot) {
      this.activeRepoRoot = repoRoot;
    }

    if (!await this.ensureRepositoryRoot()) {
      return;
    }

    const session = this.getActiveSession();
    if (!session) {
      return;
    }

    await this.withBusy('Refreshing Git graph...', async () => {
      let snapshot = await this.repository.getGraph(session.filters);

      if (session.pendingRevealHash) {
        while (
          snapshot.hasMore &&
          !snapshot.rows.some((row) => row.commit.hash === session.pendingRevealHash)
        ) {
          session.filters = { ...session.filters, limit: session.filters.limit + 200 };
          snapshot = await this.repository.getGraph(session.filters);
        }
      }

      await this.postMessage({ type: 'graphSnapshot', payload: snapshot });

      if (session.pendingRevealHash) {
        await this.postMessage({ type: 'revealCommit', payload: { commitHash: session.pendingRevealHash } });
        session.pendingRevealHash = undefined;
      }

      if (session.selectedCommitHash) {
        const detail = await this.repository.getCommitDetail(snapshot.repoRoot, session.selectedCommitHash);
        await this.postMessage({
          type: 'commitDetail',
          payload: { repoRoot: snapshot.repoRoot, detail }
        });
      }
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.appendLine(`[refresh] ${message}`);
      await this.postNotification('error', message);
    });
  }

  public async showDiff(request: DiffRequest): Promise<void> {
    await this.withBusy('Opening diff...', async () => {
      const diffView = await this.repository.getDiffView(request);
      await this.postMessage({ type: 'diffView', payload: diffView });
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.appendLine(`[diff] ${message}`);
      await this.postNotification('error', message);
    });
  }

  private async handleReady(): Promise<void> {
    if (this.activeRepoRoot) {
      await this.postRepositoryTabs();
      await this.refresh(this.activeRepoRoot);
      return;
    }

    const bootstrapRepo = process.env.REPOFLOW_REPO;
    if (bootstrapRepo) {
      await this.openRepository(bootstrapRepo);
      return;
    }

    await this.postRepositoryTabs();
  }

  private async handleOpenRepositoryPicker(payload: PayloadFor<'openRepositoryPicker'>): Promise<void> {
    if (payload.allowMultiple) {
      await this.openRepositories();
      return;
    }

    await this.openRepository();
  }

  private async handleSwitchRepositoryTab(payload: PayloadFor<'switchRepositoryTab'>): Promise<void> {
    if (!this.repositorySessions.has(payload.repoRoot) || this.activeRepoRoot === payload.repoRoot) {
      return;
    }

    this.activeRepoRoot = payload.repoRoot;
    await this.postRepositoryTabs();
    await this.refresh(payload.repoRoot);
  }

  private async handleCloseRepositoryTab(payload: PayloadFor<'closeRepositoryTab'>): Promise<void> {
    const sessionOrder = Array.from(this.repositorySessions.keys());
    const closeIndex = sessionOrder.indexOf(payload.repoRoot);
    if (closeIndex === -1) {
      return;
    }

    const isClosingActive = this.activeRepoRoot === payload.repoRoot;
    this.repositorySessions.delete(payload.repoRoot);

    if (this.repositorySessions.size === 0) {
      this.activeRepoRoot = undefined;
      await this.postRepositoryTabs();
      return;
    }

    if (!isClosingActive) {
      await this.postRepositoryTabs();
      return;
    }

    const remainingRoots = Array.from(this.repositorySessions.keys());
    this.activeRepoRoot = remainingRoots[Math.min(closeIndex, remainingRoots.length - 1)];
    await this.postRepositoryTabs();
    await this.refresh(this.activeRepoRoot);
  }

  private async handleLoadMore(payload: PayloadFor<'loadMore'>): Promise<void> {
    const session = this.repositorySessions.get(payload.repoRoot);
    if (!session || this.activeRepoRoot !== payload.repoRoot) {
      return;
    }

    session.filters = { ...session.filters, limit: payload.limit };
    await this.refresh(payload.repoRoot);
  }

  private async handleApplyFilters(payload: PayloadFor<'applyFilters'>): Promise<void> {
    const session = this.repositorySessions.get(payload.repoRoot);
    if (!session || this.activeRepoRoot !== payload.repoRoot) {
      return;
    }

    session.filters = { ...session.filters, ...payload.filters };
    await this.refresh(payload.repoRoot);
  }

  private async handleSelectCommit(payload: PayloadFor<'selectCommit'>): Promise<void> {
    if (this.activeRepoRoot !== payload.repoRoot) {
      return;
    }

    const session = this.getOrCreateSession(payload.repoRoot);
    session.selectedCommitHash = payload.commitHash;
    const detail = await this.repository.getCommitDetail(payload.repoRoot, payload.commitHash);
    await this.postMessage({
      type: 'commitDetail',
      payload: { repoRoot: payload.repoRoot, detail }
    });
  }

  private async handleClearSelectedCommit(payload: PayloadFor<'clearSelectedCommit'>): Promise<void> {
    const session = this.repositorySessions.get(payload.repoRoot);
    if (!session) {
      return;
    }

    session.selectedCommitHash = undefined;
    session.pendingRevealHash = undefined;
  }

  private async handleDeleteBranch(payload: PayloadFor<'deleteBranch'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Deleting branch...', async () => {
      await this.repository.deleteBranch(payload.repoRoot, payload.branchName);
    });
  }

  private async handleCheckoutCommit(payload: PayloadFor<'checkoutCommit'>): Promise<void> {
    if (!await this.confirm(`Checkout detached HEAD at ${payload.commitHash.slice(0, 8)}?`, 'Checkout')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Checking out commit...', async () => {
      await this.repository.checkout(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleCherryPick(payload: PayloadFor<'cherryPick'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Cherry-picking...', async () => {
      await this.repository.cherryPick(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleRevertCommit(payload: PayloadFor<'revertCommit'>): Promise<void> {
    if (!await this.confirm(`Revert commit ${payload.commitHash.slice(0, 8)}?`, 'Revert')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Reverting commit...', async () => {
      await this.repository.revert(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleDropCommit(payload: PayloadFor<'dropCommit'>): Promise<void> {
    if (!await this.confirm(`Drop commit ${payload.commitHash.slice(0, 8)}? This rewrites history.`, 'Drop')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Dropping commit...', async () => {
      await this.repository.dropCommit(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleMergeCommit(payload: PayloadFor<'mergeCommit'>): Promise<void> {
    if (!await this.confirm(`Merge commit ${payload.commitHash.slice(0, 8)} into the current branch?`, 'Merge')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Merging...', async () => {
      await this.repository.merge(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleRebaseOnCommit(payload: PayloadFor<'rebaseOnCommit'>): Promise<void> {
    if (!await this.confirm(`Rebase current branch onto commit ${payload.commitHash.slice(0, 8)}?`, 'Rebase')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Rebasing...', async () => {
      await this.repository.rebase(payload.repoRoot, payload.commitHash);
    });
  }

  private async handleCopyHash(payload: PayloadFor<'copyHash'>): Promise<void> {
    clipboard.writeText(payload.hash);
    await this.postNotification('info', 'Hash copied to clipboard.');
  }

  private async handleCopySubject(payload: PayloadFor<'copySubject'>): Promise<void> {
    clipboard.writeText(payload.subject);
    await this.postNotification('info', 'Subject copied to clipboard.');
  }

  private async handleOpenInTerminal(payload: PayloadFor<'openInTerminal'>): Promise<void> {
    if (!/^[0-9a-f]{4,40}$/i.test(payload.commitHash)) {
      await this.postNotification('error', 'Invalid commit hash.');
      return;
    }

    const child = spawn(
      'cmd.exe',
      ['/c', 'start', 'RepoFlow', 'cmd.exe', '/k', `git show --stat ${payload.commitHash}`],
      { cwd: payload.repoRoot, detached: true, stdio: 'ignore', windowsHide: false }
    );
    child.unref();
  }

  private async handleStageFile(payload: PayloadFor<'stageFile'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Staging file...', async () => {
      await this.repository.stageFile(payload.repoRoot, payload.file.path);
    });
  }

  private async handleUnstageFile(payload: PayloadFor<'unstageFile'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Unstaging file...', async () => {
      await this.repository.unstageFile(payload.repoRoot, payload.file.path);
    });
  }

  private async handleDiscardFile(payload: PayloadFor<'discardFile'>): Promise<void> {
    if (!await this.confirm(`Discard changes in ${payload.file.path}?`, 'Discard')) {
      return;
    }

    const tracked = payload.file.indexStatus !== '?' && payload.file.workTreeStatus !== '?';
    await this.executeRepositoryAction(payload.repoRoot, 'Discarding changes...', async () => {
      await this.repository.discardFile(payload.repoRoot, payload.file.path, tracked);
    });
  }

  private async handleSetGitUserName(payload: PayloadFor<'setGitUserName'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Saving user.name...', async () => {
      await this.repository.setGitUserName(payload.repoRoot, payload.name);
    });
  }

  private async handleSetGitUserEmail(payload: PayloadFor<'setGitUserEmail'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Saving user.email...', async () => {
      await this.repository.setGitUserEmail(payload.repoRoot, payload.email);
    });
  }

  private async handleSetRemoteUrl(payload: PayloadFor<'setRemoteUrl'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Saving remote URL...', async () => {
      await this.repository.setRemoteUrl(payload.repoRoot, payload.remoteName, payload.url);
    });
  }

  private async handleOpenPullRequest(payload: PayloadFor<'openPullRequest'>): Promise<void> {
    const { repoRoot, sourceBranch, targetBranch, title, description } = payload;
    const [config, branches] = await Promise.all([
      this.repository.getRepoConfig(repoRoot),
      this.repository.getBranches(repoRoot)
    ]);
    const remote = resolvePreferredRemoteForPullRequest(sourceBranch, branches, config.remotes);
    const remoteUrl = remote?.url ?? '';
    const prUrl = buildPrUrl(remoteUrl, sourceBranch, targetBranch, title, description);

    if (!prUrl) {
      await this.postNotification('error', `Could not detect PR URL. Remote: ${remoteUrl || '(none)'}`);
      return;
    }

    await shell.openExternal(prUrl);
  }

  private async handleListStashes(payload: PayloadFor<'listStashes'>): Promise<void> {
    const entries = await this.repository.listStashes(payload.repoRoot);
    await this.postMessage({ type: 'stashList', payload: { repoRoot: payload.repoRoot, entries } });
  }

  private async handleStashChanges(payload: PayloadFor<'stashChanges'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Stashing changes...', async () => {
      await this.repository.stashChanges(payload.repoRoot, payload.message, payload.includeUntracked);
    });
    await this.handleListStashes({ repoRoot: payload.repoRoot });
  }

  private async handleApplyStash(payload: PayloadFor<'applyStash'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Applying stash...', async () => {
      await this.repository.applyStash(payload.repoRoot, payload.ref);
    });
    await this.handleListStashes({ repoRoot: payload.repoRoot });
  }

  private async handlePopStash(payload: PayloadFor<'popStash'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Popping stash...', async () => {
      await this.repository.popStash(payload.repoRoot, payload.ref);
    });
    await this.handleListStashes({ repoRoot: payload.repoRoot });
  }

  private async handleDropStash(payload: PayloadFor<'dropStash'>): Promise<void> {
    if (!await this.confirm(`Drop stash ${payload.ref}?`, 'Drop')) {
      return;
    }

    await this.executeRepositoryAction(payload.repoRoot, 'Dropping stash...', async () => {
      await this.repository.dropStash(payload.repoRoot, payload.ref);
    });
    await this.handleListStashes({ repoRoot: payload.repoRoot });
  }

  private async handleListWorktrees(payload: PayloadFor<'listWorktrees'>): Promise<void> {
    const entries = await this.repository.listWorktrees(payload.repoRoot);
    await this.postMessage({ type: 'worktreeList', payload: { repoRoot: payload.repoRoot, entries } });
  }

  private async handleAddWorktree(payload: PayloadFor<'addWorktree'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Adding worktree...', async () => {
      await this.repository.addWorktree(payload.repoRoot, payload.worktreePath.trim(), payload.branch, payload.createNew);
    });
  }

  private async handleRemoveWorktree(payload: PayloadFor<'removeWorktree'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Removing worktree...', async () => {
      await this.repository.removeWorktree(payload.repoRoot, payload.path, payload.force);
      await this.repository.pruneWorktrees(payload.repoRoot);
    });
  }

  private async handleOpenWorktreeInWindow(payload: PayloadFor<'openWorktreeInWindow'>): Promise<void> {
    if (await this.openRepository(payload.path)) {
      await this.postNotification('info', 'Worktree loaded in the current RepoFlow window.');
    }
  }

  private async handleRevealWorktreeInOs(payload: PayloadFor<'revealWorktreeInOs'>): Promise<void> {
    shell.showItemInFolder(payload.path);
  }

  private async handleCopyWorktreePath(payload: PayloadFor<'copyWorktreePath'>): Promise<void> {
    clipboard.writeText(payload.path);
  }

  private async handleLockWorktree(payload: PayloadFor<'lockWorktree'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Locking worktree...', async () => {
      await this.repository.lockWorktree(payload.repoRoot, payload.path);
    });
  }

  private async handleUnlockWorktree(payload: PayloadFor<'unlockWorktree'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Unlocking worktree...', async () => {
      await this.repository.unlockWorktree(payload.repoRoot, payload.path);
    });
  }

  private async handleMoveWorktree(payload: PayloadFor<'moveWorktree'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Moving worktree...', async () => {
      await this.repository.moveWorktree(payload.repoRoot, payload.path, payload.newPath);
    });
  }

  private async handleAddWorktreeAtCommit(payload: PayloadFor<'addWorktreeAtCommit'>): Promise<void> {
    await this.executeWorktreeAction(payload.repoRoot, 'Adding detached worktree...', async () => {
      await this.repository.addWorktreeAtCommit(payload.repoRoot, payload.worktreePath.trim(), payload.commitHash.trim());
    });
  }

  private async handleContinueOperation(payload: PayloadFor<'continueOperation'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Continuing...', async () => {
      await this.repository.continueOperation(payload.repoRoot, payload.state as RepoSpecialState);
    });
  }

  private async handleSkipOperation(payload: PayloadFor<'skipOperation'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Skipping...', async () => {
      await this.repository.skipRebaseOperation(payload.repoRoot);
    });
  }

  private async handleAbortOperation(payload: PayloadFor<'abortOperation'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Aborting...', async () => {
      await this.repository.abortOperation(payload.repoRoot, payload.state as RepoSpecialState);
    });
  }

  private async handlePullRepo(payload: PayloadFor<'pullRepo'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Pulling...', async () => {
      await this.repository.pull(payload.repoRoot);
    });
  }

  private async handlePushRepo(payload: PayloadFor<'pushRepo'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Pushing...', async () => {
      await this.repository.push(payload.repoRoot);
    });
  }

  private async handleFetchRepo(payload: PayloadFor<'fetchRepo'>): Promise<void> {
    await this.executeRepositoryAction(payload.repoRoot, 'Fetching...', async () => {
      await this.repository.fetch(payload.repoRoot);
    });
  }

  private async handleOpenFile(payload: PayloadFor<'openFile'>): Promise<void> {
    await this.repository.openFile(payload.repoRoot, payload.filePath);
  }

  private async executeRepositoryAction(repoRoot: string, label: string, action: () => Promise<void>): Promise<void> {
    await this.withBusy(label, async () => {
      await action();
      await this.refresh(repoRoot);
      await this.postNotification('info', 'Operation completed successfully.');
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.appendLine(`[ui-error] ${message}`);
      await this.postNotification('error', message);
    });
  }

  private async executeWorktreeAction(repoRoot: string, label: string, action: () => Promise<void>): Promise<void> {
    try {
      await this.withBusy(label, action);
      const entries = await this.repository.listWorktrees(repoRoot);
      await this.postMessage({ type: 'worktreeList', payload: { repoRoot, entries } });
      await this.refresh(repoRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.appendLine(`[worktree] ${message}`);
      await this.postMessage({ type: 'worktreeError', payload: { repoRoot, message } });
    }
  }

  private async ensureRepositoryRoot(): Promise<boolean> {
    if (this.activeRepoRoot && this.repositorySessions.has(this.activeRepoRoot)) {
      return true;
    }

    const nextActive = this.repositorySessions.keys().next().value;
    if (nextActive) {
      this.activeRepoRoot = nextActive;
      await this.postRepositoryTabs();
      return true;
    }

    await this.postRepositoryTabs();
    return false;
  }

  private async openResolvedRepositories(selectedPaths: string[]): Promise<boolean> {
    if (selectedPaths.length === 0) {
      return false;
    }

    const resolvedRoots: string[] = [];
    const errors: string[] = [];

    for (const selectedPath of selectedPaths) {
      try {
        const repoRoot = await this.repository.resolveRepositoryRoot(selectedPath);
        this.getOrCreateSession(repoRoot);
        resolvedRoots.push(repoRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${selectedPath}: ${message}`);
      }
    }

    const uniqueRoots = Array.from(new Set(resolvedRoots));
    if (uniqueRoots.length === 0) {
      if (errors.length > 0) {
        await this.postNotification('error', errors[0]);
      }
      await this.postRepositoryTabs();
      return false;
    }

    this.activeRepoRoot = uniqueRoots[0];
    await this.postRepositoryTabs();
    await this.refresh(this.activeRepoRoot);

    if (errors.length > 0) {
      await this.postNotification('error', errors[0]);
    }

    return true;
  }

  private getActiveSession(): RepositorySession | undefined {
    if (!this.activeRepoRoot) {
      return undefined;
    }

    return this.repositorySessions.get(this.activeRepoRoot);
  }

  private getOrCreateSession(repoRoot: string): RepositorySession {
    const existing = this.repositorySessions.get(repoRoot);
    if (existing) {
      return existing;
    }

    const session: RepositorySession = {
      repoRoot,
      filters: { ...DEFAULT_FILTERS }
    };
    this.repositorySessions.set(repoRoot, session);
    return session;
  }

  private async pickRepositoryPaths(allowMultiple: boolean): Promise<string[]> {
    const properties: Array<'openDirectory' | 'multiSelections'> = allowMultiple
      ? ['openDirectory', 'multiSelections']
      : ['openDirectory'];
    const result = await dialog.showOpenDialog(this.window, {
      title: allowMultiple ? 'Open Git Repositories' : 'Open Git Repository',
      properties
    });

    return result.canceled ? [] : result.filePaths;
  }

  private async postRepositoryTabs(): Promise<void> {
    const entries: RepositoryTabDescriptor[] = Array.from(this.repositorySessions.values()).map((session) => ({
      repoRoot: session.repoRoot,
      name: path.basename(session.repoRoot)
    }));

    await this.postMessage({
      type: 'repositoryTabs',
      payload: {
        entries,
        activeRepoRoot: this.activeRepoRoot
      }
    });
  }

  private async confirm(message: string, actionLabel: string): Promise<boolean> {
    const result = await dialog.showMessageBox(this.window, {
      type: 'warning',
      buttons: [actionLabel, 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message
    });

    return result.response === 0;
  }

  private async handleFeatureNeedsModal(featureName: string): Promise<void> {
    await this.postNotification(
      'error',
      `${featureName} precisa virar um modal React no app desktop. A acao foi preservada como ponto de migracao.`
    );
  }

  private async withBusy(label: string, action: () => Promise<void>): Promise<void> {
    await this.postMessage({ type: 'busy', payload: { value: true, label } });
    try {
      await action();
    } finally {
      await this.postMessage({ type: 'busy', payload: { value: false } });
    }
  }

  private async postNotification(kind: 'info' | 'error', message: string): Promise<void> {
    await this.postMessage({
      type: 'notification',
      payload: { kind, message }
    });
  }

  private async postMessage(message: ExtensionToWebviewMessage): Promise<void> {
    if (this.window.isDestroyed()) {
      return;
    }

    this.window.webContents.send('repoflow:message', message);
  }
}
