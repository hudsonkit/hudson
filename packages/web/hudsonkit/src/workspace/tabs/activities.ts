'use client';

// ---------------------------------------------------------------------------
// useActivities / useActivity (HUD-015 §13): live activity state from the
// host, through the platform adapter's activity bridge (or one the app
// passes in). Status is never persisted; with no bridge there are none.
//
// Every component that reads one bridge shares one store: one list() and
// one subscription, however many tab strips and indicators are mounted.
// ---------------------------------------------------------------------------
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { usePlatform } from '../../platform/PlatformContext';
import { activityKey, type ActivityRef, type ActivitySnapshot, type PlatformActivityBridge } from '../../types/activity';

type ActivityMap = ReadonlyMap<string, ActivitySnapshot>;

const EMPTY: ActivityMap = new Map();

interface ActivityStore {
  get(): ActivityMap;
  subscribe(onChange: () => void): () => void;
}

const stores = new WeakMap<PlatformActivityBridge, ActivityStore>();

/** The shared store for a bridge. It connects on first subscriber, disconnects on last. */
export function activityStore(bridge: PlatformActivityBridge): ActivityStore {
  const existing = stores.get(bridge);
  if (existing) return existing;

  let current: ActivityMap = EMPTY;
  const listeners = new Set<() => void>();
  let disconnect: (() => void) | null = null;
  // Bumped on every connect, so a list() from an earlier connection can't land.
  let generation = 0;

  const set = (next: ActivityMap) => {
    current = next;
    for (const listener of listeners) listener();
  };

  const connect = () => {
    const mine = ++generation;
    // Updates that arrive while listing are newer than the list.
    const seen = new Set<string>();
    // Subscribe first so nothing between list() and subscribe() is lost.
    const unsubscribe = bridge.subscribe((snapshot) => {
      if (mine !== generation) return;
      const key = activityKey(snapshot.ref);
      seen.add(key);
      const next = new Map(current);
      next.set(key, snapshot);
      set(next);
    });
    bridge
      .list()
      .then((list) => {
        if (mine !== generation) return;
        const next = new Map(list.map((s) => [activityKey(s.ref), s] as const));
        for (const key of seen) {
          const live = current.get(key);
          if (live) next.set(key, live);
        }
        set(next);
      })
      .catch((error: unknown) => console.error('[Hudson] activity list failed:', error));
    disconnect = () => {
      generation += 1;
      unsubscribe();
      current = EMPTY;
    };
  };

  const store: ActivityStore = {
    get: () => current,
    subscribe(onChange) {
      listeners.add(onChange);
      if (listeners.size === 1) connect();
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          disconnect?.();
          disconnect = null;
        }
      };
    },
  };
  stores.set(bridge, store);
  return store;
}

const noopSubscribe = () => () => {};
const getEmpty = () => EMPTY;

/** Every activity the host reports, keyed by `activityKey(ref)`. */
export function useActivities(bridge?: PlatformActivityBridge): ActivityMap {
  const platform = usePlatform();
  const source = bridge ?? platform.activities;
  const store = useMemo(() => (source ? activityStore(source) : null), [source]);
  const subscribe = useCallback((onChange: () => void) => (store ? store.subscribe(onChange) : noopSubscribe()), [store]);
  const get = store ? store.get : getEmpty;
  return useSyncExternalStore(subscribe, get, getEmpty);
}

/** One activity's state, or null if the host doesn't report it. */
export function useActivity(ref: ActivityRef | null, bridge?: PlatformActivityBridge): ActivitySnapshot | null {
  const activities = useActivities(bridge);
  const key = ref ? activityKey(ref) : null;
  return useMemo(() => (key ? activities.get(key) ?? null : null), [activities, key]);
}

/** Send a command to the activity's host. Resolves false when there is no bridge. */
export function useActivitySender(bridge?: PlatformActivityBridge) {
  const platform = usePlatform();
  const source = bridge ?? platform.activities;
  return useCallback(
    async (ref: ActivityRef, command: string, args?: unknown): Promise<boolean> => {
      if (!source) return false;
      await source.send(ref, command, args);
      return true;
    },
    [source],
  );
}

/** Live states: the ones an indicator counts. */
export function isLiveActivity(snapshot: ActivitySnapshot): boolean {
  return snapshot.state === 'starting' || snapshot.state === 'running' || snapshot.state === 'paused';
}
