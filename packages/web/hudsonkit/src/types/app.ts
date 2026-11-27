import type { ReactNode } from 'react';
import type { CommandOption } from '../components/overlays/CommandPalette';
import type { HudsonAppBackend } from './backend';
import type { HudsonCodeSurfaceConfig, HudsonCodeSurfaceState } from './code';
import type { AppExports } from './embed';
import type { AppIntent } from './intent';
import type { AppPorts } from './port';
import type { ServiceDependency } from './service';
import type { FeatureFlagGate } from '../flags/types';
import type { HudsonAppTabConfig } from './tabs';

// ---------------------------------------------------------------------------
// App-level settings
// ---------------------------------------------------------------------------

export interface AppSettingField {
  key: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'toggle' | 'slider' | 'segment' | 'select';
  default: string | number | boolean;
  /** For segment/select type */
  options?: { value: string; label: string }[];
  /** For slider/number type */
  min?: number;
  max?: number;
  step?: number;
  /** For slider: format display string */
  format?: (v: number) => string;
}

export interface AppSettingsSection {
  label: string;
  fields: AppSettingField[];
}

export interface AppSettingsConfig {
  sections: AppSettingsSection[];
}

// ---------------------------------------------------------------------------
// Status colors supported by StatusBar
// ---------------------------------------------------------------------------
export type StatusColor = 'emerald' | 'amber' | 'red' | 'neutral';

export type StatusState = {
  label: string;
  color: StatusColor;
  /** Optional tooltip/accessible detail for the status indicator. */
  title?: string;
};

// ---------------------------------------------------------------------------
// TakeoverState — return type of useTakeover hook
// ---------------------------------------------------------------------------
export interface TakeoverState {
  /** Whether the Takeover slot should be rendered full-viewport above chrome. */
  active: boolean;
  /** When true, the shell renders a close affordance and handles Escape. */
  dismissible: boolean;
  /** Called by the shell's close affordance / Escape when dismissible.
   *  The app decides what "dismiss" means — typically flipping its own state
   *  so the next render returns active: false. */
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// AppTool — a tool that appears in the right sidebar's accordion
// ---------------------------------------------------------------------------
export interface AppTool {
  id: string;
  name: string;
  icon: ReactNode;
  Component: React.FC;
}

// ---------------------------------------------------------------------------
// Search configuration passed to NavigationBar
// ---------------------------------------------------------------------------
export interface SearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// AppManifest — serializable snapshot of an app's capabilities
// ---------------------------------------------------------------------------
export interface AppManifest {
  id: string;
  name: string;
  description?: string;
  mode: 'canvas' | 'panel';
  commands?: { id: string; label: string; shortcut?: string }[];
  tools?: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// HudsonApp — the contract every app must satisfy to plug into the shell.
// ---------------------------------------------------------------------------
/** How many live instances of this app a workspace can hold.
 *  - 'singleton' (default) — exactly one window per workspace
 *  - 'spawnable'  — shell can mint fresh instances on demand (e.g. terminal)
 *  - 'duplicable' — shell can clone an existing instance's state (e.g. document draft)
 *  Both 'spawnable' and 'duplicable' may be combined behaviourally — an app that
 *  declares 'duplicable' also supports fresh spawn; a 'spawnable' app does not
 *  advertise a Duplicate gesture. */
export type MultiInstanceMode = 'singleton' | 'spawnable' | 'duplicable';
export type PortInspectorMode = 'default' | 'compact' | 'hidden';

/** Optional AppShell panel defaults and resize bounds. */
export interface AppShellPanelBounds {
  min?: number;
  max?: number;
  /** Initial collapsed state when this app has no persisted preference. */
  collapsed?: boolean;
}

/**
 * Opt-in responsive cap on AppShell panel max width. When enabled (via
 * `AppShellLayoutConfig.responsivePanelMax`), each side panel's resize bound
 * is capped at a fraction of the viewport width instead of the static
 * default, and re-computed on window resize.
 */
export interface AppShellResponsivePanelMax {
  /** Fraction of the viewport width used as the panel max width. Defaults to 0.45. */
  ratio?: number;
  /** Lower bound (px) for the computed cap, so narrow viewports still get a usable panel. Defaults to 500. */
  min?: number;
  /** Upper bound (px) for the computed cap on very wide viewports. Defaults to 900. */
  max?: number;
}

export interface AppShellLayoutConfig {
  leftWidth?: number;
  rightWidth?: number;
  /** Fallback min/max when a side-specific bound is omitted. */
  minPanelWidth?: number;
  maxPanelWidth?: number;
  left?: AppShellPanelBounds;
  right?: AppShellPanelBounds;
  /**
   * Opt-in: cap each panel's max resize width at a fraction of the viewport,
   * re-clamped as the window resizes. `true` applies the defaults — 45% of
   * the viewport, floored at 500px and capped at 900px. An explicit max for a
   * side (`left.max` / `right.max` / `maxPanelWidth`) always wins over this
   * cap. Off by default — without it, resize bounds behave exactly as before.
   */
  responsivePanelMax?: boolean | AppShellResponsivePanelMax;
}

export interface HudsonApp {
  /** Unique identifier (used as key + localStorage namespace) */
  id: string;
  /** Human-readable name shown in app switcher */
  name: string;
  /** Short description for tooltips / palette */
  description?: string;
  /** Optional agent-facing operating guide included in Hudson AI context. */
  agentContext?: string;
  /** Optional feature flag gate. When off, the shell hides this app/surface. */
  flag?: FeatureFlagGate;
  /** Frame mode: 'canvas' enables pan/zoom, 'panel' renders scrollable content */
  mode: 'canvas' | 'panel';
  /** Icon shown next to the app name in the navigation bar */
  icon?: ReactNode;
  /** Whether the shell is allowed to mount more than one live instance of this
   *  app inside a single workspace. Defaults to 'singleton'. */
  multiInstance?: MultiInstanceMode;
  /** Tab behaviour when this app's instances are shown as tabs (HUD-015). */
  tab?: HudsonAppTabConfig;

