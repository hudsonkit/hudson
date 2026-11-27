import { describe, expect, it } from 'vitest';
import {
  activateTab,
  addTab,
  allTabs,
  createLayout,
  cycleTab,
  equaliseSplit,
  findGroup,
  focusedTab,
  locateTab,
  mainGroups,
  moveTab,
  removeTab,
  repairLayout,
  selectByNumber,
  setDockSize,
  setDockVisible,
  setSplitSizes,
  toggleDock,
  visibleGroups,
} from '../src/workspace/tabs/layout';
import type { TabLayoutSnapshot, TabSplitNode } from '../src/types/tabs';

function ids() {
  let n = 0;
  return () => `n${++n}`;
}

function base(tabs: string[] = ['a', 'b', 'c']) {
  const newId = ids();
  return { newId, layout: createLayout(newId, tabs) };
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

describe('createLayout', () => {
  it('starts with one focused group', () => {
    const { layout } = base();
    expect(layout.root).toEqual({ type: 'group', id: 'n1', tabs: ['a', 'b', 'c'], active: 'a' });
    expect(layout.focusedGroup).toBe('n1');
    expect(layout.docks).toEqual({});
  });

  it('allows an empty layout', () => {
    const { layout } = base([]);
    expect(focusedTab(layout)).toBeNull();
  });
});

describe('addTab', () => {
  it('appends to a group, activates and focuses it', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'd', { kind: 'group', group: 'n1' }, newId);
    expect(findGroup(next, 'n1')!.tabs).toEqual(['a', 'b', 'c', 'd']);
    expect(focusedTab(next)).toBe('d');
  });

  it('inserts at an index, clamped', () => {
    const { layout, newId } = base();
    expect(findGroup(addTab(layout, 'd', { kind: 'group', group: 'n1', index: 1 }, newId), 'n1')!.tabs).toEqual([
      'a', 'd', 'b', 'c',
    ]);
    expect(findGroup(addTab(layout, 'd', { kind: 'group', group: 'n1', index: 99 }, newId), 'n1')!.tabs).toEqual([
      'a', 'b', 'c', 'd',
    ]);
  });

  it('does not mutate its input', () => {
    const { layout, newId } = base();
    const before = JSON.stringify(layout);
    addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    addTab(layout, 'e', { kind: 'dock', dock: 'right' }, newId);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it('opens inactive without moving focus', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'd', { kind: 'group', group: 'n1' }, newId, { activate: false });
    expect(focusedTab(next)).toBe('a');
  });

  it('splits a group to the right', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    const root = next.root as TabSplitNode;
    expect(root.type).toBe('split');
    expect(root.direction).toBe('row');
    expect(root.children.map((c) => c.id)).toEqual(['n1', 'n2']);
    expect(root.sizes).toEqual([0.5, 0.5]);
    expect(focusedTab(next)).toBe('d');
  });

  it('splits above with a column and the new group first', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'top', size: 0.3 }, newId);
    const root = next.root as TabSplitNode;
    expect(root.direction).toBe('column');
    expect(root.children[0]!.id).toBe('n2');
    expect(root.sizes[0]).toBeCloseTo(0.3);
  });

  it('adds a sibling to a same-direction split instead of nesting', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = addTab(next, 'e', { kind: 'split', group: 'n2', edge: 'right' }, newId);
    const root = next.root as TabSplitNode;
    expect(root.children).toHaveLength(3);
    expect(sum(root.sizes)).toBeCloseTo(1);
    expect(root.sizes[0]).toBeCloseTo(0.5);
  });

  it('nests when the direction differs', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = addTab(next, 'e', { kind: 'split', group: 'n2', edge: 'bottom' }, newId);
    const root = next.root as TabSplitNode;
    expect(root.children).toHaveLength(2);
    const inner = root.children[1] as TabSplitNode;
    expect(inner.type).toBe('split');
    expect(inner.direction).toBe('column');
  });

  it('creates a dock with the default size and shows a hidden dock', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'right' }, newId);
    expect(next.docks.right).toMatchObject({ visible: true, size: 0.38 });
    expect(focusedTab(next)).toBe('d');
    next = setDockVisible(next, 'right', false);
    next = addTab(next, 'e', { kind: 'dock', dock: 'right' }, newId);
    expect(next.docks.right!.visible).toBe(true);
    expect(next.docks.right!.group.tabs).toEqual(['d', 'e']);
  });

  it('does not split a dock; it adds to it', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'bottom' }, newId);
    const dockId = next.docks.bottom!.group.id;
    next = addTab(next, 'e', { kind: 'split', group: dockId, edge: 'right' }, newId);
    expect(next.docks.bottom!.group.tabs).toEqual(['d', 'e']);
    expect(next.root.type).toBe('group');
  });

  it('moves a tab that already exists instead of duplicating it', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'a', { kind: 'dock', dock: 'right' }, newId);
    expect(allTabs(next)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to the focused group for an unknown group', () => {
    const { layout, newId } = base();
    const next = addTab(layout, 'd', { kind: 'group', group: 'nope' }, newId);
    expect(findGroup(next, 'n1')!.tabs).toContain('d');
  });
});

