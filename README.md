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

To open repositories from the CLI in development:

```powershell
npm run start -- "C:\path\to\repo-a" "C:\path\to\repo-b"
```

You can also pass explicit flags:

```powershell
npm run start -- --repo "C:\path\to\repo-a" --repo "C:\path\to\repo-b"
```

For the packaged app:

```powershell
"C:\Program Files\RepoFlow\RepoFlow.exe" "C:\path\to\repo-a" "C:\path\to\repo-b"
```

If RepoFlow is already open, running the executable again with repository paths will focus the existing window and add the repositories as new tabs.

To register the `repoflow` command globally in your user profile during development:

```powershell
npm link
```

After that, you can run:

```powershell
repoflow "C:\path\to\repo-a" "C:\path\to\repo-b"
```

To force a repository on startup via environment variable:

```powershell
$env:REPOFLOW_REPO="C:\path\to\repo"
npm run start
```

If no repository path is provided, the app opens normally and you can choose a repository from the UI.

## Build For Windows

```powershell
npm run dist:win
```

If you want a direct PowerShell entrypoint without relying on `npm`, use:

```powershell
.\scripts\build-installer.ps1
```

Output goes to:

```text
apps/desktop/release/
```

The installer artifact is generated as:

```text
RepoFlow-Setup-<version>.exe
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