  /** Left panel header config */
  leftPanel?: { title: string; icon?: ReactNode; headerActions?: React.FC };
  /** Right panel header config */
  rightPanel?: { title: string; icon?: ReactNode; headerActions?: React.FC };

  /** AppShell side panel defaults and resize bounds (panel layout only). */
  layout?: AppShellLayoutConfig;

  /** Wraps all slots — owns app state via React context.
   *  `disabled` is true when the app is disabled in the workspace.
   *  `visible` is true when the app is currently shown in the workspace.
   *  `focused` is true when the app is the active target for shell interactions.
   *  Providers should pause expensive work when disabled or hidden, and reserve
   *  any high-frequency polling/subscriptions for focused states only. */
  Provider: React.FC<{ children: ReactNode; disabled?: boolean; visible?: boolean; focused?: boolean }>;

  /** Interactive tool panels for the right sidebar accordion */
  tools?: AppTool[];

  /** Slot components rendered inside Provider */
  slots: {
    Content: React.FC;
    LeftPanel?: React.FC;
    /** @deprecated Use Inspector + tools instead */
    RightPanel?: React.FC;
    Inspector?: React.FC;
    LeftFooter?: React.FC;
    /** App-level Chat surface — the "designed UI" AI lens. Should consume the
     *  app's Provider state (same conversation as the rest of the app), not
     *  spawn its own chat hook. */
    Chat?: React.FC;
    /** App-level Terminal surface — usually a PTY/relay session for long-form
     *  coding work, distinct from the Chat surface. */
    Terminal?: React.FC;
    /** Full-viewport component rendered above the shell when useTakeover
     *  returns active. When present, the rest of the shell is marked
     *  `inert` + `aria-hidden`. Used for first-run setup, onboarding, or any
     *  flow that must block app interaction until completed or dismissed. */
    Takeover?: React.FC;
  };

  /** Static intent declarations for LLM/voice/search indexing */
  intents?: AppIntent[];

  /** Serializable manifest for tooling/LLM introspection */
  manifest?: AppManifest;

  /** App-level settings rendered in the Settings panel */
  settings?: AppSettingsConfig;

  /** Static port declarations for inter-app data piping */
  ports?: AppPorts;
  /** Controls how prominently static ports appear in the shell inspector */
  portInspector?: PortInspectorMode;

  /** App-level code surface convention. Apps that set this and implement
   *  `hooks.useCodeSurface` let Hudson expose object source as a native sheet,
   *  inspector panel, console view, or in-place editor. */
  code?: HudsonCodeSurfaceConfig;

  /** Embeddable surfaces and other export declarations */
  exports?: AppExports;

  /** Services this app depends on */
  services?: ServiceDependency[];

  /** App-local backend declaration (HUD-008). Same-origin `/api/{app.id}` and
   *  `~/hudson/{app.id}/.data` defaults derive from `app.id` when absent. */
  backend?: HudsonAppBackend;

  /** Hooks called inside Provider via Bridge component */
  hooks: {
    useCommands: () => CommandOption[];
    useStatus: () => StatusState;
    useStatusLeft?: () => ReactNode | null;
    useStatusRight?: () => ReactNode | null;
    /** When set, StatusBar renders the centered viewport strip (pan · size · zoom).
     *  Canvas apps may also provide handlers to make their Provider the canonical
     *  viewport owner while AppShell's Frame remains the renderer. */
    useViewport?: () => {
      pan: { x: number; y: number };
      zoom: number;
      canvasSize?: { w: number; h: number };
      onPan?: (delta: { x: number; y: number }) => void;
      onZoom?: (
        zoom: number,
        panAdjust?: { x: number; y: number },
      ) => void;
      onViewportChange?: (size: { width: number; height: number }) => void;
      gridOpacity?: number;
      zoomSensitivity?: number;
    } | null;
    useSearch?: () => SearchConfig;
    useNavCenter?: () => ReactNode | null;
    useNavActions?: () => ReactNode | null;
    useLayoutMode?: () => 'canvas' | 'panel' | 'focus';
    useActiveToolHint?: () => string | null;
    /** Returns a getter: (portId) => data snapshot or null */
    usePortOutput?: () => (portId: string) => unknown | null;
    /** Returns a setter: (portId, data) => void */
    usePortInput?: () => (portId: string, data: unknown) => void;
    /** Controls the Takeover slot. Return null or active:false to pass through
     *  to the normal shell; return active:true to mount the Takeover slot
     *  above chrome. AppShell is stateless about dismissal — the hook's own
     *  state is what persists or clears the takeover. */
    useTakeover?: () => TakeoverState | null;
    /** Returns the current object-code surface for this app. The shell renders
     *  the configured placement and controls open/close through this state. */
    useCodeSurface?: () => HudsonCodeSurfaceState | null;
  };
}
