// hudsonkit — public API for app developers.
// Shell internals are in 'hudsonkit/shell'.

// Types
export type { HudsonApp, AppTool, StatusColor, StatusState, SearchConfig, AppManifest, AppSettingField, AppSettingsSection, AppSettingsConfig, TakeoverState, MultiInstanceMode, PortInspectorMode, AppShellLayoutConfig, AppShellPanelBounds, AppShellResponsivePanelMax } from './types/app';
export type { HudsonAppBackend } from './types/backend';
export type { HudsonCodeChatMessage, HudsonCodeChatSurface, HudsonCodeObject, HudsonCodeSurfaceConfig, HudsonCodeSurfacePlacement, HudsonCodeSurfaceState, HudsonCodeWorkbenchSize } from './types/code';
export type { HudsonWorkspace, WorkspaceAppConfig, CanvasParticipation, WorkspaceLeftNavigation, AppInstance } from './types/workspace';
export type { AppIntent, IntentCategory, IntentParameter, ServerIntent, CatalogAppEntry, IntentCatalog } from './types/intent';
export type { ServiceDefinition, ServiceDependency, ServiceRecord, ServiceAction, ServiceStatus } from './types/service';
export type { AppOutput, AppInput, AppPorts, PipeDefinition } from './types/port';
export type { EmbedSurface, EmbedSizing, AppExports } from './types/embed';
export type { CommandOption, ContextMenuEntry, ContextMenuAction, ContextMenuSeparator, ContextMenuGroup } from './components/overlays';
export type { FeatureFlagAudience, FeatureFlagDefinition, FeatureFlagGate, FeatureFlagKey, FeatureFlagLayer, FeatureFlagLayerInput, FeatureFlagLayers, FeatureFlagOverride, FeatureFlagRegistry, FeatureFlagResolution, FeatureFlagResolver } from './flags';

// Hooks
export { usePersistentState, useDebouncedPersistentState, useSaveIndicator } from './hooks/usePersistentState';
export type { PersistentStateOptions } from './hooks/usePersistentState';
export { createHudsonCache, hudsonCache } from './lib/cache';
export type {
  HudsonCache,
  HudsonCacheDehydrateOptions,
  HudsonCacheEntry,
  HudsonCacheEvent,
  HudsonCacheEventType,
  HudsonCacheGetOptions,
  HudsonCacheHydrateOptions,
  HudsonCacheListener,
  HudsonCacheLoadContext,
  HudsonCacheLoadOptions,
  HudsonCacheLoader,
  HudsonCacheOptions,
  HudsonCacheRead,
  HudsonCacheSetOptions,
  HudsonCacheStatus,
  HudsonCacheStorage,
  HudsonCacheStorageKind,
} from './lib/cache';
export { useCommandShortcuts } from './hooks/useCommandShortcuts';
export type { UseCommandShortcutsOptions, ParsedShortcut } from './hooks/useCommandShortcuts';
export { useCachedResource } from './hooks/useCachedResource';
export type {
  CachedResourceStatus,
  UseCachedResourceOptions,
  UseCachedResourceResult,
} from './hooks/useCachedResource';
export { InstanceProvider, useInstance, useOptionalInstance } from './context/InstanceContext';
export type { InstanceContextValue } from './context/InstanceContext';
export { ShellLayoutProvider, useShellLayout } from './context/ShellLayoutContext';
export type { ShellLayout } from './context/ShellLayoutContext';
export { useAppSettings } from './hooks/useAppSettings';
export type { AppSettingsValues } from './hooks/useAppSettings';
export { useHudsonAI } from './hooks/useHudsonAI';
export type { HudsonAIChat, UseHudsonAIOptions, AIAttachment, HudsonAIAgentTrace } from './hooks/useHudsonAI';
export { useAssistant } from './hooks/useAssistant';
export type { AssistantChat, UseAssistantOptions } from './hooks/useAssistant';
// Voice kit interface (types only — no runtime voice code).
// For actual voice functionality, import from 'hudsonkit/voice'.
export type { AssistantVoiceKit, VoiceKitInput, VoiceKitOutput, VoiceKitSettings } from './types/voice-kit';
export { ThemeProvider, useTheme, HudsonThemeScript } from './theme';
export type { HudsonTheme, HudsonTemplate, ThemeProviderProps } from './theme';
export { HUDSON_TERMINAL_CLIENT_CAPABILITIES, useTerminalRelay } from './hooks/useTerminalRelay';
export type {
  RelayStatus,
  TerminalAckMessage,
  TerminalAgent,
  TerminalBackend,
  TerminalControlMode,
  TerminalDataMessage,
  TerminalFlowControlOptions,
  TerminalInputMessage,
  TerminalRelayClientMessage,
  TerminalRelayHandle,
  TerminalRelayOutputAck,
  TerminalRelayOutputHandler,
  TerminalRelayServerMessage,
  TerminalResizeMessage,
  TerminalSessionDetachedMessage,
  TerminalSessionErrorMessage,
  TerminalSessionExitMessage,
  TerminalSessionExpiredMessage,
  TerminalSessionInitMessage,
  TerminalSessionReadyMessage,
  TerminalSessionReconnectMessage,
  UseTerminalRelayOptions,
} from './hooks/useTerminalRelay';
export {
  HLogger,
  HMetrics,
  HObservability,
  HObservabilityDefault,
  HSpan,
  HTrace,
  createHudsonFetchCapture,
  dispatchHudsonAgentAction,
  formatHudsonNetworkEntryAsCurl,
  formatHudsonNetworkEntryForAgent,
  HUDSON_AGENT_ACTION_EVENT,
  HudLogger,
  HudLoggerStatusItem,
  HudNetworkPanel,
  HudsonNetworkCaptureDefault,
  HudsonNetworkStore,
  installHudsonFetchCapture,
  logHudsonAgentAction,
  redactAgentActionValue,
  sanitizeHudsonNetworkEntry,
  summarizeHudLoggerEvents,
  useHudLoggerEvents,
  useHudLoggerSummary,
  useHudsonNetworkEntries,
} from './observability';
export type {
  HudNetworkPanelProps,
  HudLoggerProps,
  HudLoggerScopeFilter,
  HudLoggerStatusItemProps,
  HudLoggerSummary,
  HudLoggerUseEventsOptions,
  HudsonAgentActionInput,
  HudsonAgentActionStatus,
  HudsonCapturedBody,
  HudsonFetchCaptureOptions,
  HudsonFetch,
  HudsonNetworkEntry,
  HudsonNetworkListener,
  HudsonNetworkRequest,
  HudsonNetworkResponse,
  HudsonNetworkStatus,
  HudsonNetworkStoreOptions,
  HudsonNetworkTiming,
  HLogEvent,
  HLogInput,
  HLogLevel,
  HMetricEvent,
  HMetricInput,
  HMetricType,
  HObservabilityOptions,
  HObservation,
  HObservationBase,
  HObservationData,
  HObservationKind,
  HObservationSink,
  HObservationTags,
  HSubscribeOptions,
  HTraceInput,
  HTraceSpan,
  HTraceStatus,
  HUnsubscribe,
} from './observability';

