'use client';

// ---------------------------------------------------------------------------
// <TabShell> (HUD-015 §2): Hudson chrome (navigation bar, status bar,
// command palette) around a TabArea, for a HudsonWorkspace. The focused
// tab's app drives the chrome, the way the focused window does in
// WorkspaceShell.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react';
import { HudMenu, type HudMenuEntry } from '../../components/behaviors/HudMenu';
import NavigationBar from '../../components/chrome/NavigationBar';
import StatusBar from '../../components/chrome/StatusBar';
import CommandPalette, { type CommandOption } from '../../components/overlays/CommandPalette';
import { Command, PanelBottom, PanelRightOpen, Plus } from '../../icons';
import { usePlatform } from '../../platform/PlatformContext';
import { usePlatformLayout } from '../../platform/usePlatformLayout';
import { HudsonThemeScript, ThemeProvider, useOptionalTheme, type HudsonTemplate, type HudsonTheme } from '../../theme';
import type { HudsonApp } from '../../types/app';
import type { OpenTabPlacement, OpenTabRequest, TabCycleScope, TabSelectTarget, TabStore } from '../../types/tabs';
import type { HudsonWorkspace } from '../../types/workspace';
import { AppProviderStack, useAppHooks, type AppHookData } from '../shared/appHost';
import { useTabsController, type TabsHandle } from './controller';
import { findGroup, visibleGroups } from './layout';
import { createLocalTabStore } from './store';
import { TabAreaView } from './TabArea';

export interface TabShellProps {
  workspace: HudsonWorkspace;
  /** Where tabs persist. Default: localStorage. Electron passes a file store. */
  store?: TabStore | null;
  /** One layout per window. Default 'main'. */
  windowId?: string;
  /** Tabs to open on first run. Default: one per `defaultActivatedAppIds` (or the first app). */
  initialTabs?: ReadonlyArray<OpenTabRequest & { placement?: OpenTabPlacement }>;
  selectTarget?: TabSelectTarget;
  cycleScope?: TabCycleScope;
  keyBindings?: boolean | Partial<Record<string, string>>;
  ref?: Ref<TabsHandle>;
  /** Navigation bar title. Default: the workspace name. */
  title?: string;
  emptyState?: ReactNode;
  managedTheme?: boolean;
  defaultTheme?: HudsonTheme;
  defaultTemplate?: HudsonTemplate;
}

interface ProviderRuntime {
  visible: ReadonlySet<string>;
  focused: string | null;
}

export function TabShell({ managedTheme = true, defaultTheme = 'system', defaultTemplate = 'hudson', ...props }: TabShellProps) {
  const theme = useOptionalTheme();
  const apps = useMemo(() => props.workspace.apps.map((c) => c.app), [props.workspace.apps]);
  const [runtime, setRuntime] = useState<ProviderRuntime>({ visible: new Set(), focused: null });

  const content = (
    <AppProviderStack
      apps={apps}
      state={(app) => ({ visible: runtime.visible.has(app.id), focused: runtime.focused === app.id })}
    >
      <TabShellInner {...props} apps={apps} onRuntime={setRuntime} />
    </AppProviderStack>
  );

  if (!managedTheme || theme) return content;
  return (
    <>
      <HudsonThemeScript defaultTheme={defaultTheme} defaultTemplate={defaultTemplate} />
      <ThemeProvider defaultTheme={defaultTheme} defaultTemplate={defaultTemplate}>
        {content}
      </ThemeProvider>
    </>
  );
}

const TAB_PREFIX = 'Tab: ';

