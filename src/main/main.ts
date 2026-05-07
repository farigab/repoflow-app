import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { GitCliRepository } from '../infrastructure/git/GitCliRepository';
import type { WebviewToExtensionMessage } from '../shared/protocol';
import { DesktopMessageController } from './DesktopMessageController';
import { DesktopLogger } from './logger';

let mainWindow: BrowserWindow | undefined;
let controller: DesktopMessageController | undefined;
const WINDOWS_APP_ID = 'com.farigab.repoflow';
const WINDOWS_CLI_NAME = 'repoflow';

function parseCliRepositoryPaths(argv: string[]): string[] {
  const rawArgs = argv.slice(app.isPackaged ? 1 : 2);
  const repositoryPaths: string[] = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (!arg) {
      continue;
    }

    if (arg === '--') {
      repositoryPaths.push(...rawArgs.slice(index + 1));
      break;
    }

    if (arg === '--repo' || arg === '-r') {
      const nextArg = rawArgs[index + 1];
      if (nextArg) {
        repositoryPaths.push(nextArg);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith('--repo=')) {
      repositoryPaths.push(arg.slice('--repo='.length));
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    repositoryPaths.push(arg);
  }

  return Array.from(new Set(repositoryPaths.map((entry) => path.resolve(entry))));
}

function resolveWindowIconPath(): string {
  return path.join(__dirname, '../renderer/icon.png');
}

function resolveWindowsAppId(): string {
  return app.isPackaged ? WINDOWS_APP_ID : process.execPath;
}

function resolveCliPath(): string | undefined {
  const userArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  const pathArg = userArgs.find((arg) => !arg.startsWith('-'));
  if (pathArg) {
    return path.resolve(pathArg);
  }

  return undefined;
}

function setupCommandLineTool() {
  const cliPath = resolveCliPath();

  if (cliPath) {
    process.env.REPOFLOW_REPO = cliPath;
  }

  if (process.platform === 'darwin') {
    setupMacOSCLI();
  } else if (process.platform === 'win32' && app.isPackaged) {
    setupWindowsCLI();
  }
}

function setupMacOSCLI() {
  const target = "/usr/local/bin/repoflow";
  if (existsSync(target)) {
    // symbolic link already exists, do nothing
    return;
  }

  const content = '#!/bin/bash\\n\\"/Applications/RepoFlow.app/Contents/MacOS/RepoFlow\\" \\"\\$@\\" > /dev/null 2>&1 &\\ndisown\\nexit'
  const command = `echo "${content}" > ${target} && chmod +x ${target}`;

  exec(command, (error) => {
    if (error) {
      console.error("Failed to create symbolic link for CLI:", error);
    } else {
      console.info("Symbolic link for CLI created successfully");
    }
  });
}

function resolveWindowsCliDirectory(): string | undefined {
  const appDataPath = process.env.APPDATA;

  if (!appDataPath) {
    return undefined;
  }

  return path.join(appDataPath, 'npm');
}

function buildWindowsCmdLauncher(executablePath: string): string {
  return `@echo off\r\n"${executablePath}" %*\r\n`;
}

function buildWindowsPowerShellLauncher(executablePath: string): string {
  const escapedPath = executablePath.replaceAll("'", "''");
  return `Start-Process -FilePath '${escapedPath}' -ArgumentList $args | Out-Null\r\n`;
}

function writeFileIfChanged(targetPath: string, content: string): void {
  if (existsSync(targetPath) && readFileSync(targetPath, 'utf8') === content) {
    return;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
}

function setupWindowsCLI() {
  const cliDirectory = resolveWindowsCliDirectory();

  if (!cliDirectory) {
    return;
  }

  try {
    writeFileIfChanged(
      path.join(cliDirectory, `${WINDOWS_CLI_NAME}.cmd`),
      buildWindowsCmdLauncher(process.execPath)
    );
    writeFileIfChanged(
      path.join(cliDirectory, `${WINDOWS_CLI_NAME}.ps1`),
      buildWindowsPowerShellLauncher(process.execPath)
    );
  } catch (error) {
    console.error('Failed to register Windows CLI launcher:', error);
  }
}

function applyWindowsTaskbarDetails(window: BrowserWindow): void {
  if (process.platform !== 'win32') {
    return;
  }

  const appId = resolveWindowsAppId();
  app.setAppUserModelId(appId);
  window.setAppDetails({
    appId,
    appIconPath: process.execPath,
    appIconIndex: 0
  });
}

async function showAboutDialog(ownerWindow: BrowserWindow): Promise<void> {
  await dialog.showMessageBox(ownerWindow, {
    type: 'info',
    title: 'About RepoFlow',
    message: 'RepoFlow',
    detail: `Version ${app.getVersion()}\nStandalone desktop app for browsing Git repositories.`,
    buttons: ['OK'],
    noLink: true
  });
}

function createApplicationMenu(
  activeController: DesktopMessageController,
  ownerWindow: BrowserWindow
): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Repository...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void activeController.openRepository();
          }
        },
        { type: 'separator' },
        {
          label: 'Refresh',
          accelerator: 'F5',
          click: () => {
            void activeController.refresh();
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        {
          label: 'About RepoFlow',
          click: () => {
            void showAboutDialog(ownerWindow);
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow(bootstrapRepositoryPaths: string[] = []): Promise<void> {
  const logger = new DesktopLogger();

  const repository = new GitCliRepository(
    logger,
    async (request) => {
      if (controller) {
        await controller.showDiff(request);
      }
    },
    {
      getWorkspaceFolders: () => {
        const root = controller?.getCurrentRepositoryRoot();
        return root ? [root] : [];
      },
      openFileHandler: async (repoRoot, filePath) => {
        const result = await shell.openPath(path.join(repoRoot, filePath));
        if (result) {
          throw new Error(result);
        }
      }
    }
  );

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'RepoFlow',
    icon: resolveWindowIconPath(),
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  applyWindowsTaskbarDetails(mainWindow);

  controller = new DesktopMessageController(mainWindow, repository, logger, bootstrapRepositoryPaths);
  createApplicationMenu(controller, mainWindow);

  ipcMain.removeAllListeners('repoflow:message');
  ipcMain.on('repoflow:message', (_event, message: WebviewToExtensionMessage) => {
    void controller?.handleMessage(message);
  });

  mainWindow.on('closed', () => {
    mainWindow = undefined;
    controller = undefined;
  });

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

const cliRepositoryPaths = parseCliRepositoryPaths(process.argv);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.whenReady().then(() => {
  setupCommandLineTool();
  void createMainWindow(cliRepositoryPaths);

  app.on('second-instance', (_event, argv) => {
    const nextRepositoryPaths = parseCliRepositoryPaths(argv);

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }

    if (nextRepositoryPaths.length > 0) {
      void controller?.queueBootstrapRepositories(nextRepositoryPaths);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}).catch((error) => {
  console.error(error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