describe('removeTab', () => {
  it('focuses the right neighbour, then the left', () => {
    const { layout } = base();
    let next = activateTab(layout, 'b');
    next = removeTab(next, 'b');
    expect(focusedTab(next)).toBe('c');
    next = removeTab(next, 'c');
    expect(focusedTab(next)).toBe('a');
  });

  it('keeps the active tab when removing another', () => {
    const { layout } = base();
    const next = removeTab(layout, 'c');
    expect(focusedTab(next)).toBe('a');
  });

  it('closes an empty split group and collapses the split', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = removeTab(next, 'd');
    expect(next.root.type).toBe('group');
    expect(next.root.id).toBe('n1');
    expect(next.focusedGroup).toBe('n1');
  });

  it('renormalises sizes when a three-way split loses a child', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = addTab(next, 'e', { kind: 'split', group: 'n2', edge: 'right' }, newId);
    next = removeTab(next, 'd');
    const root = next.root as TabSplitNode;
    expect(root.children).toHaveLength(2);
    expect(sum(root.sizes)).toBeCloseTo(1);
  });

  it('keeps the last main group, empty', () => {
    const { layout } = base(['a']);
    const next = removeTab(layout, 'a');
    expect(next.root).toMatchObject({ type: 'group', tabs: [], active: null });
    expect(next.focusedGroup).toBe(next.root.id);
  });

  it('removes an empty dock and returns focus to the main tree', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'right' }, newId);
    next = removeTab(next, 'd');
    expect(next.docks.right).toBeUndefined();
    expect(next.focusedGroup).toBe('n1');
  });

  it('is a no-op for an unknown tab', () => {
    const { layout } = base();
    expect(removeTab(layout, 'zzz')).toEqual(layout);
  });
});

describe('moveTab', () => {
  it('reorders within a group', () => {
    const { layout, newId } = base();
    const next = moveTab(layout, 'c', { kind: 'group', group: 'n1', index: 0 }, newId);
    expect(findGroup(next, 'n1')!.tabs).toEqual(['c', 'a', 'b']);
    expect(focusedTab(next)).toBe('c');
  });

  it('moves between groups and prunes the source', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = moveTab(next, 'd', { kind: 'group', group: 'n1' }, newId);
    expect(next.root.type).toBe('group');
    expect(allTabs(next)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('splitting a group by its only tab is a no-op', () => {
    const { layout, newId } = base(['a']);
    const next = moveTab(layout, 'a', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    expect(next).toEqual(layout);
  });

  it('drags a tab out to a new split', () => {
    const { layout, newId } = base();
    const next = moveTab(layout, 'b', { kind: 'split', group: 'n1', edge: 'bottom' }, newId);
    expect(mainGroups(next).map((g) => g.tabs)).toEqual([['a', 'c'], ['b']]);
  });
});

describe('docks', () => {
  it('hiding the focused dock moves focus to the main tree and keeps its tabs', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'bottom' }, newId);
    next = toggleDock(next, 'bottom');
    expect(next.docks.bottom).toMatchObject({ visible: false });
    expect(next.docks.bottom!.group.tabs).toEqual(['d']);
    expect(next.focusedGroup).toBe('n1');
    expect(visibleGroups(next)).toHaveLength(1);
  });

  it('activating a tab in a hidden dock shows the dock', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'bottom' }, newId);
    next = setDockVisible(next, 'bottom', false);
    next = activateTab(next, 'd');
    expect(next.docks.bottom!.visible).toBe(true);
    expect(focusedTab(next)).toBe('d');
  });

  it('clamps dock size', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'dock', dock: 'right' }, newId);
    next = setDockSize(next, 'right', 4);
    expect(next.docks.right!.size).toBe(0.95);
  });

  it('toggling a missing dock does nothing', () => {
    const { layout } = base();
    expect(toggleDock(layout, 'right')).toEqual(layout);
  });
});

