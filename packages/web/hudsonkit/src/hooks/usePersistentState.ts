'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { useOptionalInstance } from '../context/InstanceContext';
import { safeLocalStorage } from '../lib/safe-storage';

/** Options accepted by {@link usePersistentState} and {@link useDebouncedPersistentState}. */
export interface PersistentStateOptions<T> {
  /**
   * When false, the hook behaves like plain `useState`: nothing is restored
   * from storage and nothing is written. If it later flips to true, the
   * stored value is restored once and persistence begins. Defaults to true.
   */
  enabled?: boolean;
  /**
   * Opt-in schema version. When set, values are written to storage inside a
   * `{ __v, value }` envelope. Plain (non-envelope) stored values are treated
   * as version 0. Callers that don't pass `version` keep the legacy plain
   * format — fully backward compatible.
   */
  version?: number;
  /**
   * Migrates a value stored under an older version to the current shape.
   * Called when the stored version differs from `version`. If omitted (or if
   * it throws), the stored value is discarded and `initialValue` is used.
   */
  migrate?: (stored: unknown, fromVersion: number) => T;
}

/** Prefixes a storage key with the current instance scope when available.
 *  Keys that are already instance-scoped (start with `inst:`) or workspace-wide
 *  (start with `hudson.ws.`) are left alone so shell-owned state doesn't get
 *  accidentally double-scoped when a hook is called from inside an app. */
function useScopedKey(key: string): string {
  const instance = useOptionalInstance();
  if (!instance) return key;
  if (key.startsWith('inst:') || key.startsWith('hudson.ws.')) return key;
  return `inst:${instance.instanceId}:${key}`;
}

/** Envelope written to storage when a `version` is configured. */
type VersionEnvelope = { __v: number; value: unknown };

function isVersionEnvelope(value: unknown): value is VersionEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { __v?: unknown }).__v === 'number' &&
    'value' in value
  );
}

function readStorage<T>(key: string, options?: PersistentStateOptions<T>): T | undefined {
  const raw = safeLocalStorage.getItem(key);
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const version = options?.version;
  if (version === undefined) return parsed as T;

  const [stored, fromVersion] = isVersionEnvelope(parsed)
    ? [parsed.value, parsed.__v]
    : [parsed, 0];
  if (fromVersion === version) return stored as T;
  if (!options?.migrate) return undefined;
  try {
    return options.migrate(stored, fromVersion);
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown, version?: number) {
  let serialized: string;
  try {
    serialized = JSON.stringify(version === undefined ? value : { __v: version, value });
  } catch {
    return;
  }
  if (typeof serialized !== 'string') return;
  if (!safeLocalStorage.setItem(key, serialized)) return;
  try {
    window.dispatchEvent(new CustomEvent('hudson:saved', { detail: { key } }));
  } catch {}
}

// Hydration gate — ensures client and server render the same initial value,
// then swaps to the persisted value in a single synchronous commit.
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

/** Returns false during SSR/hydration, true once the client has mounted. */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, getTrue, getFalse);
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options: PersistentStateOptions<T> = {},
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const hydrated = useHydrated();
  const scopedKey = useScopedKey(key);
  const enabled = options.enabled ?? true;
  const { version } = options;

  const [state, setState] = useState<T>(initialValue);

  // After hydration, synchronously swap in the persisted value (single commit,
  // no flash). Restore is one-shot: if `enabled` starts false it fires on the
  // first render after it flips true.
  //
  // The "restored" flag lives in state, not a ref. Both render-phase updates
  // below then commit or get discarded together. With a ref, a discarded
  // render (React 19 StrictMode double render) kept the flag but dropped the
  // restored value, and the write effect then saved the initial value over
  // the user's stored setting.
  const [restored, setRestored] = useState(false);
  if (hydrated && enabled && !restored) {
    setRestored(true);
    const saved = readStorage<T>(scopedKey, options);
    if (saved !== undefined) {
      // Render-phase update: React re-renders with the new state before commit.
      setState(saved);
    }
  }

  // Persist changes to localStorage. Nothing is written until restore has
  // committed, so storage is never clobbered with the initial value.
  useEffect(() => {
    if (!hydrated || !enabled || !restored) return;
    writeStorage(scopedKey, state, version);
  }, [scopedKey, state, hydrated, enabled, restored, version]);

  // Same-tab sync. Two hooks can own one key (an app window and the shell
  // both read `hudson.app.<id>.settings`). Without this, the copy that did
  // not change keeps its stale value and writes it back on its next update.
  // `storage` events only fire across tabs, so listen to Hudson's own
  // `hudson:saved` event. Equal values are ignored, so instances never echo.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  useEffect(() => {
    if (!hydrated || !enabled || !restored) return;
    const onSaved = (event: Event) => {
      if ((event as CustomEvent<{ key?: string }>).detail?.key !== scopedKey) return;
      const saved = readStorage<T>(scopedKey, optionsRef.current);
      if (saved === undefined) return;
      let same = false;
      try {
        same = JSON.stringify(saved) === JSON.stringify(stateRef.current);
      } catch { /* unserializable state: adopt the stored value */ }
      if (!same) setState(saved);
    };
    window.addEventListener('hudson:saved', onSaved);
    return () => window.removeEventListener('hudson:saved', onSaved);
  }, [scopedKey, hydrated, enabled, restored]);

  return [state, setState];
}

