'use client';

// ---------------------------------------------------------------------------
// Tab controller (HUD-015 §5–§9): state, persistence, useTabs and useTab.
//
// One controller backs one TabArea. It owns the saved workspace (instances,
// layout, recently closed) plus UI-only tab state (icon, status, badge,
// holds), which is never persisted.
// ---------------------------------------------------------------------------
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CommandOption } from '../../components/overlays/CommandPalette';
import type { HudsonApp } from '../../types/app';
import type {
  ClosedTab,
  OpenTabOptions,
  OpenTabPlacement,
  OpenTabRequest,
  TabCycleScope,
  TabDock,
  TabSelectTarget,
  TabStatus,
  TabStore,
  TabStoreKey,
  TabSummary,
  TabWorkspaceState,
} from '../../types/tabs';
import type { AppInstance } from '../../types/workspace';
import {
  activateTab,
  addTab,
  allGroups,
  cycleTab,
  equaliseSplit,
  findGroup,
  focusGroup,
  locateTab,
  moveTab,
  removeTab,
  selectByNumber,
  setDockSize,
  setDockVisible,
  setSplitSizes,
  visibleGroups,
  type LayoutPlacement,
  type NewId,
} from './layout';
import {
  RECENTLY_CLOSED_LIMIT,
  emptyTabState,
  reopenPlacement,
  resolvePlacement,
  restoreTabState,
  type TombstoneReason,
} from './restore';
import { createTabSaver } from './store';

// --- ids -------------------------------------------------------------------

function shortId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const defaultNewGroupId: NewId = () => `g-${shortId()}`;

// --- public types ----------------------------------------------------------

export interface TabsApi {
  /** Open a tab and return its instanceId (or the reused tab's). */
  open(request: OpenTabRequest, options?: OpenTabOptions): string;
  /** Close a tab as the user would: asks first if it holds session work. */
  close(instanceId: string): void;
  /** Reopen the most recently closed tab. */
  reopen(): void;
  focus(instanceId: string): void;
  move(instanceId: string, to: OpenTabPlacement): void;
  /** The open tab for this app and reuse key, if any. */
  find(appId: string, reuseKey: string): TabSummary | undefined;
  /** Every open tab, in layout order. */
  tabs: ReadonlyArray<TabSummary>;
}

/** What a TabArea's `ref` receives: the TabsApi plus host-facing extras. */
export interface TabsHandle extends TabsApi {
  /** Run a tab command by ID (`tabs.close`, `tabs.open`, …), as the command bridge does. */
  runCommand(command: string, args?: unknown): boolean;
  /** Session work that would end on quit, for a native quit prompt. */
  heldWork(): Array<{ instanceId: string; title: string; label: string }>;
  /** Write any pending save now (call on native quit). */
  flush(): void;
}

export interface TabsControllerOptions {
  apps: readonly HudsonApp[];
  /** Where to persist. Omit to keep tabs in memory only. */
  store?: TabStore;
  storeKey?: Partial<TabStoreKey>;
  /** Tabs to open when nothing was saved. */
  initialTabs?: ReadonlyArray<OpenTabRequest & { placement?: OpenTabPlacement }>;
  selectTarget?: TabSelectTarget;
  cycleScope?: TabCycleScope;
  /** Opens a tab switcher; the `tabs.switch` command calls it. */
  onSwitch?: () => void;
  /** Injected for tests. */
  newGroupId?: NewId;
  newInstanceId?: (appId: string) => string;
}

interface TabMeta {
  icon: string | null;
  status: TabStatus | null;
  badge: number | null;
}

interface ControllerState {
  ws: TabWorkspaceState;
  /** Tabs that have rendered at least once (lazy restore, §5). */
  mounted: ReadonlySet<string>;
  tombstones: ReadonlyMap<string, TombstoneReason>;
  meta: ReadonlyMap<string, TabMeta>;
}

