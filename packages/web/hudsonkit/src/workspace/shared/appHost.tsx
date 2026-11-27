'use client';

// ---------------------------------------------------------------------------
// Shared app hosting for multi-app shells (WorkspaceShell, TabShell).
//
// - AppProviderStack nests every app's Provider once, in a stable order.
// - useAppHooks is the Bridge: it calls one app's hooks and must run inside
//   that app's Provider (i.e. below an AppProviderStack that includes it).
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';
import type { CommandOption } from '../../components/overlays/CommandPalette';
import type { HudsonApp, SearchConfig, StatusState } from '../../types/app';
import type { HudsonCodeSurfaceState } from '../../types/code';
import type { WorkspaceAppConfig } from '../../types/workspace';

/** Merged hook data from a single app. */
export interface AppHookData {
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

/** Calls one app's hooks. Must run inside that app's Provider. */
export function useAppHooks(config: Pick<WorkspaceAppConfig, 'app'>): AppHookData {
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

export interface AppProviderState {
  disabled?: boolean;
  visible?: boolean;
  focused?: boolean;
}

/**
 * Nest every app's Provider around `children`, first app outermost. Keep the
 * app list stable: removing a Provider from the chain remounts everything
 * below it, so disable an app through `state` instead.
 */
export function AppProviderStack({
  apps,
  state,
  children,
}: {
  apps: readonly HudsonApp[];
  state?: (app: HudsonApp) => AppProviderState;
  children: ReactNode;
}) {
  let tree: ReactNode = children;
  for (let i = apps.length - 1; i >= 0; i--) {
    const app = apps[i]!;
    const s = state?.(app) ?? {};
    tree = (
      <app.Provider disabled={s.disabled} visible={s.visible} focused={s.focused}>
        {tree}
      </app.Provider>
    );
  }
  return <>{tree}</>;
}