describe('split sizes', () => {
  it('normalises and ignores a wrong count', () => {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    const splitId = next.root.id;
    next = setSplitSizes(next, splitId, [3, 1]);
    expect((next.root as TabSplitNode).sizes).toEqual([0.75, 0.25]);
    next = setSplitSizes(next, splitId, [1, 1, 1]);
    expect((next.root as TabSplitNode).sizes).toEqual([0.75, 0.25]);
    next = equaliseSplit(next, splitId);
    expect((next.root as TabSplitNode).sizes).toEqual([0.5, 0.5]);
  });
});

describe('navigation', () => {
  function twoGroups() {
    const { layout, newId } = base();
    let next = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = addTab(next, 'e', { kind: 'group', group: 'n2' }, newId);
    next = addTab(next, 'f', { kind: 'dock', dock: 'bottom' }, newId);
    return { layout: activateTab(next, 'c'), newId };
  }

  it('cycles across the workspace in layout order and wraps', () => {
    const { layout } = twoGroups();
    expect(cycleTab(layout, 1)).toBe('d');
    expect(cycleTab(activateTab(layout, 'f'), 1)).toBe('a');
    expect(cycleTab(activateTab(layout, 'a'), -1)).toBe('f');
  });

  it('skips hidden docks', () => {
    const { layout } = twoGroups();
    const hidden = setDockVisible(activateTab(layout, 'e'), 'bottom', false);
    expect(cycleTab(hidden, 1)).toBe('a');
  });

  it('cycles within the focused group', () => {
    const { layout } = twoGroups();
    expect(cycleTab(layout, 1, 'group')).toBe('a');
    expect(cycleTab(layout, -1, 'group')).toBe('b');
  });

  it('returns null when empty', () => {
    expect(cycleTab(base([]).layout, 1)).toBeNull();
  });

  it('selects by number, with 9 meaning last', () => {
    const { layout } = twoGroups();
    expect(selectByNumber(layout, 1, 'tab')).toBe('a');
    expect(selectByNumber(layout, 3, 'tab')).toBe('c');
    expect(selectByNumber(layout, 5, 'tab')).toBeNull();
    expect(selectByNumber(layout, 9, 'tab')).toBe('c');
    expect(selectByNumber(layout, 2, 'group')).toBe('n2');
    expect(selectByNumber(layout, 9, 'group')).toBe(layout.docks.bottom!.group.id);
    expect(selectByNumber(layout, 0, 'tab')).toBeNull();
  });

  it('locates tabs in docks', () => {
    const { layout } = twoGroups();
    expect(locateTab(layout, 'f')).toMatchObject({ dock: 'bottom', index: 0 });
    expect(locateTab(layout, 'a')).toMatchObject({ index: 0 });
    expect(locateTab(layout, 'a')!.dock).toBeUndefined();
  });
});

