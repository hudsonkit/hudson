// ---------------------------------------------------------------------------
// Restoring a saved tab workspace, and resolving where a tab opens
// (HUD-015 §5, §6). Pure: no React, no DOM.
// ---------------------------------------------------------------------------
import type { HudsonApp } from '../../types/app';
import type {
  ClosedTab,
  OpenTabPlacement,
  TabLayoutSnapshot,
  TabWorkspaceState,
} from '../../types/tabs';
import type { AppInstance } from '../../types/workspace';
import {
  addTab,
  createLayout,
  dockOf,
  findGroup,
  locateTab,
  mainGroups,
  repairLayout,
  type LayoutPlacement,
  type NewId,
} from './layout';

export const RECENTLY_CLOSED_LIMIT = 50;

export type TombstoneReason = 'unknown-app' | 'params-rejected';

export interface RestoredTabs {
  state: TabWorkspaceState;
  /** Tabs that restore as tombstones, with why. Their instances are kept. */
  tombstones: Map<string, TombstoneReason>;
  /** True if anything had to be fixed (the caller may re-save). */
  repaired: boolean;
}

export function emptyTabState(newId: NewId): TabWorkspaceState {
  return { instances: [], layout: createLayout(newId), recentlyClosed: [] };
}

function isInstance(value: unknown): value is AppInstance {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.instanceId === 'string' && v.instanceId !== '' && typeof v.appId === 'string';
}

/**
 * Validate each tab on its own. Unknown apps and rejected params become
 * tombstones; everything else restores normally. Instances missing from the
 * layout are added to the first main group so nothing silently disappears.
 */
export function restoreTabState(
  saved: unknown,
  apps: ReadonlyMap<string, HudsonApp>,
  newId: NewId,
): RestoredTabs {
  const tombstones = new Map<string, TombstoneReason>();
  if (!saved || typeof saved !== 'object') {
    return { state: emptyTabState(newId), tombstones, repaired: saved != null };
  }
  const src = saved as Partial<TabWorkspaceState>;
  let repaired = false;

  const instances: AppInstance[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(src.instances) ? src.instances : []) {
    if (!isInstance(raw) || seen.has(raw.instanceId)) {
      repaired = true;
      continue;
    }
    seen.add(raw.instanceId);
    const app = apps.get(raw.appId);
    if (!app) {
      tombstones.set(raw.instanceId, 'unknown-app');
      instances.push(raw);
      continue;
    }
    const migrated = migrateInstance(raw, app);
    if (migrated === null) {
      tombstones.set(raw.instanceId, 'params-rejected');
      instances.push(raw);
      continue;
    }
    if (migrated !== raw) repaired = true;
    instances.push(migrated);
  }

  const known = new Set(instances.map((i) => i.instanceId));
  const repair = repairLayout(src.layout, known, newId);
  let layout = repair.layout;
  repaired ||= repair.repaired;

  // Instances the layout lost go to the end of the first main group.
  const firstGroup = mainGroups(layout)[0]!.id;
  for (const instance of instances) {
    if (!locateTab(layout, instance.instanceId)) {
      layout = addTab(layout, instance.instanceId, { kind: 'group', group: firstGroup }, newId, { activate: false });
      repaired = true;
    }
  }

  const recentlyClosed: ClosedTab[] = (Array.isArray(src.recentlyClosed) ? src.recentlyClosed : [])
    .filter((c): c is ClosedTab => !!c && isInstance(c.instance) && !known.has(c.instance.instanceId))
    .slice(0, RECENTLY_CLOSED_LIMIT);

  const state: TabWorkspaceState = { instances, layout, recentlyClosed };
  if (src.hostState && typeof src.hostState === 'object') state.hostState = src.hostState;
  return { state, tombstones, repaired };
}

/** Run the app's params migration. Returns null when the app rejects them. */
export function migrateInstance(instance: AppInstance, app: HudsonApp): AppInstance | null {
  const config = app.tab;
  const current = config?.paramsVersion ?? 1;
  const from = instance.paramsVersion ?? 1;
  // No params, already current, or the app versions inside its own params.
  if (instance.params === undefined || from === current || !config?.migrateParams) return instance;
  let params: unknown;
  try {
    params = config.migrateParams(instance.params, from);
  } catch {
    return null;
  }
  if (params === null) return null;
  return { ...instance, params, paramsVersion: current };
}

// --- placement -------------------------------------------------------------

export interface PlacementContext {
  layout: TabLayoutSnapshot;
  /** The tab asking to open, for 'beside'. Defaults to the focused tab. */
  requester?: string | null;
  /** The opening app's preferred split or dock size. */
  size?: number;
}

/** Turn an OpenTabPlacement into layout terms. */
export function resolvePlacement(placement: OpenTabPlacement | undefined, ctx: PlacementContext): LayoutPlacement {
  const { layout, size } = ctx;
  const focusedGroup = findGroup(layout, layout.focusedGroup) ? layout.focusedGroup : mainGroups(layout)[0]!.id;
  const requester = ctx.requester ?? findGroup(layout, focusedGroup)?.active ?? null;

  if (!placement || placement === 'focused') return { kind: 'group', group: focusedGroup };
  if (placement === 'beside') {
    const loc = requester ? locateTab(layout, requester) : undefined;
    return loc ? { kind: 'group', group: loc.group.id, index: loc.index + 1 } : { kind: 'group', group: focusedGroup };
  }
  if (placement === 'right' || placement === 'below') {
    // Docks don't split; splitting from a dock splits the main area instead.
    const anchor = dockOf(layout, focusedGroup) ? mainGroups(layout)[0]!.id : focusedGroup;
    return { kind: 'split', group: anchor, edge: placement === 'right' ? 'right' : 'bottom', size };
  }
  if ('dock' in placement) return { kind: 'dock', dock: placement.dock, size };
  if ('group' in placement) {
    return findGroup(layout, placement.group)
      ? { kind: 'group', group: placement.group }
      : { kind: 'group', group: focusedGroup };
  }
  const loc = locateTab(layout, placement.beside);
  if (!loc) return { kind: 'group', group: focusedGroup };
  if (!placement.split) return { kind: 'group', group: loc.group.id, index: loc.index + 1 };
  if (loc.dock) return { kind: 'group', group: loc.group.id, index: loc.index + 1 };
  return { kind: 'split', group: loc.group.id, edge: placement.split === 'right' ? 'right' : 'bottom', size };
}

/**
 * Where a reopened tab goes: back to its group and index if the group still
 * exists, else its dock, else the app's default placement.
 */
export function reopenPlacement(
  closed: ClosedTab,
  layout: TabLayoutSnapshot,
  fallback: OpenTabPlacement | undefined,
  size?: number,
): LayoutPlacement {
  if (findGroup(layout, closed.from.group)) {
    return { kind: 'group', group: closed.from.group, index: closed.from.index };
  }
  if (closed.from.dock) return { kind: 'dock', dock: closed.from.dock, size };
  return resolvePlacement(fallback, { layout, size });
}
