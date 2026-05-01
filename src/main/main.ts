import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as path from 'node:path';
import { GitCliRepository } from '../infrastructure/git/GitCliRepository';
import type { WebviewToExtensionMessage } from '../shared/protocol';
import { DesktopMessageController } from './DesktopMessageController';
import { DesktopLogger } from './logger';

let mainWindow: BrowserWindow | undefined;
let controller: DesktopMessageController | undefined;
const WINDOWS_APP_ID = 'com.farigab.repoflow';

function resolveWindowIconPath(): string {
  return path.join(__dirname, '../renderer/icon.png');
}

function resolveWindowsAppId(): string {
  return app.isPackaged ? WINDOWS_APP_ID : process.execPath;
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

async function createMainWindow(): Promise<void> {
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

  controller = new DesktopMessageController(mainWindow, repository, logger);
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

app.whenReady().then(() => {
  void createMainWindow();

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
