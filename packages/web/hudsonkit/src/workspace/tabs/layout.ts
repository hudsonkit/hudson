// ---------------------------------------------------------------------------
// Tab layout — pure operations over a TabLayoutSnapshot (HUD-015 §4, §10).
//
// Every function takes a snapshot and returns a new one; inputs are never
// mutated. No DOM, no React. IDs for new groups and splits come from the
// caller's `newId`, so tests are deterministic.
// ---------------------------------------------------------------------------
import type {
  DockState,
  TabCycleScope,
  TabDock,
  TabGroupNode,
  TabLayoutNode,
  TabLayoutSnapshot,
  TabSplitNode,
} from '../../types/tabs';

export type NewId = () => string;

/** Default dock sizes: Linea's values (HUD-015 §4). */
export const DEFAULT_DOCK_SIZE: Record<TabDock, number> = { right: 0.38, bottom: 0.3 };

const DOCKS: TabDock[] = ['right', 'bottom'];
const MIN_SHARE = 0.05;

/** Where to put a tab, resolved to layout terms. */
export type LayoutPlacement =
  | { kind: 'group'; group: string; index?: number }
  | { kind: 'split'; group: string; edge: SplitEdge; size?: number }
  | { kind: 'dock'; dock: TabDock; size?: number };

export type SplitEdge = 'left' | 'right' | 'top' | 'bottom';

export interface TabLocation {
  group: TabGroupNode;
  index: number;
  dock?: TabDock;
}

// --- construction ----------------------------------------------------------

export function createLayout(newId: NewId, tabs: string[] = []): TabLayoutSnapshot {
  const group: TabGroupNode = { type: 'group', id: newId(), tabs: [...tabs], active: tabs[0] ?? null };
  return { version: 1, root: group, docks: {}, focusedGroup: group.id };
}

// --- queries ---------------------------------------------------------------

/** Groups in the main tree, in reading order (depth-first). */
export function mainGroups(layout: TabLayoutSnapshot): TabGroupNode[] {
  const out: TabGroupNode[] = [];
  const walk = (node: TabLayoutNode) => {
    if (node.type === 'group') out.push(node);
    else node.children.forEach(walk);
  };
  walk(layout.root);
  return out;
}

/** Main groups first, then dock groups (right, bottom). */
export function allGroups(layout: TabLayoutSnapshot): TabGroupNode[] {
  const docks = DOCKS.flatMap((d) => (layout.docks[d] ? [layout.docks[d]!.group] : []));
  return [...mainGroups(layout), ...docks];
}

export function findGroup(layout: TabLayoutSnapshot, groupId: string): TabGroupNode | undefined {
  return allGroups(layout).find((g) => g.id === groupId);
}

/** The dock a group belongs to, if it is a dock group. */
export function dockOf(layout: TabLayoutSnapshot, groupId: string): TabDock | undefined {
  return DOCKS.find((d) => layout.docks[d]?.group.id === groupId);
}

export function locateTab(layout: TabLayoutSnapshot, instanceId: string): TabLocation | undefined {
  for (const group of allGroups(layout)) {
    const index = group.tabs.indexOf(instanceId);
    if (index !== -1) return { group, index, dock: dockOf(layout, group.id) };
  }
  return undefined;
}

/** Every tab ID in layout order: main groups, then docks. */
export function allTabs(layout: TabLayoutSnapshot): string[] {
  return allGroups(layout).flatMap((g) => g.tabs);
}

export function focusedTab(layout: TabLayoutSnapshot): string | null {
  return findGroup(layout, layout.focusedGroup)?.active ?? null;
}

// --- internal tree helpers (operate on clones) ----------------------------

function cloneNode(node: TabLayoutNode): TabLayoutNode {
  if (node.type === 'group') return { ...node, tabs: [...node.tabs] };
  return { ...node, children: node.children.map(cloneNode), sizes: [...node.sizes] };
}

function clone(layout: TabLayoutSnapshot): TabLayoutSnapshot {
  const docks: TabLayoutSnapshot['docks'] = {};
  for (const d of DOCKS) {
    const dock = layout.docks[d];
    if (dock) docks[d] = { ...dock, group: cloneNode(dock.group) as TabGroupNode };
  }
  return { ...layout, root: cloneNode(layout.root), docks };
}

function groupIn(layout: TabLayoutSnapshot, groupId: string): TabGroupNode | undefined {
  return findGroup(layout, groupId);
}

