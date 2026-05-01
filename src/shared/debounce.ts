export interface Debounced {
  schedule(): void;
  dispose(): void;
}

export function createDebounce(fn: () => void, delayMs: number): Debounced {
  let timer: NodeJS.Timeout | undefined;
  return {
    schedule(): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; fn(); }, delayMs);
    },
    dispose(): void {
      if (timer) { clearTimeout(timer); timer = undefined; }
    }
  };
}
