import type { HudsonApp } from './app';
import type { FeatureFlagGate } from '../flags/types';

// ---------------------------------------------------------------------------
// Canvas participation — how an app renders inside a multi-app workspace
// ---------------------------------------------------------------------------
export type CanvasParticipation = 'native' | 'windowed';

export type WorkspaceLeftNavigation = 'on' | 'minimized' | 'hidden';

// ---------------------------------------------------------------------------
// WorkspaceAppConfig — one app's configuration within a workspace (authoring seed)
// ---------------------------------------------------------------------------
export interface WorkspaceAppConfig {
  app: HudsonApp;
  /** Optional feature flag gate for this app within this workspace. */
  flag?: FeatureFlagGate;
  /** How the app participates in canvas mode (default: 'native') */
  canvasMode?: CanvasParticipation;
  /** Default window bounds for 'windowed' apps */
  defaultWindowBounds?: { x: number; y: number; w: number; h: number };
  /**
   * Whether choosing this app in the sidebar opens its window when it is
   * closed (default: true). Set false for supporting apps that should stay
   * put: their section still expands, and the visibility toggle still opens
   * them deliberately.
   */
  openFromSidebar?: boolean;
}

// ---------------------------------------------------------------------------
// AppInstance — one live window at runtime.
// A workspace's `apps: WorkspaceAppConfig[]` is the authoring seed; once the
// shell is running, a separate `instances: AppInstance[]` list is authoritative
// and can grow (via spawn/duplicate) or shrink (via close).
// ---------------------------------------------------------------------------
export interface AppInstance {
  /** Unique across a workspace. Doubles as the localStorage scope key. */
  instanceId: string;
  /** References the HudsonApp this is an instance of. */
  appId: string;
  /** Optional user-overridable title; when omitted the shell derives one. */
  title?: string;
  /** Persisted window bounds snapshot (authoring seed copies this from
   *  defaultWindowBounds; runtime spawns derive from the canvas centre). */
  bounds?: { x: number; y: number; w: number; h: number };
  /** Serializable restore params, owned by the app (HUD-015). They name
   *  durable objects, never live handles or content snapshots. */
  params?: unknown;
  /** The app's params version when `params` was written (HUD-015). */
  paramsVersion?: number;
}

// ---------------------------------------------------------------------------
// HudsonWorkspace — a collection of apps that coexist in a shared shell
// ---------------------------------------------------------------------------
export interface HudsonWorkspace {
  id: string;
  name: string;
  description?: string;
  /** Frame mode: 'canvas' for pan/zoom world, 'panel' for scrollable layout */
  mode: 'canvas' | 'panel';
  /** Apps participating in this workspace */
  apps: WorkspaceAppConfig[];
  /** Which app receives focus by default */
  defaultFocusedAppId?: string;
  /** Which apps open by default. Others remain available from the launcher/nav. */
  defaultActivatedAppIds?: string[];
  /** Initial canvas zoom when the workspace first boots. Defaults to 1 (100%). */
  defaultScale?: number;
  /** Initial canvas pan offset when the workspace first boots. Defaults to (0,0). */
  defaultPan?: { x: number; y: number };
  /**
   * Optional structural left navigation for canvas workspaces.
   * - 'on': render expanded
   * - 'minimized': render the collapsed panel affordance
   * - 'hidden': do not render the left navigation surface
   */
  leftNavigation?: WorkspaceLeftNavigation;
}