/** Replace `target` wherever it sits in the main tree. */
function replaceNode(layout: TabLayoutSnapshot, targetId: string, next: TabLayoutNode): void {
  if (layout.root.id === targetId) {
    layout.root = next;
    return;
  }
  const walk = (node: TabLayoutNode): boolean => {
    if (node.type === 'group') return false;
    const i = node.children.findIndex((c) => c.id === targetId);
    if (i !== -1) {
      node.children[i] = next;
      return true;
    }
    return node.children.some(walk);
  };
  walk(layout.root);
}

function parentOf(root: TabLayoutNode, id: string): TabSplitNode | undefined {
  if (root.type === 'group') return undefined;
  if (root.children.some((c) => c.id === id)) return root;
  for (const child of root.children) {
    const found = parentOf(child, id);
    if (found) return found;
  }
  return undefined;
}

function normalise(sizes: number[]): number[] {
  if (sizes.length === 0) return [];
  const clean = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return sizes.map(() => 1 / sizes.length);
  return clean.map((s) => s / total);
}

/** Remove an empty group from the main tree and collapse single-child splits. */
function pruneGroup(layout: TabLayoutSnapshot, groupId: string): void {
  if (layout.root.id === groupId) return; // the last main group stays, empty
  const parent = parentOf(layout.root, groupId);
  if (!parent) return;
  const i = parent.children.findIndex((c) => c.id === groupId);
  parent.children.splice(i, 1);
  parent.sizes.splice(i, 1);
  parent.sizes = normalise(parent.sizes);
  if (parent.children.length === 1) replaceNode(layout, parent.id, parent.children[0]!);
}

function setActiveAfterRemoval(group: TabGroupNode, removedIndex: number, wasActive: boolean): void {
  if (!wasActive) return;
  // Focus goes to the neighbour on the right, else the left (HUD-015 §10).
  group.active = group.tabs[removedIndex] ?? group.tabs[removedIndex - 1] ?? null;
}

/** Pick a focus target after the focused group disappears. */
function refocus(layout: TabLayoutSnapshot, preferred?: string): void {
  const groups = allGroups(layout);
  if (preferred && groups.some((g) => g.id === preferred)) {
    layout.focusedGroup = preferred;
    return;
  }
  if (groups.some((g) => g.id === layout.focusedGroup)) return;
  layout.focusedGroup = (groups.find((g) => g.tabs.length > 0) ?? mainGroups(layout)[0]!).id;
}

// --- tab operations --------------------------------------------------------

export interface AddTabOptions {
  /** Make it the active tab of its group. Default true. */
  activate?: boolean;
  /** Also focus its group. Default true. Ignored when activate is false. */
  focus?: boolean;
}

/**
 * Add a tab. If the tab already exists it is moved instead (see moveTab).
 * Opening into a hidden dock shows the dock (HUD-015 §6).
 */
