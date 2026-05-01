import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import * as path from 'node:path';
import { GitCliRepository } from '../infrastructure/git/GitCliRepository';
import type { WebviewToExtensionMessage } from '../shared/protocol';
import { DesktopMessageController } from './DesktopMessageController';
import { DesktopLogger } from './logger';

let mainWindow: BrowserWindow | undefined;
let controller: DesktopMessageController | undefined;

function createApplicationMenu(activeController: DesktopMessageController): void {
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
        {
          label: 'Open Multiple Repositories...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            void activeController.openRepositories();
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
        { role: 'toggleDevTools' }
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
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  controller = new DesktopMessageController(mainWindow, repository, logger);
  createApplicationMenu(controller);

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
