// ---------------------------------------------------------------------------
// Tabs, splits and docks (HUD-015). Spec: docs/specs/hud-015-tabs.md
// ---------------------------------------------------------------------------
import type { ActivityRef } from './activity';
import type { AppInstance } from './workspace';

/** A group of tabs. `tabs` holds instance IDs in strip order. */
export interface TabGroupNode {
  type: 'group';
  id: string;
  tabs: string[];
  active: string | null;
}

/** A row (side by side) or column (stacked) of children. `sizes` sum to 1. */
export interface TabSplitNode {
  type: 'split';
  id: string;
  direction: 'row' | 'column';
  children: TabLayoutNode[];
  sizes: number[];
}

export type TabLayoutNode = TabGroupNode | TabSplitNode;

export type TabDock = 'right' | 'bottom';

export interface DockState {
  /** The dock's own group. Docks are not nodes in the main tree. */
  group: TabGroupNode;
  visible: boolean;
  /** Width (right) or height (bottom) as a share of the window, 0–1. */
  size: number;
}

export interface TabLayoutSnapshot {
  version: 1;
  root: TabLayoutNode;
  docks: Partial<Record<TabDock, DockState>>;
  /** ID of the focused group: one in the main tree, or a dock's group. */
  focusedGroup: string;
}

export interface ClosedTab {
  instance: AppInstance;
  /** Where it was: a group ID, and its index there. */
  from: { group: string; index: number; dock?: TabDock };
}

export interface TabWorkspaceState {
  instances: AppInstance[];
  layout: TabLayoutSnapshot;
  /** Most recent first, capped at 50. */
  recentlyClosed: ClosedTab[];
  /** Host-owned data that shares the store (e.g. window bounds). Never read by HudsonKit. */
  hostState?: Record<string, unknown>;
}

export interface TabStoreKey {
  workspaceId: string;
  /** One layout per window or scene. Default 'main'. */
  windowId: string;
}

export interface TabStore {
  load(key: TabStoreKey): Promise<TabWorkspaceState | null>;
  save(key: TabStoreKey, state: TabWorkspaceState): Promise<void>;
}

export type OpenTabPlacement =
  | 'focused'
  | 'beside'
  | 'right'
  | 'below'
  | { dock: TabDock }
  | { group: string }
  | { beside: string; split?: 'right' | 'below' };

export interface OpenTabRequest {
  appId: string;
  title?: string;
  params?: unknown;
}

export interface OpenTabOptions {
  placement?: OpenTabPlacement;
  /** Open without focusing it, and without moving focus. */
  inactive?: boolean;
  /** Focus an existing tab with the same reuseKey instead of opening one. */
  reuse?: boolean;
}

/** UI-only states. Activity state comes from the activity bridge. */
export type TabStatus = 'needs-input' | 'error';

export interface TabSummary {
  instanceId: string;
  appId: string;
  title: string;
  /** Extra label when titles collide, e.g. a host or folder. */
  detail?: string;
  group: string;
  active: boolean;
  status: TabStatus | null;
  badge: number | null;
}

/** What ⌘1–⌘9 select. */
export type TabSelectTarget = 'tab' | 'group';

/** Tab cycling scope for tabs.next / tabs.previous. */
export type TabCycleScope = 'workspace' | 'group';

/** Per-app tab behaviour (HudsonApp.tab). */
export interface HudsonAppTabConfig {
  /** Restore this tab on relaunch. Default true. */
  persists?: boolean;
  /** Current params version. Optional; default 1. */
  paramsVersion?: number;
  /** Upgrade older params. Return null to restore as a tombstone. */
  migrateParams?: (params: unknown, fromVersion: number) => unknown | null;
  /** Canonical identity for reuse. Same key = same resource. */
  reuseKey?: (params: unknown) => string | null;
  /** The activity this tab views, if any. Pure, so unmounted tabs can match. */
  activityRef?: (params: unknown) => ActivityRef | null;
  /** Where a new tab of this app goes when the caller gives no placement. */
  defaultPlacement?: OpenTabPlacement;
  /** Preferred share of a new split or dock, 0–1. */
  defaultSize?: number;
  /** Text glyph for the strip when no icon is set. */
  glyph?: string;
  /** Unmount when hidden and not holding work (v2). Default false. */
  sleeps?: boolean;
}