// AI
export { AI } from './components/AI';
export {
  RuntimePicker,
  RuntimeChip,
  RUNTIME_EFFORT_AUTO,
  runtimeModelDisplayName,
  resolveRuntimeSelection,
} from './components/RuntimePicker';
export type {
  RuntimeModel,
  RuntimeHarness,
  RuntimeEffort,
  RuntimeSelection,
  RuntimeMarkRenderer,
  RuntimeChipProps,
  RuntimePickerProps,
} from './components/RuntimePicker';
export { Assistant } from './components/Assistant';
export {
  TerminalRelay,
  captureWorkspace,
  HUDSON_TERMINAL_VOICE_TRANSCRIPT_EVENT,
  HUDSON_TERMINAL_VOICE_SUBMIT_EVENT,
} from './components/TerminalRelay';
export type {
  HudsonTerminalVoiceTranscriptDetail,
  TerminalColorScheme,
  TerminalRelayConfigItem,
  TerminalRelayProps,
  TerminalRelayRef,
  TerminalRelayTerminalInstance,
  TerminalRendererPreference,
  TerminalRendererState,
} from './components/TerminalRelay';

// Utilities
export {
  blipDown,
  blipUp,
  boot,
  chime,
  click,
  confirm,
  error,
  isMuted,
  ping,
  pop,
  preview,
  setMuted,
  slideIn,
  slideOut,
  sounds,
  thock,
  tick,
  toggleMute,
  type,
  whoosh,
} from './lib/sounds';
export type { SoundName } from './lib/sounds';
export { logEvent, FRAME_LOG_EVENT } from './lib/logger';
export type { FrameLogEntry } from './lib/logger';
export { worldToScreen, screenToWorld } from './lib/viewport';
export { HUD_SPRING, springEasing, springTransition } from './lib/motion';
export { probeVoxAvailability } from './lib/voxProbe';
export type { VoxAvailability } from './lib/voxProbe';
export {
  HUDSON_VOICE_API_PATHS,
  HUDSON_VOICE_DAEMON_DEFAULT_HOST,
  HUDSON_VOICE_DAEMON_DEFAULT_PORT,
  HUDSON_VOICE_DAEMON_DEFAULT_WS_URL,
  HudsonVoiceClientError,
  createHudsonVoiceDaemonClient,
  createHudsonVoiceClient,
  parseHudsonVoiceEventLine,
  parseHudsonVoiceEventStream,
  parseHudsonVoiceNdjson,
  probeHudsonVoiceAvailability,
} from './lib/hudsonVoiceClient';
export type {
  HudsonVoiceAvailability,
  HudsonVoiceClient,
  HudsonVoiceClientErrorCode,
  HudsonVoiceClientOptions,
  HudsonVoiceDaemonStatus,
  HudsonVoiceDaemonClientOptions,
  HudsonVoiceDevice,
  HudsonVoiceDeviceList,
  HudsonVoiceFetch,
  HudsonVoiceHealth,
  HudsonVoiceInputState,
  HudsonVoiceLiveEvent,
  HudsonVoiceLiveSession,
  HudsonVoiceLiveSessionRequest,
  HudsonVoiceModelDownloadPolicy,
  HudsonVoiceMode,
  HudsonVoicePreferencesPayload,
  HudsonVoiceProbeClient,
  HudsonVoicePermissionStatus,
  HudsonVoiceRuntimeHealth,
} from './lib/hudsonVoiceClient';
export { safeLocalStorage, safeSessionStorage } from './lib/safe-storage';
export type { SafeStorage } from './lib/safe-storage';
export { createHudsonId } from './lib/id';
export { agentCopy, agentCopyToClipboard } from './lib/agentCopy';
export type { AgentCopyOptions, AgentCopyRenderer } from './lib/agentCopy';

