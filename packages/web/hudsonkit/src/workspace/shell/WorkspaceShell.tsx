'use client';

import { isValidElement, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BootSplash, phaseAtLeast } from './BootSplash';
import type { BootPhase } from './BootSplash';
import { AppLauncher, loadSession, saveSession } from './HomeScreen';
import {
  Frame,
  Minimap,
  NavigationBar,
  SidePanel,
  StatusBar,
  CommandPalette,
  CommandDock,
  TerminalDrawer,
  AppWindow,
  SHELL_THEME,
} from '../../shell';
import { ObjectCodeSurface, ObjectCodeWorkbench } from '../../controls';
import {
  useSaveIndicator,
  usePlatformLayout,
  sounds,
  setMuted as setSoundMuted,
  useAppSettings,
  captureWorkspace,
  HUDSON_TERMINAL_VOICE_TRANSCRIPT_EVENT,
  HUDSON_TERMINAL_VOICE_SUBMIT_EVENT,
  FeatureFlagPanel,
  isGateEnabled,
  useOptionalFeatureFlags,
} from '../../index';
import { useVoiceInput } from '../../voice';
import { usePersistentState, useDebouncedPersistentState } from '../../hooks/usePersistentState';
import {
  HObservabilityDefault,
  HUDSON_AGENT_ACTION_EVENT,
  HudLogger,
  HudLoggerStatusItem,
  logHudsonAgentAction,
  type HudsonAgentActionInput,
  type HObservation,
} from '../../observability';
import type { HudsonWorkspace, WorkspaceAppConfig, CommandOption, StatusColor, StatusState, SearchConfig, HudsonCodeSurfaceState, HudsonCodeWorkbenchSize } from '../../index';
import { Volume2, VolumeX, Settings, Maximize2, Minimize2, RotateCcw, BookOpen, TerminalSquare, PanelLeftOpen, PanelLeftClose, PanelRightOpen, PanelRightClose, Activity, Sparkles, Camera, Loader2, LayoutGrid, Mic, Square, CornerDownLeft, Code2, ExternalLink, Keyboard, MousePointer2, ScanSearch, X, Home } from '../../icons';
import { HudsonKitMark } from '../../components/brand';
import {
  HudSideNav,
  HudSideNavLayout,
  HudSideNavProvider,
  HudSideNavTrigger,
  HudSideRail,
  HUD_SIDE_NAV_COLLAPSED_WIDTH,
  type HudNavNode,
} from '../../components/nav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SidebarSection } from './SidebarSection';
import { ToolAccordion } from './ToolAccordion';
import { ShellLayoutProvider, useShellLayout } from '../../context/ShellLayoutContext';
import type { AppSettingsEntry } from '../settings/components';
import type { HudsonSettings } from '../settings/types';
import { useIntentCatalog } from '../hooks/useIntentCatalog';
import { useIntentExecutor } from '../hooks/useIntentExecutor';
import { AppSlotErrorBoundary } from './AppSlotErrorBoundary';
import { WorkspaceErrorBoundary } from './WorkspaceErrorBoundary';
import { HudsonTerminal } from './HudsonTerminal';
import { WorkspaceAI, type WorkspaceAIComposerRequest } from './WorkspaceAI';
import { HudsonAIRuntimeProvider } from './HudsonAIRuntimeContext';
import { useAgentActionLog } from './useAgentActionLog';
import type { HudsonAIToolContext } from './HudsonAIRuntimeContext';
import { DataBusProvider, usePortBridge, useDataBus } from '../context/DataBusContext';
import { PipeConnectorLayer } from './PipeConnectorLayer';
import { PortInspector } from './PortInspector';
import { WindowPorts } from './WindowPorts';
import { useServiceRegistry } from '../services/useServiceRegistry';
import { ServiceRegistryProvider } from '../services/ServiceRegistryContext';
import { ServiceBanner } from './ServiceBanner';
import { WorkspaceManagerProvider, WorkspaceManagerPanel } from './workspace-manager';
import type { EditorTab } from './workspace-manager';
import type { ServiceStatus } from '../../index';
import { DEFAULT_SHELL_SETTINGS, mergeHudsonSettings, normalizeHudsonSettings } from './shellSettings';
import { ActiveWorkspaceProvider } from '../context/ActiveWorkspaceContext';
import { WorkspaceDecorProvider } from './decor/WorkspaceDecorContext';
import { DecorationLayer } from './decor/DecorationLayer';
import { arrangeForViewport, arrangeInsets } from './arrange';
import {
  WorkspaceHostRoutesProvider,
  routeWithQuery,
  useWorkspaceHostRoutes,
  type WorkspaceHostRoutes,
} from '../hostRoutes';
import {
  announceSettingChanged,
  SettingChangedNotice,
  useSettingChangedNotice,
} from './SettingChangedNotice';
import {
  buildAppWindowContextMenu,
  buildCanvasContextMenu,
  buildDynamicWindowContextMenu,
  hasInspectorSurface,
  type ContextMenuMode,
} from './contextMenus';
import { installHudsonDevtoolsWelcome, showHudsonDevtoolsWelcome, type HudsonDevtoolsWelcomeInfo } from './devtoolsWelcome';

// ---------------------------------------------------------------------------
// Shell configuration — all tuneable defaults and timing constants
// ---------------------------------------------------------------------------

/** How often high-frequency state (pan/zoom) flushes to localStorage (ms). */
const PERSIST_DEBOUNCE_MS = 5_000;

/** Debounce for flushing window bounds to state for minimap rendering (ms). */
const BOUNDS_FLUSH_MS = 500;

/** Delay before fit-all fires after launcher dismiss (ms). */
const FIT_ALL_DELAY_MS = 600;

/** Default sidebar and terminal dimensions. */
const DEFAULTS = {
  leftWidth: 260,
  rightWidth: 280,
  terminalHeight: 480,
  leftCollapsed: false,
  rightCollapsed: false,
  minimapCollapsed: false,
  showTerminal: false,
  showGuides: false,
  pan: { x: 0, y: 0 } as { x: number; y: number },
  zoom: 1 as number,
};

const TERMINAL_VOICE_SHORTCUT_LABEL = 'Cmd+Shift+M';
const HUD_LOGGER_MAX_EVENTS = 240;
const AGENT_ACTION_PERSIST_SEEN_LIMIT = 500;

/** Window sizes used by the smart-tiler on first launch. */
const TILE = {
  singleW: 960,
  singleH: 680,
  multiW: 800,
  multiH: 600,
  gap: 40,
} as const;

// [perf] Mount tracer — logs first-mount of a labeled component, with delta
// from the canvas:start mark set in WorkspaceInner. performance.mark() is
// always emitted (cheap; shows up in DevTools Performance), but console
// output is gated behind ?perf=1 or localStorage.hudsonPerf === '1' so we
// don't spam consoles in prod.
function isPerfLogEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1') return true;
    if (window.localStorage?.getItem('hudsonPerf') === '1') return true;
  } catch {}
  return false;
}

function useCanvasMountTrace(label: string) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (typeof performance === 'undefined') return;
    const t = performance.now();
    try { performance.mark(`canvas:mount:${label}`); } catch {}
    if (!isPerfLogEnabled()) return;
    const start = performance.getEntriesByName('canvas:start')[0];
    const delta = start ? `  Δ=${(t - start.startTime).toFixed(1)}ms` : '';
    console.log(`[perf] mount ${label}  @${t.toFixed(1)}ms${delta}`);
  }, []);
}

function observationData(event: HObservation): Record<string, unknown> {
  return event.data && typeof event.data === 'object' && !Array.isArray(event.data)
    ? event.data
    : {};
}

function isPersistableAgentActionObservation(event: HObservation) {
  const data = observationData(event);
  return (
    event.category === 'agent-action' ||
    data.triggeredBy === 'agent' ||
    data.source === 'workspace-ai'
  );
}

async function persistAgentActionObservation(event: HObservation, routes?: WorkspaceHostRoutes) {
  if (!routes?.agentActions) return;
  try {
    await fetch(routes.agentActions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  } catch {
    // The live in-memory log still works if the durable dev-local feed is unavailable.
  }
}

function MountTrace({ label, children }: { label: string; children: ReactNode }) {
  useCanvasMountTrace(label);
  return <>{children}</>;
}

export type WindowBounds = { x: number; y: number; w: number; h: number };

export interface WorkspaceShellInitialState {
  activeWorkspaceId: string;
  activatedAppIds: string[];
  focusedAppId: string;
  tileWindowBounds: Record<string, WindowBounds>;
  theme: 'dark' | 'light';
  template: string;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
}


function getPendingTerminalAppIdKey(workspaceId: string): string {
  return `hudson.ws.${workspaceId}.terminal.pending-active`;
}

function consumePendingTerminalAppId(workspaceId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getPendingTerminalAppIdKey(workspaceId);
    const value = window.localStorage.getItem(key);
    if (value) {
      window.localStorage.removeItem(key);
    }
    return value;
  } catch {
    return null;
  }
}

function primeHudsonAIWorkspaceHandoff(workspaceId: string, terminalAppId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`hudson.ws.${workspaceId}.terminal`, JSON.stringify(true));
    window.localStorage.setItem(getPendingTerminalAppIdKey(workspaceId), terminalAppId);
  } catch {}
}

// ---------------------------------------------------------------------------
// Service status indicator (rendered in StatusBar right slot)
// ---------------------------------------------------------------------------
function ServiceStatusIndicator({ registry, onOpenSettings, serviceIds }: {
  registry: ReturnType<typeof useServiceRegistry>;
  onOpenSettings: () => void;
  serviceIds: string[];
}) {
  const { records } = registry;
  const total = serviceIds.length;
  if (total === 0) return null;

  const running = serviceIds.filter(id => records[id]?.status === 'running').length;
  const hasError = serviceIds.some(id => records[id]?.status === 'error');
  const color = hasError ? 'text-destructive' : 'text-muted-foreground';

  return (
    <button
      onClick={onOpenSettings}
      className={`flex items-center ${color} hover:opacity-80 transition-opacity`}
      title="Open Services settings"
    >
      <span className="uppercase text-[10px] font-semibold tracking-wider">
        Services {running}/{total}
      </span>
    </button>
  );
}

function HudLoggerStatusButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex min-w-0 items-center rounded px-1 py-0.5 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Open Agent Actions"
      aria-label="Open Agent Actions"
    >
      <HudLoggerStatusItem maxEvents={HUD_LOGGER_MAX_EVENTS} />
    </button>
  );
}

function renderStatusRightItems(appRight: ReactNode | null, loggerButton: ReactNode | null) {
  if (!appRight && !loggerButton) return null;

  return (
    <div className="flex min-w-0 items-center gap-3 md:gap-4">
      {appRight}
      {appRight && loggerButton && (
        <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
      )}
      {loggerButton}
    </div>
  );
}

function WorkspacePrimaryNavBrand({
  title,
  compact,
}: {
  title: string;
  compact?: boolean;
}) {
  return (
    <HudSideNavTrigger
      label="Toggle primary navigation"
      className={`w-full ${compact ? 'px-0' : 'justify-start px-1'}`}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
        <HudsonKitMark size={15} />
      </span>
      {!compact ? (
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
          {title}
        </span>
      ) : null}
    </HudSideNavTrigger>
  );
}

function getWorkspaceServiceStatus(
  workspace: HudsonWorkspace,
  registry: ReturnType<typeof useServiceRegistry>,
): { label: string; color: StatusColor } {
  const requiredServiceIds = new Set(
    workspace.apps.flatMap(config =>
      (config.app.services ?? [])
        .filter(dep => !dep.optional)
        .map(dep => dep.serviceId),
    ),
  );

  if (requiredServiceIds.size === 0) {
    return { label: 'READY', color: 'emerald' };
  }

  const hasError = [...requiredServiceIds].some(id => registry.records[id]?.status === 'error');
  const allRunning = [...requiredServiceIds].every(id => registry.records[id]?.status === 'running');

  if (hasError) return { label: 'ERROR', color: 'red' };
  if (allRunning) return { label: 'NOMINAL', color: 'emerald' };
  return { label: 'DEGRADED', color: 'amber' };
}

function getWorkspaceServiceIds(workspace: HudsonWorkspace): string[] {
  return [
    ...new Set(
      workspace.apps.flatMap(config =>
        (config.app.services ?? [])
          .filter(dep => !dep.optional)
          .map(dep => dep.serviceId),
      ),
    ),
  ];
}

function appHasPorts(app: WorkspaceAppConfig['app'] | null | undefined): boolean {
  return !!(app?.ports?.outputs?.length || app?.ports?.inputs?.length);
}

function appShowsPorts(app: WorkspaceAppConfig['app'] | null | undefined): boolean {
  return appHasPorts(app) && app?.portInspector !== 'hidden';
}

type AppSettingFieldLike = AppSettingsEntry['config']['sections'][number]['fields'][number];
type WorkspaceToolScalar = string | number | boolean;

function coerceBooleanToolValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

function coerceNumberToolValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function clampToolNumber(field: AppSettingFieldLike, value: number): number {
  let next = value;
  if (typeof field.min === 'number') next = Math.max(field.min, next);
  if (typeof field.max === 'number') next = Math.min(field.max, next);
  return next;
}

function coerceAppSettingToolValue(
  field: AppSettingFieldLike,
  value: unknown,
): WorkspaceToolScalar | null {
  switch (field.type) {
    case 'toggle':
      return coerceBooleanToolValue(value);
    case 'number':
    case 'slider': {
      const parsed = coerceNumberToolValue(value);
      return parsed === null ? null : clampToolNumber(field, parsed);
    }
    case 'segment':
    case 'select': {
      const normalized = typeof value === 'string' ? value.trim() : String(value);
      const match = field.options?.find(option =>
        option.value === normalized || option.label.toLowerCase() === normalized.toLowerCase(),
      );
      return match?.value ?? null;
    }
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return null;
    default:
      return null;
  }
}