/**
 * Like usePersistentState but debounces writes to localStorage.
 * Ideal for high-frequency state like pan/zoom that changes every frame.
 */
export function useDebouncedPersistentState<T>(
  key: string,
  initialValue: T,
  delayMs = 300,
  options: PersistentStateOptions<T> = {},
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const hydrated = useHydrated();
  const scopedKey = useScopedKey(key);
  const enabled = options.enabled ?? true;
  const { version } = options;

  const [state, setState] = useState<T>(initialValue);

  const didRestore = useRef(false);
  // eslint-disable-next-line react-hooks/refs -- one-time hydration-restore guard read during render is intentional; enables a single synchronous commit of the persisted value with no post-mount flash
  if (hydrated && enabled && !didRestore.current) {
    didRestore.current = true;
    const saved = readStorage<T>(scopedKey, options);
    if (saved !== undefined) {
      setState(saved);
    }
  }

  // Debounced persist — only writes after state settles
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || !enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeStorage(scopedKey, state, version);
    }, delayMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scopedKey, state, delayMs, hydrated, enabled, version]);

  // Also flush on unmount (page navigation, workspace switch). Skipped when
  // persistence is disabled or the stored value was never restored (so a
  // too-early unmount can't clobber storage with the initial value).
  const stateRef = useRef(state);
  // eslint-disable-next-line react-hooks/refs -- mirroring latest state into a ref during render is intentional so the unmount-only flush effect can persist the final value without re-subscribing
  stateRef.current = state;
  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (!didRestore.current) return;
      writeStorage(scopedKey, stateRef.current, version);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedKey, enabled, version]);

  return [state, setState];
}

/** Debounce interval for the save indicator (coalesces rapid writes). */
const SAVE_INDICATOR_DEBOUNCE_MS = 800;
/** How long the "saved" state stays true before resetting. */
const SAVE_INDICATOR_VISIBLE_MS = 1_500;

/**
 * Listens for `hudson:saved` events and returns `true` briefly after a write.
 * Use this to show a subtle save indicator in the UI.
 */
export function useSaveIndicator(): boolean {
  const [visible, setVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(() => {
    // Debounce: reset the timer on each save event so rapid writes
    // produce a single flash after the burst settles.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);

    debounceRef.current = setTimeout(() => {
      setVisible(true);
      hideRef.current = setTimeout(() => setVisible(false), SAVE_INDICATOR_VISIBLE_MS);
    }, SAVE_INDICATOR_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    window.addEventListener('hudson:saved', handleSave);
    return () => {
      window.removeEventListener('hudson:saved', handleSave);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, [handleSave]);

  return visible;
}