function TabShellInner({
  workspace,
  apps,
  store,
  windowId = 'main',
  initialTabs,
  selectTarget,
  cycleScope,
  keyBindings,
  ref,
  title,
  emptyState,
  onRuntime,
}: Omit<TabShellProps, 'managedTheme' | 'defaultTheme' | 'defaultTemplate'> & {
  apps: readonly HudsonApp[];
  onRuntime: (next: ProviderRuntime) => void;
}) {
  const platform = usePlatform();
  const { navTotalHeight } = usePlatformLayout();
  const [palette, setPalette] = useState<{ open: boolean; query?: string }>({ open: false });
  const defaultStore = useMemo(() => createLocalTabStore(), []);
  const seed = useMemo(
    () =>
      initialTabs ??
      (workspace.defaultActivatedAppIds?.length ? workspace.defaultActivatedAppIds : apps.slice(0, 1).map((a) => a.id)).map(
        (appId) => ({ appId }),
      ),
    [apps, initialTabs, workspace.defaultActivatedAppIds],
  );

  const controller = useTabsController({
    apps,
    store: store === null ? undefined : (store ?? defaultStore),
    storeKey: { workspaceId: workspace.id, windowId },
    initialTabs: seed,
    selectTarget,
    cycleScope,
    // The palette closes itself after running a command, so reopen it on the next tick.
    onSwitch: () => setTimeout(() => setPalette({ open: true, query: TAB_PREFIX }), 0),
  });
  useImperativeHandle(ref, () => controller.api, [controller.api]);

  // Bridge: every app's hooks, in a stable order (they run inside all Providers).
  // eslint-disable-next-line react-hooks/rules-of-hooks -- `apps` is the workspace's fixed app list, so the hook call order is stable across renders
  const hooks: AppHookData[] = apps.map((app) => useAppHooks({ app }));

  const layout = controller.state.ws.layout;
  const focusedId = findGroup(layout, layout.focusedGroup)?.active ?? null;
  const focusedTab = controller.api.tabs.find((t) => t.instanceId === focusedId);
  const focusedHooks = focusedTab ? hooks.find((h) => h.appId === focusedTab.appId) : undefined;

  // Report which apps are on screen and focused to the Providers above.
  const visibleKey = visibleGroups(layout)
    .map((g) => (g.active ? controller.tab.instance(g.active)?.appId : undefined))
    .filter(Boolean)
    .sort()
    .join('|');
  const focusedAppId = focusedTab?.appId ?? null;
  useEffect(() => {
    onRuntime({ visible: new Set(visibleKey ? visibleKey.split('|') : []), focused: focusedAppId });
  }, [focusedAppId, onRuntime, visibleKey]);

  const openApp = useCallback(
    (app: HudsonApp) => {
      const existing = controller.api.tabs.find((t) => t.appId === app.id);
      const single = !app.multiInstance || app.multiInstance === 'singleton';
      if (single && existing) controller.api.focus(existing.instanceId);
      else controller.api.open({ appId: app.id });
    },
    [controller.api],
  );

  // ⌘K opens the palette, as in AppShell. Native hosts may send `palette.toggle`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => ({ open: !p.open }));
      }
    };
    window.addEventListener('keydown', onKey);
    const unsubscribe = platform.commands?.subscribe((command) => {
      if (command === 'palette.toggle') setPalette((p) => ({ open: !p.open }));
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      unsubscribe?.();
    };
  }, [platform.commands]);

  const commands = useMemo<CommandOption[]>(() => {
    const list: CommandOption[] = [...(focusedHooks?.commands ?? []), ...controller.commands];
    for (const app of apps) {
      list.push({ id: `tabs.new.${app.id}`, label: `New ${app.name} Tab`, action: () => openApp(app) });
    }
    for (const t of controller.api.tabs) {
      list.push({
        id: `tabs.goto.${t.instanceId}`,
        label: `${TAB_PREFIX}${t.title}${t.detail ? ` — ${t.detail}` : ''}`,
        action: () => controller.api.focus(t.instanceId),
      });
    }
    return list;
  }, [apps, controller.api, controller.commands, focusedHooks?.commands, openApp]);

  const newTabItems: HudMenuEntry[] = apps.map((app) => ({ id: app.id, label: app.name, icon: app.icon, action: () => openApp(app) }));
  const dockButton = (dock: 'right' | 'bottom') => {
    const d = layout.docks[dock];
    if (!d) return null;
    const Icon = dock === 'right' ? PanelRightOpen : PanelBottom;
    return (
      <ChromeButton
        key={dock}
        label={`${d.visible ? 'Hide' : 'Show'} ${dock} dock`}
        pressed={d.visible}
        onClick={() => controller.ops.toggleDock(dock)}
      >
        <Icon size={13} />
      </ChromeButton>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <div
        className="relative shrink-0 border-b"
        style={{ height: navTotalHeight, borderColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' }}
      >
        <NavigationBar
          embedded
          title={title ?? workspace.name}
          subtitle={focusedTab ? <span className="truncate">{focusedTab.title}</span> : undefined}
          center={focusedHooks?.navCenter ?? undefined}
          actions={
            <>
              {focusedHooks?.navActions}
              <div className="flex items-center gap-0.5">
                {dockButton('bottom')}
                {dockButton('right')}
                <HudMenu items={newTabItems} align="end">
                  <button
                    type="button"
                    aria-label="New tab"
                    className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus size={13} />
                  </button>
                </HudMenu>
                <ChromeButton label="Command palette (⌘K)" onClick={() => setPalette({ open: true })}>
                  <Command size={13} />
                </ChromeButton>
              </div>
            </>
          }
        />
      </div>

      <main className="relative min-h-0 flex-1">
        <TabAreaView controller={controller} keyBindings={keyBindings} emptyState={emptyState ?? <EmptyShell apps={apps} onOpen={openApp} />} />
      </main>

      <div className="relative h-7 shrink-0 border-t" style={{ borderColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' }}>
        <StatusBar
          embedded
          left={focusedHooks?.statusLeft ?? undefined}
          right={focusedHooks?.statusRight ?? undefined}
          status={focusedHooks?.status}
        />
      </div>

      <CommandPalette
        isOpen={palette.open}
        query={palette.query}
        onClose={() => setPalette({ open: false })}
        commands={commands}
      />
    </div>
  );
}

function ChromeButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        pressed ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyShell({ apps, onOpen }: { apps: readonly HudsonApp[]; onOpen: (app: HudsonApp) => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[11px] text-muted-foreground">No tabs open</div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => onOpen(app)}
            className="flex items-center gap-1.5 rounded border border-input px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {app.icon && <span className="flex h-3 w-3 items-center">{app.icon}</span>}
            {app.name}
          </button>
        ))}
      </div>
    </div>
  );
}