export function addTab(
  layout: TabLayoutSnapshot,
  instanceId: string,
  placement: LayoutPlacement,
  newId: NewId,
  options: AddTabOptions = {},
): TabLayoutSnapshot {
  const activate = options.activate ?? true;
  const focus = activate && (options.focus ?? true);
  let next = locateTab(layout, instanceId) ? removeTab(layout, instanceId) : clone(layout);
  let target: TabGroupNode;

  if (placement.kind === 'dock') {
    const existing = next.docks[placement.dock];
    if (existing) {
      existing.visible = true;
      target = existing.group;
    } else {
      target = { type: 'group', id: newId(), tabs: [], active: null };
      const dock: DockState = {
        group: target,
        visible: true,
        size: placement.size ?? DEFAULT_DOCK_SIZE[placement.dock],
      };
      next.docks[placement.dock] = dock;
    }
    target.tabs.push(instanceId);
  } else if (placement.kind === 'split') {
    const anchor = groupIn(next, placement.group);
    if (!anchor || dockOf(next, anchor.id)) {
      // Docks don't split; fall back to adding to the anchor (or focused) group.
      const fallback = anchor ?? groupIn(next, next.focusedGroup) ?? mainGroups(next)[0]!;
      fallback.tabs.push(instanceId);
      target = fallback;
    } else {
      target = { type: 'group', id: newId(), tabs: [instanceId], active: instanceId };
      next = splitBeside(next, anchor.id, target, placement.edge, placement.size, newId);
      target = groupIn(next, target.id)!;
    }
  } else {
    const group = groupIn(next, placement.group) ?? groupIn(next, next.focusedGroup) ?? mainGroups(next)[0]!;
    const index = placement.index === undefined ? group.tabs.length : clampIndex(placement.index, group.tabs.length);
    group.tabs.splice(index, 0, instanceId);
    target = group;
    const dock = dockOf(next, group.id);
    if (dock) next.docks[dock]!.visible = true;
  }

  if (activate || target.active === null) target.active = instanceId;
  if (focus) next.focusedGroup = target.id;
  return next;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

function splitBeside(
  layout: TabLayoutSnapshot,
  anchorId: string,
  inserted: TabGroupNode,
  edge: SplitEdge,
  size: number | undefined,
  newId: NewId,
): TabLayoutSnapshot {
  const direction: TabSplitNode['direction'] = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const after = edge === 'right' || edge === 'bottom';
  const share = clampShare(size ?? 0.5);
  const parent = parentOf(layout.root, anchorId);

  if (parent && parent.direction === direction) {
    // Same direction: insert as a sibling and give it part of the anchor's share.
    const i = parent.children.findIndex((c) => c.id === anchorId);
    const anchorShare = parent.sizes[i] ?? 1 / parent.children.length;
    const insertAt = after ? i + 1 : i;
    parent.sizes[i] = anchorShare * (1 - share);
    parent.children.splice(insertAt, 0, inserted);
    parent.sizes.splice(insertAt, 0, anchorShare * share);
    parent.sizes = normalise(parent.sizes);
    return layout;
  }

  const anchor = layout.root.id === anchorId ? layout.root : findNode(layout.root, anchorId)!;
  const split: TabSplitNode = {
    type: 'split',
    id: newId(),
    direction,
    children: after ? [anchor, inserted] : [inserted, anchor],
    sizes: after ? [1 - share, share] : [share, 1 - share],
  };
  replaceNode(layout, anchorId, split);
  return layout;
}

function findNode(root: TabLayoutNode, id: string): TabLayoutNode | undefined {
  if (root.id === id) return root;
  if (root.type === 'group') return undefined;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0.5;
  return Math.max(MIN_SHARE, Math.min(1 - MIN_SHARE, share));
}

/**
 * Remove a tab. Empty main groups close and their splits collapse; the last
 * main group stays (empty). An empty dock is removed (HUD-015 §4).
 */
export function removeTab(layout: TabLayoutSnapshot, instanceId: string): TabLayoutSnapshot {
  const next = clone(layout);
  const loc = locateTab(next, instanceId);
  if (!loc) return next;
  const { group, index, dock } = loc;
  const wasActive = group.active === instanceId;
  group.tabs.splice(index, 1);
  setActiveAfterRemoval(group, index, wasActive);

  if (group.tabs.length === 0) {
    if (dock) {
      delete next.docks[dock];
      if (next.focusedGroup === group.id) refocus(next, lastMainFocus(next));
    } else {
      const wasFocused = next.focusedGroup === group.id;
      pruneGroup(next, group.id);
      if (wasFocused) refocus(next, mainGroups(next).find((g) => g.tabs.length > 0)?.id);
    }
  }
  refocus(next);
  return next;
}

function lastMainFocus(layout: TabLayoutSnapshot): string | undefined {
  return mainGroups(layout).find((g) => g.tabs.length > 0)?.id ?? mainGroups(layout)[0]?.id;
}

/** Move a tab to a new placement. Same as removing then adding it. */
export function moveTab(
  layout: TabLayoutSnapshot,
  instanceId: string,
  placement: LayoutPlacement,
  newId: NewId,
): TabLayoutSnapshot {
  if (!locateTab(layout, instanceId)) return clone(layout);
  // Moving within the same group: reorder without pruning the group.
  if (placement.kind === 'group') {
    const loc = locateTab(layout, instanceId)!;
    if (loc.group.id === placement.group) {
      const next = clone(layout);
      const group = groupIn(next, placement.group)!;
      group.tabs.splice(loc.index, 1);
      const index = placement.index === undefined ? group.tabs.length : clampIndex(placement.index, group.tabs.length);
      group.tabs.splice(index, 0, instanceId);
      group.active = instanceId;
      next.focusedGroup = group.id;
      return next;
    }
  }
  // Moving the only tab of a group to split that same group is a no-op.
  if (placement.kind === 'split') {
    const loc = locateTab(layout, instanceId)!;
    if (loc.group.id === placement.group && loc.group.tabs.length === 1) return clone(layout);
  }
  return addTab(layout, instanceId, placement, newId);
}

/** Make a tab active in its group and focus that group. */
export function activateTab(layout: TabLayoutSnapshot, instanceId: string): TabLayoutSnapshot {
  const next = clone(layout);
  const loc = locateTab(next, instanceId);
  if (!loc) return next;
  loc.group.active = instanceId;
  next.focusedGroup = loc.group.id;
  if (loc.dock) next.docks[loc.dock]!.visible = true;
  return next;
}

export function focusGroup(layout: TabLayoutSnapshot, groupId: string): TabLayoutSnapshot {
  const next = clone(layout);
  if (!groupIn(next, groupId)) return next;
  next.focusedGroup = groupId;
  const dock = dockOf(next, groupId);
  if (dock) next.docks[dock]!.visible = true;
  return next;
}

// --- docks -----------------------------------------------------------------

/**
 * Show or hide a dock. Hiding keeps its tabs and size; hiding the focused
 * dock moves focus to a main group (HUD-015 §4).
 */
export function setDockVisible(layout: TabLayoutSnapshot, dock: TabDock, visible: boolean): TabLayoutSnapshot {
  const next = clone(layout);
  const state = next.docks[dock];
  if (!state) return next;
  state.visible = visible;
  if (!visible && next.focusedGroup === state.group.id) next.focusedGroup = lastMainFocus(next)!;
  return next;
}

export function toggleDock(layout: TabLayoutSnapshot, dock: TabDock): TabLayoutSnapshot {
  const state = layout.docks[dock];
  return state ? setDockVisible(layout, dock, !state.visible) : clone(layout);
}

export function setDockSize(layout: TabLayoutSnapshot, dock: TabDock, size: number): TabLayoutSnapshot {
  const next = clone(layout);
  const state = next.docks[dock];
  if (state) state.size = clampShare(size);
  return next;
}

// --- splits ----------------------------------------------------------------

/** Set a split's child sizes. Values are normalised; a wrong count is ignored. */
export function setSplitSizes(layout: TabLayoutSnapshot, splitId: string, sizes: number[]): TabLayoutSnapshot {
  const next = clone(layout);
  const node = findNode(next.root, splitId);
  if (node?.type === 'split' && sizes.length === node.children.length) node.sizes = normalise(sizes);
  return next;
}

/** Give every child of a split the same share (double-click a divider). */
export function equaliseSplit(layout: TabLayoutSnapshot, splitId: string): TabLayoutSnapshot {
  const node = findNode(layout.root, splitId);
  if (node?.type !== 'split') return clone(layout);
  return setSplitSizes(layout, splitId, node.children.map(() => 1));
}

// --- navigation ------------------------------------------------------------

/**
 * The tab `delta` steps from the focused tab. Workspace scope walks every
 * visible tab in layout order (Linea's behaviour); group scope stays in the
 * focused group. Wraps around.
 */
export function cycleTab(layout: TabLayoutSnapshot, delta: number, scope: TabCycleScope = 'workspace'): string | null {
  const current = focusedTab(layout);
  const pool =
    scope === 'group'
      ? findGroup(layout, layout.focusedGroup)?.tabs ?? []
      : visibleGroups(layout).flatMap((g) => g.tabs);
  if (pool.length === 0) return null;
  const at = current ? pool.indexOf(current) : -1;
  const start = at === -1 ? (delta > 0 ? -1 : 0) : at;
  return pool[(((start + delta) % pool.length) + pool.length) % pool.length]!;
}

/** Groups on screen: main groups plus visible docks. */
export function visibleGroups(layout: TabLayoutSnapshot): TabGroupNode[] {
  const docks = DOCKS.flatMap((d) => {
    const s = layout.docks[d];
    return s && s.visible ? [s.group] : [];
  });
  return [...mainGroups(layout), ...docks];
}

/**
 * ⌘N: the Nth tab (1-based) of the focused group, or the Nth group. ⌘9 is
 * the last, as in browsers. Returns a tab ID for 'tab', a group ID for 'group'.
 */
export function selectByNumber(layout: TabLayoutSnapshot, n: number, target: 'tab' | 'group'): string | null {
  const list =
    target === 'tab' ? findGroup(layout, layout.focusedGroup)?.tabs ?? [] : visibleGroups(layout).map((g) => g.id);
  if (list.length === 0 || n < 1) return null;
  if (n >= 9) return list[list.length - 1]!;
  return list[n - 1] ?? null;
}

// --- validation and repair (HUD-015 §5) ------------------------------------

export interface RepairResult {
  layout: TabLayoutSnapshot;
  /** Tab IDs dropped because they were unknown or duplicated. */
  dropped: string[];
  /** True if anything changed. */
  repaired: boolean;
}

/**
 * Make a snapshot safe to render: drop unknown and duplicate tab IDs, fix
 * `active`, normalise sizes, remove empty groups and docks, collapse
 * single-child splits, and fix `focusedGroup`. `known` is the set of instance
 * IDs that exist; tabs not in it are dropped (the caller restores those as
 * tombstones before repairing if it wants to keep them).
 */
export function repairLayout(input: unknown, known: ReadonlySet<string>, newId: NewId): RepairResult {
  const dropped: string[] = [];
  const seen = new Set<string>();
  const usedIds = new Set<string>();
  let repaired = false;

  const freshId = (id: unknown): string => {
    if (typeof id === 'string' && id && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    repaired = true;
    let next = newId();
    while (usedIds.has(next)) next = newId();
    usedIds.add(next);
    return next;
  };

  const fixGroup = (raw: Record<string, unknown>): TabGroupNode => {
    const tabs: string[] = [];
    for (const t of Array.isArray(raw.tabs) ? raw.tabs : []) {
      if (typeof t !== 'string' || !known.has(t) || seen.has(t)) {
        dropped.push(String(t));
        repaired = true;
        continue;
      }
      seen.add(t);
      tabs.push(t);
    }
    const active = typeof raw.active === 'string' && tabs.includes(raw.active) ? raw.active : (tabs[0] ?? null);
    if (active !== raw.active) repaired = true;
    return { type: 'group', id: freshId(raw.id), tabs, active };
  };

  const fixNode = (raw: unknown): TabLayoutNode | null => {
    if (!raw || typeof raw !== 'object') {
      repaired = true;
      return null;
    }
    const r = raw as Record<string, unknown>;
    if (r.type === 'group') {
      const g = fixGroup(r);
      if (g.tabs.length === 0) {
        repaired = true;
        return null;
      }
      return g;
    }
    if (r.type === 'split' && Array.isArray(r.children)) {
      const rawSizes = Array.isArray(r.sizes) ? r.sizes : [];
      const kids: TabLayoutNode[] = [];
      const sizes: number[] = [];
      r.children.forEach((c, i) => {
        const fixed = fixNode(c);
        if (fixed) {
          kids.push(fixed);
          sizes.push(typeof rawSizes[i] === 'number' ? (rawSizes[i] as number) : NaN);
        }
      });
      if (kids.length === 0) return null;
      if (kids.length === 1) {
        repaired = true;
        return kids[0]!;
      }
      const direction = r.direction === 'column' ? 'column' : 'row';
      const normalised = normalise(sizes);
      if (normalised.some((s, i) => Math.abs(s - (sizes[i] ?? NaN)) > 1e-9)) repaired = true;
      return { type: 'split', id: freshId(r.id), direction, children: kids, sizes: normalised };
    }
    repaired = true;
    return null;
  };

  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (src.version !== 1) repaired = true;
  const root = fixNode(src.root) ?? { type: 'group' as const, id: freshId(undefined), tabs: [], active: null };

  const docks: TabLayoutSnapshot['docks'] = {};
  const rawDocks = (src.docks && typeof src.docks === 'object' ? src.docks : {}) as Record<string, unknown>;
  for (const d of DOCKS) {
    const raw = rawDocks[d] as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object' || !raw.group || typeof raw.group !== 'object') continue;
    const group = fixGroup(raw.group as Record<string, unknown>);
    if (group.tabs.length === 0) {
      repaired = true;
      continue;
    }
    const size = typeof raw.size === 'number' ? clampShare(raw.size) : DEFAULT_DOCK_SIZE[d];
    if (size !== raw.size) repaired = true;
    docks[d] = { group, visible: raw.visible !== false, size };
  }

  const layout: TabLayoutSnapshot = { version: 1, root, docks, focusedGroup: '' };
  const focused = typeof src.focusedGroup === 'string' ? src.focusedGroup : '';
  const target = allGroups(layout).find((g) => g.id === focused);
  const dockHidden = target && DOCKS.some((d) => docks[d]?.group.id === focused && !docks[d]!.visible);
  if (target && !dockHidden) layout.focusedGroup = focused;
  else {
    repaired = true;
    layout.focusedGroup = mainGroups(layout)[0]!.id;
  }
  return { layout, dropped, repaired };
}
