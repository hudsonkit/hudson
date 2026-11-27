// ---------------------------------------------------------------------------
// Tab persistence (HUD-015 §5).
//
// - createLocalTabStore: the default store, on the same localStorage backing
//   as usePersistentState. An unreadable snapshot is kept beside the key
//   (`<key>.unreadable`) for recovery, and load returns null.
// - createTabSaver: debounces saves (300 ms) and flushes on demand, so a quit
//   inside the debounce window loses nothing.
// ---------------------------------------------------------------------------
import { safeLocalStorage } from '../../lib/safe-storage';
import type { TabStore, TabStoreKey, TabWorkspaceState } from '../../types/tabs';

export const TAB_SAVE_DEBOUNCE_MS = 300;

export function tabStorageKey(key: TabStoreKey): string {
  return `hudson.tabs:${key.workspaceId}:${key.windowId}`;
}

export function createLocalTabStore(): TabStore {
  return {
    async load(key) {
      const storageKey = tabStorageKey(key);
      const raw = safeLocalStorage.getItem(storageKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as TabWorkspaceState).instances)) {
          throw new Error('not a tab workspace');
        }
        return parsed as TabWorkspaceState;
      } catch {
        safeLocalStorage.setItem(`${storageKey}.unreadable`, raw);
        return null;
      }
    },
    async save(key, state) {
      safeLocalStorage.setItem(tabStorageKey(key), JSON.stringify(state));
    },
  };
}

/** A store that keeps everything in memory. Useful for tests and previews. */
export function createMemoryTabStore(initial?: Record<string, TabWorkspaceState>): TabStore & {
  snapshot(key: TabStoreKey): TabWorkspaceState | undefined;
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    async load(key) {
      const raw = data.get(tabStorageKey(key));
      return raw ? (JSON.parse(raw) as TabWorkspaceState) : null;
    },
    async save(key, state) {
      data.set(tabStorageKey(key), JSON.stringify(state));
    },
    snapshot(key) {
      const raw = data.get(tabStorageKey(key));
      return raw ? (JSON.parse(raw) as TabWorkspaceState) : undefined;
    },
  };
}

export interface TabSaver {
  /** Queue a save; the latest state wins. */
  schedule(state: TabWorkspaceState): void;
  /** Write any queued state now. */
  flush(): void;
  /** Flush, then stop. */
  dispose(): void;
}

export function createTabSaver(
  store: TabStore,
  key: TabStoreKey,
  delay = TAB_SAVE_DEBOUNCE_MS,
  onError?: (error: unknown) => void,
): TabSaver {
  let pending: TabWorkspaceState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const write = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const state = pending;
    pending = null;
    store.save(key, state).catch((error: unknown) => onError?.(error));
  };

  return {
    schedule(state) {
      if (disposed) return;
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delay);
    },
    flush: write,
    dispose() {
      write();
      disposed = true;
    },
  };
}
