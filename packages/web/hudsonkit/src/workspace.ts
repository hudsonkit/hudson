// hudsonkit/workspace — the multi-app host, graduated out of Hudson's app/shell
// into the kit so every client (Hudson, Atelier, …) consumes it instead of
// forking it. Built up in stages: Stage 1 is the foundation contexts; the
// chrome, ports, AI runtime, and the decomposed orchestrator land here next.

// Foundation contexts + runtime services
export { ActiveWorkspaceProvider, useActiveWorkspace } from './workspace/context/ActiveWorkspaceContext';
export {
  DataBusProvider,
  useDataBus,
  useOptionalDataBus,
  usePortActivity,
  usePortBridge,
} from './workspace/context/DataBusContext';
export { ServiceRegistryProvider, useServiceRegistryContext } from './workspace/services/ServiceRegistryContext';
export { useServiceRegistry } from './workspace/services/useServiceRegistry';

// Settings model
export type {
  HudsonSettings,
  FontSettings,
  AIMode,
  VoiceSettings,
  SpokenReplyStyle,
  SpokenReplyLongResponse,
  SpokenReplyCodeResponse,
} from './workspace/settings/types';
export {
  FontSettingsCard,
  ServiceActionButton,
  SettingsPanel,
  SettingsSection,
  SettingsSegment,
  SettingsSelect,
  SettingsSlider,
  SettingsText,
  SettingsToggle,
} from './workspace/settings/components';
export type { AppSettingsEntry } from './workspace/settings/components';

// Graduated multi-app shell
export { WorkspaceShell } from './workspace/shell/WorkspaceShell';
export type {
  WorkspaceShellEnvironment,
  WorkspaceDeveloperTool,
  WorkspaceShellInitialState,
  WindowBounds,
} from './workspace/shell/WorkspaceShell';
export {
  WorkspaceHostRoutesProvider,
  routeWithQuery,
  useWorkspaceHostRoutes,
} from './workspace/hostRoutes';
export type { WorkspaceHostRoutes, HudsonHostRoutes } from './workspace/hostRoutes';

// Shell runtime contexts and extension surfaces used by workspace apps
export {
  HudsonAIRuntimeProvider,
  useHudsonAIRuntime,
} from './workspace/shell/HudsonAIRuntimeContext';
export type {
  HudsonAIAppCapability,
  HudsonAIAppSettingsFieldSummary,
  HudsonAIAppSettingsSummary,
  HudsonAICommandSummary,
  HudsonAIIntentSummary,
  HudsonAIPipeSummary,
  HudsonAIPortCatalogEntry,
  HudsonAIRuntimeData,
  HudsonAIServiceSummary,
  HudsonAIToolContext,
  HudsonAIWorkspaceCatalogEntry,
  HudsonAIWorkspaceSummary,
} from './workspace/shell/HudsonAIRuntimeContext';
export {
  WorkspaceManagerProvider,
  useWorkspaceManager,
} from './workspace/shell/workspace-manager';
export type {
  EditorTab,
  WorkspaceManagerData,
} from './workspace/shell/workspace-manager';
export {
  WorkspaceDecorProvider,
  useOptionalWorkspaceDecor,
  useWorkspaceDecor,
} from './workspace/shell/decor/WorkspaceDecorContext';
export type { WorkspaceDecorContextValue } from './workspace/shell/decor/WorkspaceDecorContext';
export {
  EMPTY_DECOR_STATE,
  SIZING_PRESETS,
} from './workspace/shell/decor/types';
export type {
  DecorBase,
  DecorationItem,
  DecorationType,
  DecorSizing,
  DecorState,
  ImageDecor,
  StepCardDecor,
  TextDecor,
  WebDecor,
} from './workspace/shell/decor/types';
export { useAgentActionLog } from './workspace/shell/useAgentActionLog';
export type { UseAgentActionLogOptions } from './workspace/shell/useAgentActionLog';
export { HudsonEnvironmentEditor } from './workspace/shell/HudsonEnvironmentEditor';
export { HudsonVoiceSettingsEditor } from './workspace/shell/HudsonVoiceSettingsEditor';
export {
  applyHudsonVoiceBehaviorPreset,
  createHudsonSpokenReply,
  getHudsonMessageDisplayText,
  getHudsonSpokenReplyStyleLabel,
  getHudsonVoiceBehaviorPreset,
  getHudsonVoiceBehaviorPresetLabel,
} from './workspace/shell/voiceReply';
export type {
  HudsonSpokenReplyStyle,
  HudsonVoiceBehaviorPreset,
} from './workspace/shell/voiceReply';
export { shellIntents } from './workspace/shell/intents';
export { buildIntentCatalog } from './workspace/lib/intent-catalog';
export type { BuildIntentCatalogOptions } from './workspace/lib/intent-catalog';

// Tabs, splits and docks (HUD-015): pure layout operations
export {
  DEFAULT_DOCK_SIZE,
  createLayout,
  mainGroups,
  allGroups,
  visibleGroups,
  findGroup,
  dockOf,
  locateTab,
  allTabs,
  focusedTab,
  addTab,
  removeTab,
  moveTab,
  activateTab,
  focusGroup,
  setDockVisible,
  toggleDock,
  setDockSize,
  setSplitSizes,
  equaliseSplit,
  cycleTab,
  selectByNumber,
  repairLayout,
} from './workspace/tabs/layout';
export type {
  NewId,
  LayoutPlacement,
  SplitEdge,
  TabLocation,
  AddTabOptions,
  RepairResult,
} from './workspace/tabs/layout';