function buildShellSettingsPatch(
  key: string,
  value: unknown,
  current: HudsonSettings,
): Partial<HudsonSettings> | null {
  switch (key) {
    case 'glowIntensity':
    case 'gridOpacity':
    case 'zoomSensitivity': {
      const parsed = coerceNumberToolValue(value);
      return parsed === null ? null : { [key]: parsed } as Partial<HudsonSettings>;
    }
    case 'connectorStyle':
      return value === 'dashed' || value === 'solid' || value === 'dotted'
        ? { connectorStyle: value }
        : null;
    case 'theme':
      return value === 'light' || value === 'dark' || value === 'system'
        ? { theme: value }
        : null;
    case 'template':
      return typeof value === 'string' && /^[a-z][a-z0-9-]{1,64}$/.test(value)
        ? { template: value }
        : null;
    case 'contextMenuMode':
      return value === 'hudson-first' || value === 'chrome-first'
        ? { contextMenuMode: value }
        : null;
    case 'masterMute':
    case 'uiClickSounds':
    case 'uiTransitionSounds': {
      const parsed = coerceBooleanToolValue(value);
      return parsed === null ? null : { [key]: parsed } as Partial<HudsonSettings>;
    }
    case 'aiMode':
      return value === 'cli' || value === 'api' ? { aiMode: value } : null;
    case 'font.fontSize': {
      const parsed = coerceNumberToolValue(value);
      return parsed === null ? null : { font: { ...current.font, fontSize: parsed } };
    }
    case 'font.fontFamily':
      return typeof value === 'string' ? { font: { ...current.font, fontFamily: value } } : null;
    case 'voice.autoSend':
    case 'voice.speakReplies': {
      const parsed = coerceBooleanToolValue(value);
      return parsed === null
        ? null
        : {
          voice: {
            ...current.voice,
            [key === 'voice.autoSend' ? 'autoSend' : 'speakReplies']: parsed,
          },
        };
    }
    case 'voice.replyProvider':
      return value === 'vox'
        ? { voice: { ...current.voice, replyProvider: value } }
        : null;
    case 'voice.replyModel':
      return typeof value === 'string' ? { voice: { ...current.voice, replyModel: value } } : null;
    case 'voice.inputDeviceId':
      return typeof value === 'string' ? { voice: { ...current.voice, inputDeviceId: value } } : null;
    case 'voice.transcriptionModel':
      return typeof value === 'string' ? { voice: { ...current.voice, transcriptionModel: value } } : null;
    case 'voice.transcriptionLanguage':
      return typeof value === 'string' ? { voice: { ...current.voice, transcriptionLanguage: value } } : null;
    case 'voice.captureMode':
      return value === 'push_to_talk' || value === 'always_on'
        ? { voice: { ...current.voice, captureMode: value } }
        : null;
    case 'voice.replyVoice':
      return typeof value === 'string' ? { voice: { ...current.voice, replyVoice: value } } : null;
    case 'voice.replyRate': {
      const parsed = coerceNumberToolValue(value);
      return parsed === null ? null : { voice: { ...current.voice, replyRate: parsed } };
    }
    case 'voice.spokenReplyStyle':
      return value === 'brief' || value === 'full' || value === 'adaptive'
        ? { voice: { ...current.voice, spokenReplyStyle: value } }
        : null;
    case 'voice.spokenReplyLongResponse':
      return value === 'summary' || value === 'invite' || value === 'verbatim'
        ? { voice: { ...current.voice, spokenReplyLongResponse: value } }
        : null;
    case 'voice.spokenReplyCodeResponse':
      return value === 'summary' || value === 'mention' || value === 'read'
        ? { voice: { ...current.voice, spokenReplyCodeResponse: value } }
        : null;
    case 'voice.spokenReplyMaxChars': {
      const parsed = coerceNumberToolValue(value);
      return parsed === null ? null : { voice: { ...current.voice, spokenReplyMaxChars: parsed } };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Window bounds hook
// ---------------------------------------------------------------------------
function useWindowBounds(
  workspaceId: string,
  appId: string,
  defaults: WindowBounds,
  persistState: boolean,
) {
  return usePersistentState(`hudson.ws.${workspaceId}.win.${appId}`, defaults, { enabled: persistState });
}

// ---------------------------------------------------------------------------
// WorkspaceShell — outer wrapper that nests all app Providers
// ---------------------------------------------------------------------------
/**
 * Host-app bindings for surfaces the shell must not import directly. The shell
 * is app-agnostic; the host (Hudson, or any other consumer) supplies concrete
 * implementations through this object. Kept here with the shell so the type
 * travels with it when this file moves into the kit.
 */
export interface WorkspaceShellEnvironment {
  /** Host-owned relative routes for optional server-backed shell features. */
  routes?: WorkspaceHostRoutes;
  /** Label shown for the shared console drawer toggle. Defaults to 'Console'. */
  terminalLabel?: string;
  /** Render the console for a dynamically-spawned terminal window. Injected so
   *  the shell never imports a specific terminal app. */
  renderTerminal?: (opts: { initialCwd: string; backend: 'pty' | 'tmux'; tmuxSession?: string }) => ReactNode;
  /** Hook producing the Hudson AI settings entry (model options + scoped
   *  overrides). A hook because it composes app-side hooks; the shell calls it
   *  unconditionally with a stable identity. */
  useHudsonAISettingsEntry?: (config: WorkspaceAppConfig | null, workspaceId: string) => AppSettingsEntry | null;
  /** Hook producing host-owned developer tools for the shared console drawer.
   *  Keeping the tool body injectable lets Hudson own the chrome while a host
   *  opts into diagnostics without pulling them into every consumer. */
  useDeveloperTools?: () => readonly WorkspaceDeveloperTool[];
}

export interface WorkspaceDeveloperTool {
  id: string;
  label: string;
  icon?: ReactNode;
  render: () => ReactNode;
}

interface WorkspaceShellProps {
  workspaces: HudsonWorkspace[];
  defaultWorkspaceId: string;
  shellTitle?: string;
  bootMode?: 'full' | 'condensed' | 'none';
  persistSession?: boolean;
  initialState?: WorkspaceShellInitialState;
  /** Application-level navigation composition. Defaults to legacy floating panels. */
  sideNavMode?: 'legacy' | 'anchored';
  /** Concrete bindings for app-specific surfaces (terminal, …). */
  environment?: WorkspaceShellEnvironment;
  /** Tile the open windows into a clean grid and fit the canvas to them on
   *  first load and on every workspace switch. Users can still drag freely.
   *  Off by default; demos and embeds turn it on. */
  autoArrange?: boolean;
  /** Render the workspace's decoration placards behind the windows. */
  showDecor?: boolean;
}

interface ProviderRuntimeState {
  visibleAppIds: string[];
  focusedAppId: string;
}

function sameAppIdList(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, idx) => id === b[idx]);
}

function defaultActivatedIdsForWorkspace(workspace: HudsonWorkspace): string[] {
  const appIds = workspace.apps.map(config => config.app.id);
  const defaults = workspace.defaultActivatedAppIds?.filter(id => appIds.includes(id)) ?? [];
  return defaults.length > 0 ? defaults : appIds;
}

export function WorkspaceShell({
  workspaces,
  defaultWorkspaceId,
  shellTitle = 'HUDSONKIT',
  bootMode = 'none',
  persistSession = true,
  initialState,
  sideNavMode = 'legacy',
  environment,
  autoArrange = false,
  showDecor = true,
}: WorkspaceShellProps) {
  const routes = environment?.routes;
  // --- Session restore (hydration-safe: read localStorage in useEffect) ---
  const initialWorkspaceId = initialState && workspaces.some(w => w.id === initialState.activeWorkspaceId)
    ? initialState.activeWorkspaceId
    : defaultWorkspaceId;
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaceId);
  const [hasSession, setHasSession] = useState(false);
  const [bootPhase, setBootPhase] = useState<BootPhase>(bootMode === 'none' ? 'done' : 'brand');
  const [booted, setBooted] = useState(bootMode === 'none');

  useEffect(() => {
    HObservabilityDefault.setEnabled(true);

    const seen = new Set<string>();
    const order: string[] = [];
    const unsubscribe = HObservabilityDefault.subscribe((event) => {
      if (!isPersistableAgentActionObservation(event)) return;
      if (seen.has(event.id)) return;

      seen.add(event.id);
      order.push(event.id);
      while (order.length > AGENT_ACTION_PERSIST_SEEN_LIMIT) {
        const oldest = order.shift();
        if (oldest) seen.delete(oldest);
      }

      void persistAgentActionObservation(event, routes);
    });

    return unsubscribe;
  }, [routes]);

  // Read session from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (!persistSession) return;
    const session = loadSession();
    if (session && workspaces.some(w => w.id === session.activeWorkspaceId)) {
      setActiveWorkspaceId(session.activeWorkspaceId);
      setHasSession(true);
    }
  }, [persistSession, workspaces]);

  const workspace = workspaces.find(w => w.id === activeWorkspaceId) ?? workspaces[0];
  const featureFlags = useOptionalFeatureFlags();
  const flagDisabledAppIds = useMemo(() => new Set(
    workspace.apps
      .filter(config => !isGateEnabled(config.flag ?? config.app.flag, featureFlags))
      .map(config => config.app.id),
  ), [workspace.apps, featureFlags]);
  const activeInitialState = initialState?.activeWorkspaceId === workspace.id ? initialState : undefined;

  // --- Disabled apps (persisted to disk via workspace-state API) ---
  const [disabledAppIdsArr, setDisabledAppIdsArr] = useState<string[]>([]);
  const disabledLoaded = useRef(false);

  // Load disabled apps from disk
  useEffect(() => {
    if (!persistSession) {
      disabledLoaded.current = true;
      return;
    }
    disabledLoaded.current = false;
    if (!routes?.workspaceState) {
      disabledLoaded.current = true;
      return;
    }
    fetch(routeWithQuery(routes.workspaceState, { id: workspace.id }))
      .then(r => r.json())
      .then(data => {
        if (data.disabledApps && Array.isArray(data.disabledApps)) {
          // Only keep IDs that exist in the workspace
          const wsAppIds = new Set(workspace.apps.map(c => c.app.id));
          setDisabledAppIdsArr((data.disabledApps as string[]).filter(id => wsAppIds.has(id)));
        }
        disabledLoaded.current = true;
      })
      .catch(() => { disabledLoaded.current = true; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistSession, routes?.workspaceState, workspace.id]);

  // Save disabled apps to disk (debounced)
  const disabledSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!persistSession || !disabledLoaded.current) return;
    if (!routes?.workspaceState) return;
    if (disabledSaveRef.current) clearTimeout(disabledSaveRef.current);
    disabledSaveRef.current = setTimeout(() => {
      fetch(routes.workspaceState!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workspace.id, state: { disabledApps: disabledAppIdsArr } }),
      }).catch(() => {});
    }, 1000);
  }, [disabledAppIdsArr, persistSession, routes?.workspaceState, workspace.id]);

  const userDisabledAppIds = useMemo(() => new Set(disabledAppIdsArr), [disabledAppIdsArr]);
  const disabledAppIds = useMemo(() => new Set([...userDisabledAppIds, ...flagDisabledAppIds]), [userDisabledAppIds, flagDisabledAppIds]);
  const initialShowLauncher = bootMode !== 'none' && !hasSession;
  const defaultProviderVisibleAppIds = useMemo(
    () => {
      const initialIds = activeInitialState?.activatedAppIds;
      if (initialIds) return initialIds.filter(id => workspace.apps.some(config => config.app.id === id) && !disabledAppIds.has(id));
      return initialShowLauncher ? [] : defaultActivatedIdsForWorkspace(workspace)
        .filter(id => !disabledAppIds.has(id));
    },
    [activeInitialState, workspace, disabledAppIds, initialShowLauncher],
  );
  const defaultProviderFocusedAppId = activeInitialState?.focusedAppId ?? workspace.defaultFocusedAppId ?? workspace.apps[0]?.app.id ?? '';
  const [providerRuntime, setProviderRuntime] = useState<ProviderRuntimeState>({
    visibleAppIds: defaultProviderVisibleAppIds,
    focusedAppId: defaultProviderFocusedAppId,
  });

  useEffect(() => {
    setProviderRuntime({
      visibleAppIds: defaultProviderVisibleAppIds,
      focusedAppId: defaultProviderFocusedAppId,
    });
  }, [defaultProviderFocusedAppId, defaultProviderVisibleAppIds, workspace.id]);

  const handleProviderRuntimeChange = useCallback((next: ProviderRuntimeState) => {
    setProviderRuntime(prev => {
      if (
        prev.focusedAppId === next.focusedAppId &&
        sameAppIdList(prev.visibleAppIds, next.visibleAppIds)
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const providerVisibleAppIds = useMemo(
    () => new Set(providerRuntime.visibleAppIds.filter(id => !disabledAppIds.has(id))),
    [providerRuntime.visibleAppIds, disabledAppIds],
  );

  // Filter workspace to only enabled apps for Provider nesting + rendering
  const enabledWorkspace = useMemo(() => ({
    ...workspace,
    apps: workspace.apps.filter(c => !disabledAppIds.has(c.app.id)),
  }), [workspace, disabledAppIds]);

  // Save session on workspace switch
  const handleSwitchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    if (persistSession) {
      saveSession(id);
    }
  }, [persistSession]);

  // Nest ALL app Providers (including disabled) to keep the tree stable.
  // Removing a Provider from the nesting chain causes React to remount
  // everything below it, losing all state (modal open, fetched templates, etc.).
  let tree: ReactNode = (
    <WorkspaceInner
      key={workspace.id}
      workspace={enabledWorkspace}
      fullWorkspace={workspace}
      disabledAppIds={disabledAppIds}
      setDisabledAppIdsArr={setDisabledAppIdsArr}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onSwitchWorkspace={handleSwitchWorkspace}
      shellTitle={shellTitle}
      bootPhase={bootPhase}
      bootMode={bootMode}
      initialShowLauncher={initialShowLauncher}
      onProviderRuntimeChange={handleProviderRuntimeChange}
      persistSession={persistSession}
      initialState={activeInitialState}
      sideNavMode={sideNavMode}
      environment={environment}
      autoArrange={autoArrange}
      showDecor={showDecor}
    />
  );

  for (let i = workspace.apps.length - 1; i >= 0; i--) {
    const { app } = workspace.apps[i];
    const isDisabled = disabledAppIds.has(app.id);
    tree = (
      <app.Provider
        disabled={isDisabled}
        visible={!isDisabled && providerVisibleAppIds.has(app.id)}
        focused={providerRuntime.focusedAppId === app.id}
      >
        {tree}
      </app.Provider>
    );
  }

  // DataBusProvider wraps above all app Providers so port hooks can register.
  // WorkspaceDecorProvider sits at the same level so the stage-design app and
  // the shell render layer share the same workspace-scoped state.
  tree = (
    <WorkspaceHostRoutesProvider routes={routes}>
      <ActiveWorkspaceProvider workspaceId={workspace.id}>
        <WorkspaceDecorProvider workspaceId={workspace.id}>
          <DataBusProvider workspace={enabledWorkspace}>{tree}</DataBusProvider>
        </WorkspaceDecorProvider>
      </ActiveWorkspaceProvider>
    </WorkspaceHostRoutesProvider>
  );

  return (
    <>
      {/* Workspace content — always rendered */}
      <WorkspaceErrorBoundary workspaceName={workspace.name}>
        <div key={workspace.id}>{tree}</div>
      </WorkspaceErrorBoundary>

      {/* Boot splash overlay */}
      <AnimatePresence>
        {!booted && bootMode !== 'none' && (
          <BootSplash
            mode={bootMode}
            onPhaseChange={setBootPhase}
            onBooted={() => setBooted(true)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Merged hook data from a single app
// ---------------------------------------------------------------------------
interface AppHookData {
  appId: string;
  appName: string;
  commands: CommandOption[];
  status: StatusState;
  statusLeft: ReactNode | null;
  statusRight: ReactNode | null;
  search: SearchConfig | null;
  navCenter: ReactNode | null;
  navActions: ReactNode | null;
  layoutMode: 'canvas' | 'panel' | 'focus';
  activeToolHint: string | null;
  codeSurface: HudsonCodeSurfaceState | null;
}

// ---------------------------------------------------------------------------
// Bridge — calls hooks for one app (must be inside that app's Provider)
// ---------------------------------------------------------------------------
function useAppHooks(config: WorkspaceAppConfig): AppHookData {
  const { app } = config;
  return {
    appId: app.id,
    appName: app.name,
    commands: app.hooks.useCommands(),
    status: app.hooks.useStatus(),
    statusLeft: app.hooks.useStatusLeft?.() ?? null,
    statusRight: app.hooks.useStatusRight?.() ?? null,
    search: app.hooks.useSearch?.() ?? null,
    navCenter: app.hooks.useNavCenter?.() ?? null,
    navActions: app.hooks.useNavActions?.() ?? null,
    layoutMode: app.hooks.useLayoutMode?.() ?? app.mode,
    activeToolHint: app.hooks.useActiveToolHint?.() ?? null,
    codeSurface: app.hooks.useCodeSurface?.() ?? null,
  };
}

// Empty settings config used as stable default for apps without settings
const EMPTY_SETTINGS = { sections: [] };

/** Calls useAppSettings for one app (must be called unconditionally). */
function useAppSettingsBridge(config: WorkspaceAppConfig): AppSettingsEntry | null {
  const { app } = config;
  const settingsConfig = app.settings ?? EMPTY_SETTINGS;
  const [values, update] = useAppSettings(app.id, settingsConfig);
  if (!app.settings) return null;
  return { appId: app.id, appName: app.name, config: app.settings, values, onUpdate: update };
}

/** No-op fallback used when the host doesn't inject AI settings. */
function useNoHudsonAISettingsEntry(): AppSettingsEntry | null {
  return null;
}

/** Stable fallback for hosts that do not provide developer tools. */
function useNoDeveloperTools(): readonly WorkspaceDeveloperTool[] {
  return [];
}

// ---------------------------------------------------------------------------
// WorkspaceInner — renders inside all Providers, can call all app hooks
// ---------------------------------------------------------------------------
function WorkspaceInner({
  workspace,
  fullWorkspace,
  disabledAppIds,
  setDisabledAppIdsArr,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  shellTitle,
  bootPhase,
  bootMode,
  initialShowLauncher,
  onProviderRuntimeChange,
  persistSession,
  initialState,
  sideNavMode,
  environment,
  autoArrange,
  showDecor,
}: {
  workspace: HudsonWorkspace;
  /** Full workspace including disabled apps (for workspace editor) */
  fullWorkspace: HudsonWorkspace;
  disabledAppIds: Set<string>;
  setDisabledAppIdsArr: (v: string[] | ((prev: string[]) => string[])) => void;
  workspaces: HudsonWorkspace[];
  activeWorkspaceId: string;
  onSwitchWorkspace: (id: string) => void;
  shellTitle: string;
  bootPhase: BootPhase;
  bootMode: 'full' | 'condensed' | 'none';
  initialShowLauncher: boolean;
  onProviderRuntimeChange: (next: ProviderRuntimeState) => void;
  persistSession: boolean;
  initialState?: WorkspaceShellInitialState;
  sideNavMode: 'legacy' | 'anchored';
  environment?: WorkspaceShellEnvironment;
  autoArrange: boolean;
  showDecor: boolean;
}) {
  const routes = useWorkspaceHostRoutes();
  // Derived visibility flags from boot phase
  const chromeVisible = phaseAtLeast(bootPhase, 'chrome-in');
  const panelsVisible = phaseAtLeast(bootPhase, 'panels-in');
  const isSingleApp = workspace.apps.length === 1;
  const isMultiApp = !isSingleApp;

  // [perf] Canvas timing — paired with `canvas:painted` in MultiAppCanvas.
  // Mark is always emitted; log is gated by ?perf=1 / localStorage.hudsonPerf.
  useEffect(() => {
    if (typeof performance === 'undefined') return;
    performance.mark('canvas:start');
    if (isPerfLogEnabled()) console.log(`[perf] canvas:start @ ${performance.now().toFixed(1)}ms`);
  }, []);

  // gridOpacity is computed below after shellSettings is declared

  // --- Hook merging ---
  // Hooks must be called for ALL apps (including disabled) to keep hook order stable.
  // Results for disabled apps are filtered out downstream.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fullWorkspace.apps is a stable-length list (hooks run for every app, including disabled ones, per the note above), so mapping a hook over it keeps call order stable across renders
  const allAppHooksRaw: AppHookData[] = fullWorkspace.apps.map(config => useAppHooks(config));
  const allAppHooks = allAppHooksRaw.filter(h => !disabledAppIds.has(h.appId));

  const resolveDeveloperTools = environment?.useDeveloperTools ?? useNoDeveloperTools;
  const developerTools = resolveDeveloperTools();

  // --- Port bridge (registers output/input hooks with DataBus) ---
  // eslint-disable-next-line react-hooks/rules-of-hooks
  fullWorkspace.apps.forEach(config => usePortBridge(config));

  // --- App-level settings (called unconditionally for each app) ---
  const hudsonAIConfig = fullWorkspace.apps.find(config => config.app.id === 'hudson-ai') ?? null;
  const resolveHudsonAISettings = environment?.useHudsonAISettingsEntry ?? useNoHudsonAISettingsEntry;
  const hudsonAISettingsEntry = resolveHudsonAISettings(hudsonAIConfig, activeWorkspaceId);
  const genericAppSettings = fullWorkspace.apps
    .filter(config => config.app.id !== 'hudson-ai')
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the app set (and the fixed hudson-ai exclusion) is stable per workspace, so mapping this hook over the filtered list keeps hook call order stable across renders
    .map(config => useAppSettingsBridge(config))
    .filter((e): e is AppSettingsEntry => e !== null);
  const genericAppSettingsMap = new Map(genericAppSettings.map(entry => [entry.appId, entry]));
  const workspaceAppSettings = fullWorkspace.apps.flatMap(config => {
    if (config.app.id === 'hudson-ai') return hudsonAISettingsEntry ? [hudsonAISettingsEntry] : [];
    const entry = genericAppSettingsMap.get(config.app.id);
    return entry ? [entry] : [];
  });
  const appSettings = hudsonAIConfig || !hudsonAISettingsEntry
    ? workspaceAppSettings
    : [hudsonAISettingsEntry, ...workspaceAppSettings];

  // --- Service registry (global, not tied to any app) ---
  const serviceRegistry = useServiceRegistry(routes);
  const workspaceServiceIds = useMemo(() => getWorkspaceServiceIds(workspace), [workspace]);
  const showSaved = useSaveIndicator();

  // --- Auto-start required services for workspace apps ---
  const autoStartedServicesRef = useRef(false);
  useEffect(() => {
    if (autoStartedServicesRef.current) return;
    autoStartedServicesRef.current = true;

    // Collect required (non-optional) service IDs from all workspace apps
    const requiredServiceIds = new Set<string>();
    for (const config of fullWorkspace.apps) {
      for (const dep of config.app.services ?? []) {
        if (!dep.optional) requiredServiceIds.add(dep.serviceId);
      }
    }
    if (requiredServiceIds.size === 0) return;

    // After a brief delay (let initial health check run), start any that aren't running
    const timer = setTimeout(async () => {
      for (const sid of requiredServiceIds) {
        const rec = serviceRegistry.records[sid];
        if (!rec || rec.status !== 'running') {
          console.log(`[workspace] Auto-starting required service: ${sid}`);
          await serviceRegistry.executeAction(sid, 'start', 'system');
        }
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allAppIds = useMemo(() => workspace.apps.map(c => c.app.id), [workspace]);

  // --- Focus state (persisted per workspace) ---
  const defaultFocus = initialState?.focusedAppId && allAppIds.includes(initialState.focusedAppId)
    ? initialState.focusedAppId
    : workspace.defaultFocusedAppId ?? workspace.apps[0]?.app.id ?? '';
  const [focusedAppId, setFocusedAppIdRaw] = usePersistentState(
    `hudson.ws.${workspace.id}.focus`,
    defaultFocus,
    { enabled: persistSession },
  );
  const focusedIdx = allAppHooks.findIndex(h => h.appId === focusedAppId);
  const focused = allAppHooks[focusedIdx >= 0 ? focusedIdx : 0];

  // --- Z-order tracking (higher index = on top) ---
  const zCounterRef = useRef(0);
  const [zOrderMap, setZOrderMap] = useState<Record<string, number>>(() => {
    // Initialize all apps with sequential z-indices so nothing starts at 0
    const map: Record<string, number> = {};
    for (const config of fullWorkspace.apps) {
      zCounterRef.current += 1;
      map[config.app.id] = zCounterRef.current;
    }
    // Focused app gets the highest initial z-index
    if (focusedAppId) {
      zCounterRef.current += 1;
      map[focusedAppId] = zCounterRef.current;
    }
    return map;
  });

  const setFocusedAppId = useCallback((appId: string) => {
    setFocusedAppIdRaw(appId);
    // Bring to front by assigning the next z-counter value
    zCounterRef.current += 1;
    setZOrderMap(prev => ({ ...prev, [appId]: zCounterRef.current }));
  }, [setFocusedAppIdRaw]);

  // --- Tool expansion state (right sidebar accordion) ---
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  // Reset expanded tool when focused app changes
  const prevFocusedAppIdRef = useRef(focusedAppId);
  useEffect(() => {
    if (prevFocusedAppIdRef.current !== focusedAppId) {
      setExpandedToolId(null);
      prevFocusedAppIdRef.current = focusedAppId;
    }
  }, [focusedAppId]);

  // Auto-expand tool based on app's activeToolHint
  useEffect(() => {
    if (focused.activeToolHint) {
      setExpandedToolId(focused.activeToolHint);
    }
  }, [focused.activeToolHint]);

  const handleToggleTool = useCallback((toolId: string) => {
    setExpandedToolId(prev => prev === toolId ? null : toolId);
  }, []);

  // --- Activated apps tracking (optionally persisted through host workspace state route) ---
  const isFullBoot = bootMode === 'full';
  const defaultVisible = initialState?.activatedAppIds
    ? initialState.activatedAppIds.filter(id => allAppIds.includes(id))
    : isFullBoot && initialShowLauncher ? [] : defaultActivatedIdsForWorkspace(workspace);
  const [activatedAppIdsArr, setActivatedAppIdsArr] = useState<string[]>(defaultVisible);
  const wsStateReady = useRef(false);
  const savePending = useRef(0);

  // Load from disk on mount / workspace switch
  useEffect(() => {
    if (!persistSession || !routes.workspaceState) {
      wsStateReady.current = true;
      return;
    }
    wsStateReady.current = false;
    savePending.current++;
    const gen = savePending.current;
    fetch(routeWithQuery(routes.workspaceState, { id: workspace.id }))
      .then(r => r.json())
      .then(data => {
        if (gen !== savePending.current) return; // stale
        if (data.visibleApps && Array.isArray(data.visibleApps)) {
          const validIds = (data.visibleApps as string[]).filter(id => allAppIds.includes(id));
          setActivatedAppIdsArr(validIds.length > 0 ? validIds : defaultActivatedIdsForWorkspace(workspace));
        }
        wsStateReady.current = true;
      })
      .catch(() => { wsStateReady.current = true; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistSession, routes.workspaceState, workspace.id]);

  // Save to disk on change (debounced, only after initial load completes)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!persistSession || !wsStateReady.current) return; // Don't save until disk load finishes
    if (!routes.workspaceState) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(routes.workspaceState!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workspace.id, state: { visibleApps: activatedAppIdsArr } }),
      }).catch(() => {});
    }, 1000);
  }, [activatedAppIdsArr, persistSession, routes.workspaceState, workspace.id]);

  // Derive Set for fast lookups, filtered to only include current workspace's apps
  const activatedAppIds = useMemo(
    () => new Set(activatedAppIdsArr.filter(id => allAppIds.includes(id))),
    [activatedAppIdsArr, allAppIds],
  );
  const setActivatedAppIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setActivatedAppIdsArr(prev => {
        const prevSet = new Set(prev.filter(id => allAppIds.includes(id)));
        const next = typeof updater === 'function' ? updater(prevSet) : updater;
        return [...next];
      });
    },
    [setActivatedAppIdsArr, allAppIds],
  );

  useEffect(() => {
    onProviderRuntimeChange({
      visibleAppIds: [...activatedAppIds].filter(id => !disabledAppIds.has(id)),
      focusedAppId,
    });
  }, [activatedAppIds, disabledAppIds, focusedAppId, onProviderRuntimeChange]);

  // --- App launcher state ---
  const [showLauncher, setShowLauncher] = useState(initialShowLauncher);
  // Gate launcher visibility on boot completion (full mode)
  const [launcherReady, setLauncherReady] = useState(bootMode !== 'full');

  // Set launcherReady when boot splash is dismissed (full mode)
  useEffect(() => {
    if (bootMode === 'full' && phaseAtLeast(bootPhase, 'done')) {
      setLauncherReady(true);
    }
  }, [bootMode, bootPhase]);

  const handleActivateApp = useCallback((appId: string) => {
    setActivatedAppIds(prev => new Set([...prev, appId]));
    setFocusedAppId(appId);
  }, [setActivatedAppIds, setFocusedAppId]);

  const handleToggleAppVisibility = useCallback((appId: string) => {
    setActivatedAppIds(prev => {
      const next = new Set(prev);
      if (next.has(appId)) {
        // Don't allow hiding the last visible app
        if (next.size <= 1) return prev;
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, [setActivatedAppIds]);

  // --- Disable/enable apps (removes from Provider tree entirely) ---
  const handleToggleAppDisabled = useCallback((appId: string) => {
    const isCurrentlyDisabled = disabledAppIds.has(appId);

    // Update disabled set
    setDisabledAppIdsArr(prev => {
      const set = new Set(prev);
      if (set.has(appId)) {
        set.delete(appId);
      } else {
        set.add(appId);
      }
      return [...set];
    });

    // Separate state update (not nested in another updater)
    if (!isCurrentlyDisabled) {
      // Disabling — remove from visible
      setActivatedAppIds(vis => {
        const next = new Set(vis);
        next.delete(appId);
        return next;
      });
    } else {
      // Re-enabling — add to visible
      setActivatedAppIds(vis => new Set([...vis, appId]));
    }
  }, [disabledAppIds, setDisabledAppIdsArr, setActivatedAppIds]);

  // --- App ordering (for workspace editor display) ---
  const allFullAppIds = useMemo(() => fullWorkspace.apps.map(c => c.app.id), [fullWorkspace]);
  const [appOrder, setAppOrder] = usePersistentState<string[]>(
    `hudson.ws.${workspace.id}.appOrder`,
    allFullAppIds,
    { enabled: persistSession },
  );
  // Ensure order includes all current apps (handles new apps added to workspace)
  const normalizedAppOrder = useMemo(() => {
    const ordered = appOrder.filter(id => allFullAppIds.includes(id));
    const missing = allFullAppIds.filter(id => !ordered.includes(id));
    return [...ordered, ...missing];
  }, [appOrder, allFullAppIds]);

  const handleReorderApps = useCallback((orderedIds: string[]) => {
    setAppOrder(orderedIds);
  }, [setAppOrder]);

  // --- Window reset key (bumped to force WindowedApp remount) ---
  const [windowResetKey, setWindowResetKey] = useState(0);
  const [windowBoundsOverrides, setWindowBoundsOverrides] = useState<Record<string, WindowBounds>>(
    initialState?.tileWindowBounds ?? {},
  );

  // --- Dynamic windows (e.g. spawned terminals, not tied to static workspace apps) ---
  const [dynamicWindows, setDynamicWindows] = useState<DynamicWindowEntry[]>([]);
  const dynamicCountRef = useRef(0);
  const [showDevtoolsWelcome, setShowDevtoolsWelcome] = useState(false);
  const [showTerminalSpawn, setShowTerminalSpawn] = useState(false);
  const { notice: settingChangedNotice, setNotice: setSettingChangedNotice } = useSettingChangedNotice();

  const spawnTerminal = useCallback((
    cwd = '~',
    opts?: { backend?: 'pty' | 'tmux'; title?: string },
  ) => {
    dynamicCountRef.current++;
    const n = dynamicCountRef.current;
    const offset = (n - 1) * 30;
    const shortCwd = cwd.replace(/^\/Users\/[^/]+/, '~');
    const backend = opts?.backend ?? 'pty';
    const id = `dyn-terminal-${n}`;
    const tmuxSession = backend === 'tmux' ? `hudson-${id}` : undefined;
    const title = opts?.title?.trim()
      ? opts.title.trim()
      : `Terminal ${n} — ${shortCwd}${backend === 'tmux' ? ' · tmux' : ''}`;
    const win: DynamicWindowEntry = {
      id,
      title,
      render: () => environment?.renderTerminal?.({ initialCwd: cwd, backend, tmuxSession }) ?? null,
      bounds: { x: -350 + offset, y: -250 + offset, w: 700, h: 500 },
    };
    setDynamicWindows(prev => [...prev, win]);
    setFocusedAppId(win.id);
  }, [environment]);

  const closeDynamicWindow = useCallback((id: string) => {
    setDynamicWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  // --- Smart tiling: compute clean window positions on first launch ---
  const tileWindowBounds = useCallback((ids: Set<string>) => {
    const windowed = workspace.apps.filter(
      c => ids.has(c.app.id) && c.canvasMode === 'windowed',
    );
    const n = windowed.length;
    if (n === 0) return;

    const { gap } = TILE;
    const nextBounds: Record<string, WindowBounds> = {};

    if (n === 1) {
      const { singleW: w, singleH: h } = TILE;
      nextBounds[windowed[0].app.id] = { x: -w / 2, y: -h / 2, w, h };
    } else if (n === 2) {
      const { multiW: w, multiH: h } = TILE;
      const totalW = w * 2 + gap;
      windowed.forEach((config, i) => {
        const x = -totalW / 2 + i * (w + gap);
        const y = -h / 2;
        nextBounds[config.app.id] = { x, y, w, h };
      });
    } else {
      // Grid layout for 3+
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const { multiW: w, multiH: h } = TILE;
      const totalW = cols * w + (cols - 1) * gap;
      const totalH = rows * h + (rows - 1) * gap;
      windowed.forEach((config, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = -totalW / 2 + col * (w + gap);
        const y = -totalH / 2 + row * (h + gap);
        nextBounds[config.app.id] = { x, y, w, h };
      });
    }

    setWindowBoundsOverrides(previous => ({ ...previous, ...nextBounds }));
    if (persistSession) {
      for (const [appId, bounds] of Object.entries(nextBounds)) {
        const key = `hudson.ws.${workspace.id}.win.${appId}`;
        try { localStorage.setItem(key, JSON.stringify(bounds)); } catch {}
      }
    }
  }, [persistSession, workspace]);


  const handleDismissLauncher = useCallback(() => {
    const finalIds = activatedAppIds.size === 0
      ? new Set(defaultActivatedIdsForWorkspace(workspace))
      : activatedAppIds;

    setActivatedAppIds(finalIds);

    // Compute smart tiled positions and force window remount
    tileWindowBounds(finalIds);
    setWindowResetKey(k => k + 1);

    setShowLauncher(false);
    if (persistSession) {
      saveSession(activeWorkspaceId);
    }
  }, [workspace, activeWorkspaceId, activatedAppIds, setActivatedAppIds, tileWindowBounds, persistSession]);

  // Auto fit-all on first load after launcher dismiss
  const pendingFitAllRef = useRef(false);
  const prevShowLauncherRef = useRef(showLauncher);
  useEffect(() => {
    // Detect launcher going from visible → hidden
    if (prevShowLauncherRef.current && !showLauncher) {
      pendingFitAllRef.current = true;
    }
    prevShowLauncherRef.current = showLauncher;
  }, [showLauncher]);

  // --- Mode resolution ---
  const layoutMode = isSingleApp ? focused.layoutMode : workspace.mode;
  const frameMode = layoutMode === 'focus' ? 'panel' : layoutMode;
  const isCanvasMode = frameMode === 'canvas';
  const showPanels = layoutMode === 'panel';
  const leftNavigationMode = workspace.leftNavigation ?? 'hidden';
  const showLeftNavigation = showPanels || (isCanvasMode && leftNavigationMode !== 'hidden');

  // --- Shell state (same as AppShell) ---
  const [leftCollapsed, setLeftCollapsed] = usePersistentState(
    `hudson.ws.${workspace.id}.leftCollapsed`,
    initialState?.leftCollapsed ?? leftNavigationMode === 'minimized',
    { enabled: persistSession },
  );
  const [rightCollapsed, setRightCollapsed] = usePersistentState(
    `hudson.ws.${workspace.id}.rightCollapsed`,
    initialState?.rightCollapsed ?? DEFAULTS.rightCollapsed,
    { enabled: persistSession },
  );
  const [leftWidth, setLeftWidth] = usePersistentState(`hudson.ws.${workspace.id}.leftW`, DEFAULTS.leftWidth, { enabled: persistSession });
  const [rightWidth, setRightWidth] = usePersistentState(`hudson.ws.${workspace.id}.rightW`, DEFAULTS.rightWidth, { enabled: persistSession });
  const anchoredSideNav = sideNavMode === 'anchored';
  const [primaryNavOpen, setPrimaryNavOpen] = usePersistentState(
    `hudson.ws.${workspace.id}.primaryNavOpen`,
    false,
    { enabled: persistSession && anchoredSideNav },
  );
  const [primaryNavWidth, setPrimaryNavWidth] = usePersistentState(
    `hudson.ws.${workspace.id}.primaryNavW`,
    DEFAULTS.leftWidth,
    { enabled: persistSession && anchoredSideNav },
  );

  const [panOffset, setPanOffset] = useDebouncedPersistentState(`hudson.ws.${workspace.id}.pan`, workspace.defaultPan ?? DEFAULTS.pan, PERSIST_DEBOUNCE_MS, { enabled: persistSession });
  const [scale, setScale] = useDebouncedPersistentState(`hudson.ws.${workspace.id}.zoom`, workspace.defaultScale ?? DEFAULTS.zoom, PERSIST_DEBOUNCE_MS, { enabled: persistSession });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const featureFlags = useOptionalFeatureFlags();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showFeatureFlagPanel, setShowFeatureFlagPanel] = useState(false);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [workspaceEditorTab, setWorkspaceEditorTab] = useState<EditorTab>('overview');
  const [fullscreenAppId, setFullscreenAppId] = useState<string | null>(null);
  const [fsLeftOpen, setFsLeftOpen] = useState(true);
  const [fsRightOpen, setFsRightOpen] = useState(true);
  const pendingFullscreenHashRef = useRef<string | null>(null);
  const fullscreenConfig = fullscreenAppId
    ? fullWorkspace.apps.find(c => c.app.id === fullscreenAppId)
    : null;
  const fullscreenHook = fullscreenAppId
    ? allAppHooksRaw.find(h => h.appId === fullscreenAppId)
    : null;
  const fullscreenLayoutMode = fullscreenHook?.layoutMode ?? fullscreenConfig?.app.mode ?? null;
  const isCanvasFocusMode = !!fullscreenConfig && fullscreenLayoutMode === 'canvas';
  const fullscreenHasPorts = appShowsPorts(fullscreenConfig?.app);
  const fullscreenCodeSurface = fullscreenHook?.codeSurface ?? null;
  const fullscreenCodePlacement = fullscreenCodeSurface?.placement ?? fullscreenConfig?.app.code?.placement ?? 'workbench';
  const fullscreenCodeAvailable = Boolean(fullscreenCodeSurface?.object);
  const fullscreenCodeInInspector = fullscreenCodeAvailable && fullscreenCodeSurface?.open === true && fullscreenCodePlacement === 'inspector';
  const fullscreenHasInspectorSurface = !!(
    fullscreenConfig?.app.slots.Inspector ||
    fullscreenConfig?.app.slots.RightPanel ||
    fullscreenConfig?.app.tools?.length ||
    fullscreenHasPorts ||
    (fullscreenCodeAvailable && fullscreenCodePlacement === 'inspector')
  );
  const [showTerminal, setShowTerminal] = usePersistentState(`hudson.ws.${workspace.id}.terminal`, DEFAULTS.showTerminal, { enabled: persistSession });
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [terminalHeight, setTerminalHeight] = usePersistentState('hudson.termH', DEFAULTS.terminalHeight, { enabled: persistSession });
  const workspaceAppIdsKey = useMemo(() => workspace.apps.map(c => c.app.id).join('\0'), [workspace.apps]);

  // --- URL hash sync (deep-link into focused/fullscreen app) ---
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const p = new URLSearchParams(hash);
      const focus = p.get('focus');
      const fs = p.get('fullscreen');
      const allIds = new Set(workspaceAppIdsKey ? workspaceAppIdsKey.split('\0') : []);
      if (focus && allIds.has(focus)) setFocusedAppId(focus);
      if (fs && allIds.has(fs)) {
        pendingFullscreenHashRef.current = null;
        setFullscreenAppId(fs);
        setFocusedAppId(fs);
      } else {
        pendingFullscreenHashRef.current = fs;
      }
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [setFocusedAppId, workspaceAppIdsKey]);

  useEffect(() => {
    if (!fullscreenAppId && pendingFullscreenHashRef.current) return;
    const parts: string[] = [];
    if (focusedAppId) parts.push(`focus=${focusedAppId}`);
    if (fullscreenAppId) parts.push(`fullscreen=${fullscreenAppId}`);
    const hash = parts.length > 0 ? `#${parts.join('&')}` : '';
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || window.location.pathname);
    }
  }, [focusedAppId, fullscreenAppId]);

  const [minimapCollapsed, setMinimapCollapsed] = usePersistentState('hudson.minimap', DEFAULTS.minimapCollapsed, { enabled: persistSession });
  const [showGuides, setShowGuides] = usePersistentState(`hudson.ws.${workspace.id}.guides`, DEFAULTS.showGuides, { enabled: persistSession });
  const [codeWorkbenchSize, setCodeWorkbenchSize] = usePersistentState<HudsonCodeWorkbenchSize>(
    `hudson.ws.${workspace.id}.codeWorkbenchSize`,
    'half',
    { enabled: persistSession },
  );
  const [codeWorkbenchEditorWidth, setCodeWorkbenchEditorWidth] = usePersistentState(
    `hudson.ws.${workspace.id}.codeWorkbenchEditorWidth`,
    420,
    { enabled: persistSession },
  );
  const [codeWorkbenchChatWidth, setCodeWorkbenchChatWidth] = usePersistentState(
    `hudson.ws.${workspace.id}.codeWorkbenchChatWidth`,
    320,
    { enabled: persistSession },
  );
  const [codeSheetWidth, setCodeSheetWidth] = usePersistentState(
    `hudson.ws.${workspace.id}.codeSheetWidth`,
    720,
    { enabled: persistSession },
  );

  const singleApp = isSingleApp ? workspace.apps[0].app : null;
  const focusedApp = isSingleApp ? singleApp : workspace.apps.find(c => c.app.id === focusedAppId)?.app ?? null;
  const primaryNavItems = useMemo<HudNavNode[]>(() => [
    { id: '__hudson_home__', label: 'Home', icon: Home },
    ...workspace.apps.map(({ app }) => {
      const icon = app.icon ?? app.leftPanel?.icon ?? app.rightPanel?.icon;
      return {
        id: app.id,
        label: app.name,
        ...(isValidElement(icon) ? { icon } : {}),
      };
    }),
  ], [workspace.apps]);
  const anchoredContextVisible = anchoredSideNav && Boolean(focusedApp?.slots.LeftPanel);
  const anchoredPrimaryWidth = primaryNavOpen
    ? primaryNavWidth
    : HUD_SIDE_NAV_COLLAPSED_WIDTH;
  const anchoredContextWidth = anchoredContextVisible
    ? leftCollapsed
      ? HUD_SIDE_NAV_COLLAPSED_WIDTH
      : leftWidth
    : 0;
  const effectiveLeftWidth = anchoredSideNav
    ? anchoredPrimaryWidth + anchoredContextWidth
    : showLeftNavigation && !leftCollapsed
      ? leftWidth
      : 0;
  const focusedCodeSurface = focused.codeSurface;
  const focusedCodePlacement = focusedCodeSurface?.placement ?? focusedApp?.code?.placement ?? 'workbench';
  const focusedCodeAvailable = Boolean(focusedCodeSurface?.object);
  const focusedCodeInInspector = focusedCodeAvailable && focusedCodeSurface?.open === true && focusedCodePlacement === 'inspector';
  const focusedCodeWorkbenchOpen = focusedCodeAvailable && focusedCodeSurface?.open === true && focusedCodePlacement === 'workbench';
  const previousFocusedCodeWorkbenchOpenRef = useRef(false);
  const focusedHasPorts = appShowsPorts(focusedApp);
  const hasInspectorOrTools = !!(focusedApp && (focusedApp.slots.Inspector || focusedApp.tools?.length));
  const hasRightPanelSlot = !!focusedApp?.slots.RightPanel;
  const hasRightRailContent = !!focusedApp && (hasInspectorOrTools || hasRightPanelSlot || focusedHasPorts || focusedCodeAvailable);
  const showRightRail = showPanels || (isCanvasMode && hasRightRailContent);
  const effectiveRightWidth = showRightRail && !rightCollapsed ? rightWidth : 0;

  useEffect(() => {
    if (focusedCodeWorkbenchOpen && !previousFocusedCodeWorkbenchOpenRef.current && !rightCollapsed) {
      setRightCollapsed(true);
    }
    previousFocusedCodeWorkbenchOpenRef.current = focusedCodeWorkbenchOpen;
  }, [focusedCodeWorkbenchOpen, rightCollapsed, setRightCollapsed]);

  // Parallax nudge: the workbench slides out from the nav bar anchored to the
  // left of the available area. Gently drift the canvas a touch to the right
  // so it feels like the workbench is layering over a world that recedes,
  // rather than just slapping a panel on top. ~15% of the workbench width is
  // enough to read as motion without re-centering the scene.
  const codeWorkbenchViewportShiftX = useMemo(() => {
    if (!focusedCodeWorkbenchOpen || codeWorkbenchSize === 'full' || viewport.width === 0) return 0;
    const workbenchWidth = codeWorkbenchSize === 'compact'
      ? Math.min(viewport.width * 0.44, 720)
      : Math.min(viewport.width * 0.56, 920);
    return workbenchWidth * 0.24;
  }, [focusedCodeWorkbenchOpen, codeWorkbenchSize, viewport.width]);

  // --- Window bounds tracking (for fit-all + minimap indicators) ---
  // Ref holds the live truth — updated synchronously, zero re-renders.
  // handleFitAll reads from the ref (it's event-driven, doesn't need reactivity).
  // Minimap indicators read from state, updated via a debounced flush so
  // dragging/resizing a window doesn't re-render the entire shell each frame.
  const windowBoundsRef = useRef<Record<string, WindowBounds>>(initialState?.tileWindowBounds ?? {});
  const [windowBoundsMap, setWindowBoundsMap] = useState<Record<string, WindowBounds>>(initialState?.tileWindowBounds ?? {});
  const boundsFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportWindowBounds = useCallback((appId: string, bounds: WindowBounds) => {
    const old = windowBoundsRef.current[appId];
    if (old && old.x === bounds.x && old.y === bounds.y &&
        old.w === bounds.w && old.h === bounds.h) return;
    windowBoundsRef.current = { ...windowBoundsRef.current, [appId]: bounds };

    // Debounced flush to state for minimap rendering
    if (boundsFlushTimer.current) clearTimeout(boundsFlushTimer.current);
    boundsFlushTimer.current = setTimeout(() => {
      setWindowBoundsMap({ ...windowBoundsRef.current });
    }, BOUNDS_FLUSH_MS);
  }, []);

  // --- Console drawer state — shared AI / Terminal / diagnostics surface.
  //
  // `consoleWorkspaceKind` is the universal "which mode am I in" — the body
  // routes to the focused app's Chat or Terminal slot if present, else the
  // workspace-level fallback (`workspaceAINode` / `hudsonTerminalNode`).
  //
  // `activeTerminalAppId` is preserved as a back-compat write-only handle.
  // External callers (intents, voice, command-palette) keep calling
  // `setActiveTerminalAppId(HUDSON_AI_ID)` etc; we mirror that into the kind.
  const HUDSON_TERMINAL_ID = '__hudson__';
  const HUDSON_AI_ID = '__hudson-ai__';
  const appsWithConsoleSurface = workspace.apps.filter(c => c.app.slots.Chat || c.app.slots.Terminal);
  type ConsoleWorkspaceKind = 'ai' | 'terminal' | 'logs' | `developer:${string}`;
  const [consoleWorkspaceKind, setConsoleWorkspaceKind] = useState<ConsoleWorkspaceKind>('ai');
  const initialFocusedChatApp = workspace.apps.find(c => c.app.id === focusedAppId && c.app.slots.Chat)?.app ?? null;
  const [consoleAIKind, setConsoleAIKind] = useState<'workspace' | 'app'>(
    initialFocusedChatApp ? 'app' : 'workspace',
  );
  const consoleAIKindUserSelected = useRef(false);
  const [, setActiveTerminalAppIdRaw] = useState(() => {
    const pendingTerminalAppId = consumePendingTerminalAppId(workspace.id);
    if (pendingTerminalAppId) return pendingTerminalAppId;
    return HUDSON_AI_ID;
  });
  const setActiveTerminalAppId = useCallback((id: string) => {
    setActiveTerminalAppIdRaw(id);
    if (id === HUDSON_TERMINAL_ID) setConsoleWorkspaceKind('terminal');
    else if (id === HUDSON_AI_ID) setConsoleWorkspaceKind('ai');
  }, [HUDSON_AI_ID, HUDSON_TERMINAL_ID]);
  const [hudsonAIComposerRequest, setHudsonAIComposerRequest] = useState<WorkspaceAIComposerRequest | null>(null);
  const [voiceTriggerNonce, setVoiceTriggerNonce] = useState(0);

  const focusedConsoleApp = appsWithConsoleSurface.find(c => c.app.id === focusedAppId)?.app ?? null;
  const focusedChatApp = focusedConsoleApp?.slots.Chat ? focusedConsoleApp : null;
  const openWorkspaceConsole = useCallback((kind: ConsoleWorkspaceKind) => {
    setConsoleWorkspaceKind(kind);
    if (kind === 'ai') setActiveTerminalAppIdRaw(HUDSON_AI_ID);
    if (kind === 'terminal') setActiveTerminalAppIdRaw(HUDSON_TERMINAL_ID);
    if (kind === 'ai' && focusedChatApp && !consoleAIKindUserSelected.current) {
      setConsoleAIKind('app');
    }
  }, [HUDSON_AI_ID, HUDSON_TERMINAL_ID, focusedChatApp]);

  const selectConsoleAIKind = useCallback((kind: 'workspace' | 'app') => {
    consoleAIKindUserSelected.current = true;
    setConsoleAIKind(kind);
  }, []);

  useEffect(() => {
    if (!focusedChatApp) {
      setConsoleAIKind('workspace');
      return;
    }
    if (!consoleAIKindUserSelected.current) {
      setConsoleAIKind('app');
    }
  }, [focusedChatApp]);

  // --- Settings ---
  const initialShellSettings = useMemo(
    () => initialState
      ? mergeHudsonSettings(DEFAULT_SHELL_SETTINGS, {
          theme: initialState.theme,
          template: initialState.template,
        })
      : DEFAULT_SHELL_SETTINGS,
    [initialState],
  );
  const [storedShellSettings, setShellSettings] = usePersistentState<HudsonSettings>(
    'hudson.settings',
    initialShellSettings,
    { enabled: persistSession },
  );
  const shellSettings = useMemo(
    () => normalizeHudsonSettings(storedShellSettings),
    [storedShellSettings],
  );
  const muted = shellSettings.masterMute;
  const gridOpacity = phaseAtLeast(bootPhase, 'chrome-in') ? (shellSettings.gridOpacity ?? 60) / 100 : 0;

  useEffect(() => {
    const normalized = normalizeHudsonSettings(storedShellSettings);
    if (JSON.stringify(normalized) !== JSON.stringify(storedShellSettings)) {
      setShellSettings(normalized);
    }
  }, [storedShellSettings, setShellSettings]);

  useEffect(() => {
    setSoundMuted(shellSettings.masterMute);
  }, [shellSettings.masterMute]);

  // Apply font settings as CSS custom properties on :root
  useEffect(() => {
    const font = shellSettings.font ?? DEFAULT_SHELL_SETTINGS.font;
    document.documentElement.style.setProperty('--hudson-font-size', `${font.fontSize}px`);
    document.documentElement.style.setProperty('--hudson-font-family', font.fontFamily);
  }, [shellSettings.font]);

  const updateShellSettings = useCallback(
    (patch: Partial<HudsonSettings>) => {
      setShellSettings(prev => mergeHudsonSettings(prev, patch));
    },
    [setShellSettings],
  );

  const resetShellSettings = useCallback(() => {
    setShellSettings(DEFAULT_SHELL_SETTINGS);
  }, [setShellSettings]);

  const contextMenuMode = shellSettings.contextMenuMode ?? DEFAULT_SHELL_SETTINGS.contextMenuMode;
  const contextMenuActivationMode = contextMenuMode === 'chrome-first' ? 'modifier' : 'default';
  const toggleContextMenuMode = useCallback(() => {
    const nextMode = contextMenuMode === 'hudson-first' ? 'chrome-first' : 'hudson-first';
    updateShellSettings({
      contextMenuMode: nextMode,
    });
    announceSettingChanged({
      id: 'context-menu-mode',
      title: 'Right click updated',
      valueLabel: nextMode === 'hudson-first' ? 'Hudson First' : 'Chrome First',
      description: nextMode === 'hudson-first'
        ? 'Right-click opens Hudson menus. Option-right-click opens Chrome Inspect Element.'
        : 'Right-click opens Chrome Inspect Element. Option-right-click opens Hudson menus.',
      locationLabel: 'Settings > Navigation > Right Click',
    });
  }, [contextMenuMode, updateShellSettings]);

  const devtoolsWelcomeInfo = useMemo(() => ({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    mode: frameMode,
    contextMenuMode,
    focusedAppId: focusedApp?.id ?? null,
    focusedAppName: focusedApp?.name ?? null,
    apps: workspace.apps.map(config => ({
      id: config.app.id,
      name: config.app.name,
      mode: config.app.mode,
      canvasMode: config.canvasMode ?? 'native',
    })),
  }), [workspace.id, workspace.name, workspace.apps, frameMode, contextMenuMode, focusedApp?.id, focusedApp?.name]);

  useEffect(() => {
    installHudsonDevtoolsWelcome(devtoolsWelcomeInfo);
  }, [devtoolsWelcomeInfo]);

  const openDevtoolsWelcome = useCallback(() => {
    showHudsonDevtoolsWelcome(devtoolsWelcomeInfo);
    setShowDevtoolsWelcome(true);
  }, [devtoolsWelcomeInfo]);

  // --- Sound helper ---
  const playSound = useCallback(
    (name: string) => {
      if (shellSettings.masterMute) return;
      const isTransition = name === 'slideIn' || name === 'slideOut' || name === 'whoosh' || name === 'boot';
      if (isTransition && !shellSettings.uiTransitionSounds) return;
      if (!isTransition && !shellSettings.uiClickSounds) return;
      (sounds as Record<string, () => void>)[name]?.();
    },
    [shellSettings.masterMute, shellSettings.uiClickSounds, shellSettings.uiTransitionSounds],
  );

  useEffect(() => {
    const onAgentAction = (event: Event) => {
      const detail = (event as CustomEvent<HudsonAgentActionInput>).detail;
      if (!detail || typeof detail !== 'object') return;
      logHudsonAgentAction(detail);
    };

    window.addEventListener(HUDSON_AGENT_ACTION_EVENT, onAgentAction);
    return () => window.removeEventListener(HUDSON_AGENT_ACTION_EVENT, onAgentAction);
  }, []);

  useEffect(() => {
    const onOpenApp = (event: Event) => {
      const detail = (event as CustomEvent<{
        appId?: string;
        workspaceId?: string | null;
        fullscreen?: boolean;
      }>).detail;
      const appId = typeof detail?.appId === 'string' ? detail.appId : '';
      if (!appId) return;

      if (allAppIds.includes(appId)) {
        handleActivateApp(appId);
        setFullscreenAppId(detail?.fullscreen ? appId : null);
        setShowLauncher(false);
        playSound('thock');
        return;
      }

      const requestedWorkspaceId =
        typeof detail?.workspaceId === 'string' ? detail.workspaceId : null;
      const targetWorkspace = workspaces.find(candidate =>
        (requestedWorkspaceId ? candidate.id === requestedWorkspaceId : true) &&
        candidate.apps.some(config => config.app.id === appId),
      ) ?? workspaces.find(candidate =>
        candidate.apps.some(config => config.app.id === appId),
      );

      if (!targetWorkspace) return;
      if (typeof window !== 'undefined') {
        const hash = detail?.fullscreen
          ? `focus=${encodeURIComponent(appId)}&fullscreen=${encodeURIComponent(appId)}`
          : `focus=${encodeURIComponent(appId)}`;
        window.location.hash = hash;
      }
      onSwitchWorkspace(targetWorkspace.id);
      setShowLauncher(false);
      playSound('thock');
    };

    window.addEventListener('hudson:open-app', onOpenApp);
    return () => window.removeEventListener('hudson:open-app', onOpenApp);
  }, [allAppIds, handleActivateApp, onSwitchWorkspace, playSound, workspaces]);

  const openHudLogger = useCallback(() => {
    setShowTerminal(true);
    openWorkspaceConsole('logs');
    setShowLauncher(false);
    playSound('thock');
  }, [openWorkspaceConsole, playSound, setShowTerminal]);
  const hudLoggerStatusButton = <HudLoggerStatusButton onOpen={openHudLogger} />;

  const replayEvents = useAgentActionLog({
    limit: HUD_LOGGER_MAX_EVENTS,
    refreshMs: 5000,
    enabled: showTerminal && consoleWorkspaceKind === 'logs',
  });

  const startVoicePrompt = useCallback(() => {
    setShowTerminal(true);
    setActiveTerminalAppId(HUDSON_AI_ID);
    setVoiceTriggerNonce(n => n + 1);
    playSound('pop');
  }, [playSound]);

  // --- Pan/zoom ---
  const handlePan = useCallback((delta: { x: number; y: number }) => {
    setPanOffset(prev => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
  }, []);

  const handleZoom = useCallback((newScale: number, panAdjust?: { x: number; y: number }) => {
    setScale(newScale);
    if (panAdjust) {
      setPanOffset(prev => ({ x: prev.x + panAdjust.x, y: prev.y + panAdjust.y }));
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !shellSettings.masterMute;
    updateShellSettings({ masterMute: next });
    if (!next) sounds.click();
  }, [shellSettings.masterMute, updateShellSettings]);

  const handleMinimapNavigate = useCallback((pos: { x: number; y: number }) => {
    setPanOffset(pos);
  }, []);

  const handleFitAll = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    // Read live bounds from ref — no dependency on state, always fresh
    const allBounds = Object.values(windowBoundsRef.current);
    if (allBounds.length === 0) {
      setPanOffset({ x: 0, y: 0 });
      setScale(1);
      if (!silent) playSound('blipUp');
      return;
    }
    const minX = Math.min(...allBounds.map(b => b.x));
    const maxX = Math.max(...allBounds.map(b => b.x + b.w));
    const minY = Math.min(...allBounds.map(b => b.y));
    const maxY = Math.max(...allBounds.map(b => b.y + b.h));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const padding = 120;
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    const fitScaleX = bboxW > 0 ? (viewport.width - padding) / bboxW : 1;
    const fitScaleY = bboxH > 0 ? (viewport.height - padding) / bboxH : 1;
    const fitScale = Math.max(0.2, Math.min(fitScaleX, fitScaleY, 1));

    setPanOffset({ x: -centerX, y: -centerY });
    setScale(fitScale);
    if (!silent) playSound('blipUp');
  }, [viewport, playSound]);

  // Fire delayed fit-all after launcher dismiss (gives apps time to render + report bounds).
  // Embeds skip the boot/launcher choreography, so don't pay the delayed-fit tax there.
  useEffect(() => {
    if (!pendingFitAllRef.current) return;
    pendingFitAllRef.current = false;
    if (bootMode === 'none') {
      handleFitAll();
      return;
    }
    const timer = setTimeout(handleFitAll, FIT_ALL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [bootMode, showLauncher, handleFitAll]);

  // --- Resize (ref-driven during drag, state flush on mouseup) ---
  const handleResizeStart = useCallback(
    (side: 'left' | 'right') => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;
      const setter = side === 'left' ? setLeftWidth : setRightWidth;
      const direction = side === 'left' ? 1 : -1;
      const attr = side === 'left' ? 'manifest' : 'inspector';
      const panelEl = document.querySelector(`[data-frame-panel="${attr}"]`) as HTMLElement | null;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = (ev.clientX - startX) * direction;
        const newWidth = Math.max(200, Math.min(500, startWidth + delta));
        if (panelEl) panelEl.style.width = `${newWidth}px`;
      };
      const onMouseUp = (ev: MouseEvent) => {
        const delta = (ev.clientX - startX) * direction;
        setter(Math.max(200, Math.min(500, startWidth + delta)));
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [leftWidth, rightWidth, setLeftWidth, setRightWidth],
  );

  // --- Reset all windows to defaults ---
  const handleResetAllWindows = useCallback(() => {
    for (const config of workspace.apps) {
      const key = `hudson.ws.${workspace.id}.win.${config.app.id}`;
      try { localStorage.removeItem(key); } catch {}
    }
    setPanOffset({ x: 0, y: 0 });
    setScale(1);
    // Bump key to force WindowedApp remount → re-reads defaults from localStorage
    setWindowResetKey(k => k + 1);
    playSound('blipUp');
  }, [workspace, playSound]);

  // --- Auto-layout: tile visible windows in a clean grid, then fit ---
  const handleAutoLayout = useCallback(() => {
    tileWindowBounds(activatedAppIds);
    setWindowResetKey(k => k + 1);
    // Delayed fit-all after windows remount with new positions
    setTimeout(() => handleFitAll(), 100);
    playSound('blipUp');
  }, [activatedAppIds, tileWindowBounds, handleFitAll, playSound]);

  // --- Auto-arrange on load: tidy grid + fit, once per workspace mount ---
  // WorkspaceInner is keyed by workspace id, so this also runs on every
  // workspace switch. Waits for the canvas to measure itself so the fit is
  // computed against the real viewport, then announces it for hosts (the
  // embed's reveal waits on `hudson:canvas-arranged`).
  const arrangedRef = useRef(false);
  const arrangeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportReady = viewport.width > 0 && viewport.height > 0;
  const windowedActiveIds = workspace.apps
    .filter(c => activatedAppIds.has(c.app.id) && c.canvasMode === 'windowed')
    .map(c => c.app.id);
  const windowedActiveKey = windowedActiveIds.join('|');
  // What the layout depends on: open windows and which side panels take room.
  const arrangeKey = `${windowedActiveKey}#${leftCollapsed ? 0 : 1}${rightCollapsed ? 0 : 1}`;

  // Tile the open windows for the current viewport. Open side panels count
  // as insets on wide frames so nothing lands underneath them.
  const runArrange = useCallback(() => {
    const base = arrangeInsets(viewport);
    const wide = viewport.width >= 900;
    const insets = {
      ...base,
      left: wide && !leftCollapsed ? Math.max(base.left, leftWidth + 32) : base.left,
      right: wide && !rightCollapsed ? Math.max(base.right, rightWidth + 32) : base.right,
    };
    const arranged = arrangeForViewport(windowedActiveIds, viewport, insets);
    if (!arranged) return;
    // Saved bounds win over defaults when a window mounts, so save the
    // arrangement itself: the remounted windows restore exactly these.
    if (persistSession) {
      for (const id of windowedActiveIds) {
        try { localStorage.setItem(`hudson.ws.${workspace.id}.win.${id}`, JSON.stringify(arranged.bounds[id])); } catch {}
      }
    }
    setWindowBoundsOverrides(previous => ({ ...previous, ...arranged.bounds }));
    setWindowResetKey(k => k + 1);
    setScale(arranged.scale);
    setPanOffset(arranged.pan);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- windowedActiveKey stands in for the id list
  }, [viewport, leftCollapsed, rightCollapsed, leftWidth, rightWidth, windowedActiveKey, persistSession]);

  // Once per workspace mount, as soon as the viewport is measured.
  useEffect(() => {
    if (!autoArrange || arrangedRef.current || !viewportReady) return;
    arrangedRef.current = true;
    runArrange();
    const workspaceId = workspace.id;
    arrangeTimerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hudson:canvas-arranged', { detail: { workspaceId } }));
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per workspace mount, as soon as the viewport is measured
  }, [autoArrange, viewportReady]);

  // Opening or closing an app (or a side panel) re-tiles so everything open
  // fits at a readable zoom: clicking an app in the navigation always visibly
  // lands somewhere, and no window ends up under a panel.
  const lastArrangedKeyRef = useRef(arrangeKey);
  useEffect(() => {
    if (!autoArrange || !arrangedRef.current) {
      lastArrangedKeyRef.current = arrangeKey;
      return;
    }
    if (lastArrangedKeyRef.current === arrangeKey) return;
    lastArrangedKeyRef.current = arrangeKey;
    runArrange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when open windows or panels change
  }, [autoArrange, arrangeKey]);
  useEffect(() => () => clearTimeout(arrangeTimerRef.current), []);

  // --- Fullscreen app mode ---
  const enterFullscreen = useCallback((appId: string) => {
    setFullscreenAppId(appId);
    setFocusedAppId(appId);
  }, [setFocusedAppId]);

  const exitFullscreen = useCallback(() => {
    setFullscreenAppId(null);
  }, []);

  // --- Open settings helper (now opens workspace editor on settings tab) ---
  const openSettings = useCallback((tab: EditorTab = 'settings') => {
    setWorkspaceEditorTab(tab);
    setShowWorkspaceManager(true);
  }, []);

  // --- Open workspace manager ---
  const openWorkspaceManager = useCallback(() => {
    setWorkspaceEditorTab('overview');
    setShowWorkspaceManager(true);
  }, []);

  const setPanelCollapsed = useCallback((side: 'left' | 'right', collapsed: boolean | 'toggle') => {
    const apply = (current: boolean) => collapsed === 'toggle' ? !current : collapsed;
    if (side === 'left') {
      setLeftCollapsed(current => apply(current));
    } else {
      setRightCollapsed(current => apply(current));
    }
    playSound('thock');
  }, [playSound, setLeftCollapsed, setRightCollapsed]);

  // --- Shell commands ---
  const shellCommands: CommandOption[] = useMemo(
    () => [
      {
        id: 'shell:settings',
        label: 'Settings',
        shortcut: 'Cmd+,',
        icon: <Settings size={14} />,
        action: () => openSettings('settings'),
      },
      {
        id: 'shell:environment',
        label: 'Environment',
        icon: <Settings size={14} />,
        action: () => openSettings('environment'),
      },
      ...(featureFlags ? [{
        id: 'shell:feature-flags',
        label: 'Feature Flags',
        icon: <Settings size={14} />,
        action: () => setShowFeatureFlagPanel(true),
      }] : []),
      {
        id: 'shell:workspace-editor',
        label: 'Workspace Editor',
        shortcut: 'Cmd+Shift+,',
        icon: <Settings size={14} />,
        action: () => openWorkspaceManager(),
      },
      {
        id: 'shell:fullscreen-app',
        label: fullscreenAppId ? 'Exit Focus Mode' : 'Focus App',
        shortcut: 'Cmd+Shift+F',
        icon: fullscreenAppId ? <Minimize2 size={14} /> : <Maximize2 size={14} />,
        action: () => {
          if (fullscreenAppId) {
            exitFullscreen();
          } else {
            enterFullscreen(focusedAppId);
          }
        },
      },
      ...(focusedCodeSurface?.object ? [{
        id: `shell:code-surface:${focused.appId}`,
        label: focusedCodeSurface.open
          ? `Hide ${focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'Code'}`
          : (focusedApp?.code?.commandLabel ?? focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'View Code'),
        icon: <Code2 size={14} />,
        action: () => focusedCodeSurface.setOpen(!focusedCodeSurface.open),
      }] : []),
      {
        id: 'shell:toggle-left',
        label: 'Toggle Left Panel',
        shortcut: 'Cmd+[',
        action: () => { setLeftCollapsed(c => !c); playSound('thock'); },
      },
      {
        id: 'shell:toggle-right',
        label: 'Toggle Right Panel',
        shortcut: 'Cmd+]',
        action: () => { setRightCollapsed(c => !c); playSound('thock'); },
      },
      {
        id: 'shell:toggle-terminal',
        label: 'Toggle Terminal',
        shortcut: 'Ctrl+`',
        action: () => { setShowTerminal(t => !t); playSound('slideIn'); },
      },
      {
        id: 'shell:open-logs',
        label: 'Developer Tools: Logs',
        icon: <Activity size={14} />,
        action: () => {
          setShowTerminal(true);
          openWorkspaceConsole('logs');
        },
      },
      ...developerTools.map(tool => ({
        id: `shell:open-developer-tool:${tool.id}`,
        label: `Developer Tools: ${tool.label}`,
        icon: tool.icon ?? <Activity size={14} />,
        action: () => {
          setShowTerminal(true);
          openWorkspaceConsole(`developer:${tool.id}`);
        },
      })),
      {
        id: 'shell:start-voice',
        label: 'Start Voice Prompt',
        icon: <Mic size={14} />,
        action: startVoicePrompt,
      },
      {
        id: 'shell:toggle-guides',
        label: showGuides ? 'Hide Crosshair Guides' : 'Show Crosshair Guides',
        shortcut: 'Cmd+\\',
        action: () => setShowGuides(g => !g),
      },
      {
        id: 'shell:toggle-minimap',
        label: minimapCollapsed ? 'Show Minimap' : 'Hide Minimap',
        action: () => { setMinimapCollapsed(c => !c); playSound('thock'); },
      },
      {
        id: 'shell:reset-view',
        label: 'Reset View',
        shortcut: 'Cmd+0',
        action: () => { setPanOffset({ x: 0, y: 0 }); setScale(1); playSound('blipUp'); },
      },
      {
        id: 'shell:reset-all-windows',
        label: 'Reset All Windows',
        icon: <RotateCcw size={14} />,
        action: handleResetAllWindows,
      },
      {
        id: 'shell:auto-layout',
        label: 'Auto Layout Windows',
        icon: <LayoutGrid size={14} />,
        action: handleAutoLayout,
      },
      {
        id: 'shell:toggle-mute',
        label: muted ? 'Unmute Sounds' : 'Mute Sounds',
        shortcut: 'Cmd+M',
        action: handleToggleMute,
      },
      {
        id: 'shell:theme:system',
        label: 'Theme: System',
        action: () => updateShellSettings({ theme: 'system' }),
      },
      {
        id: 'shell:theme:light',
        label: 'Theme: Light',
        action: () => updateShellSettings({ theme: 'light' }),
      },
      {
        id: 'shell:theme:dark',
        label: 'Theme: Dark',
        action: () => updateShellSettings({ theme: 'dark' }),
      },
      {
        id: 'shell:template:hudson',
        label: 'Template: Hudson',
        action: () => updateShellSettings({ template: 'hudson' }),
      },
      {
        id: 'shell:template:editorial',
        label: 'Template: Editorial',
        action: () => updateShellSettings({ template: 'editorial' }),
      },
      {
        id: 'shell:template:drafting',
        label: 'Template: Drafting',
        action: () => updateShellSettings({ template: 'drafting' }),
      },
      {
        id: 'shell:docs',
        label: 'Open Documentation',
        icon: <BookOpen size={14} />,
        action: () => window.open('/docs', '_blank'),
      },
      // Workspace switch commands
      ...workspaces
        .filter(ws => ws.id !== activeWorkspaceId)
        .map(ws => ({
          id: `switch-ws:${ws.id}`,
          label: `Switch to ${ws.name}`,
          action: () => onSwitchWorkspace(ws.id),
        })),
    ],
    [
      showGuides,
      minimapCollapsed,
      muted,
      handleToggleMute,
      handleResetAllWindows,
      workspaces,
      activeWorkspaceId,
      onSwitchWorkspace,
      playSound,
      setLeftCollapsed,
      setRightCollapsed,
      setMinimapCollapsed,
      setShowTerminal,
      setShowGuides,
      setPanOffset,
      setScale,
      updateShellSettings,
      openSettings,
      openWorkspaceManager,
      openWorkspaceConsole,
      startVoicePrompt,
      enterFullscreen,
      exitFullscreen,
      focusedAppId,
      fullscreenAppId,
      handleAutoLayout,
      focused.appId,
      focusedApp?.code?.commandLabel,
      focusedApp?.code?.label,
      focusedCodeSurface,
      featureFlags,
      developerTools,
    ],
  );

  // --- Service commands for Cmd+K palette ---
  const serviceCommands = useMemo((): CommandOption[] => {
    const cmds: CommandOption[] = [];
    for (const svc of serviceRegistry.catalog) {
      const status = serviceRegistry.records[svc.id]?.status;
      if (status !== 'running') {
        cmds.push({ id: `svc:start:${svc.id}`, label: `Start ${svc.name}`, action: () => serviceRegistry.executeAction(svc.id, 'start') });
      }
      if (status === 'running') {
        cmds.push({ id: `svc:stop:${svc.id}`, label: `Stop ${svc.name}`, action: () => serviceRegistry.executeAction(svc.id, 'stop') });
      }
      cmds.push({ id: `svc:check:${svc.id}`, label: `Check ${svc.name}`, action: () => serviceRegistry.executeAction(svc.id, 'check') });
    }
    return cmds;
  }, [serviceRegistry.catalog, serviceRegistry.records, serviceRegistry.executeAction]);

  // --- Merge all commands ---
  const allCommands = useMemo(() => {
    const merged: CommandOption[] = [...shellCommands, ...serviceCommands];
    for (const hookData of allAppHooks) {
      merged.push(...hookData.commands);
    }
    return merged.filter(command => isGateEnabled(command.flag, featureFlags));
  }, [shellCommands, serviceCommands, allAppHooks, featureFlags]);

  // --- Intent catalog + executor (plumbing for voice/LLM layer) ---
  const catalog = useIntentCatalog(workspace);
  useIntentExecutor(allCommands, catalog);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ',') {
        e.preventDefault();
        setWorkspaceEditorTab('overview');
        setShowWorkspaceManager(s => !s);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setWorkspaceEditorTab('settings');
        setShowWorkspaceManager(s => !s);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        if (fullscreenAppId) {
          setFullscreenAppId(null);
        } else {
          setFullscreenAppId(focusedAppId);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (fullscreenAppId) {
          e.preventDefault();
          setFullscreenAppId(null);
          return;
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedAppId, fullscreenAppId]);

  // --- Canvas context menu ---
  const canvasContextMenuItems = useMemo(() => buildCanvasContextMenu({
    showGuides,
    minimapCollapsed,
    onNewTerminal: () => setShowTerminalSpawn(true),
    onResetView: () => { setPanOffset({ x: 0, y: 0 }); setScale(1); playSound('blipUp'); },
    onFitAll: handleFitAll,
    onResetAllWindows: handleResetAllWindows,
    onToggleGuides: () => setShowGuides(g => !g),
    onToggleMinimap: () => { setMinimapCollapsed(c => !c); playSound('thock'); },
    onOpenDevtools: openDevtoolsWelcome,
  }), [
    showGuides,
    minimapCollapsed,
    playSound,
    handleFitAll,
    handleResetAllWindows,
    spawnTerminal,
    setMinimapCollapsed,
    openDevtoolsWelcome,
  ]);

  // --- Shell layout context ---
  const shellLayout = useMemo(
    () => ({
      leftWidth: effectiveLeftWidth,
      rightWidth: effectiveRightWidth,
      leftCollapsed: anchoredSideNav
        ? !primaryNavOpen && (!anchoredContextVisible || leftCollapsed)
        : !showLeftNavigation || leftCollapsed,
      rightCollapsed: !showRightRail || rightCollapsed,
      isTerminalOpen: showTerminal,
      terminalHeight,
      isTerminalMaximized,
    }),
    [
      effectiveLeftWidth,
      effectiveRightWidth,
      anchoredSideNav,
      primaryNavOpen,
      anchoredContextVisible,
      showLeftNavigation,
      leftCollapsed,
      showRightRail,
      rightCollapsed,
      showTerminal,
      terminalHeight,
      isTerminalMaximized,
    ],
  );
  const terminalCanvasBottomOffset = showTerminal && !isTerminalMaximized ? terminalHeight : 0;
  const canvasHeightAboveTerminal = viewport.height - SHELL_THEME.layout.statusBarHeight - terminalCanvasBottomOffset;
  const showCanvasZoomControls = !showTerminal
    || (!isTerminalMaximized && (viewport.height === 0 || canvasHeightAboveTerminal >= 160));

  const leftFooterApp = anchoredSideNav ? focusedApp : isSingleApp ? singleApp : null;
  // --- Left panel footer ---
  const leftFooter = (
    <>
      {leftFooterApp?.slots.LeftFooter && (
        <AppSlotErrorBoundary appName={leftFooterApp.name} slotName="LeftFooter">
          <leftFooterApp.slots.LeftFooter />
        </AppSlotErrorBoundary>
      )}
      {isCanvasMode && (
        <Minimap
          pan={panOffset}
          zoom={scale}
          viewportSize={viewport}
          isCollapsed={minimapCollapsed}
          onToggleCollapse={() => { setMinimapCollapsed(c => !c); playSound('thock'); }}
          onNavigate={handleMinimapNavigate}
          onFitAll={handleFitAll}
          onAutoLayout={handleAutoLayout}
        >
          {Object.entries(windowBoundsMap).map(([appId, b]) => (
            <div
              key={appId}
              className={`absolute pointer-events-none ${
                appId === focusedAppId
                  ? 'border border-accent/60 bg-accent/10'
                  : 'border border-muted-foreground/40 bg-muted-foreground/10'
              }`}
              style={{
                left: `${((b.x + 2000) / 4000) * 100}%`,
                top:  `${((b.y + 2000) / 4000) * 100}%`,
                width:  `${(b.w / 4000) * 100}%`,
                height: `${(b.h / 4000) * 100}%`,
              }}
            />
          ))}
        </Minimap>
      )}
    </>
  );

  // --- Right panel footer ---
  const rightFooter = (
    <CommandDock onOpenCommandPalette={() => { setShowCommandPalette(true); playSound('pop'); }} />
  );

  // --- Left/Right sidebar content ---
  const leftPanelContent = isCanvasFocusMode && fullscreenConfig ? (
    fullscreenConfig.app.slots.LeftPanel && (
      <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="LeftPanel">
        <fullscreenConfig.app.slots.LeftPanel />
      </AppSlotErrorBoundary>
    )
  ) : isSingleApp ? (
    singleApp?.slots.LeftPanel && (
      <AppSlotErrorBoundary appName={singleApp.name} slotName="LeftPanel">
        <singleApp.slots.LeftPanel />
      </AppSlotErrorBoundary>
    )
  ) : (
    workspace.apps.map(config => {
      const { app } = config;
      const deps = app.services;
      const serviceDeps = deps?.map(dep => ({
        serviceId: dep.serviceId,
        status: (serviceRegistry.records[dep.serviceId]?.status ?? 'unknown') as ServiceStatus,
      }));
      return (
        <SidebarSection
          key={app.id}
          appName={app.name}
          appIcon={app.leftPanel?.icon ?? app.rightPanel?.icon}
          isFocused={app.id === focusedAppId}
          // Choosing a closed app opens it (and the canvas re-tiles), so a
          // click in the navigation always lands somewhere visible.
          onFocus={() => (activatedAppIds.has(app.id) ? setFocusedAppId(app.id) : handleActivateApp(app.id))}
          defaultExpanded={app.id === focusedAppId}
          isVisible={activatedAppIds.has(app.id)}
          onToggleVisibility={() => handleToggleAppVisibility(app.id)}
          serviceDeps={serviceDeps}
          onOpenManager={openWorkspaceManager}
        >
          {app.slots.LeftPanel && (
            <AppSlotErrorBoundary appName={app.name} slotName="LeftPanel">
              <app.slots.LeftPanel />
            </AppSlotErrorBoundary>
          )}
        </SidebarSection>
      );
    })
  );

  const FocusedLeftHeaderActions = focusedApp?.leftPanel?.headerActions;
  const anchoredContextLabel = focusedApp?.leftPanel?.title ?? focusedApp?.name ?? 'Context';
  const anchoredContextHeader = (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{anchoredContextLabel}</span>
      {FocusedLeftHeaderActions ? <FocusedLeftHeaderActions /> : null}
    </div>
  );
  const anchoredContextContent = focusedApp?.slots.LeftPanel ? (
    <AppSlotErrorBoundary appName={focusedApp.name} slotName="LeftPanel">
      <focusedApp.slots.LeftPanel />
    </AppSlotErrorBoundary>
  ) : null;
  const anchoredContextIcon = focusedApp?.leftPanel?.icon ?? focusedApp?.icon;

  // --- Right panel content: app inspector, tools, and ports ---
  const rightPanelContent = focusedApp ? (
    <>
      {focusedCodeInInspector && focusedCodeSurface?.object && (
        <ObjectCodeSurface
          object={focusedCodeSurface.object}
          placement="inspector"
          onClose={() => focusedCodeSurface.setOpen(false)}
          className="min-h-[420px]"
        />
      )}
      {focusedHasPorts && (
        <PortInspector appId={focusedApp.id} />
      )}
      {focusedApp.slots.Inspector && (
        <AppSlotErrorBoundary appName={focusedApp.name} slotName="Inspector">
          <focusedApp.slots.Inspector />
        </AppSlotErrorBoundary>
      )}
      {focusedApp.tools && focusedApp.tools.length > 0 && (
        <ToolAccordion
          tools={focusedApp.tools}
          expandedToolId={expandedToolId}
          onToggle={handleToggleTool}
        />
      )}
      {!hasInspectorOrTools && focusedApp.slots.RightPanel && (
        <AppSlotErrorBoundary appName={focusedApp.name} slotName="RightPanel">
          <focusedApp.slots.RightPanel />
        </AppSlotErrorBoundary>
      )}
    </>
  ) : null;

  // --- Panel titles ---
  const leftPanelTitle = isCanvasFocusMode && fullscreenConfig
    ? (fullscreenConfig.app.leftPanel?.title ?? 'Navigation')
    : isSingleApp
    ? (singleApp?.leftPanel?.title ?? 'Navigation')
    : 'Navigation';
  const rightPanelTitle = isSingleApp
    ? (singleApp?.rightPanel?.title ?? 'Inspector')
    : 'Inspector';
  const leftPanelIcon = isCanvasFocusMode && fullscreenConfig
    ? fullscreenConfig.app.leftPanel?.icon
    : isSingleApp ? singleApp?.leftPanel?.icon : undefined;
  const rightPanelIcon = focusedApp?.rightPanel?.icon ?? (focusedCodeAvailable ? <Code2 size={12} /> : focusedHasPorts ? <Activity size={12} /> : undefined);
  const leftHeaderActions = isSingleApp && singleApp?.leftPanel?.headerActions
    ? <singleApp.leftPanel.headerActions />
    : undefined;
  const codeSurfaceHeaderAction = focusedCodeSurface?.object ? (
    <button
      type="button"
      onClick={() => focusedCodeSurface.setOpen(!focusedCodeSurface.open)}
      className={`rounded p-1 transition-colors ${
        focusedCodeSurface.open
          ? 'bg-cyan-700/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200'
          : 'text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground'
      }`}
      title={focusedCodeSurface.open ? 'Hide code' : (focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'View code')}
      aria-label={focusedCodeSurface.open ? 'Hide code' : (focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'View code')}
    >
      <Code2 size={12} />
    </button>
  ) : null;
  const rightHeaderActions = codeSurfaceHeaderAction || focusedApp?.rightPanel?.headerActions
    ? (
      <div className="flex items-center gap-1">
        {codeSurfaceHeaderAction}
        {focusedApp?.rightPanel?.headerActions && <focusedApp.rightPanel.headerActions />}
      </div>
    )
    : undefined;

  const { pushPipe, createPipe, deletePipe, getPortCatalog, pipes } = useDataBus();
  const workspaceAIToolContext = useMemo(() => {
    const hookByAppId = new Map(allAppHooksRaw.map(hook => [hook.appId, hook]));
    const visibleAppIds = [...activatedAppIds];
    const disabledIds = [...disabledAppIds];
    const liveCommands = [
      ...shellCommands.map(command => ({
        id: command.id,
        label: command.label,
        shortcut: command.shortcut,
        scope: 'shell' as const,
        description: catalog.index[command.id]?.intent.description,
      })),
      ...serviceCommands.map(command => ({
        id: command.id,
        label: command.label,
        shortcut: command.shortcut,
        scope: 'service' as const,
        description: catalog.index[command.id]?.intent.description,
      })),
      ...allAppHooks.flatMap(hook =>
        hook.commands.map(command => ({
          id: command.id,
          label: command.label,
          shortcut: command.shortcut,
          scope: 'app' as const,
          appId: hook.appId,
          appName: hook.appName,
          description: catalog.index[command.id]?.intent.description,
        })),
      ),
    ];

    return {
      workspace: {
        id: fullWorkspace.id,
        name: fullWorkspace.name,
        description: fullWorkspace.description,
        mode: fullWorkspace.mode,
        focusedAppId,
        visibleAppIds,
        disabledAppIds: disabledIds,
        availableWorkspaces: workspaces.map(candidate => ({
          id: candidate.id,
          name: candidate.name,
          current: candidate.id === activeWorkspaceId,
        })),
      },
      workspaces: workspaces.map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        mode: candidate.mode,
        current: candidate.id === activeWorkspaceId,
        defaultFocusedAppId: candidate.defaultFocusedAppId,
        apps: candidate.apps.map(({ app, canvasMode }) => ({
          id: app.id,
          name: app.name,
          description: app.description,
          agentContext: app.agentContext,
          mode: app.mode,
          canvasMode: canvasMode ?? 'native',
          services: app.services ?? [],
        })),
      })),
      apps: fullWorkspace.apps.map(config => {
        const { app } = config;
        const hook = hookByAppId.get(app.id);
        return {
          id: app.id,
          name: app.name,
          description: app.description,
          agentContext: app.agentContext,
          mode: app.mode,
          canvasMode: config.canvasMode ?? 'native',
          visible: activatedAppIds.has(app.id),
          disabled: disabledAppIds.has(app.id),
          focused: focusedAppId === app.id,
          ports: app.ports,
          tools: app.tools?.map(tool => ({ id: tool.id, name: tool.name })) ?? [],
          status: hook?.status ?? null,
          activeToolHint: hook?.activeToolHint ?? null,
          services: app.services ?? [],
        };
      }),
      commands: liveCommands,
      intents: [
        ...catalog.shell.map(intent => ({
          appId: 'shell',
          appName: 'Shell',
          commandId: intent.commandId,
          title: intent.title,
          description: intent.description,
          category: intent.category,
          keywords: intent.keywords,
          shortcut: intent.shortcut,
          dangerous: intent.dangerous,
          paramsCount: intent.params?.length ?? 0,
        })),
        ...catalog.apps.flatMap(app =>
          app.intents.map(intent => ({
            appId: app.appId,
            appName: app.appName,
            commandId: intent.commandId,
            title: intent.title,
            description: intent.description,
            category: intent.category,
            keywords: intent.keywords,
            shortcut: intent.shortcut,
            dangerous: intent.dangerous,
            paramsCount: intent.params?.length ?? 0,
          })),
        ),
      ],
      appSettings: appSettings.map(entry => ({
        appId: entry.appId,
        appName: entry.appName,
        sections: entry.config.sections.map(section => ({
          label: section.label,
          fields: section.fields.map(field => ({
            key: field.key,
            label: field.label,
            type: field.type,
            default: field.default,
            min: field.min,
            max: field.max,
            step: field.step,
            options: field.options,
            current: entry.values[field.key],
          })),
        })),
      })),
      shellSettings,
      services: serviceRegistry.catalog.map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        version: service.version,
        status: serviceRegistry.records[service.id]?.status ?? 'unknown',
        error: serviceRegistry.records[service.id]?.error,
      })),
      pipes: pipes.filter(pipe => pipe.source?.appId).map(pipe => ({
        id: pipe.id,
        name: pipe.name,
        enabled: pipe.enabled,
        source: pipe.source,
        sink: pipe.sink,
        lastPushedAt: pipe.lastPushedAt,
      })),
      portCatalog: getPortCatalog(),
      environment: {
        manageable: true,
        path: '.env.local',
        vaultPath: '.data/hudson-local-vault.json',
      },
    } as HudsonAIToolContext;
  }, [
    activeWorkspaceId,
    activatedAppIds,
    allAppHooks,
    allAppHooksRaw,
    appSettings,
    catalog.apps,
    catalog.index,
    catalog.shell,
    disabledAppIds,
    focusedAppId,
    fullWorkspace,
    getPortCatalog,
    pipes,
    serviceCommands,
    serviceRegistry.catalog,
    serviceRegistry.records,
    shellCommands,
    shellSettings,
    workspaces,
  ]);
  const hudsonAISettings = appSettings.find(entry => entry.appId === 'hudson-ai')?.values;
  const hudsonAIProvider = typeof hudsonAISettings?.provider === 'string'
    ? hudsonAISettings.provider
    : undefined;
  const hudsonAIModel = typeof hudsonAISettings?.model === 'string'
    ? hudsonAISettings.model
    : undefined;
  const queueHudsonAIPrompt = useCallback((text: string, options?: { submit?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setActiveTerminalAppId(HUDSON_AI_ID);
    setConsoleAIKind('workspace');
    setShowTerminal(true);
    setHudsonAIComposerRequest({
      id: Date.now() + Math.floor(Math.random() * 1000),
      text: trimmed,
      submit: Boolean(options?.submit),
    });
  }, [setShowTerminal]);

  // Apps can ask the shell to close the console drawer when they want to
  // surface a result on the canvas after an app-level action completes.
  useEffect(() => {
    const onClose = () => { setShowTerminal(false); playSound('slideOut'); };
    window.addEventListener('hudson:close-terminal', onClose);
    return () => window.removeEventListener('hudson:close-terminal', onClose);
  }, [setShowTerminal, playSound]);

  // Apps can ask the shell to open settings (workspace editor, settings tab).
  // Optional detail.tab targets a specific editor tab.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: EditorTab } | undefined>).detail;
      openSettings(detail?.tab ?? 'settings');
    };
    window.addEventListener('hudson:open-settings', onOpen);
    return () => window.removeEventListener('hudson:open-settings', onOpen);
  }, [openSettings]);

  // Apps can expose in-page panel affordances while the shell still owns the
  // actual SidePanel state, persistence, resize handles, and collapse chrome.
  useEffect(() => {
    const onPanelRequest = (e: Event) => {
      const detail = (e as CustomEvent<{ side?: 'left' | 'right'; collapsed?: boolean | 'toggle' } | undefined>).detail;
      if (detail?.side !== 'left' && detail?.side !== 'right') return;
      setPanelCollapsed(detail.side, detail.collapsed ?? 'toggle');
    };
    window.addEventListener('hudson:set-panel-collapsed', onPanelRequest);
    return () => window.removeEventListener('hudson:set-panel-collapsed', onPanelRequest);
  }, [setPanelCollapsed]);

  // --- Workspace AI tool call handler ---
  const handleWorkspaceToolCall = useCallback(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case 'run_command': {
        const commandId = args.commandId as string;
        const command = allCommands.find(entry => entry.id === commandId);
        if (command) {
          command.action();
        } else {
          console.warn('[WorkspaceAI] unknown command:', commandId);
        }
        break;
      }
      case 'set_app_setting': {
        const appId = args.appId as string;
        const key = args.key as string;
        const entry = appSettings.find(setting => setting.appId === appId);
        const field = entry?.config.sections.flatMap(section => section.fields).find(candidate => candidate.key === key);
        if (!entry || !field) {
          console.warn('[WorkspaceAI] unknown app setting:', appId, key);
          break;
        }
        const coerced = coerceAppSettingToolValue(field, args.value);
        if (coerced === null) {
          console.warn('[WorkspaceAI] invalid app setting value:', appId, key, args.value);
          break;
        }
        entry.onUpdate({ [key]: coerced });
        break;
      }
      case 'set_shell_setting': {
        const key = args.key as string;
        const patch = buildShellSettingsPatch(key, args.value, shellSettings);
        if (!patch) {
          console.warn('[WorkspaceAI] unsupported shell setting:', key, args.value);
          break;
        }
        updateShellSettings(patch);
        break;
      }
      case 'set_app_state': {
        const appId = args.appId as string;
        if (!appId) break;

        const visible = typeof args.visible === 'boolean' ? args.visible : undefined;
        const disabled = typeof args.disabled === 'boolean' ? args.disabled : undefined;
        const focused = typeof args.focused === 'boolean' ? args.focused : undefined;

        if (disabled !== undefined && disabled !== disabledAppIds.has(appId)) {
          handleToggleAppDisabled(appId);
        }

        if (visible !== undefined && visible !== activatedAppIds.has(appId)) {
          if (visible) {
            handleActivateApp(appId);
          } else {
            handleToggleAppVisibility(appId);
          }
        }

        if (focused) {
          handleActivateApp(appId);
        }
        break;
      }
      case 'service_action': {
        const serviceId = args.serviceId as string;
        const action = args.action as 'check' | 'install' | 'start' | 'stop';
        if (!serviceId) break;
        await serviceRegistry.executeAction(serviceId, action, 'agent');
        break;
      }
      case 'load_workspace': {
        const workspaceId = args.workspaceId as string;
        if (!workspaceId) break;
        const targetWorkspace = workspaces.find(candidate => candidate.id === workspaceId);
        if (!targetWorkspace) {
          console.warn('[WorkspaceAI] unknown workspace:', workspaceId);
          break;
        }
        if (workspaceId !== activeWorkspaceId) {
          primeHudsonAIWorkspaceHandoff(workspaceId, HUDSON_AI_ID);
          onSwitchWorkspace(workspaceId);
        }
        break;
      }
      case 'set_environment_variable': {
        const key = args.key as string;
        const value = args.value as string;
        if (!key || !routes.localEnvironment) break;
        try {
          const response = await fetch(routes.localEnvironment, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value: value ?? '' }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.error || `Failed to save ${key}.`);
          }
        } catch (error) {
          console.error('[WorkspaceAI] environment set error:', error);
        }
        break;
      }
      case 'delete_environment_variable': {
        const key = args.key as string;
        if (!key || !routes.localEnvironment) break;
        try {
          const response = await fetch(routes.localEnvironment, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.error || `Failed to delete ${key}.`);
          }
        } catch (error) {
          console.error('[WorkspaceAI] environment delete error:', error);
        }
        break;
      }
      case 'push_pipe': {
        const pipeName = args.pipeName as string;
        const pipe = pipes.find(p => p.name === pipeName);
        if (pipe) await pushPipe(pipe.id);
        break;
      }
      case 'fetch_image': {
        const url = args.url as string;
        if (url && routes.fetchImage) {
          try {
            const res = await fetch(routeWithQuery(routes.fetchImage, { url }));
            const data = await res.json();
            if (data.dataUrl) {
              console.log('[WorkspaceAI] fetched image:', data.sourceUrl, data.size, 'bytes');
            }
          } catch (e) { console.error('[WorkspaceAI] fetch error:', e); }
        }
        break;
      }
      case 'create_pipe': {
        try {
          await createPipe({
            name: args.name as string,
            source: {
              appId: args.sourceAppId as string,
              portId: args.sourcePortId as string,
            },
            sink: {
              appId: args.sinkAppId as string,
              portId: args.sinkPortId as string,
            },
            enabled: true,
          });
        } catch (e) { console.error('[WorkspaceAI] create pipe error:', e); }
        break;
      }
      case 'delete_pipe': {
        const pipeName = args.pipeName as string;
        const pipe = pipes.find(entry => entry.name === pipeName);
        if (!pipe) {
          console.warn('[WorkspaceAI] unknown pipe:', pipeName);
          break;
        }
        try {
          await deletePipe(pipe.id);
        } catch (error) {
          console.error('[WorkspaceAI] delete pipe error:', error);
        }
        break;
      }
      case 'generate_image': {
        const prompt = args.prompt as string;
        if (!prompt || !routes.imageGeneration) break;
        try {
          const res = await fetch(routes.imageGeneration, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, aspectRatio: args.aspectRatio }),
          });
          const data = await res.json();
          if (data.image?.dataUrl) {
            console.log('[WorkspaceAI] image generated');
            // Dispatch event so WorkspaceAI can display the result
            window.dispatchEvent(new CustomEvent('hudson:generated-image', {
              detail: { dataUrl: data.image.dataUrl, prompt },
            }));
          } else if (data.error) {
            console.error('[WorkspaceAI] generate error:', data.error);
            window.dispatchEvent(new CustomEvent('hudson:generated-image', {
              detail: { error: data.error, prompt },
            }));
          }
        } catch (e) { console.error('[WorkspaceAI] generate error:', e); }
        break;
      }
    }
  }, [
    activatedAppIds,
    allCommands,
    appSettings,
    createPipe,
    deletePipe,
    disabledAppIds,
    handleActivateApp,
    handleToggleAppDisabled,
    handleToggleAppVisibility,
    activeWorkspaceId,
    onSwitchWorkspace,
    pipes,
    pushPipe,
    serviceRegistry,
    updateShellSettings,
    workspaces,
    routes.fetchImage,
    routes.imageGeneration,
    routes.localEnvironment,
    shellSettings,
  ]);

  // --- Terminal screenshot button ---
  const [termSnapping, setTermSnapping] = useState(false);
  const handleTermScreenshot = useCallback(async () => {
    if (termSnapping) return;
    setTermSnapping(true);
    try {
      const blob = await captureWorkspace();
      if (!blob) return;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = new File([blob], `snap-${ts}.jpg`, { type: 'image/jpeg' });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!routes.relayUpload) return;
      const res = await fetch(routes.relayUpload, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: base64 }),
      });
      const { path } = (await res.json()) as { path: string };
      if (path) navigator.clipboard.writeText(path);
    } finally {
      setTermSnapping(false);
    }
  }, [routes.relayUpload, termSnapping]);

  // --- Terminal voice capture ---
  const terminalVoiceMetadata = useMemo(
    () => ({ workspaceId: workspace.id }),
    [workspace.id],
  );
  const [terminalVoiceDraftSubmitted, setTerminalVoiceDraftSubmitted] = useState(false);
  const handleTerminalVoiceTranscript = useCallback((transcript: string) => {
    setTerminalVoiceDraftSubmitted(shellSettings.voice.autoSend);
    window.dispatchEvent(new CustomEvent(HUDSON_TERMINAL_VOICE_TRANSCRIPT_EVENT, {
      detail: {
        transcript,
        submit: shellSettings.voice.autoSend,
      },
    }));
    playSound(shellSettings.voice.autoSend ? 'blipUp' : 'click');
  }, [playSound, shellSettings.voice.autoSend]);
  const terminalVoiceInput = useVoiceInput({
    surface: 'hudson-terminal',
    metadata: terminalVoiceMetadata,
    onTranscript: handleTerminalVoiceTranscript,
  });
  const {
    status: terminalVoiceStatus,
    error: terminalVoiceError,
    lastTranscript: terminalVoiceLastTranscript,
    isSupported: terminalVoiceSupported,
    start: startTerminalVoice,
    stop: stopTerminalVoice,
  } = terminalVoiceInput;
  const terminalVoiceRecording = terminalVoiceStatus === 'recording';
  const terminalVoiceTranscribing = terminalVoiceStatus === 'transcribing';
  const terminalVoiceAvailable = consoleWorkspaceKind === 'terminal';
  const terminalVoiceCanQuickSubmit =
    terminalVoiceAvailable
    && terminalVoiceStatus === 'ready'
    && Boolean(terminalVoiceLastTranscript)
    && !shellSettings.voice.autoSend
    && !terminalVoiceDraftSubmitted;
  const handleTerminalVoiceClick = useCallback(() => {
    if (!terminalVoiceSupported || terminalVoiceTranscribing) return;

    setShowTerminal(true);
    openWorkspaceConsole('terminal');

    if (terminalVoiceRecording) {
      stopTerminalVoice();
      return;
    }

    setTerminalVoiceDraftSubmitted(false);
    void startTerminalVoice();
  }, [
    openWorkspaceConsole,
    setShowTerminal,
    startTerminalVoice,
    stopTerminalVoice,
    terminalVoiceRecording,
    terminalVoiceSupported,
    terminalVoiceTranscribing,
  ]);
  const handleTerminalVoiceSubmit = useCallback(() => {
    window.dispatchEvent(new CustomEvent(HUDSON_TERMINAL_VOICE_SUBMIT_EVENT));
    setTerminalVoiceDraftSubmitted(true);
    playSound('blipUp');
  }, [playSound]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'm') return;
      event.preventDefault();
      event.stopPropagation();
      handleTerminalVoiceClick();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleTerminalVoiceClick]);
  const terminalVoiceTitle = (() => {
    if (!terminalVoiceAvailable) return `Switch to Terminal and record voice (${TERMINAL_VOICE_SHORTCUT_LABEL})`;
    if (!terminalVoiceSupported) return 'Voice input is not supported in this browser';
    if (terminalVoiceError) return terminalVoiceError;
    if (terminalVoiceRecording) return `Stop recording (${TERMINAL_VOICE_SHORTCUT_LABEL})`;
    if (terminalVoiceTranscribing) return 'Transcribing voice prompt';
    if (terminalVoiceCanQuickSubmit) return 'Voice draft ready';
    return shellSettings.voice.autoSend
      ? `Record and send voice prompt (${TERMINAL_VOICE_SHORTCUT_LABEL})`
      : `Record voice prompt (${TERMINAL_VOICE_SHORTCUT_LABEL})`;
  })();

  // Drawer title — product consoles and diagnostics share one Hudson-native tab strip.
  // Active tab uses the shell accent with an underline + subtle bg tint;
  // inactive in muted gray and clickable.
  const consoleTitle = (
    <div className="flex items-stretch -my-1.5 h-[34px]">
      <button
        type="button"
        onClick={() => openWorkspaceConsole('terminal')}
        aria-pressed={consoleWorkspaceKind === 'terminal'}
        className={`flex items-center gap-1.5 px-2.5 border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          consoleWorkspaceKind === 'terminal'
            ? 'text-accent border-accent bg-accent/[0.07]'
            : 'text-muted-foreground/55 border-transparent hover:text-foreground/80'
        }`}
        title="Terminal — app's Terminal slot if present, else system terminal"
      >
        <TerminalSquare size={13} />
        <span className="text-[10px] font-medium tracking-[0.18em] font-mono uppercase">TERMINAL</span>
      </button>
      <button
        type="button"
        onClick={() => openWorkspaceConsole('ai')}
        aria-pressed={consoleWorkspaceKind === 'ai'}
        className={`flex items-center gap-1.5 px-2.5 border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          consoleWorkspaceKind === 'ai'
            ? 'text-accent border-accent bg-accent/[0.07]'
            : 'text-muted-foreground/55 border-transparent hover:text-foreground/80'
        }`}
        title="AI — app's Chat slot if present, else workspace AI"
      >
        <Sparkles size={13} />
        <span className="text-[10px] font-medium tracking-[0.18em] font-mono uppercase">AI</span>
      </button>
      <button
        type="button"
        onClick={() => openWorkspaceConsole('logs')}
        aria-pressed={consoleWorkspaceKind === 'logs'}
        className={`flex items-center gap-1.5 px-2.5 border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          consoleWorkspaceKind === 'logs'
            ? 'text-accent border-accent bg-accent/[0.07]'
            : 'text-muted-foreground/55 border-transparent hover:text-foreground/80'
        }`}
        title="Logs — app, shell, agent action, and trace events"
      >
        <Activity size={13} />
        <span className="text-[10px] font-medium tracking-[0.18em] font-mono uppercase">LOGS</span>
      </button>
      {developerTools.map(tool => (
        <button
          type="button"
          key={tool.id}
          onClick={() => openWorkspaceConsole(`developer:${tool.id}`)}
          aria-pressed={consoleWorkspaceKind === `developer:${tool.id}`}
          className={`flex items-center gap-1.5 px-2.5 border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
            consoleWorkspaceKind === `developer:${tool.id}`
              ? 'text-accent border-accent bg-accent/[0.07]'
              : 'text-muted-foreground/55 border-transparent hover:text-foreground/80'
          }`}
          title={`Developer tool — ${tool.label}`}
        >
          {tool.icon ?? <Activity size={13} />}
          <span className="text-[10px] font-medium tracking-[0.18em] font-mono uppercase">{tool.label}</span>
        </button>
      ))}
    </div>
  );

  const terminalHeaderActions = consoleWorkspaceKind === 'terminal' ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleTermScreenshot}
        disabled={termSnapping}
        className="p-1 rounded text-muted-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 transition-colors"
        title="Capture screenshot — copies file path to clipboard"
      >
        {termSnapping ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
      </button>
    </div>
  ) : null;

  const terminalVoiceOverlay = consoleWorkspaceKind === 'terminal' ? (
    <div
      data-hudson-terminal-voice-overlay="true"
      className={`group flex items-center rounded-full border px-1.5 py-1 shadow-lg backdrop-blur-md transition-all duration-150 ${
        terminalVoiceRecording
          ? 'border-red-400/35 bg-red-500/15 text-red-300 opacity-100 shadow-red-950/20'
          : terminalVoiceError
            ? 'border-red-400/35 bg-card/90 text-red-400 opacity-85'
            : terminalVoiceStatus === 'unavailable'
              ? 'border-amber-400/35 bg-card/90 text-amber-400 opacity-85'
              : 'border-border/70 bg-card/75 text-muted-foreground opacity-55 hover:opacity-100 hover:text-accent focus-within:opacity-100'
      }`}
      title={terminalVoiceTitle}
    >
      <button
        data-hudson-terminal-voice-button="true"
        type="button"
        onClick={handleTerminalVoiceClick}
        disabled={!terminalVoiceAvailable || !terminalVoiceSupported || terminalVoiceTranscribing}
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          terminalVoiceRecording
            ? 'bg-red-500/20 text-red-200 hover:bg-red-500/25'
            : terminalVoiceError
              ? 'text-red-400 hover:bg-red-500/10'
              : terminalVoiceStatus === 'unavailable'
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-muted-foreground hover:bg-accent/10 hover:text-accent'
        }`}
        title={terminalVoiceTitle}
        aria-label={terminalVoiceTitle}
        aria-keyshortcuts="Meta+Shift+M Control+Shift+M"
      >
        {terminalVoiceTranscribing
          ? <Loader2 size={14} className="animate-spin" />
          : terminalVoiceRecording
            ? <Square size={13} />
            : <Mic size={15} />}
      </button>
      {terminalVoiceCanQuickSubmit && (
        <button
          type="button"
          onClick={handleTerminalVoiceSubmit}
          className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-600/25 bg-emerald-600/10 text-emerald-700 transition-colors hover:border-emerald-600/35 hover:bg-emerald-600/15 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:border-emerald-300/40"
          title="Submit pasted voice prompt"
          aria-label="Submit pasted voice prompt"
        >
          <CornerDownLeft size={14} />
        </button>
      )}
      {(terminalVoiceRecording || terminalVoiceTranscribing || terminalVoiceError || terminalVoiceStatus === 'unavailable' || terminalVoiceCanQuickSubmit) && (
        <div className="max-w-[220px] pr-2 text-[10px] font-mono uppercase tracking-[0.12em]">
          {terminalVoiceRecording
            ? 'Recording'
            : terminalVoiceTranscribing
              ? 'Transcribing'
              : terminalVoiceCanQuickSubmit
                ? 'Ready'
                : terminalVoiceError || 'Unavailable'}
        </div>
      )}
    </div>
  ) : null;

  // --- Terminal content ---
  const hudsonTerminalNode = <HudsonTerminal workspace={workspace} catalog={catalog} />;
  const workspaceAINode = (
    <WorkspaceAI
      workspace={workspace}
      onToolCall={handleWorkspaceToolCall}
      voiceSettings={shellSettings.voice}
      voiceTriggerNonce={voiceTriggerNonce}
      toolContext={workspaceAIToolContext}
      provider={hudsonAIProvider}
      model={hudsonAIModel}
      routes={routes}
      composerRequest={hudsonAIComposerRequest}
      onComposerRequestConsumed={requestId => {
        setHudsonAIComposerRequest(current => current?.id === requestId ? null : current);
      }}
    />
  );

  const appAINode = focusedChatApp?.slots.Chat ? (() => {
    const ChatSlot = focusedChatApp.slots.Chat;
    return (
      <AppSlotErrorBoundary appName={focusedChatApp.name} slotName="Chat">
        <ChatSlot />
      </AppSlotErrorBoundary>
    );
  })() : null;
  const focusedChatAppName = focusedChatApp?.name ?? 'App';

  const aiConsoleNode = (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {appAINode && (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-card/70 px-2">
          <button
            type="button"
            onClick={() => selectConsoleAIKind('workspace')}
            className={`rounded-md px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] transition-colors ${
              consoleAIKind === 'workspace'
                ? 'border border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200'
                : 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Hudson
          </button>
          <button
            type="button"
            onClick={() => selectConsoleAIKind('app')}
            className={`min-w-0 rounded-md px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] transition-colors ${
              consoleAIKind === 'app'
                ? 'border border-cyan-700/25 bg-cyan-700/10 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200'
                : 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title={`${focusedChatAppName} AI`}
          >
            <span className="block max-w-[160px] truncate">{focusedChatAppName}</span>
          </button>
          <div className="ml-auto truncate text-[10px] font-mono text-muted-foreground/70">
            {consoleAIKind === 'workspace' ? 'workspace scope' : 'app scope'}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {consoleAIKind === 'app' && appAINode ? appAINode : workspaceAINode}
      </div>
    </div>
  );

  // Console body: routed by the shared tab strip in the drawer header.
  // - AI mode    → workspace AI plus focused app AI when the app provides Chat
  // - Terminal   → focused app's Terminal slot if present, else system terminal
  const terminalContent = (() => {
    if (consoleWorkspaceKind === 'ai') {
      return aiConsoleNode;
    }
    if (consoleWorkspaceKind === 'logs') {
      return (
        <HudLogger
          observability={HObservabilityDefault}
          replayEvents={replayEvents}
          maxEvents={HUD_LOGGER_MAX_EVENTS}
          title="logs"
          className="!h-full !min-h-0 !rounded-none !border-0"
          emptyMessage="No events yet."
        />
      );
    }
    if (consoleWorkspaceKind.startsWith('developer:')) {
      const toolId = consoleWorkspaceKind.slice('developer:'.length);
      const tool = developerTools.find(candidate => candidate.id === toolId);
      return tool ? tool.render() : null;
    }
    // Terminal kind
    if (focusedConsoleApp?.slots.Terminal) {
      const TerminalSlot = focusedConsoleApp.slots.Terminal;
      return (
        <AppSlotErrorBoundary appName={focusedConsoleApp.name} slotName="Terminal">
          <TerminalSlot />
        </AppSlotErrorBoundary>
      );
    }
    return hudsonTerminalNode;
  })();

  // --- World content (always rendered — launcher overlays on top) ---
  const SingleContent = singleApp?.slots.Content ?? null;
  const singleAppConfig = isSingleApp ? workspace.apps[0] : null;
  const CanvasFocusContent = isCanvasFocusMode ? fullscreenConfig?.app.slots.Content ?? null : null;
  const canvasFocusContentNode = isCanvasFocusMode && fullscreenConfig && CanvasFocusContent ? (
    <ServiceBanner appConfig={fullscreenConfig} onOpenServices={openWorkspaceManager}>
      <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="Content">
        <CanvasFocusContent />
      </AppSlotErrorBoundary>
    </ServiceBanner>
  ) : null;
  const singleContentNode = isSingleApp && SingleContent && singleAppConfig ? (
    <ServiceBanner appConfig={singleAppConfig} onOpenServices={openWorkspaceManager}>
      <AppSlotErrorBoundary appName={singleApp!.name} slotName="Content">
        <SingleContent />
      </AppSlotErrorBoundary>
    </ServiceBanner>
  ) : null;
  const focusedCanvasContentNode = canvasFocusContentNode ?? singleContentNode;
  const { navTotalHeight: panelNavHeight } = usePlatformLayout();
  const worldContent = (
    <div
      data-hudson-world
      className={frameMode === 'panel' ? 'absolute min-h-0 min-w-0 overflow-hidden' : undefined}
      style={frameMode === 'panel' ? {
        top: panelNavHeight,
        bottom: SHELL_THEME.layout.statusBarHeight + terminalCanvasBottomOffset,
        left: effectiveLeftWidth,
        right: effectiveRightWidth,
      } : undefined}
    >
      {focusedCanvasContentNode ? (
        isCanvasMode ? (
          <div className="pointer-events-auto" style={{ transform: 'translate(-50%, -50%)' }}>
            {focusedCanvasContentNode}
          </div>
        ) : focusedCanvasContentNode
      ) : (
        <MultiAppCanvas
          showDecor={showDecor}
          workspace={workspace}
          focusedAppId={focusedAppId}
          onFocusApp={setFocusedAppId}
          onCloseApp={handleToggleAppVisibility}
          worldScale={scale}
          onResetView={() => { setPanOffset({ x: 0, y: 0 }); setScale(1); playSound('blipUp'); }}
          windowResetKey={windowResetKey}
          onReportBounds={reportWindowBounds}
          activatedAppIds={activatedAppIds}
          showLauncher={showLauncher}
          onOpenServices={openWorkspaceManager}
          onOpenInspector={() => setRightCollapsed(false)}
          onCloseInspector={() => setRightCollapsed(true)}
          isInspectorOpen={!rightCollapsed}
          onOpenDevtools={openDevtoolsWelcome}
          contextMenuActivationMode={contextMenuActivationMode}
          dynamicWindows={dynamicWindows}
          onCloseDynamicWindow={closeDynamicWindow}
          zOrderMap={zOrderMap}
          appHooksMap={Object.fromEntries(allAppHooks.map(h => [h.appId, h]))}
          onEnterFullscreen={enterFullscreen}
          windowBoundsMap={windowBoundsMap}
          windowBoundsOverrides={windowBoundsOverrides}
          persistWindowState={persistSession}
        />
      )}
    </div>
  );

  // --- Reset layout: re-tile all windows and force remount ---
  const handleResetLayout = useCallback(() => {
    tileWindowBounds(activatedAppIds);
    setWindowResetKey(k => k + 1);
    // Delayed fit-all after windows remount
    setTimeout(() => handleFitAll(), 300);
  }, [activatedAppIds, tileWindowBounds, handleFitAll]);

  // --- Workspace Manager context value ---
  const wmData = useMemo(() => ({
    workspace: fullWorkspace,
    workspaces,
    activatedAppIds,
    disabledAppIds,
    appOrder: normalizedAppOrder,
    focusedAppId,
    onToggleAppVisibility: handleToggleAppVisibility,
    onToggleAppDisabled: handleToggleAppDisabled,
    onReorderApps: handleReorderApps,
    onFocusApp: setFocusedAppId,
    serviceRegistry,
    appSettings,
    windowBoundsMap,
    onResetLayout: handleResetLayout,
    onFitAll: handleFitAll,
    shellSettings,
    onUpdateShellSettings: updateShellSettings,
    onResetShellSettings: resetShellSettings,
  }), [fullWorkspace, workspaces, activatedAppIds, disabledAppIds, normalizedAppOrder, focusedAppId, handleToggleAppVisibility, handleToggleAppDisabled, handleReorderApps, serviceRegistry, appSettings, windowBoundsMap, handleResetLayout, handleFitAll, shellSettings, updateShellSettings, resetShellSettings]);

  const hudsonAIRuntime = useMemo(() => ({
    workspace,
    onToolCall: handleWorkspaceToolCall,
    voiceSettings: shellSettings.voice,
    voiceTriggerNonce,
    toolContext: workspaceAIToolContext,
    queueConsolePrompt: queueHudsonAIPrompt,
    openWorkspaceSettings: openSettings,
  }), [
    handleWorkspaceToolCall,
    openSettings,
    queueHudsonAIPrompt,
    shellSettings.voice,
    voiceTriggerNonce,
    workspace,
    workspaceAIToolContext,
  ]);

  const renderShellNavigationBar = (embedded = false) => (
    <NavigationBar
      embedded={embedded}
      showMark={!embedded}
      title={embedded ? focusedApp?.name ?? workspace.name : shellTitle}
      subtitle={
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          onSwitch={onSwitchWorkspace}
        />
      }
      search={focused.search ?? undefined}
      center={(isSingleApp || isCanvasFocusMode) ? focused.navCenter : undefined}
      actions={
        <>
          {focused.navActions}
          {focusedCodeSurface?.object && focusedApp?.code?.navAction === true && (
            <button
              type="button"
              onClick={() => focusedCodeSurface.setOpen(!focusedCodeSurface.open)}
              className={`p-1.5 rounded border transition-colors ${
                focusedCodeSurface.open
                  ? 'border-cyan-700/25 bg-cyan-700/10 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-200'
                  : 'border-transparent text-foreground/70 hover:bg-muted hover:text-foreground hover:border-border'
              }`}
              title={focusedCodeSurface.open ? 'Hide code' : (focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'View code')}
              aria-label={focusedCodeSurface.open ? 'Hide code' : (focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'View code')}
            >
              <Code2 size={14} />
            </button>
          )}
          {isCanvasFocusMode && (
            <button
              onClick={exitFullscreen}
              className="p-1.5 rounded border border-transparent text-foreground/70 hover:bg-muted hover:text-foreground hover:border-border transition-colors"
              title="Exit Focus Mode"
              aria-label="Exit Focus Mode"
            >
              <Minimize2 size={14} />
            </button>
          )}
          <a
            href="/docs"
            target="_blank"
            className="p-1.5 rounded border border-transparent text-foreground/70 hover:bg-muted hover:text-foreground hover:border-border transition-colors"
            title="Documentation"
            aria-label="Documentation"
          >
            <BookOpen size={14} />
          </a>
          <button
            onClick={handleToggleMute}
            className="p-1.5 rounded border border-transparent text-foreground/70 hover:bg-muted hover:text-foreground hover:border-border transition-colors"
            title={muted ? 'Unmute' : 'Mute'}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </>
      }
    />
  );

  const renderShellStatusBar = (embedded = false) => (
    <StatusBar
      embedded={embedded}
      status={getWorkspaceServiceStatus(workspace, serviceRegistry)}
      viewport={{
        pan: panOffset,
        zoom: scale,
        canvasSize: { w: viewport.width, h: viewport.height },
      }}
      onToggleTerminal={() => { setShowTerminal(t => !t); playSound('slideIn'); }}
      isTerminalOpen={showTerminal}
      terminalLabel={environment?.terminalLabel}
      right={renderStatusRightItems(focused.statusRight, hudLoggerStatusButton)}
      left={
        <div className="flex items-center gap-4">
          {focused.statusLeft}
          {focused.statusLeft && (
            <div className="h-3 w-px bg-border" />
          )}
          {workspaceServiceIds.length > 0 && (
            <>
              <ServiceStatusIndicator
                registry={serviceRegistry}
                onOpenSettings={openWorkspaceManager}
                serviceIds={workspaceServiceIds}
              />
              <div className="h-3 w-px bg-border" />
            </>
          )}
          <button
            onClick={startVoicePrompt}
            className="flex items-center gap-1.5 text-foreground/70 hover:text-accent transition-colors"
            title="Start Voice Prompt"
          >
            <Mic size={10} />
            <span className="uppercase text-[10px] font-semibold tracking-wider">Voice</span>
          </button>
          <div className="h-3 w-px bg-border" />
          <button
            onClick={() => openSettings()}
            className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground transition-colors"
            title="Settings (⌘,)"
          >
            <Settings size={10} />
            <span className="uppercase text-[10px] font-semibold tracking-wider">Settings</span>
          </button>
          {showSaved && (
            <>
              <div className="h-3 w-px bg-border" />
              <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                Saved
              </span>
            </>
          )}
        </div>
      }
    />
  );

  return (
    <HudsonAIRuntimeProvider value={hudsonAIRuntime}>
    <ServiceRegistryProvider value={serviceRegistry}>
    <WorkspaceManagerProvider value={wmData}>
    <ShellLayoutProvider value={shellLayout}>
      {/* Focus mode: canvas apps stay in the Hudson canvas; panel apps use the fullscreen layout. */}
      {fullscreenConfig && !isCanvasFocusMode ? (
        <div className="h-screen flex flex-col bg-background text-foreground">
          {/* Header bar */}
          <div className="h-10 shrink-0 flex items-center px-3 gap-2 border-b border-border bg-background/95 backdrop-blur-xl shadow-[var(--hud-shadow-nav)]">
            {/* Left: back button + panel toggle */}
            <button
              onClick={exitFullscreen}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono text-foreground/80 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
              title="Back to canvas (Esc)"
            >
              <Minimize2 size={11} />
              Canvas
            </button>
            {fullscreenConfig.app.slots.LeftPanel && (
              <button
                onClick={() => setFsLeftOpen(v => !v)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                title={fsLeftOpen ? 'Hide left panel' : 'Show left panel'}
              >
                {fsLeftOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
              </button>
            )}
            <div className="h-4 w-px bg-border" />

            {/* Center: app name + template */}
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
              {fullscreenConfig.app.leftPanel?.icon && <span className="text-muted-foreground shrink-0">{fullscreenConfig.app.leftPanel.icon}</span>}
              <span className="text-[12px] font-mono font-bold text-foreground tracking-wider shrink-0">{fullscreenConfig.app.name}</span>
              {(() => {
                const h = allAppHooksRaw.find(h => h.appId === fullscreenAppId);
                return h ? (
                  <span className={`text-[9px] font-mono uppercase tracking-wider text-${h.status.color}-500 truncate`}>
                    {h.status.label}
                  </span>
                ) : null;
              })()}
            </div>

            <div className="h-4 w-px bg-border" />
            {/* Right: panel toggle + settings */}
            {fullscreenCodeSurface?.object && fullscreenConfig.app.code?.navAction === true && (
              <button
                type="button"
                onClick={() => fullscreenCodeSurface.setOpen(!fullscreenCodeSurface.open)}
                className={`p-1 rounded border transition-colors ${
                  fullscreenCodeSurface.open
                    ? 'border-cyan-700/25 bg-cyan-700/10 text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-200'
                    : 'border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
                }`}
                title={fullscreenCodeSurface.open ? 'Hide code' : (fullscreenConfig.app.code?.label ?? fullscreenCodeSurface.label ?? 'View code')}
                aria-label={fullscreenCodeSurface.open ? 'Hide code' : (fullscreenConfig.app.code?.label ?? fullscreenCodeSurface.label ?? 'View code')}
              >
                <Code2 size={12} />
              </button>
            )}
            <button
              onClick={() => openSettings()}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
              title="Settings (⌘,)"
            >
              <Settings size={12} />
            </button>
            {fullscreenHasInspectorSurface && (
              <button
                onClick={() => setFsRightOpen(v => !v)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                title={fsRightOpen ? 'Hide inspector' : 'Show inspector'}
              >
                {fsRightOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
              </button>
            )}
          </div>

          {/* Body: left panel + content + right panel */}
          <div className="flex-1 flex overflow-hidden min-h-0 pb-7">
            {/* Left panel */}
            {fullscreenConfig.app.slots.LeftPanel && fsLeftOpen && (
              <div className="w-[240px] shrink-0 border-r border-border overflow-y-auto frame-scrollbar bg-card/80">
                <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="LeftPanel">
                  <fullscreenConfig.app.slots.LeftPanel />
                </AppSlotErrorBoundary>
              </div>
            )}

            {/* Main content */}
            <div className="flex-1 min-h-0 overflow-hidden relative min-w-0">
              <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="Content">
                <fullscreenConfig.app.slots.Content />
              </AppSlotErrorBoundary>
            </div>

            {/* Right panel: Inspector, tools, and ports */}
            {fullscreenHasInspectorSurface && fsRightOpen && (
              <div className="w-[260px] shrink-0 border-l border-border overflow-y-auto frame-scrollbar bg-card/80">
                {fullscreenCodeInInspector && fullscreenCodeSurface?.object && (
                  <ObjectCodeSurface
                    object={fullscreenCodeSurface.object}
                    placement="inspector"
                    onClose={() => fullscreenCodeSurface.setOpen(false)}
                  />
                )}
                {fullscreenHasPorts && (
                  <PortInspector appId={fullscreenConfig.app.id} />
                )}
                {fullscreenConfig.app.slots.Inspector && (
                  <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="Inspector">
                    <fullscreenConfig.app.slots.Inspector />
                  </AppSlotErrorBoundary>
                )}
                {!fullscreenConfig.app.slots.Inspector && fullscreenConfig.app.slots.RightPanel && (
                  <AppSlotErrorBoundary appName={fullscreenConfig.app.name} slotName="RightPanel">
                    <fullscreenConfig.app.slots.RightPanel />
                  </AppSlotErrorBoundary>
                )}
                {fullscreenConfig.app.tools && fullscreenConfig.app.tools.length > 0 && (
                  <ToolAccordion
                    tools={fullscreenConfig.app.tools}
                    expandedToolId={expandedToolId}
                    onToggle={handleToggleTool}
                  />
                )}
              </div>
            )}
          </div>

          {/* Status bar */}
          <StatusBar
            status={getWorkspaceServiceStatus(workspace, serviceRegistry)}
            onToggleTerminal={() => { setShowTerminal(t => !t); playSound('slideIn'); }}
            isTerminalOpen={showTerminal}
            terminalLabel={environment?.terminalLabel}
            right={renderStatusRightItems(
              allAppHooksRaw.find(h => h.appId === fullscreenAppId)?.statusRight ?? null,
              hudLoggerStatusButton,
            )}
            left={
              <div className="flex items-center gap-4">
                {allAppHooksRaw.find(h => h.appId === fullscreenAppId)?.statusLeft}
                {allAppHooksRaw.find(h => h.appId === fullscreenAppId)?.statusLeft && (
                  <div className="h-3 w-px bg-border" />
                )}
                {workspaceServiceIds.length > 0 && (
                  <>
                    <ServiceStatusIndicator
                      registry={serviceRegistry}
                      onOpenSettings={openWorkspaceManager}
                      serviceIds={workspaceServiceIds}
                    />
                    <div className="h-3 w-px bg-border" />
                  </>
                )}
                <button
                  onClick={startVoicePrompt}
                  className="flex items-center gap-1.5 text-foreground/70 hover:text-accent transition-colors"
                  title="Start Voice Prompt"
                >
                  <Mic size={10} />
                  <span className="uppercase text-[10px] font-semibold tracking-wider">Voice</span>
                </button>
                <div className="h-3 w-px bg-border" />
                <button
                  onClick={() => openSettings()}
                  className="flex items-center gap-1.5 text-foreground/70 hover:text-foreground transition-colors"
                  title="Settings (⌘,)"
                >
                  <Settings size={10} />
                  <span className="uppercase text-[10px] font-semibold tracking-wider">Settings</span>
                </button>
              </div>
            }
          />

          {/* Terminal drawer */}
          <div
            className="pointer-events-none"
            style={{
              position: 'fixed',
              left: fsLeftOpen && fullscreenConfig.app.slots.LeftPanel ? 240 : 0,
              right: fsRightOpen && fullscreenHasInspectorSurface ? 260 : 0,
              bottom: 0,
              top: 0,
              zIndex: 45,
              transition: 'left 200ms ease, right 200ms ease',
              transform: 'translateZ(0)',
            }}
          >
            <TerminalDrawer
              isOpen={showTerminal}
              onClose={() => { setShowTerminal(false); playSound('slideOut'); }}
              onToggleMaximize={() => setIsTerminalMaximized(m => !m)}
              isMaximized={isTerminalMaximized}
              height={terminalHeight}
              onHeightChange={setTerminalHeight}
              title={consoleTitle}
              headerActions={terminalHeaderActions}
              contentOverlay={terminalVoiceOverlay}
            >
              {terminalContent}
            </TerminalDrawer>
          </div>

          {fullscreenCodeSurface?.open && fullscreenCodeSurface.object && fullscreenCodePlacement === 'sheet' && (
            <div
              className="pointer-events-auto fixed bottom-7 right-0 top-10 z-[46]"
              aria-label={fullscreenConfig.app.code?.label ?? fullscreenCodeSurface.label ?? 'Object code'}
            >
              <ObjectCodeSurface
                object={fullscreenCodeSurface.object}
                placement="sheet"
                onClose={() => fullscreenCodeSurface.setOpen(false)}
                width={codeSheetWidth}
                onWidthChange={setCodeSheetWidth}
              />
            </div>
          )}

          {fullscreenCodeSurface?.open && fullscreenCodeSurface.object && fullscreenCodePlacement === 'workbench' && (
            <div
              className="pointer-events-none fixed bottom-7 top-10 z-[46]"
              style={{
                left: codeWorkbenchSize === 'full'
                  ? 0
                  : fsLeftOpen && fullscreenConfig.app.slots.LeftPanel
                    ? 240
                    : 0,
                right: codeWorkbenchSize === 'full'
                  ? 0
                  : fsRightOpen && fullscreenHasInspectorSurface
                    ? 260
                    : 0,
              }}
              aria-label={fullscreenConfig.app.code?.label ?? fullscreenCodeSurface.label ?? 'Object code'}
            >
              <ObjectCodeWorkbench
                object={fullscreenCodeSurface.object}
                size={codeWorkbenchSize}
                onSizeChange={setCodeWorkbenchSize}
                onClose={() => fullscreenCodeSurface.setOpen(false)}
                chat={fullscreenCodeSurface.chat}
                editorWidth={codeWorkbenchEditorWidth}
                chatWidth={codeWorkbenchChatWidth}
                onEditorWidthChange={setCodeWorkbenchEditorWidth}
                onChatWidthChange={setCodeWorkbenchChatWidth}
              />
            </div>
          )}
        </div>
      ) : (
      <Frame
        mode={frameMode}
        panOffset={panOffset}
        scale={scale}
        onPan={handlePan}
        onZoom={handleZoom}
        onViewportChange={setViewport}
        zoomSensitivity={shellSettings.zoomSensitivity}
        zoomControlsRightOffset={effectiveRightWidth}
        zoomControlsBottomOffset={terminalCanvasBottomOffset}
        showZoomControls={showCanvasZoomControls}
        viewportShiftX={codeWorkbenchViewportShiftX}
        {...(isCanvasMode ? {
          canvasProps: { showGuides, onGuidesChange: setShowGuides, gridOpacity },
          canvasContextMenuItems,
          canvasContextMenuActivationMode: contextMenuActivationMode,
        } : {})}
        hud={
          <>
            {anchoredSideNav ? (
              <HudSideNavProvider
                open={primaryNavOpen}
                onOpenChange={setPrimaryNavOpen}
                collapsible="icon"
                keyboardShortcut="b"
                expandedWidth={primaryNavWidth}
                onExpandedWidthChange={setPrimaryNavWidth}
                collapsedWidth={HUD_SIDE_NAV_COLLAPSED_WIDTH}
              >
                <HudSideNavLayout
                  overlay
                  resizable
                  navigation={
                    <HudSideNav
                      items={primaryNavItems}
                      selectedId={showLauncher ? '__hudson_home__' : focusedAppId}
                      onSelect={(node) => {
                        if (node.id === '__hudson_home__') {
                          setShowLauncher(true);
                          return;
                        }
                        setShowLauncher(false);
                        handleActivateApp(node.id);
                      }}
                      selectionWash
                      rovingFocus
                      ariaLabel="Workspace destinations"
                      header={<WorkspacePrimaryNavBrand title={shellTitle} />}
                      collapsedHeader={<WorkspacePrimaryNavBrand title={shellTitle} compact />}
                    />
                  }
                  contextRail={anchoredContextVisible ? (
                    <HudSideRail
                      label={anchoredContextLabel}
                      header={anchoredContextHeader}
                      collapsed={leftCollapsed}
                      onCollapsedChange={setLeftCollapsed}
                      expandedWidth={leftWidth}
                      onExpandedWidthChange={setLeftWidth}
                      maxExpandedWidth={500}
                      resizable
                      collapsedContent={
                        <div className="flex justify-center py-2 text-muted-foreground">
                          {anchoredContextIcon}
                        </div>
                      }
                      footer={leftFooter}
                    >
                      {anchoredContextContent}
                    </HudSideRail>
                  ) : undefined}
                  contextRailAriaLabel={anchoredContextLabel}
                  topRow={renderShellNavigationBar(true)}
                  bottomBar={renderShellStatusBar(true)}
                >
                  {null}
                </HudSideNavLayout>
              </HudSideNavProvider>
            ) : (
              <motion.div
                initial={bootMode === 'none' ? false : { y: -48, opacity: 0 }}
                animate={chromeVisible ? { y: 0, opacity: 1 } : { y: -48, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              >
                {renderShellNavigationBar()}
              </motion.div>
            )}

            {!anchoredSideNav && (
              <motion.div
                initial={bootMode === 'none' ? false : { x: -leftWidth, opacity: 0 }}
                animate={panelsVisible ? { x: 0, opacity: 1 } : { x: -leftWidth, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              >
                {showLeftNavigation && (
                  <SidePanel
                    side="left"
                    title={leftPanelTitle}
                    icon={leftPanelIcon}
                    isCollapsed={leftCollapsed}
                    onToggleCollapse={() => { setLeftCollapsed(!leftCollapsed); playSound('thock'); }}
                    width={leftWidth}
                    onResizeStart={handleResizeStart('left')}
                    footer={leftFooter}
                    headerActions={leftHeaderActions}
                  >
                    {leftPanelContent}
                  </SidePanel>
                )}
              </motion.div>
            )}

            <motion.div
              initial={bootMode === 'none' ? false : { x: rightWidth, opacity: 0 }}
              animate={panelsVisible ? { x: 0, opacity: 1 } : { x: rightWidth, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            >
              {showRightRail && (
                <SidePanel
                  side="right"
                  title={rightPanelTitle}
                  icon={rightPanelIcon}
                  isCollapsed={rightCollapsed}
                  onToggleCollapse={() => { setRightCollapsed(!rightCollapsed); playSound('thock'); }}
                  width={rightWidth}
                  onResizeStart={handleResizeStart('right')}
                  footer={rightFooter}
                  headerActions={rightHeaderActions}
                >
                  {rightPanelContent}
                </SidePanel>
              )}
            </motion.div>

            {!anchoredSideNav && (
              <motion.div
                initial={bootMode === 'none' ? false : { y: 28, opacity: 0 }}
                animate={chromeVisible ? { y: 0, opacity: 1 } : { y: 28, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              >
                {renderShellStatusBar()}
              </motion.div>
            )}

            {/* Terminal — inset between panels */}
            <div
              className="pointer-events-none"
              style={{
                position: 'fixed',
                left: effectiveLeftWidth,
                right: effectiveRightWidth,
                bottom: 0,
                top: 0,
                zIndex: 45,
                transition: 'left 200ms ease, right 200ms ease',
                transform: 'translateZ(0)',
              }}
            >
              <TerminalDrawer
                isOpen={showTerminal}
                onClose={() => { setShowTerminal(false); playSound('slideOut'); }}
                onToggleMaximize={() => setIsTerminalMaximized(m => !m)}
                isMaximized={isTerminalMaximized}
                height={terminalHeight}
                onHeightChange={setTerminalHeight}
                title={consoleTitle}
                headerActions={terminalHeaderActions}
                contentOverlay={terminalVoiceOverlay}
              >
                {terminalContent}
              </TerminalDrawer>
            </div>

            {focusedCodeSurface?.open && focusedCodeSurface.object && focusedCodePlacement === 'sheet' && (
              <div
                className="pointer-events-auto fixed bottom-7 right-0 top-12 z-[44]"
                aria-label={focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'Object code'}
              >
                <ObjectCodeSurface
                  object={focusedCodeSurface.object}
                  placement="sheet"
                  onClose={() => focusedCodeSurface.setOpen(false)}
                  width={codeSheetWidth}
                  onWidthChange={setCodeSheetWidth}
                />
              </div>
            )}

            {focusedCodeSurface?.open && focusedCodeSurface.object && focusedCodePlacement === 'workbench' && (
              <div
                className="pointer-events-none fixed bottom-7 top-12 z-[44]"
                style={{
                  left: codeWorkbenchSize === 'full' ? 0 : effectiveLeftWidth,
                  right: codeWorkbenchSize === 'full' ? 0 : effectiveRightWidth,
                }}
                aria-label={focusedApp?.code?.label ?? focusedCodeSurface.label ?? 'Object code'}
              >
                <ObjectCodeWorkbench
                  object={focusedCodeSurface.object}
                  size={codeWorkbenchSize}
                  onSizeChange={setCodeWorkbenchSize}
                  onClose={() => focusedCodeSurface.setOpen(false)}
                  chat={focusedCodeSurface.chat}
                  editorWidth={codeWorkbenchEditorWidth}
                  chatWidth={codeWorkbenchChatWidth}
                  onEditorWidthChange={setCodeWorkbenchEditorWidth}
                  onChatWidthChange={setCodeWorkbenchChatWidth}
                />
              </div>
            )}

            {/* Command palette */}
            <CommandPalette
              isOpen={showCommandPalette}
              onClose={() => setShowCommandPalette(false)}
              commands={allCommands}
            />

            <FeatureFlagPanel
              isOpen={showFeatureFlagPanel}
              onClose={() => setShowFeatureFlagPanel(false)}
            />

            {/* App launcher overlay (rendered in HUD layer to escape canvas transform) */}
            {showLauncher && launcherReady && (
              <div className="fixed inset-0 z-[5] pointer-events-auto">
                <AppLauncher
                  workspace={workspace}
                  activatedAppIds={activatedAppIds}
                  onActivateApp={handleActivateApp}
                  onDismiss={handleDismissLauncher}
                />
              </div>
            )}
          </>
        }
      >
        {worldContent}
      </Frame>
      )}
      <WorkspaceManagerPanel
        isOpen={showWorkspaceManager}
        onClose={() => setShowWorkspaceManager(false)}
        defaultTab={workspaceEditorTab}
      />
      {showTerminalSpawn && (
        <TerminalSpawnDialog
          onSpawn={(cwd, opts) => {
            spawnTerminal(cwd, opts);
            setShowTerminalSpawn(false);
          }}
          onClose={() => setShowTerminalSpawn(false)}
        />
      )}
      {showDevtoolsWelcome && (
        <DevtoolsIntegrationDialog
          info={devtoolsWelcomeInfo}
          mode={contextMenuMode}
          onClose={() => setShowDevtoolsWelcome(false)}
          onToggleContextMenuMode={toggleContextMenuMode}
          onOpenSettings={() => {
            setShowDevtoolsWelcome(false);
            openSettings('settings');
          }}
          onShowConsole={() => showHudsonDevtoolsWelcome(devtoolsWelcomeInfo)}
        />
      )}
      <SettingChangedNotice
        notice={settingChangedNotice}
        onDismiss={() => setSettingChangedNotice(null)}
        onOpenSettings={() => {
          setSettingChangedNotice(null);
          setShowDevtoolsWelcome(false);
          openSettings('settings');
        }}
      />
    </ShellLayoutProvider>
    </WorkspaceManagerProvider>
    </ServiceRegistryProvider>
    </HudsonAIRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------
// MultiAppCanvas — renders native + windowed apps together
// ---------------------------------------------------------------------------
interface DynamicWindowEntry {
  id: string;
  title: string;
  render: () => ReactNode;
  bounds: { x: number; y: number; w: number; h: number };
}

function MultiAppCanvas({
  showDecor = true,
  workspace,
  focusedAppId,
  onFocusApp,
  onCloseApp,
  worldScale,
  onResetView,
  windowResetKey,
  onReportBounds,
  activatedAppIds,
  showLauncher,
  onOpenServices,
  onOpenInspector,
  onCloseInspector,
  isInspectorOpen,
  onOpenDevtools,
  contextMenuActivationMode,
  dynamicWindows,
  onCloseDynamicWindow,
  zOrderMap,
  appHooksMap,
  onEnterFullscreen,
  windowBoundsMap,
  windowBoundsOverrides,
  persistWindowState,
}: {
  showDecor?: boolean;
  workspace: HudsonWorkspace;
  focusedAppId: string;
  onFocusApp: (id: string) => void;
  onCloseApp: (id: string) => void;
  worldScale: number;
  onResetView: () => void;
  windowResetKey: number;
  onReportBounds: (appId: string, bounds: { x: number; y: number; w: number; h: number }) => void;
  activatedAppIds: Set<string>;
  showLauncher: boolean;
  onOpenServices: () => void;
  onOpenInspector: () => void;
  onCloseInspector: () => void;
  isInspectorOpen: boolean;
  onOpenDevtools: () => void;
  contextMenuActivationMode: 'default' | 'modifier';
  dynamicWindows: DynamicWindowEntry[];
  onCloseDynamicWindow: (id: string) => void;
  zOrderMap: Record<string, number>;
  appHooksMap: Record<string, AppHookData>;
  onEnterFullscreen: (appId: string) => void;
  windowBoundsMap: Record<string, WindowBounds>;
  windowBoundsOverrides: Record<string, WindowBounds>;
  persistWindowState: boolean;
}) {
  // Separate native vs windowed apps — filter by activated when launcher is open
  const nativeApps = workspace.apps.filter(c => (c.canvasMode ?? 'native') === 'native');
  const windowedApps = workspace.apps.filter(c => c.canvasMode === 'windowed');

  // Filter to only show activated (visible) apps
  const visibleNative = nativeApps.filter(c => activatedAppIds.has(c.app.id));
  const visibleWindowed = windowedApps.filter(c => activatedAppIds.has(c.app.id));

  // [perf] Canvas timing — paired with `canvas:start` in WorkspaceInner.
  // Fires once when first apps are placed; double-rAF so the browser has
  // actually committed paint before we mark.
  const canvasPaintedRef = useRef(false);
  useEffect(() => {
    if (canvasPaintedRef.current) return;
    if (visibleWindowed.length === 0 && visibleNative.length === 0) return;
    canvasPaintedRef.current = true;
    if (typeof performance === 'undefined') return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performance.mark('canvas:painted');
        const log = isPerfLogEnabled();
        try {
          const m = performance.measure('canvas-ready', 'canvas:start', 'canvas:painted');
          if (log) console.log(`[perf] canvas-ready: ${m.duration.toFixed(1)}ms (windowed=${visibleWindowed.length}, native=${visibleNative.length})`);
        } catch {
          if (log) console.log(`[perf] canvas:painted @ ${performance.now().toFixed(1)}ms`);
        }
      });
    });
  }, [visibleWindowed.length, visibleNative.length]);

  // Pipes from DataBus
  const { pipes } = useDataBus();

  return (
    <>
      {/* Workspace decoration layer — read-only placards behind app windows. */}
      {showDecor && <DecorationLayer worldScale={worldScale} />}
      {/* Pipe connection arrows between apps */}
      <MountTrace label="PipeConnectorLayer">
        <PipeConnectorLayer pipes={pipes} windowBoundsMap={windowBoundsMap} />
      </MountTrace>
      {/* Native apps render directly on canvas */}
      <AnimatePresence>
        {visibleNative.map(config => (
          <motion.div
            key={config.app.id}
            data-native-app={config.app.name}
            onClick={() => onFocusApp(config.app.id)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <MountTrace label={`Native:${config.app.id}`}>
              <ServiceBanner appConfig={config} onOpenServices={onOpenServices}>
                <AppSlotErrorBoundary appName={config.app.name} slotName="Content">
                  <MountTrace label={`Content:${config.app.id}`}>
                    <config.app.slots.Content />
                  </MountTrace>
                </AppSlotErrorBoundary>
              </ServiceBanner>
            </MountTrace>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Windowed apps render inside AppWindow */}
      <AnimatePresence>
        {visibleWindowed.map(config => (
          <motion.div
            key={`${config.app.id}-${windowResetKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ zIndex: zOrderMap[config.app.id] ?? 1, position: 'relative' }}
          >
            <MountTrace label={`WindowedWrapper:${config.app.id}`}>
              <WindowedApp
                config={config}
                workspaceId={workspace.id}
                initialBounds={windowBoundsOverrides[config.app.id]}
                persistWindowState={persistWindowState}
                isFocused={config.app.id === focusedAppId}
                onFocus={() => onFocusApp(config.app.id)}
                onClose={() => onCloseApp(config.app.id)}
                worldScale={worldScale}
                onResetView={onResetView}
                onReportBounds={onReportBounds}
                onOpenServices={onOpenServices}
                onOpenInspector={onOpenInspector}
                onCloseInspector={onCloseInspector}
                isInspectorOpen={config.app.id === focusedAppId && isInspectorOpen}
                onOpenDevtools={onOpenDevtools}
                contextMenuActivationMode={contextMenuActivationMode}
                navCenter={appHooksMap[config.app.id]?.navCenter ?? null}
                onEnterFullscreen={() => onEnterFullscreen(config.app.id)}
              />
            </MountTrace>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Dynamic windows (spawned terminals, etc.) */}
      <AnimatePresence>
        {dynamicWindows.map(dw => (
          <motion.div
            key={dw.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ zIndex: zOrderMap[dw.id] ?? 1, position: 'relative' }}
          >
            <MountTrace label={`DynamicWrapper:${dw.id}`}>
              <DynamicWindowedApp
                win={dw}
                isFocused={dw.id === focusedAppId}
                onFocus={() => onFocusApp(dw.id)}
                onClose={() => onCloseDynamicWindow(dw.id)}
                worldScale={worldScale}
                onOpenDevtools={onOpenDevtools}
                contextMenuActivationMode={contextMenuActivationMode}
              />
            </MountTrace>
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// DynamicWindowedApp — standalone window not tied to an app Provider
// ---------------------------------------------------------------------------
function DynamicWindowedApp({
  win,
  isFocused,
  onFocus,
  onClose,
  worldScale,
  onOpenDevtools,
  contextMenuActivationMode,
}: {
  win: DynamicWindowEntry;
  isFocused: boolean;
  onFocus: () => void;
  onClose: () => void;
  worldScale: number;
  onOpenDevtools: () => void;
  contextMenuActivationMode: 'default' | 'modifier';
}) {
  useCanvasMountTrace(`DynamicWindowedApp:${win.id}`);
  const [bounds, setBounds] = useState(win.bounds);
  const initialBoundsRef = useRef(win.bounds);
  const handleBringToCenter = useCallback(() => {
    setBounds(prev => ({
      ...prev,
      x: -(prev.w / 2),
      y: -(prev.h / 2),
    }));
  }, []);
  const handleResetWindow = useCallback(() => {
    setBounds(initialBoundsRef.current);
  }, []);
  // eslint-disable-next-line react-hooks/refs -- handleResetWindow reads initialBoundsRef only when the user picks "reset" (a click handler stored in the menu), not during render; buildDynamicWindowContextMenu just wires the callbacks
  const contextMenuItems = useMemo(() => buildDynamicWindowContextMenu({
    windowId: win.id,
    onFocus,
    onBringToCenter: handleBringToCenter,
    onResetWindow: handleResetWindow,
    onClose,
    onOpenDevtools,
  }), [win.id, onFocus, handleBringToCenter, handleResetWindow, onClose, onOpenDevtools]);

  return (
    <AppWindow
      title={win.title}
      bounds={bounds}
      onBoundsChange={setBounds}
      isFocused={isFocused}
      onFocus={onFocus}
      onClose={onClose}
      worldScale={worldScale}
      contextMenuItems={contextMenuItems}
      contextMenuScope="chrome"
      contextMenuActivationMode={contextMenuActivationMode}
    >
      {win.render()}
    </AppWindow>
  );
}

// ---------------------------------------------------------------------------
// TerminalSpawnDialog — 2-step wizard: directory presets → identity + backend.
// Same shape as the canvas-terminals studio exhibit; eventually both surfaces
// should share the wizard primitive.
// ---------------------------------------------------------------------------
type SpawnBackend = 'pty' | 'tmux';

interface CwdPreset {
  label: string;
  cwd: string;
}

const SPAWN_PRESETS: CwdPreset[] = [
  { label: '~/dev/hudson', cwd: '/Users/arach/dev/hudson' },
  { label: '~/dev/studio', cwd: '/Users/arach/dev/studio' },
  { label: '~', cwd: '~' },
];

function TerminalSpawnDialog({
  onSpawn,
  onClose,
}: {
  onSpawn: (cwd: string, opts: { backend: SpawnBackend; title: string }) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [cwd, setCwd] = useState('');
  const [customCwd, setCustomCwd] = useState('');
  const [title, setTitle] = useState('');
  const [backend, setBackend] = useState<SpawnBackend>('pty');
  const customInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (step === 1 && cwd === '__custom__') customInputRef.current?.focus();
    if (step === 2) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [step, cwd]);

  const resolvedCwd = cwd === '__custom__' ? customCwd.trim() || '~' : cwd;

  const advance = (nextCwd: string) => {
    setCwd(nextCwd);
    setTitle(prettyCwdShort(nextCwd));
    setStep(2);
  };

  const commit = () => {
    if (!resolvedCwd) return;
    onSpawn(resolvedCwd, { backend, title });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="rounded-lg border border-border bg-popover/95 text-popover-foreground shadow-[0_0_40px_rgba(0,0,0,0.6)] overflow-hidden w-[380px]"
        style={{ backdropFilter: 'blur(20px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TerminalSquare size={14} className="text-foreground/80" />
            <span className="text-[12px] font-mono text-foreground tracking-wider">New Terminal</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              · {step === 1 ? '1 / 2 directory' : '2 / 2 identity'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {step === 1 ? (
          <div className="p-3 space-y-1.5">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider px-1 pb-1">
              starting directory
            </div>
            {SPAWN_PRESETS.map((preset) => (
              <button
                key={preset.cwd}
                type="button"
                onClick={() => advance(preset.cwd)}
                className="flex w-full items-center gap-2.5 rounded border border-border bg-muted/40 px-3 py-2 text-left hover:border-foreground/30 hover:bg-muted/70 transition-colors"
              >
                <span className="font-mono text-[12px] text-foreground">{preset.label}</span>
                <span className="ml-auto text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground">
                  shell
                </span>
              </button>
            ))}
            {cwd === '__custom__' ? (
              <div className="rounded border border-border bg-muted/40 p-2">
                <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
                  custom path
                </div>
                <input
                  ref={customInputRef}
                  type="text"
                  value={customCwd}
                  onChange={(e) => setCustomCwd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') advance('__custom__');
                  }}
                  placeholder="/path/to/dir or ~/shortcut"
                  className="w-full bg-background/60 border border-border rounded px-2 py-1 text-[12px] font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-accent/40"
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => advance('__custom__')}
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-border text-foreground hover:border-foreground/40"
                  >
                    next →
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCwd('__custom__')}
                className="flex w-full items-center gap-2.5 rounded border border-dashed border-border bg-muted/20 px-3 py-2 text-left hover:border-foreground/30 hover:bg-muted/50 transition-colors"
              >
                <span className="font-mono text-[12px] text-foreground/80">custom path…</span>
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="rounded border border-border bg-muted/40 px-3 py-2">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">cwd</div>
              <div className="mt-0.5 font-mono text-[12px] text-foreground truncate">
                {prettyCwdShort(resolvedCwd)}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground block">
                title
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
                className="mt-1 w-full bg-background/60 border border-border rounded px-2 py-1 text-[12px] font-mono text-foreground outline-none focus:border-accent/40"
                placeholder={prettyCwdShort(resolvedCwd)}
                spellCheck={false}
              />
            </div>

            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                backend
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {(['pty', 'tmux'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBackend(b)}
                    aria-pressed={backend === b}
                    className={`flex-1 rounded border px-2 py-1.5 text-left transition-colors ${
                      backend === b
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-border bg-muted/40 hover:border-foreground/30'
                    }`}
                  >
                    <div className={`text-[11px] font-mono uppercase tracking-wider ${
                      backend === b ? 'text-accent' : 'text-foreground'
                    }`}>
                      {b}
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground">
                      {b === 'pty' ? 'orphan-ttl persistence' : 'survives reload'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                ← back
              </button>
              <button
                type="button"
                onClick={commit}
                className="text-[11px] px-3 py-1 rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 font-mono uppercase tracking-wider"
              >
                create terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function prettyCwdShort(cwd: string): string {
  if (!cwd) return '~';
  return cwd.replace(/^\/Users\/[^/]+/, '~');
}

// ---------------------------------------------------------------------------
// DevtoolsIntegrationDialog — explains the browser/Hudson context menu split
// ---------------------------------------------------------------------------
function DevtoolsIntegrationDialog({
  info,
  mode,
  onClose,
  onToggleContextMenuMode,
  onOpenSettings,
  onShowConsole,
}: {
  info: HudsonDevtoolsWelcomeInfo;
  mode: ContextMenuMode;
  onClose: () => void;
  onToggleContextMenuMode: () => void;
  onOpenSettings: () => void;
  onShowConsole: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const hudsonGesture = mode === 'hudson-first' ? 'Right-click' : 'Option + right-click';
  const chromeGesture = mode === 'hudson-first' ? 'Option + right-click' : 'Right-click';
  const nextModeLabel = mode === 'hudson-first' ? 'Use Chrome First' : 'Use Hudson First';
  const currentModeLabel = mode === 'hudson-first' ? 'Hudson right click first' : 'Chrome right click first';

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-background/55 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hudson-devtools-dialog-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border/70 px-4 py-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/25 bg-cyan-500/10 text-cyan-500">
            <ScanSearch size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="hudson-devtools-dialog-title" className="text-[13px] font-mono font-semibold uppercase tracking-[0.18em] text-foreground">
              Chrome DevTools
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Chrome only exposes Inspect Element through the browser native menu or DevTools shortcut.
              Hudson can choose which menu gets right-click first, but page JavaScript cannot open DevTools directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close DevTools help"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-300">
              {currentModeLabel}
            </span>
            <span className="text-muted-foreground">
              {info.workspaceName} / {info.focusedAppName ?? 'no focused app'}
            </span>
          </div>

          <div className="grid border-y border-border/70 text-[12px]">
            <div className="grid grid-cols-[24px_minmax(120px,0.6fr)_1fr] items-center gap-3 px-1 py-2">
              <MousePointer2 size={14} className="text-cyan-500" />
              <span className="font-mono text-foreground">{hudsonGesture}</span>
              <span className="text-muted-foreground">Open the Hudson menu.</span>
            </div>
            <div className="grid grid-cols-[24px_minmax(120px,0.6fr)_1fr] items-center gap-3 border-t border-border/70 px-1 py-2">
              <ScanSearch size={14} className="text-emerald-500" />
              <span className="font-mono text-foreground">{chromeGesture}</span>
              <span className="text-muted-foreground">Open Chrome native menu for Inspect Element.</span>
            </div>
            <div className="grid grid-cols-[24px_minmax(120px,0.6fr)_1fr] items-center gap-3 border-t border-border/70 px-1 py-2">
              <Keyboard size={14} className="text-teal-500" />
              <span className="font-mono text-foreground">Cmd + Option + I</span>
              <span className="text-muted-foreground">Open Chrome DevTools directly.</span>
            </div>
          </div>

          <div className="border-t border-border/70 pt-3">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-foreground">
              <Code2 size={13} className="text-cyan-500" />
              Console helper
            </div>
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              The CDP welcome splash is available in the console as <code className="text-emerald-500">window.HudsonDevtools</code>.
              Try <code className="text-emerald-500">help()</code>, <code className="text-emerald-500">shortcuts()</code>, <code className="text-emerald-500">apps()</code>, or <code className="text-emerald-500">resources()</code>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <button
            type="button"
            onClick={onShowConsole}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Code2 size={12} />
            Print Console Help
          </button>
          <a
            href="https://developer.chrome.com/docs/extensions/how-to/devtools/extend-devtools"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink size={12} />
            Extension Docs
          </a>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings size={12} />
            Settings
          </button>
          <button
            type="button"
            onClick={onToggleContextMenuMode}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-mono text-cyan-600 transition-colors hover:bg-cyan-500/15 dark:text-cyan-300"
          >
            <MousePointer2 size={12} />
            {nextModeLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WindowedApp — single app in an AppWindow with persisted bounds
// ---------------------------------------------------------------------------
function WindowedApp({
  config,
  workspaceId,
  initialBounds,
  persistWindowState,
  isFocused,
  onFocus,
  onClose,
  worldScale,
  onResetView,
  onReportBounds,
  onOpenServices,
  onOpenInspector,
  onCloseInspector,
  isInspectorOpen,
  onOpenDevtools,
  contextMenuActivationMode,
  navCenter,
  onEnterFullscreen,
}: {
  config: WorkspaceAppConfig;
  workspaceId: string;
  initialBounds?: WindowBounds;
  persistWindowState: boolean;
  isFocused: boolean;
  onFocus: () => void;
  onClose: () => void;
  worldScale: number;
  onResetView: () => void;
  onReportBounds: (appId: string, bounds: { x: number; y: number; w: number; h: number }) => void;
  onOpenServices: () => void;
  onOpenInspector: () => void;
  onCloseInspector: () => void;
  isInspectorOpen: boolean;
  onOpenDevtools: () => void;
  contextMenuActivationMode: 'default' | 'modifier';
  navCenter: ReactNode | null;
  onEnterFullscreen: () => void;
}) {
  useCanvasMountTrace(`WindowedApp:${config.app.id}`);
  const defaults = useMemo(
    () => initialBounds ?? config.defaultWindowBounds ?? { x: 100, y: 100, w: 800, h: 600 },
    [config.defaultWindowBounds, initialBounds],
  );
  const [bounds, setBounds] = useWindowBounds(workspaceId, config.app.id, defaults, persistWindowState);
  // An arrangement from the shell (auto-layout) wins over restored bounds:
  // adopt it whenever it changes, however this window's mount was timed.
  useEffect(() => {
    if (initialBounds) setBounds(initialBounds);
  }, [initialBounds, setBounds]);
  const layout = useShellLayout();
  const { navTotalHeight } = usePlatformLayout();

  // Report bounds upstream for minimap + fit-all
  useEffect(() => {
    onReportBounds(config.app.id, bounds);
  }, [bounds, config.app.id, onReportBounds]);

  // Lifted maximize state so context menu + title bar button stay in sync
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxBounds, setPreMaxBounds] = useState<typeof defaults | null>(null);

  const handleToggleMaximize = useCallback(() => {
    if (isMaximized && preMaxBounds) {
      setBounds(preMaxBounds);
      setIsMaximized(false);
      setPreMaxBounds(null);
    } else {
      // Reset the canvas view so the expanded window lands centered on screen
      onResetView();
      setBounds(prev => {
        setPreMaxBounds(prev);
        // Account for shell chrome: nav bar, status bar, sidebars, terminal
        const STATUS_H = 28;
        const termH = layout.isTerminalOpen ? layout.terminalHeight : 0;
        const chromeLeft = layout.leftWidth;
        const chromeRight = layout.rightWidth;
        const chromeTop = navTotalHeight;
        const chromeBottom = STATUS_H + termH;

        // Available viewport minus chrome, with a small inset so canvas peeks through
        const pad = 8;
        const availW = window.innerWidth - chromeLeft - chromeRight - pad * 2;
        const availH = window.innerHeight - chromeTop - chromeBottom - pad * 2;

        // After onResetView(), world origin (0,0) sits at viewport center.
        // Convert the top-left of the available area from screen to world coords.
        const worldX = chromeLeft + pad - window.innerWidth / 2;
        const worldY = chromeTop + pad - window.innerHeight / 2;

        return { x: worldX, y: worldY, w: availW, h: availH };
      });
      setIsMaximized(true);
    }
  }, [isMaximized, preMaxBounds, setBounds, onResetView, layout, navTotalHeight]);

  const handleResetWindow = useCallback(() => {
    setBounds(defaults);
    setIsMaximized(false);
    setPreMaxBounds(null);
  }, [defaults, setBounds]);

  const hasPorts = appShowsPorts(config.app);
  const hasInspector = hasInspectorSurface(config.app, hasPorts);
  const handleBringToCenter = useCallback(() => {
    setBounds(prev => ({
      ...prev,
      x: -(prev.w / 2),
      y: -(prev.h / 2),
    }));
  }, [setBounds]);

  const contextMenuItems = useMemo(() => buildAppWindowContextMenu({
    appId: config.app.id,
    isMaximized,
    hasInspector,
    inspectorOpen: isInspectorOpen,
    onEnterFullscreen,
    onFocus,
    onShowInspector: onOpenInspector,
    onHideInspector: onCloseInspector,
    onBringToCenter: handleBringToCenter,
    onToggleMaximize: handleToggleMaximize,
    onResetWindow: handleResetWindow,
    onResetView,
    onClose,
    onOpenDevtools,
  }), [
    config.app.id,
    isMaximized,
    hasInspector,
    isInspectorOpen,
    onEnterFullscreen,
    onFocus,
    onOpenInspector,
    onCloseInspector,
    handleBringToCenter,
    handleToggleMaximize,
    handleResetWindow,
    onResetView,
    onClose,
    onOpenDevtools,
  ]);

  return (
    <>
      <AppWindow
        title={config.app.name}
        titleCenter={navCenter}
        bounds={bounds}
        onBoundsChange={setBounds}
        isFocused={isFocused}
        onFocus={onFocus}
        onClose={onClose}
        worldScale={worldScale}
        isMaximized={isMaximized}
        onToggleMaximize={handleToggleMaximize}
        contextMenuItems={contextMenuItems}
        contextMenuScope="chrome"
        contextMenuActivationMode={contextMenuActivationMode}
        decorations={
          <WindowPorts
            appId={config.app.id}
            inputs={config.app.ports?.inputs}
            outputs={config.app.ports?.outputs}
          />
        }
      >
        <ServiceBanner appConfig={config} onOpenServices={onOpenServices}>
          <AppSlotErrorBoundary appName={config.app.name} slotName="Content">
            <MountTrace label={`WindowedContent:${config.app.id}`}>
              <config.app.slots.Content />
            </MountTrace>
          </AppSlotErrorBoundary>
        </ServiceBanner>
      </AppWindow>
    </>
  );
}
