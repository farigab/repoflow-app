# RepoFlow Desktop

This folder is a standalone Windows desktop project for RepoFlow.

The desktop app has its own local copy of the code it needs from the VS Code extension:

- `src/core`
- `src/application`
- `src/infrastructure/git`
- `src/shared`
- `src/renderer`
- `src/presentation/webview/GitGraphUtils.ts`

It should not import from the repository root `src` or `webview` folders. That keeps the VS Code extension and the desktop app separable.

## Current Shape

```text
apps/desktop/
  media/
  esbuild.mjs
  package.json
  src/
    application/
    core/
    infrastructure/
    main/
    preload/
    presentation/
    renderer/
    shared/
```

The desktop app replaces the VS Code webview host with Electron IPC:

```text
React UI -> window.repoFlow.postMessage -> preload -> ipcMain -> DesktopMessageController
DesktopMessageController -> BrowserWindow.webContents.send -> preload -> window message -> React UI
```

## Run Locally

From this folder:

```powershell
npm install
npm run start
```

To force a repository on startup:

```powershell
$env:REPOFLOW_REPO="C:\path\to\repo"
npm run start
```

If `REPOFLOW_REPO` is not set, the app tries the current working directory and then opens a folder picker.

## Build For Windows

```powershell
npm run dist:win
```

Output goes to:

```text
apps/desktop/release/
```

## Already Wired

- Git graph loading
- commit selection and commit details
- filtering and load more
- stage / unstage / discard
- fetch / pull / push
- checkout / cherry-pick / revert / drop / merge / rebase actions
- stashes
- worktrees
- repo settings
- PR URL opening
- file opening through the OS
- clipboard actions

## Still Marked As Migration Points

These were VS Code prompts or VS Code-native surfaces and now need desktop UI:

- create branch prompt
- commit message prompt
- reset mode picker
- native diff view

Recommended next step: add React modals for branch creation, commit, and reset, then add a desktop diff panel using Monaco Editor.