export interface TabsController {
  ready: boolean;
  /** Changes whenever a hold is added or released. */
  holdsVersion: number;
  state: ControllerState;
  apps: ReadonlyMap<string, HudsonApp>;
  api: TabsHandle;
  commands: CommandOption[];
  pendingClose: string | null;
  confirmClose(): void;
  cancelClose(): void;
  /** Internal operations used by TabArea. */
  ops: {
    moveTo(instanceId: string, placement: LayoutPlacement): void;
    focusGroup(groupId: string): void;
    setSizes(splitId: string, sizes: number[]): void;
    equalise(splitId: string): void;
    setDockSize(dock: TabDock, size: number): void;
    toggleDock(dock: TabDock): void;
    closeNow(instanceId: string): void;
  };
  tab: {
    instance(instanceId: string): AppInstance | undefined;
    setTitle(instanceId: string, title: string): void;
    setMeta(instanceId: string, patch: Partial<TabMeta>): void;
    setParams(instanceId: string, params: unknown): void;
    holdWork(instanceId: string, label: string): () => void;
    onClose(instanceId: string, handler: () => void): () => void;
    holds(instanceId: string): string[];
  };
}

// --- state helpers -----------------------------------------------------------

/** Add every tab that is on screen to the mounted set. */
function withMounted(state: ControllerState): ControllerState {
  const visibleActive = visibleGroups(state.ws.layout)
    .map((g) => g.active)
    .filter((id): id is string => !!id);
  if (visibleActive.every((id) => state.mounted.has(id))) return state;
  return { ...state, mounted: new Set([...state.mounted, ...visibleActive]) };
}

function withoutTab(state: ControllerState, instanceId: string): ControllerState {
  const mounted = new Set(state.mounted);
  mounted.delete(instanceId);
  const meta = new Map(state.meta);
  meta.delete(instanceId);
  const tombstones = new Map(state.tombstones);
  tombstones.delete(instanceId);
  return { ...state, mounted, meta, tombstones };
}

/** Strip tabs whose app says they don't persist. */
export function serializableState(ws: TabWorkspaceState, apps: ReadonlyMap<string, HudsonApp>): TabWorkspaceState {
  const transient = ws.instances.filter((i) => apps.get(i.appId)?.tab?.persists === false).map((i) => i.instanceId);
  if (transient.length === 0) return ws;
  let layout = ws.layout;
  for (const id of transient) layout = removeTab(layout, id);
  return { ...ws, instances: ws.instances.filter((i) => !transient.includes(i.instanceId)), layout };
}

function initialControllerState(newId: NewId): ControllerState {
  return { ws: emptyTabState(newId), mounted: new Set(), tombstones: new Map(), meta: new Map() };
}

const DEFAULT_META: TabMeta = { icon: null, status: null, badge: null };

// --- the hook ------------------------------------------------------------------

