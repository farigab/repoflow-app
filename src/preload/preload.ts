import { contextBridge, ipcRenderer } from 'electron';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../shared/protocol';

let hostState: unknown;

contextBridge.exposeInMainWorld('repoFlow', {
  postMessage(message: WebviewToExtensionMessage): void {
    ipcRenderer.send('repoflow:message', message);
  },
  setState<T>(data: T): void {
    hostState = data;
  },
  getState<T>(): T | undefined {
    return hostState as T | undefined;
  }
});

ipcRenderer.on('repoflow:message', (_event, message: ExtensionToWebviewMessage) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
});
