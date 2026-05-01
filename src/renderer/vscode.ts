import type { WebviewToExtensionMessage } from '../shared/protocol';

interface RepoFlowDesktopBridge {
  postMessage(message: WebviewToExtensionMessage): void;
  setState?<T>(data: T): void;
  getState?<T>(): T | undefined;
}

declare global {
  interface Window {
    __REPOFLOW_ASSETS__?: {
      hero?: string;
    };

    repoFlow?: RepoFlowDesktopBridge;
  }
}

let desktopState: unknown;

function getDesktopBridge(): RepoFlowDesktopBridge {
  if (window.repoFlow) {
    return window.repoFlow;
  }
  throw new Error('RepoFlow host API was not found.');
}

export const vscode = {
  postMessage(message: WebviewToExtensionMessage): void {
    getDesktopBridge().postMessage(message);
  },
  setState<T>(data: T): void {
    desktopState = data;
    getDesktopBridge().setState?.(data);
  },
  getState<T>(): T | undefined {
    return getDesktopBridge().getState?.<T>() ?? (desktopState as T | undefined);
  }
};
