import type { HudsonWorkspace } from 'hudsonkit';
import type { ConsumerConfig, EmbedTheme } from './registry';
import type { WindowBounds, WorkspaceShellInitialState } from 'hudsonkit/workspace';

export type EmbedSearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: EmbedSearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function cleanId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[a-z][a-z0-9-]{0,63}$/.test(trimmed) ? trimmed : undefined;
}

function cleanTheme(value: string | undefined): EmbedTheme | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

function cleanApps(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map(part => cleanId(part))
    .filter((id): id is string => Boolean(id));
  return ids.length > 0 ? [...new Set(ids)] : undefined;
}

/**
 * `collapse=left,right` — start the embed with those shell panels closed.
 * `right:narrow` starts it closed and opens it once the frame proves wide
 * (see `panelsToOpenWhenWide`).
 */
export function parseCollapse(value: string | null | undefined): { leftCollapsed?: boolean; rightCollapsed?: boolean } {
  if (!value) return {};
  const parts = new Set(value.split(',').map(part => part.trim().split(':')[0]));
  return {
    ...(parts.has('left') ? { leftCollapsed: true } : null),
    ...(parts.has('right') ? { rightCollapsed: true } : null),
  };
}

function workspaceById(workspaces: HudsonWorkspace[], id: string | undefined): HudsonWorkspace | undefined {
  return id ? workspaces.find(workspace => workspace.id === id) : undefined;
}

function defaultBoundsForActivatedApps(workspace: HudsonWorkspace, activatedAppIds: string[]): Record<string, WindowBounds> {
  const activated = new Set(activatedAppIds);
  return Object.fromEntries(
    workspace.apps
      .filter(config => activated.has(config.app.id) && config.canvasMode === 'windowed')
      .map((config, index) => {
        const fallback = { x: -400 + index * 80, y: -260 + index * 60, w: 800, h: 600 };
        return [config.app.id, config.defaultWindowBounds ?? fallback];
      }),
  );
}

export function resolveEmbedInitialState(
  searchParams: EmbedSearchParams,
  consumers: Record<string, ConsumerConfig>,
  workspaces: HudsonWorkspace[],
  defaultWorkspaceId = 'hudson-os',
): WorkspaceShellInitialState & { ref?: string } {
  const ref = firstParam(searchParams, 'ref')?.trim() || undefined;
  const consumer = ref ? consumers[ref] : undefined;

  const requestedWorkspaceId = cleanId(firstParam(searchParams, 'ws'))
    ?? cleanId(consumer?.defaultWorkspace)
    ?? defaultWorkspaceId;
  const workspace = workspaceById(workspaces, requestedWorkspaceId)
    ?? workspaceById(workspaces, defaultWorkspaceId)
    ?? workspaces[0];

  const workspaceAppIds = workspace.apps.map(config => config.app.id);
  const workspaceAppIdSet = new Set(workspaceAppIds);
  const requestedApps = cleanApps(firstParam(searchParams, 'apps'))
    ?? consumer?.defaultApps?.map(cleanId).filter((id): id is string => Boolean(id));
  const defaultWorkspaceApps = workspace.defaultActivatedAppIds?.filter(id => workspaceAppIdSet.has(id));
  let activatedAppIds = (requestedApps ?? defaultWorkspaceApps ?? workspaceAppIds).filter(id => workspaceAppIdSet.has(id));

  const requestedFocus = cleanId(firstParam(searchParams, 'focus'))
    ?? cleanId(consumer?.defaultFocus)
    ?? cleanId(workspace.defaultFocusedAppId)
    ?? activatedAppIds[0]
    ?? workspaceAppIds[0]
    ?? '';
  const focusedAppId = workspaceAppIdSet.has(requestedFocus)
    ? requestedFocus
    : activatedAppIds[0] ?? workspaceAppIds[0] ?? '';

  if (activatedAppIds.length === 0) activatedAppIds = focusedAppId ? [focusedAppId] : workspaceAppIds;
  if (focusedAppId && !activatedAppIds.includes(focusedAppId)) {
    activatedAppIds = [focusedAppId, ...activatedAppIds];
  }

  const theme = cleanTheme(firstParam(searchParams, 'theme')) ?? consumer?.theme ?? 'dark';
  const template = cleanId(firstParam(searchParams, 'template')) ?? cleanId(consumer?.template) ?? 'hudson';

  return {
    ref,
    activeWorkspaceId: workspace.id,
    activatedAppIds,
    focusedAppId,
    tileWindowBounds: defaultBoundsForActivatedApps(workspace, activatedAppIds),
    theme,
    template,
    ...parseCollapse(firstParam(searchParams, 'collapse')),
  };
}

/** `workspaces=hudson-os,developer-mode` → the ids the embed may switch between (order kept). */
export function parseWorkspaceIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(part => cleanId(part))
    .filter((id): id is string => Boolean(id))
    .slice(0, 8);
}

/** Named accent presets an embed can ask for (`accent=ember`), as oklch triplets. */
const ACCENT_PRESETS: Record<string, string> = {
  ember: '0.70 0.11 42',
  // Steel blue; bright enough for dark chrome, deep enough for light.
  harbor: '0.62 0.11 245',
};

export function parseAccent(value: string | null | undefined): string | undefined {
  return value ? ACCENT_PRESETS[value.trim().toLowerCase()] : undefined;
}

/** Panels marked `side:narrow` in `collapse=`: open them when the frame is wide. */
export function panelsToOpenWhenWide(value: string | null | undefined): Array<'left' | 'right'> {
  if (!value) return [];
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.endsWith(':narrow'))
    .map(part => part.split(':')[0])
    .filter((side): side is 'left' | 'right' => side === 'left' || side === 'right');
}