describe('repairLayout', () => {
  const known = new Set(['a', 'b', 'c', 'd']);

  it('passes a valid layout through unchanged', () => {
    const { layout, newId } = base();
    const split = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    const result = repairLayout(JSON.parse(JSON.stringify(split)), known, ids());
    expect(result.repaired).toBe(false);
    expect(result.dropped).toEqual([]);
    expect(result.layout).toEqual(split);
  });

  it('drops unknown and duplicate tabs and fixes active', () => {
    const input = {
      version: 1,
      root: { type: 'group', id: 'g', tabs: ['a', 'x', 'a', 'b'], active: 'x' },
      docks: {},
      focusedGroup: 'g',
    };
    const result = repairLayout(input, known, ids());
    expect(result.layout.root).toEqual({ type: 'group', id: 'g', tabs: ['a', 'b'], active: 'a' });
    expect(result.dropped).toEqual(['x', 'a']);
    expect(result.repaired).toBe(true);
  });

  it('collapses splits whose children empty out', () => {
    const input = {
      version: 1,
      root: {
        type: 'split',
        id: 's',
        direction: 'row',
        children: [
          { type: 'group', id: 'g1', tabs: ['a'], active: 'a' },
          { type: 'group', id: 'g2', tabs: ['gone'], active: 'gone' },
        ],
        sizes: [0.5, 0.5],
      },
      docks: {},
      focusedGroup: 'g2',
    };
    const result = repairLayout(input, known, ids());
    expect(result.layout.root).toEqual({ type: 'group', id: 'g1', tabs: ['a'], active: 'a' });
    expect(result.layout.focusedGroup).toBe('g1');
  });

  it('normalises bad sizes', () => {
    const input = {
      version: 1,
      root: {
        type: 'split',
        id: 's',
        direction: 'column',
        children: [
          { type: 'group', id: 'g1', tabs: ['a'], active: 'a' },
          { type: 'group', id: 'g2', tabs: ['b'], active: 'b' },
        ],
        sizes: [2, 'x'],
      },
      docks: {},
      focusedGroup: 'g1',
    };
    const result = repairLayout(input, known, ids());
    expect((result.layout.root as TabSplitNode).sizes).toEqual([1, 0]);
    expect(result.repaired).toBe(true);
  });

  it('gives duplicate node IDs fresh ones', () => {
    const input = {
      version: 1,
      root: {
        type: 'split',
        id: 'same',
        direction: 'row',
        children: [
          { type: 'group', id: 'same', tabs: ['a'], active: 'a' },
          { type: 'group', id: 'g2', tabs: ['b'], active: 'b' },
        ],
        sizes: [0.5, 0.5],
      },
      docks: {},
      focusedGroup: 'g2',
    };
    const result = repairLayout(input, known, ids());
    const groupIds = mainGroups(result.layout).map((g) => g.id);
    expect(new Set([result.layout.root.id, ...groupIds]).size).toBe(3);
  });

  it('repairs docks: drops empty ones, clamps size, keeps a tab out of two places', () => {
    const input = {
      version: 1,
      root: { type: 'group', id: 'g', tabs: ['a', 'b'], active: 'a' },
      docks: {
        right: { group: { type: 'group', id: 'r', tabs: ['b', 'c'], active: 'b' }, visible: true, size: 7 },
        bottom: { group: { type: 'group', id: 'bt', tabs: ['nope'], active: null }, visible: true, size: 0.3 },
      },
      focusedGroup: 'r',
    };
    const result = repairLayout(input, known, ids());
    expect(result.layout.docks.right).toEqual({
      group: { type: 'group', id: 'r', tabs: ['c'], active: 'c' },
      visible: true,
      size: 0.95,
    });
    expect(result.layout.docks.bottom).toBeUndefined();
    expect(result.layout.focusedGroup).toBe('r');
  });

  it('does not focus a hidden dock', () => {
    const input = {
      version: 1,
      root: { type: 'group', id: 'g', tabs: ['a'], active: 'a' },
      docks: { right: { group: { type: 'group', id: 'r', tabs: ['b'], active: 'b' }, visible: false, size: 0.4 } },
      focusedGroup: 'r',
    };
    expect(repairLayout(input, known, ids()).layout.focusedGroup).toBe('g');
  });

  it('survives garbage', () => {
    for (const junk of [null, 42, 'x', {}, { version: 2 }, { root: { type: 'weird' } }]) {
      const result = repairLayout(junk, known, ids());
      expect(result.repaired).toBe(true);
      expect(result.layout.root).toMatchObject({ type: 'group', tabs: [] });
      expect(result.layout.focusedGroup).toBe(result.layout.root.id);
    }
  });

  it('round-trips every operation through JSON', () => {
    const { layout, newId } = base();
    let next: TabLayoutSnapshot = addTab(layout, 'd', { kind: 'split', group: 'n1', edge: 'right' }, newId);
    next = moveTab(next, 'b', { kind: 'dock', dock: 'bottom' }, newId);
    const result = repairLayout(JSON.parse(JSON.stringify(next)), known, ids());
    expect(result.repaired).toBe(false);
    expect(result.layout).toEqual(next);
  });
});