export function useTabsController(options: TabsControllerOptions): TabsController {
  const {
    apps: appList,
    store,
    selectTarget = 'tab',
    cycleScope = 'workspace',
    initialTabs,
    onSwitch,
  } = options;
  const workspaceId = options.storeKey?.workspaceId ?? 'default';
  const windowId = options.storeKey?.windowId ?? 'main';
  const newGroupId = options.newGroupId ?? defaultNewGroupId;
  const newInstanceId = options.newInstanceId ?? ((appId: string) => `${appId}-${shortId()}`);

  const apps = useMemo(() => new Map(appList.map((a) => [a.id, a])), [appList]);
  const [state, setState] = useState<ControllerState>(() => initialControllerState(newGroupId));
  // Ready once the current store key has loaded; a new key is not ready until it loads.
  const loadKey = `${workspaceId}\u0000${windowId}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const ready = !store || loadedKey === loadKey;
  const [pendingClose, setPendingClose] = useState<string | null>(null);

  // Latest values for callbacks that must stay stable.
  // stateRef is also advanced inside `update`, so callbacks in the same tick see the newest state.
  const stateRef = useRef(state);
  const appsRef = useRef(apps);
  const optsRef = useRef({ initialTabs, onSwitch, newGroupId, newInstanceId, selectTarget, cycleScope });
  useIsomorphicLayoutEffect(() => {
    stateRef.current = state;
    appsRef.current = apps;
    optsRef.current = { initialTabs, onSwitch, newGroupId, newInstanceId, selectTarget, cycleScope };
  });

  const holdsRef = useRef(new Map<string, Map<symbol, string>>());
  const closeHandlersRef = useRef(new Map<string, Set<() => void>>());
  const [holdsVersion, setHoldsVersion] = useState(0);

  /** Apply a change to the controller state; keeps the mounted set current. */
  const update = useCallback((fn: (s: ControllerState) => ControllerState) => {
    setState((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      const withM = withMounted(next);
      stateRef.current = withM;
      return withM;
    });
  }, []);

  const updateWs = useCallback(
    (fn: (ws: TabWorkspaceState) => TabWorkspaceState) => update((s) => {
      const ws = fn(s.ws);
      return ws === s.ws ? s : { ...s, ws };
    }),
    [update],
  );

  // --- opening ---------------------------------------------------------------

  const openInto = useCallback(
    (ws: TabWorkspaceState, request: OpenTabRequest, opts: OpenTabOptions, instanceId: string): TabWorkspaceState => {
      const app = appsRef.current.get(request.appId);
      const tab = app?.tab;
      const placement = resolvePlacement(opts.placement ?? tab?.defaultPlacement, {
        layout: ws.layout,
        size: tab?.defaultSize,
      });
      const instance: AppInstance = {
        instanceId,
        appId: request.appId,
        ...(request.title !== undefined ? { title: request.title } : {}),
        ...(request.params !== undefined ? { params: request.params, paramsVersion: tab?.paramsVersion ?? 1 } : {}),
      };
      const inactive = opts.inactive ?? false;
      const layout = addTab(ws.layout, instanceId, placement, optsRef.current.newGroupId, {
        activate: !inactive,
        focus: !inactive,
      });
      return { ...ws, instances: [...ws.instances, instance], layout };
    },
    [],
  );

  const reuseKeyOf = useCallback((instance: AppInstance): string | null => {
    const fn = appsRef.current.get(instance.appId)?.tab?.reuseKey;
    if (!fn) return null;
    try {
      return fn(instance.params);
    } catch {
      return null;
    }
  }, []);

  const findInstance = useCallback(
    (appId: string, key: string): AppInstance | undefined =>
      stateRef.current.ws.instances.find((i) => i.appId === appId && reuseKeyOf(i) === key),
    [reuseKeyOf],
  );

  const open = useCallback(
    (request: OpenTabRequest, opts: OpenTabOptions = {}): string => {
      if (opts.reuse) {
        const fn = appsRef.current.get(request.appId)?.tab?.reuseKey;
        const key = fn ? fn(request.params) : null;
        const existing = key !== null ? findInstance(request.appId, key) : undefined;
        if (existing) {
          if (!opts.inactive) updateWs((ws) => ({ ...ws, layout: activateTab(ws.layout, existing.instanceId) }));
          return existing.instanceId;
        }
      }
      const instanceId = optsRef.current.newInstanceId(request.appId);
      updateWs((ws) => openInto(ws, request, opts, instanceId));
      return instanceId;
    },
    [findInstance, openInto, updateWs],
  );

  // --- closing -----------------------------------------------------------------

  const closeNow = useCallback(
    (instanceId: string) => {
      const current = stateRef.current;
      const instance = current.ws.instances.find((i) => i.instanceId === instanceId);
      const loc = locateTab(current.ws.layout, instanceId);
      if (!instance || !loc) return;

      // onClose runs on close only, never on unmount, move or quit (§7).
      const handlers = closeHandlersRef.current.get(instanceId);
      closeHandlersRef.current.delete(instanceId);
      handlers?.forEach((h) => {
        try {
          h();
        } catch (error) {
          console.error('[Hudson] tab onClose handler failed:', error);
        }
      });
      if (holdsRef.current.delete(instanceId)) setHoldsVersion((v) => v + 1);

      const persists = appsRef.current.get(instance.appId)?.tab?.persists !== false;
      update((s) => {
        const closed: ClosedTab = { instance, from: { group: loc.group.id, index: loc.index, ...(loc.dock ? { dock: loc.dock } : {}) } };
        const ws: TabWorkspaceState = {
          ...s.ws,
          instances: s.ws.instances.filter((i) => i.instanceId !== instanceId),
          layout: removeTab(s.ws.layout, instanceId),
          recentlyClosed: persists ? [closed, ...s.ws.recentlyClosed].slice(0, RECENTLY_CLOSED_LIMIT) : s.ws.recentlyClosed,
        };
        return withoutTab({ ...s, ws }, instanceId);
      });
    },
    [update],
  );

  const close = useCallback(
    (instanceId: string) => {
      if ((holdsRef.current.get(instanceId)?.size ?? 0) > 0) setPendingClose(instanceId);
      else closeNow(instanceId);
    },
    [closeNow],
  );

  const reopen = useCallback(() => {
    update((s) => {
      const [closed, ...rest] = s.ws.recentlyClosed;
      if (!closed) return s;
      const app = appsRef.current.get(closed.instance.appId);
      const placement = reopenPlacement(closed, s.ws.layout, app?.tab?.defaultPlacement, app?.tab?.defaultSize);
      const layout = addTab(s.ws.layout, closed.instance.instanceId, placement, optsRef.current.newGroupId);
      return { ...s, ws: { ...s.ws, instances: [...s.ws.instances, closed.instance], layout, recentlyClosed: rest } };
    });
  }, [update]);

  const focus = useCallback(
    (instanceId: string) => updateWs((ws) => (locateTab(ws.layout, instanceId) ? { ...ws, layout: activateTab(ws.layout, instanceId) } : ws)),
    [updateWs],
  );

  const moveToLayout = useCallback(
    (instanceId: string, placement: LayoutPlacement) =>
      updateWs((ws) => ({ ...ws, layout: moveTab(ws.layout, instanceId, placement, optsRef.current.newGroupId) })),
    [updateWs],
  );

  const move = useCallback(
    (instanceId: string, to: OpenTabPlacement) =>
      updateWs((ws) => {
        if (!locateTab(ws.layout, instanceId)) return ws;
        const instance = ws.instances.find((i) => i.instanceId === instanceId);
        const size = instance ? appsRef.current.get(instance.appId)?.tab?.defaultSize : undefined;
        // A tab can't be placed relative to itself; place it relative to the focused tab instead.
        const placement = resolvePlacement(to, { layout: ws.layout, size, requester: instanceId });
        return { ...ws, layout: moveTab(ws.layout, instanceId, placement, optsRef.current.newGroupId) };
      }),
    [updateWs],
  );

  // --- summaries -----------------------------------------------------------------

  const tabs = useMemo<TabSummary[]>(() => {
    const byId = new Map(state.ws.instances.map((i) => [i.instanceId, i]));
    const rows = allGroups(state.ws.layout).flatMap((group) =>
      group.tabs.map((instanceId) => {
        const instance = byId.get(instanceId);
        const app = instance ? apps.get(instance.appId) : undefined;
        const meta = state.meta.get(instanceId) ?? DEFAULT_META;
        return {
          instanceId,
          appId: instance?.appId ?? '',
          title: instance?.title || app?.name || 'Unavailable',
          group: group.id,
          active: group.active === instanceId,
          status: meta.status,
          badge: meta.badge,
        } satisfies TabSummary;
      }),
    );
    // Colliding titles from different apps get the app name as detail.
    const counts = new Map<string, Set<string>>();
    for (const r of rows) counts.set(r.title, (counts.get(r.title) ?? new Set()).add(r.appId));
    return rows.map((r) =>
      (counts.get(r.title)?.size ?? 0) > 1 ? { ...r, detail: apps.get(r.appId)?.name } : r,
    );
  }, [apps, state.meta, state.ws.instances, state.ws.layout]);

  const tabsRef = useRef(tabs);
  useIsomorphicLayoutEffect(() => {
    tabsRef.current = tabs;
  });

  const find = useCallback(
    (appId: string, key: string) => {
      const instance = findInstance(appId, key);
      return instance ? tabsRef.current.find((t) => t.instanceId === instance.instanceId) : undefined;
    },
    [findInstance],
  );

  // --- commands --------------------------------------------------------------

  const focusedTabId = useCallback(() => {
    const layout = stateRef.current.ws.layout;
    return findGroup(layout, layout.focusedGroup)?.active ?? null;
  }, []);

  const runCommand = useCallback(
    (command: string, args?: unknown): boolean => {
      const layout = stateRef.current.ws.layout;
      const current = focusedTabId();
      const { cycleScope: scope, selectTarget: target } = optsRef.current;
      switch (command) {
        case 'tabs.close':
          if (current) close(current);
          return true;
        case 'tabs.reopen':
          reopen();
          return true;
        case 'tabs.next':
        case 'tabs.previous': {
          const next = cycleTab(layout, command === 'tabs.next' ? 1 : -1, scope);
          if (next) focus(next);
          return true;
        }
        case 'tabs.split-right':
        case 'tabs.split-below':
          if (current) move(current, command === 'tabs.split-right' ? 'right' : 'below');
          return true;
        case 'tabs.dock.right':
        case 'tabs.dock.bottom': {
          const dock: TabDock = command === 'tabs.dock.right' ? 'right' : 'bottom';
          updateWs((ws) => {
            const d = ws.layout.docks[dock];
            return d ? { ...ws, layout: setDockVisible(ws.layout, dock, !d.visible) } : ws;
          });
          return true;
        }
        case 'tabs.switch':
          optsRef.current.onSwitch?.();
          return true;
        case 'tabs.open': {
          const a = (args ?? {}) as { request?: OpenTabRequest; options?: OpenTabOptions } & Partial<OpenTabRequest>;
          const request = a.request ?? (a.appId ? (a as OpenTabRequest) : null);
          if (!request || !appsRef.current.has(request.appId)) return false;
          open(request, a.options);
          return true;
        }
        default: {
          const m = /^tabs\.select\.([1-9])$/.exec(command);
          if (!m) return false;
          const picked = selectByNumber(layout, Number(m[1]), target);
          if (!picked) return true;
          if (target === 'group') updateWs((ws) => ({ ...ws, layout: focusGroup(ws.layout, picked) }));
          else focus(picked);
          return true;
        }
      }
    },
    [close, focus, focusedTabId, move, open, reopen, updateWs],
  );

  const commands = useMemo<CommandOption[]>(() => {
    const layout = state.ws.layout;
    const hasTab = !!(findGroup(layout, layout.focusedGroup)?.active);
    const entries: Array<[id: string, label: string, enabled: boolean]> = [
      ['tabs.close', 'Close Tab', hasTab],
      ['tabs.reopen', 'Reopen Closed Tab', state.ws.recentlyClosed.length > 0],
      ['tabs.next', 'Next Tab', tabs.length > 1],
      ['tabs.previous', 'Previous Tab', tabs.length > 1],
      ['tabs.split-right', 'Move Tab to Split Right', hasTab],
      ['tabs.split-below', 'Move Tab to Split Below', hasTab],
      ['tabs.dock.right', layout.docks.right?.visible ? 'Hide Right Dock' : 'Show Right Dock', !!layout.docks.right],
      ['tabs.dock.bottom', layout.docks.bottom?.visible ? 'Hide Bottom Dock' : 'Show Bottom Dock', !!layout.docks.bottom],
      ['tabs.switch', 'Switch Tab…', !!onSwitch && tabs.length > 0],
    ];
    const list = entries
      .filter(([, , enabled]) => enabled)
      .map(([id, label]): CommandOption => ({ id, label, action: () => runCommand(id) }));
    return list;
  }, [onSwitch, runCommand, state.ws.layout, state.ws.recentlyClosed.length, tabs.length]);

  // --- per-tab operations ------------------------------------------------------------

  const tab = useMemo<TabsController['tab']>(
    () => ({
      instance: (id) => stateRef.current.ws.instances.find((i) => i.instanceId === id),
      setTitle: (id, title) =>
        updateWs((ws) => {
          const i = ws.instances.findIndex((x) => x.instanceId === id);
          if (i === -1 || ws.instances[i]!.title === title) return ws;
          const instances = [...ws.instances];
          instances[i] = { ...instances[i]!, title };
          return { ...ws, instances };
        }),
      setParams: (id, params) =>
        updateWs((ws) => {
          const i = ws.instances.findIndex((x) => x.instanceId === id);
          if (i === -1) return ws;
          const instances = [...ws.instances];
          const app = appsRef.current.get(instances[i]!.appId);
          instances[i] = { ...instances[i]!, params, paramsVersion: app?.tab?.paramsVersion ?? 1 };
          return { ...ws, instances };
        }),
      setMeta: (id, patch) =>
        update((s) => {
          const prev = s.meta.get(id) ?? DEFAULT_META;
          const next = { ...prev, ...patch };
          if (next.icon === prev.icon && next.status === prev.status && next.badge === prev.badge) return s;
          const meta = new Map(s.meta);
          meta.set(id, next);
          return { ...s, meta };
        }),
      holdWork: (id, label) => {
        const token = Symbol(label);
        const map = holdsRef.current.get(id) ?? new Map<symbol, string>();
        map.set(token, label);
        holdsRef.current.set(id, map);
        setHoldsVersion((v) => v + 1);
        return () => {
          const m = holdsRef.current.get(id);
          if (m?.delete(token)) {
            if (m.size === 0) holdsRef.current.delete(id);
            setHoldsVersion((v) => v + 1);
          }
        };
      },
      onClose: (id, handler) => {
        const set = closeHandlersRef.current.get(id) ?? new Set<() => void>();
        set.add(handler);
        closeHandlersRef.current.set(id, set);
        return () => {
          closeHandlersRef.current.get(id)?.delete(handler);
        };
      },
      holds: (id) => [...(holdsRef.current.get(id)?.values() ?? [])],
    }),
    [update, updateWs],
  );

  const heldWork = useCallback(() => {
    const out: Array<{ instanceId: string; title: string; label: string }> = [];
    for (const [instanceId, map] of holdsRef.current) {
      const title = tabsRef.current.find((t) => t.instanceId === instanceId)?.title ?? instanceId;
      for (const label of map.values()) out.push({ instanceId, title, label });
    }
    return out;
  }, []);

  // --- persistence ---------------------------------------------------------------

  const saver = useMemo(
    () => (store ? createTabSaver(store, { workspaceId, windowId }, undefined, (e) => console.error('[Hudson] tab save failed:', e)) : null),
    [store, workspaceId, windowId],
  );

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    store
      .load({ workspaceId, windowId })
      .catch((error: unknown) => {
        console.error('[Hudson] tab restore failed:', error);
        return null;
      })
      .then((saved) => {
        if (cancelled) return;
        const { newGroupId: gid, newInstanceId: iid, initialTabs: seed } = optsRef.current;
        if (saved) {
          const restored = restoreTabState(saved, appsRef.current, gid);
          update(() => ({ ws: restored.state, mounted: new Set(), tombstones: restored.tombstones, meta: new Map() }));
        } else {
          let ws = emptyTabState(gid);
          for (const t of seed ?? []) {
            if (appsRef.current.has(t.appId)) ws = openInto(ws, t, { placement: t.placement, inactive: ws.instances.length > 0 }, iid(t.appId));
          }
          update(() => ({ ...initialControllerState(gid), ws }));
        }
        setLoadedKey(`${workspaceId}\u0000${windowId}`);
      });
    return () => {
      cancelled = true;
    };
  }, [store, workspaceId, windowId, openInto, update]);

  // Memory-only controllers seed once.
  const seeded = useRef(false);
  useEffect(() => {
    if (store || seeded.current) return;
    seeded.current = true;
    const { newInstanceId: iid, initialTabs: seed } = optsRef.current;
    if (!seed?.length) return;
    updateWs((ws) => {
      let next = ws;
      for (const t of seed) {
        if (appsRef.current.has(t.appId)) next = openInto(next, t, { placement: t.placement, inactive: next.instances.length > 0 }, iid(t.appId));
      }
      return next;
    });
  }, [store, openInto, updateWs]);

  useEffect(() => {
    if (ready && saver) saver.schedule(serializableState(state.ws, apps));
  }, [apps, ready, saver, state.ws]);

  useEffect(() => {
    if (!saver) return;
    const flush = () => saver.flush();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      saver.dispose();
    };
  }, [saver]);

  const flush = useCallback(() => saver?.flush(), [saver]);

  // --- assemble ------------------------------------------------------------------

  const api = useMemo<TabsHandle>(
    () => ({ open, close, reopen, focus, move, find, tabs, runCommand, heldWork, flush }),
    [open, close, reopen, focus, move, find, tabs, runCommand, heldWork, flush],
  );

  const ops = useMemo<TabsController['ops']>(
    () => ({
      moveTo: moveToLayout,
      focusGroup: (groupId) => updateWs((ws) => (findGroup(ws.layout, groupId) && ws.layout.focusedGroup !== groupId ? { ...ws, layout: focusGroup(ws.layout, groupId) } : ws)),
      setSizes: (splitId, sizes) => updateWs((ws) => ({ ...ws, layout: setSplitSizes(ws.layout, splitId, sizes) })),
      equalise: (splitId) => updateWs((ws) => ({ ...ws, layout: equaliseSplit(ws.layout, splitId) })),
      setDockSize: (dock, size) => updateWs((ws) => ({ ...ws, layout: setDockSize(ws.layout, dock, size) })),
      toggleDock: (dock) => updateWs((ws) => (ws.layout.docks[dock] ? { ...ws, layout: setDockVisible(ws.layout, dock, !ws.layout.docks[dock]!.visible) } : ws)),
      closeNow,
    }),
    [closeNow, moveToLayout, updateWs],
  );

  const confirmClose = useCallback(() => {
    if (pendingClose) closeNow(pendingClose);
    setPendingClose(null);
  }, [closeNow, pendingClose]);
  const cancelClose = useCallback(() => setPendingClose(null), []);

  return { ready, state, apps, api, commands, pendingClose, confirmClose, cancelClose, ops, tab, holdsVersion };
}

// --- contexts ------------------------------------------------------------------

const TabsContext = createContext<TabsController | null>(null);

export function TabsControllerProvider({ controller, children }: { controller: TabsController; children: ReactNode }) {
  return <TabsContext.Provider value={controller}>{children}</TabsContext.Provider>;
}

export function useTabsControllerContext(): TabsController | null {
  return useContext(TabsContext);
}

/** The TabsApi of the nearest TabArea or TabShell. */
export function useTabs(): TabsApi {
  const controller = useContext(TabsContext);
  if (!controller) throw new Error('useTabs() must be called inside a <TabArea> or <TabShell>');
  return controller.api;
}

/** Like useTabs, but returns null outside a TabArea. */
export function useOptionalTabs(): TabsApi | null {
  return useContext(TabsContext)?.api ?? null;
}

// --- useTab ------------------------------------------------------------------------

export interface TabHandle {
  instanceId: string;
  /** On screen right now. A rendering hint only (HUD-015 principle 3). */
  visible: boolean;
  setTitle(title: string): void;
  /** null restores the app's glyph. */
  setIcon(url: string | null): void;
  setStatus(status: TabStatus | null): void;
  /** Unread count. Unread means badge > 0. */
  setBadge(count: number | null): void;
  params: unknown;
  setParams(params: unknown): void;
  /** Close this tab, e.g. after the user deleted its resource. */
  close(): void;
  /** Hold session work: closing asks first. Returns a release function. */
  holdWork(label: string): () => void;
  /** Runs when the tab is closed, and only then. */
  onClose(handler: () => void): () => void;
}

interface TabInstanceValue {
  instanceId: string;
  visible: boolean;
}

const TabInstanceContext = createContext<TabInstanceValue | null>(null);

export function TabInstanceProvider({ value, children }: { value: TabInstanceValue; children: ReactNode }) {
  return <TabInstanceContext.Provider value={value}>{children}</TabInstanceContext.Provider>;
}

const noop = () => {};

/**
 * The current tab. Outside a TabArea it still works: setTitle sets the
 * window title, and the strip-only calls do nothing (§7).
 */
export function useTab(): TabHandle {
  const controller = useContext(TabsContext);
  const instance = useContext(TabInstanceContext);
  const instanceId = instance?.instanceId ?? '';
  const visible = instance?.visible ?? true;
  const inTab = !!instance && !!controller;
  const tab = controller?.tab;
  const closeNow = controller?.ops.closeNow;
  const params = inTab ? tab!.instance(instanceId)?.params : undefined;

  // Callbacks depend only on the tab's identity, so effects that list them
  // (holdWork, onClose) do not re-run when visibility or params change.
  const actions = useMemo(() => {
    if (!inTab || !tab || !closeNow) {
      return {
        setTitle: (title: string) => {
          if (typeof document !== 'undefined') document.title = title;
        },
        setIcon: noop,
        setStatus: noop,
        setBadge: noop,
        setParams: noop,
        close: noop,
        holdWork: () => noop,
        onClose: () => noop,
      } satisfies Omit<TabHandle, 'instanceId' | 'visible' | 'params'>;
    }
    return {
      setTitle: (title: string) => tab.setTitle(instanceId, title),
      setIcon: (icon: string | null) => tab.setMeta(instanceId, { icon }),
      setStatus: (status: TabStatus | null) => tab.setMeta(instanceId, { status }),
      setBadge: (badge: number | null) => tab.setMeta(instanceId, { badge }),
      setParams: (p: unknown) => tab.setParams(instanceId, p),
      close: () => closeNow(instanceId),
      holdWork: (label: string) => tab.holdWork(instanceId, label),
      onClose: (handler: () => void) => tab.onClose(instanceId, handler),
    } satisfies Omit<TabHandle, 'instanceId' | 'visible' | 'params'>;
  }, [closeNow, inTab, instanceId, tab]);

  return useMemo(() => ({ ...actions, instanceId, visible, params }), [actions, instanceId, params, visible]);
}

