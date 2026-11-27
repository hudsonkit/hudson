import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudsonApp } from '../src/types/app';
import type { TabLayoutSnapshot, TabWorkspaceState } from '../src/types/tabs';
import { addTab, allTabs, createLayout, findGroup, mainGroups, removeTab } from '../src/workspace/tabs/layout';
import { migrateInstance, reopenPlacement, resolvePlacement, restoreTabState } from '../src/workspace/tabs/restore';
import { createLocalTabStore, createMemoryTabStore, createTabSaver, tabStorageKey } from '../src/workspace/tabs/store';
import { serializableState } from '../src/workspace/tabs/controller';

function ids(prefix = 'n') {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function app(id: string, tab?: HudsonApp['tab']): HudsonApp {
  return {
    id,
    name: id,
    mode: 'panel',
    tab,
    Provider: ({ children }) => children,
    slots: { Content: () => null },
    hooks: { useCommands: () => [], useStatus: () => ({ label: 'READY', color: 'emerald' }) },
  } as HudsonApp;
}

const registry = (...apps: HudsonApp[]) => new Map(apps.map((a) => [a.id, a]));

function saved(layout: TabLayoutSnapshot, instances: TabWorkspaceState['instances']): TabWorkspaceState {
  return { instances, layout, recentlyClosed: [] };
}

describe('restoreTabState', () => {
  it('restores a valid workspace unchanged', () => {
    const layout = createLayout(ids('g'), ['a', 'b']);
    const state = saved(layout, [
      { instanceId: 'a', appId: 'notes' },
      { instanceId: 'b', appId: 'notes', params: { id: 1 }, paramsVersion: 1 },
    ]);
    const result = restoreTabState(JSON.parse(JSON.stringify(state)), registry(app('notes')), ids('x'));
    expect(result.repaired).toBe(false);
    expect(result.tombstones.size).toBe(0);
    expect(result.state).toEqual(state);
  });

  it('keeps tabs of unknown apps as tombstones', () => {
    const state = saved(createLayout(ids('g'), ['a', 'b']), [
      { instanceId: 'a', appId: 'notes' },
      { instanceId: 'b', appId: 'gone', title: 'Old thing' },
    ]);
    const result = restoreTabState(state, registry(app('notes')), ids('x'));
    expect(result.tombstones.get('b')).toBe('unknown-app');
    expect(result.state.instances.map((i) => i.instanceId)).toEqual(['a', 'b']);
    expect(allTabs(result.state.layout)).toEqual(['a', 'b']);
  });

  it('migrates params, and tombstones params the app rejects', () => {
    const notes = app('notes', {
      paramsVersion: 2,
      migrateParams: (p, from) => (from === 1 && (p as { ok: boolean }).ok ? { upgraded: true } : null),
    });
    const state = saved(createLayout(ids('g'), ['a', 'b']), [
      { instanceId: 'a', appId: 'notes', params: { ok: true }, paramsVersion: 1 },
      { instanceId: 'b', appId: 'notes', params: { ok: false }, paramsVersion: 1 },
    ]);
    const result = restoreTabState(state, registry(notes), ids('x'));
    expect(result.state.instances[0]).toMatchObject({ params: { upgraded: true }, paramsVersion: 2 });
    expect(result.tombstones.get('b')).toBe('params-rejected');
    expect(result.repaired).toBe(true);
  });

  it('treats a throwing migration as a rejection', () => {
    const notes = app('notes', {
      paramsVersion: 2,
      migrateParams: () => {
        throw new Error('nope');
      },
    });
    expect(migrateInstance({ instanceId: 'a', appId: 'notes', params: {}, paramsVersion: 1 }, notes)).toBeNull();
  });

  it('passes params through when the app has no migration', () => {
    const notes = app('notes', { paramsVersion: 3 });
    const instance = { instanceId: 'a', appId: 'notes', params: { v: 1 }, paramsVersion: 1 };
    expect(migrateInstance(instance, notes)).toBe(instance);
  });

  it('adds instances the layout lost, and drops layout tabs with no instance', () => {
    const state = saved(createLayout(ids('g'), ['a', 'ghost']), [
      { instanceId: 'a', appId: 'notes' },
      { instanceId: 'b', appId: 'notes' },
    ]);
    const result = restoreTabState(state, registry(app('notes')), ids('x'));
    expect(allTabs(result.state.layout)).toEqual(['a', 'b']);
    expect(result.repaired).toBe(true);
  });

  it('drops malformed and duplicate instances', () => {
    const state = {
      instances: [{ instanceId: 'a', appId: 'notes' }, { instanceId: 'a', appId: 'notes' }, { nope: true }, null],
      layout: createLayout(ids('g'), ['a']),
      recentlyClosed: [],
    };
    const result = restoreTabState(state, registry(app('notes')), ids('x'));
    expect(result.state.instances).toHaveLength(1);
    expect(result.repaired).toBe(true);
  });

  it('filters closed history and keeps hostState untouched', () => {
    const state = {
      ...saved(createLayout(ids('g'), ['a']), [{ instanceId: 'a', appId: 'notes' }]),
      recentlyClosed: [
        { instance: { instanceId: 'a', appId: 'notes' }, from: { group: 'g1', index: 0 } }, // still open
        { instance: { instanceId: 'c', appId: 'notes' }, from: { group: 'g1', index: 1 } },
        { garbage: true },
      ],
      hostState: { windowBounds: { x: 1 } },
    };
    const result = restoreTabState(state, registry(app('notes')), ids('x'));
    expect(result.state.recentlyClosed.map((c) => c.instance.instanceId)).toEqual(['c']);
    expect(result.state.hostState).toEqual({ windowBounds: { x: 1 } });
  });

  it('falls back to an empty workspace for garbage', () => {
    for (const junk of [null, undefined, 'x', 42]) {
      const result = restoreTabState(junk, registry(app('notes')), ids('x'));
      expect(result.state.instances).toEqual([]);
      expect(mainGroups(result.state.layout)).toHaveLength(1);
    }
  });
});

describe('resolvePlacement', () => {
  function layout() {
    const newId = ids('g');
    let l = createLayout(newId, ['a', 'b']);
    l = addTab(l, 'd', { kind: 'dock', dock: 'right' }, newId, { activate: true, focus: false });
    return l;
  }

  it('defaults to the focused group', () => {
    expect(resolvePlacement(undefined, { layout: layout() })).toEqual({ kind: 'group', group: 'g1' });
    expect(resolvePlacement('focused', { layout: layout() })).toEqual({ kind: 'group', group: 'g1' });
  });

  it('beside goes after the requester, else after the focused tab', () => {
    const l = layout();
    expect(resolvePlacement('beside', { layout: l, requester: 'a' })).toEqual({ kind: 'group', group: 'g1', index: 1 });
    expect(resolvePlacement('beside', { layout: l })).toEqual({ kind: 'group', group: 'g1', index: 1 });
  });

  it('right and below split the focused group with the app size', () => {
    expect(resolvePlacement('right', { layout: layout(), size: 0.3 })).toEqual({
      kind: 'split',
      group: 'g1',
      edge: 'right',
      size: 0.3,
    });
  });

  it('splitting from a focused dock splits the main area', () => {
    const l = { ...layout(), focusedGroup: 'g2' };
    expect(resolvePlacement('below', { layout: l })).toMatchObject({ kind: 'split', group: 'g1', edge: 'bottom' });
  });

  it('beside another tab, with or without a split', () => {
    const l = layout();
    expect(resolvePlacement({ beside: 'b' }, { layout: l })).toEqual({ kind: 'group', group: 'g1', index: 2 });
    expect(resolvePlacement({ beside: 'a', split: 'right' }, { layout: l })).toMatchObject({ kind: 'split', group: 'g1' });
    // A tab in a dock can't be split beside; it goes next to it instead.
    expect(resolvePlacement({ beside: 'd', split: 'below' }, { layout: l })).toEqual({ kind: 'group', group: 'g2', index: 1 });
    expect(resolvePlacement({ beside: 'missing' }, { layout: l })).toEqual({ kind: 'group', group: 'g1' });
  });

  it('unknown groups fall back to the focused group', () => {
    expect(resolvePlacement({ group: 'nope' }, { layout: layout() })).toEqual({ kind: 'group', group: 'g1' });
    expect(resolvePlacement({ dock: 'bottom' }, { layout: layout(), size: 0.2 })).toEqual({ kind: 'dock', dock: 'bottom', size: 0.2 });
  });
});

describe('reopenPlacement', () => {
  it('returns to the same group and index while it exists', () => {
    const l = createLayout(ids('g'), ['a', 'b']);
    const closed = { instance: { instanceId: 'c', appId: 'x' }, from: { group: 'g1', index: 1 } };
    expect(reopenPlacement(closed, l, undefined)).toEqual({ kind: 'group', group: 'g1', index: 1 });
  });

  it('falls back to its dock, then the app default', () => {
    const newId = ids('g');
    let l = createLayout(newId, ['a']);
    l = addTab(l, 'd', { kind: 'dock', dock: 'right' }, newId);
    l = removeTab(l, 'd');
    const fromDock = { instance: { instanceId: 'd', appId: 'x' }, from: { group: 'g2', index: 0, dock: 'right' as const } };
    expect(reopenPlacement(fromDock, l, undefined, 0.4)).toEqual({ kind: 'dock', dock: 'right', size: 0.4 });
    const fromGone = { instance: { instanceId: 'e', appId: 'x' }, from: { group: 'gone', index: 0 } };
    expect(reopenPlacement(fromGone, l, { dock: 'bottom' })).toEqual({ kind: 'dock', dock: 'bottom' });
    expect(findGroup(l, 'g1')).toBeDefined();
  });
});

describe('serializableState', () => {
  it('leaves out tabs whose app does not persist', () => {
    const newId = ids('g');
    let layout = createLayout(newId, ['a']);
    layout = addTab(layout, 's', { kind: 'split', group: 'g1', edge: 'right' }, newId);
    const ws = saved(layout, [
      { instanceId: 'a', appId: 'notes' },
      { instanceId: 's', appId: 'stopwatch' },
    ]);
    const out = serializableState(ws, registry(app('notes'), app('stopwatch', { persists: false })));
    expect(out.instances.map((i) => i.instanceId)).toEqual(['a']);
    expect(allTabs(out.layout)).toEqual(['a']);
    expect(out.layout.root.type).toBe('group');
  });
});

describe('tab stores', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage', async () => {
    const store = createLocalTabStore();
    const key = { workspaceId: 'w', windowId: 'main' };
    const state = saved(createLayout(ids('g'), ['a']), [{ instanceId: 'a', appId: 'notes' }]);
    await store.save(key, state);
    expect(await store.load(key)).toEqual(state);
    expect(await store.load({ workspaceId: 'w', windowId: 'other' })).toBeNull();
  });

  it('keeps an unreadable snapshot beside the key and loads nothing', async () => {
    const key = { workspaceId: 'w', windowId: 'main' };
    localStorage.setItem(tabStorageKey(key), '{not json');
    expect(await createLocalTabStore().load(key)).toBeNull();
    expect(localStorage.getItem(`${tabStorageKey(key)}.unreadable`)).toBe('{not json');
  });

  it('memory store snapshots what was saved', async () => {
    const store = createMemoryTabStore();
    const key = { workspaceId: 'w', windowId: 'main' };
    const state = saved(createLayout(ids('g')), []);
    await store.save(key, state);
    expect(store.snapshot(key)).toEqual(state);
  });
});

describe('createTabSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const state = (n: number) => saved(createLayout(() => `g${n}`), []);

  it('debounces to the latest state', () => {
    const save = vi.fn(async (_key: unknown, _state: TabWorkspaceState) => {});
    const saver = createTabSaver({ load: async () => null, save }, { workspaceId: 'w', windowId: 'm' }, 300);
    saver.schedule(state(1));
    vi.advanceTimersByTime(200);
    saver.schedule(state(2));
    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toEqual(state(2));
  });

  it('flush writes immediately, and dispose flushes then stops', () => {
    const save = vi.fn(async () => {});
    const saver = createTabSaver({ load: async () => null, save }, { workspaceId: 'w', windowId: 'm' });
    saver.schedule(state(1));
    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    saver.schedule(state(2));
    saver.dispose();
    expect(save).toHaveBeenCalledTimes(2);
    saver.schedule(state(3));
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('reports save errors instead of throwing', async () => {
    vi.useRealTimers();
    const onError = vi.fn();
    const saver = createTabSaver({ load: async () => null, save: async () => Promise.reject(new Error('disk')) }, { workspaceId: 'w', windowId: 'm' }, 0, onError);
    saver.schedule(state(1));
    saver.flush();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