// Copy-context React surface (scope wrapper, themed button, context-menu hook)
export {
  CopyContextScope,
  useCopyContextScope,
  CopyContextButton,
  useCopyContextInScope,
} from './components/copy-context';
export type {
  CopyContextScopeProps,
  CopyContextButtonProps,
} from './components/copy-context';

// App factory
export { defineApp } from './lib/defineApp';
export type {
  AppCommandDeclaration,
  AppCommandOption,
  AppIntentDeclaration,
  CommandActionMap,
  DefineAppConfig,
  DefineAppHooks,
} from './lib/defineApp';

// Manifest
export { deriveManifest } from './lib/manifest';

// App backend (HUD-008)
export { createAppApiClient } from './lib/api/createAppApiClient';
export type {
  AppApiClient,
  AppApiClientAppLike,
  AppApiServiceStatus,
  AppApiStatusStore,
  AppApiStream,
  AppApiStreamEvent,
} from './lib/api/createAppApiClient';
export { useAppApiStatus } from './hooks/useAppApiStatus';
export type { UseAppApiStatusResult } from './hooks/useAppApiStatus';

// Platform adapter
export type { PlatformAdapter, PlatformLayout } from './platform';
export { WEB_ADAPTER, PlatformProvider, usePlatform, usePlatformLayout } from './platform';

// Reusable widgets
export { HudsonKitLockup, HudsonKitMark } from './components/brand';
export type { HudsonKitLockupProps, HudsonKitMarkProps } from './components/brand';
export { ZoomControls } from './components/chrome';
export { CanvasToolDock, PanZoomViewport } from './components/canvas';
export type { ViewportPan } from './components/canvas';

export { HudTiling, computeTilingLayout } from './components/patterns/HudTiling';
export type {
  HudTilingProps,
  TilingConstraints,
  TileLayout,
} from './components/patterns/HudTiling';
export {
  HudWorkflowGraph,
  brainDumpProcessorWorkflow,
  hudWorkflowBasicSchema,
  hudWorkflowFixtures,
  quickSummaryWorkflow,
  transcribeWorkflow,
  voiceAssistantWorkflow,
} from './workflow';
export type {
  HudWorkflowConnection,
  HudWorkflowDocument,
  HudWorkflowDocumentMetadata,
  HudWorkflowFieldSchema,
  HudWorkflowFieldType,
  HudWorkflowFixture,
  HudWorkflowNode,
  HudWorkflowNodeTypeSchema,
  HudWorkflowPickerOption,
  HudWorkflowPort,
  HudWorkflowPortRole,
  HudWorkflowSchema,
  HudWorkflowTint,
  HudWorkflowValue,
  HudWorkflowViewport,
} from './workflow';

export {
  CodeEditor,
  CodeViewer,
  ObjectCodeSurface,
  ObjectCodeWorkbench,
  TextDocumentProvider,
  TextDocumentSurface,
  TextDocumentSurfaceInner,
  createHudsonTextDocument,
  detectTextDocumentKind,
  inferDocumentLanguage,
  useTextDocument,
} from './controls';
export type {
  CodeEditorProps,
  CodeEditorSelection,
  CodeLanguage,
  CodeViewerProps,
  DocumentLanguage,
  HudsonTextDocument,
  ObjectCodeSurfaceProps,
  ObjectCodeWorkbenchProps,
  TextDocumentDetectionInput,
  TextDocumentContextValue,
  TextDocumentKind,
  TextDocumentMode,
  TextDocumentProviderProps,
  TextDocumentSurfaceProps,
} from './controls';

export { createFlagRegistry, createFlagResolver, FeatureFlagsProvider, FeatureFlagPanel, filterFlaggedItems, isFlagEnabled, isGateEnabled, parseFeatureFlagEnv, parseFeatureFlagUrl, normalizeFeatureFlagLayer, useFeatureFlags, useFlag, useFlagResolution, useOptionalFeatureFlags, useOptionalFlag, parseFeatureFlagLocalState, readFeatureFlagLocalState, writeFeatureFlagLocalState } from './flags';
