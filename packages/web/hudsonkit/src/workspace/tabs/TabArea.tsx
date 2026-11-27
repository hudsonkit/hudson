'use client';

// ---------------------------------------------------------------------------
// <TabArea> (HUD-015 §2, §4–§10): a split tree of tab groups with docks.
//
// Tab content is rendered in one stable layer, keyed by instanceId and
// positioned over its group's box. Moving a tab between groups or into a
// dock therefore never remounts it: a terminal keeps its session and a web
// guest does not reload. Tabs mount on first view (lazy restore) and then
// stay mounted while open (v1 never sleeps).
// ---------------------------------------------------------------------------
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { CommandOption } from '../../components/overlays/CommandPalette';
import { InstanceProvider } from '../../context/InstanceContext';
import { useCommandShortcuts } from '../../hooks/useCommandShortcuts';
import { usePlatform } from '../../platform/PlatformContext';
import { activityKey, type ActivitySnapshot, type PlatformActivityBridge } from '../../types/activity';
import type { HudsonApp } from '../../types/app';
import type { TabDock, TabGroupNode, TabLayoutNode, TabSplitNode } from '../../types/tabs';
import { AppSlotErrorBoundary } from '../shell/AppSlotErrorBoundary';
import { AppProviderStack } from '../shared/appHost';
import { useActivities } from './activities';
import { TAB_DRAG_MIME, TabAreaUiContext, hasTabDrag, useTabAreaUi, type TabAreaUi } from './areaContext';
import {
  TabInstanceProvider,
  TabsControllerProvider,
  useTabsController,
  type TabsController,
  type TabsControllerOptions,
  type TabsHandle,
} from './controller';
import { Docks } from './Docks';
import { dockOf, findGroup, locateTab, mainGroups, visibleGroups, type LayoutPlacement, type SplitEdge } from './layout';
import { TabStrip } from './TabStrip';

// --- key bindings ------------------------------------------------------------

/** Native defaults (§9). On the web an app opts in with `keyBindings`. */
export const DEFAULT_TAB_KEY_BINDINGS: Readonly<Record<string, string>> = {
  'tabs.close': 'Cmd+W',
  'tabs.reopen': 'Cmd+Shift+T',
  'tabs.next': 'Ctrl+Tab',
  'tabs.previous': 'Ctrl+Shift+Tab',
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`tabs.select.${i + 1}`, `Cmd+${i + 1}`])),
};

export interface TabAreaProps extends Omit<TabsControllerOptions, 'apps'> {
  apps: readonly HudsonApp[];
  ref?: Ref<TabsHandle>;
  /**
   * Bind tab keys in the page. Off by default on the web, where browsers
   * reserve ⌘W, ⌘1–9 and friends. `true` uses DEFAULT_TAB_KEY_BINDINGS; an
   * object overrides individual commands (an empty string unbinds one).
   * Ignored when a native command bridge is present: the host owns the keys.
   */
  keyBindings?: boolean | Partial<Record<string, string>>;
  /** Nest the apps' Providers. Turn off when the host already nests them. */
  nestProviders?: boolean;
  /** Shown in an empty main group. */
  emptyState?: ReactNode;
  /** Activity source; defaults to the platform adapter's. */
  activities?: PlatformActivityBridge;
  /** Extra controls at the end of each group's strip. */
  stripActions?: (groupId: string) => ReactNode;
  /** Width below which one group shows at a time. Default 640. */
  compactBelow?: number;
  className?: string;
}

/** A self-contained tab area: owns its controller. */
export function TabArea({ apps, ref, nestProviders = true, ...props }: TabAreaProps) {
  const controller = useTabsController({ apps, ...props });
  useImperativeHandle(ref, () => controller.api, [controller.api]);
  const view = <TabAreaView controller={controller} {...props} />;
  return nestProviders ? <AppProviderStack apps={apps}>{view}</AppProviderStack> : view;
}

export interface TabAreaViewProps
  extends Pick<TabAreaProps, 'keyBindings' | 'emptyState' | 'activities' | 'stripActions' | 'compactBelow' | 'className'> {
  controller: TabsController;
}

/** Renders a controller. TabShell uses this with a controller it owns. */
export function TabAreaView({
  controller,
  keyBindings = false,
  emptyState,
  activities: activityBridge,
  stripActions,
  compactBelow = 640,
  className,
}: TabAreaViewProps) {
  const platform = usePlatform();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const width = useElementWidth(rootRef);
  const compact = width > 0 && width < compactBelow;
  const activities = useActivities(activityBridge);
  const { state, apps, api } = controller;
  const layout = state.ws.layout;

  // --- group boxes -------------------------------------------------------------
  const bodies = useRef(new Map<string, HTMLElement>());
  const [rects, setRects] = useState<ReadonlyMap<string, Rect>>(new Map());
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const next = new Map<string, Rect>();
    for (const [id, el] of bodies.current) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Exact sub-pixel boxes: rounding can cover half of a 1px divider.
      next.set(id, { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height });
    }
    setRects((prev) => (sameRects(prev, next) ? prev : next));
  }, []);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    observer.current = ro;
    if (rootRef.current) ro.observe(rootRef.current);
    bodies.current.forEach((el) => ro.observe(el));
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, [measure]);
  const registerBody = useCallback(
    (groupId: string, el: HTMLElement | null) => {
      const prev = bodies.current.get(groupId);
      if (prev === el) return;
      if (prev) observer.current?.unobserve(prev);
      if (el) {
        bodies.current.set(groupId, el);
        observer.current?.observe(el);
      } else {
        bodies.current.delete(groupId);
      }
    },
    [],
  );
  // Layout changes can move a box without resizing it, which ResizeObserver
  // misses, so re-measure after every commit. measure() bails out when
  // nothing moved, so this settles in one extra render at most.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM measurement must run after layout; see above
  useLayoutEffect(() => measure());

  // --- activities ----------------------------------------------------------------
  const activityFor = useCallback(
    (instanceId: string): ActivitySnapshot | null => {
      if (activities.size === 0) return null;
      const instance = controller.tab.instance(instanceId);
      const fn = instance ? apps.get(instance.appId)?.tab?.activityRef : undefined;
      if (!instance || !fn) return null;
      try {
        const ref = fn(instance.params);
        return ref ? activities.get(activityKey(ref)) ?? null : null;
      } catch {
        return null;
      }
    },
    [activities, apps, controller.tab],
  );

  // --- commands: native bridge, or opt-in page bindings ------------------------------
  const runCommand = api.runCommand;
  const flush = api.flush;
  useEffect(() => {
    const bridge = platform.commands;
    if (!bridge) return;
    return bridge.subscribe((command, args) => {
      if (command === 'app.quit' || command === 'app.will-quit') flush();
      else if (command.startsWith('tabs.')) runCommand(command, args);
    });
  }, [flush, platform.commands, runCommand]);

  const bindings = useMemo<CommandOption[]>(() => {
    if (!keyBindings || platform.commands) return [];
    const map = { ...DEFAULT_TAB_KEY_BINDINGS, ...(keyBindings === true ? {} : keyBindings) };
    return Object.entries(map)
      .filter(([, chord]) => !!chord)
      .map(([id, chord]) => ({ id, label: id, shortcut: chord, action: () => runCommand(id) }));
  }, [keyBindings, platform.commands, runCommand]);
  useCommandShortcuts(bindings, { enabled: bindings.length > 0 });

  // On the web, held session work gets the browser's leave prompt (§7).
  const heldWork = api.heldWork;
  useEffect(() => {
    if (platform.commands) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (heldWork().length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [heldWork, platform.commands]);

  const ui = useMemo<TabAreaUi>(
    () => ({ controller, registerBody, dragging, setDragging, compact, activities, activityFor, emptyState }),
    [activities, activityFor, compact, controller, dragging, emptyState, registerBody],
  );

  // In compact mode only the focused group is shown.
  const focusedGroupId = findGroup(layout, layout.focusedGroup) ? layout.focusedGroup : mainGroups(layout)[0]!.id;
  const shownGroups = compact
    ? new Set([focusedGroupId])
    : new Set(visibleGroups(layout).map((g) => g.id));

  return (
    <TabsControllerProvider controller={controller}>
      <TabAreaUiContext.Provider value={ui}>
        <div
          ref={rootRef}
          data-tab-area=""
          className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-background ${className ?? ''}`}
        >
          {!controller.ready ? null : compact ? (
            <CompactGroup groupId={focusedGroupId} />
          ) : (
            <Docks
              right={dockSlot(controller, 'right', stripActions)}
              bottom={dockSlot(controller, 'bottom', stripActions)}
            >
              <NodeView node={layout.root} stripActions={stripActions} />
            </Docks>
          )}

          {controller.ready && <ContentLayer rects={rects} shownGroups={shownGroups} />}
          {dragging && !compact && <DropLayer rects={rects} shownGroups={shownGroups} />}
          {controller.pendingClose && <CloseConfirm />}
        </div>
      </TabAreaUiContext.Provider>
    </TabsControllerProvider>
  );
}

function dockSlot(controller: TabsController, dock: TabDock, stripActions?: (groupId: string) => ReactNode) {
  const d = controller.state.ws.layout.docks[dock];
  if (!d) return undefined;
  return {
    visible: d.visible,
    size: d.size,
    label: dock === 'right' ? 'Right dock' : 'Bottom dock',
    onSizeChange: (size: number) => controller.ops.setDockSize(dock, size),
    content: <GroupView group={d.group} stripActions={stripActions} />,
  };
}

// --- tree --------------------------------------------------------------------------

function NodeView({ node, stripActions }: { node: TabLayoutNode; stripActions?: (groupId: string) => ReactNode }) {
  if (node.type === 'group') return <GroupView group={node} stripActions={stripActions} />;
  return <SplitView node={node} stripActions={stripActions} />;
}

const DIVIDER_STYLE: CSSProperties = { backgroundColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' };

const MIN_SPLIT_SHARE = 0.08;

function SplitView({ node, stripActions }: { node: TabSplitNode; stripActions?: (groupId: string) => ReactNode }) {
  const { controller } = useTabAreaUi();
  const containerRef = useRef<HTMLDivElement>(null);
  const childRefs = useRef<Array<HTMLDivElement | null>>([]);
  const row = node.direction === 'row';

  const onDividerDown = (index: number) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const rect = container.getBoundingClientRect();
    const extent = row ? rect.width : rect.height;
    const start = row ? e.clientX : e.clientY;
    const sizes = [...node.sizes];
    const pair = sizes[index]! + sizes[index + 1]!;
    let live = sizes;
    const move = (ev: globalThis.PointerEvent) => {
      const delta = ((row ? ev.clientX : ev.clientY) - start) / extent;
      const a = Math.max(MIN_SPLIT_SHARE, Math.min(pair - MIN_SPLIT_SHARE, sizes[index]! + delta));
      live = [...sizes];
      live[index] = a;
      live[index + 1] = pair - a;
      childRefs.current[index]?.style.setProperty('flex-grow', String(live[index]));
      childRefs.current[index + 1]?.style.setProperty('flex-grow', String(live[index + 1]));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (live !== sizes) controller.ops.setSizes(node.id, live);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onDividerKey = (index: number) => (e: React.KeyboardEvent) => {
    const back = row ? 'ArrowLeft' : 'ArrowUp';
    const fwd = row ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    const sizes = [...node.sizes];
    const pair = sizes[index]! + sizes[index + 1]!;
    const a = Math.max(MIN_SPLIT_SHARE, Math.min(pair - MIN_SPLIT_SHARE, sizes[index]! + (e.key === fwd ? 0.02 : -0.02)));
    sizes[index] = a;
    sizes[index + 1] = pair - a;
    controller.ops.setSizes(node.id, sizes);
  };

  return (
    <div ref={containerRef} className={`flex h-full w-full min-h-0 min-w-0 ${row ? 'flex-row' : 'flex-col'}`}>
      {node.children.map((child, i) => (
        <SplitChild
          key={child.id}
          index={i}
          last={i === node.children.length - 1}
          row={row}
          size={node.sizes[i] ?? 1}
          childRef={(el) => {
            childRefs.current[i] = el;
          }}
          onDividerDown={onDividerDown(i)}
          onDividerKey={onDividerKey(i)}
          onEqualise={() => controller.ops.equalise(node.id)}
        >
          <NodeView node={child} stripActions={stripActions} />
        </SplitChild>
      ))}
    </div>
  );
}

function SplitChild({
  children,
  index,
  last,
  row,
  size,
  childRef,
  onDividerDown,
  onDividerKey,
  onEqualise,
}: {
  children: ReactNode;
  index: number;
  last: boolean;
  row: boolean;
  size: number;
  childRef: (el: HTMLDivElement | null) => void;
  onDividerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onDividerKey: (e: React.KeyboardEvent) => void;
  onEqualise: () => void;
}) {
  return (
    <>
      <div ref={childRef} className="relative min-h-0 min-w-0" style={{ flexGrow: size, flexShrink: 1, flexBasis: 0 }}>
        {children}
      </div>
      {!last && (
        <div
          role="separator"
          aria-label={`Resize split ${index + 1}`}
          aria-orientation={row ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(size * 100)}
          tabIndex={0}
          onPointerDown={onDividerDown}
          onKeyDown={onDividerKey}
          onDoubleClick={onEqualise}
          className={`group relative z-10 shrink-0 outline-none ${row ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}`}
          style={DIVIDER_STYLE}
        >
          <span
            aria-hidden
            className={`absolute ${row ? '-left-1 -right-1 inset-y-0' : '-top-1 -bottom-1 inset-x-0'} transition-colors group-hover:bg-accent/40 group-focus-visible:bg-accent/60`}
          />
        </div>
      )}
    </>
  );
}

function GroupView({ group, stripActions }: { group: TabGroupNode; stripActions?: (groupId: string) => ReactNode }) {
  const ui = useTabAreaUi();
  const layout = ui.controller.state.ws.layout;
  const focused = layout.focusedGroup === group.id;
  return (
    <div data-tab-group={group.id} className="flex h-full w-full min-h-0 min-w-0 flex-col">
      <TabStrip group={group} focused={focused} actions={stripActions?.(group.id)} />
      <GroupBody groupId={group.id} empty={group.tabs.length === 0} />
    </div>
  );
}

function CompactGroup({ groupId }: { groupId: string }) {
  return (
    <div data-tab-group={groupId} className="flex h-full w-full min-h-0 min-w-0 flex-col">
      <TabStrip group={null} focused />
      <GroupBody groupId={groupId} empty={false} />
    </div>
  );
}

function GroupBody({ groupId, empty }: { groupId: string; empty: boolean }) {
  const ui = useTabAreaUi();
  const { registerBody } = ui;
  const ref = useCallback((el: HTMLDivElement | null) => registerBody(groupId, el), [groupId, registerBody]);
  return (
    <div
      ref={ref}
      className="relative min-h-0 min-w-0 flex-1"
      onPointerDown={() => ui.controller.ops.focusGroup(groupId)}
    >
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center font-mono text-[11px] text-muted-foreground">
          {ui.emptyState ?? 'No tabs open'}
        </div>
      )}
    </div>
  );
}

// --- content layer -------------------------------------------------------------------

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function sameRects(a: ReadonlyMap<string, Rect>, b: ReadonlyMap<string, Rect>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, r] of b) {
    const p = a.get(k);
    const near = (x: number, y: number) => Math.abs(x - y) < 0.25;
    if (!p || !near(p.left, r.left) || !near(p.top, r.top) || !near(p.width, r.width) || !near(p.height, r.height)) return false;
  }
  return true;
}

function ContentLayer({ rects, shownGroups }: { rects: ReadonlyMap<string, Rect>; shownGroups: ReadonlySet<string> }) {
  const { controller } = useTabAreaUi();
  const { state, apps } = controller;
  const layout = state.ws.layout;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Stable order and keys: a tab's element never moves, so it never remounts. */}
      {state.ws.instances.map((instance) => {
        if (!state.mounted.has(instance.instanceId)) return null;
        const loc = locateTab(layout, instance.instanceId);
        if (!loc) return null;
        const groupShown = shownGroups.has(loc.group.id);
        const rect = rects.get(loc.group.id);
        const visible = groupShown && loc.group.active === instance.instanceId && !!rect;
        const app = apps.get(instance.appId);
        const tombstone = state.tombstones.get(instance.instanceId) ?? (app ? undefined : 'unknown-app');
        return (
          <div
            key={instance.instanceId}
            role="tabpanel"
            aria-label={instance.title || app?.name}
            data-tab-panel={instance.instanceId}
            hidden={!visible}
            className="pointer-events-auto absolute overflow-hidden"
            style={visible ? rect : undefined}
            onPointerDownCapture={() => controller.ops.focusGroup(loc.group.id)}
            onFocusCapture={() => controller.ops.focusGroup(loc.group.id)}
          >
            <TabPanelContent
              instanceId={instance.instanceId}
              appId={instance.appId}
              visible={visible}
              app={app}
              tombstone={tombstone}
              title={instance.title || app?.name || instance.appId}
              onClose={controller.ops.closeNow}
            />
          </div>
        );
      })}
    </div>
  );
}

/** One tab's providers and content. Memoised context so useTab() stays stable. */
function TabPanelContent({
  instanceId,
  appId,
  visible,
  app,
  tombstone,
  title,
  onClose,
}: {
  instanceId: string;
  appId: string;
  visible: boolean;
  app: HudsonApp | undefined;
  tombstone: string | undefined;
  title: string;
  onClose: (instanceId: string) => void;
}) {
  const value = useMemo(() => ({ instanceId, visible }), [instanceId, visible]);
  return (
    <InstanceProvider instanceId={instanceId} appId={appId}>
      <TabInstanceProvider value={value}>
        {app && !tombstone ? (
          <AppSlotErrorBoundary appName={app.name} slotName="Content">
            <app.slots.Content />
          </AppSlotErrorBoundary>
        ) : (
          <Tombstone title={title} reason={tombstone ?? 'unknown-app'} onClose={() => onClose(instanceId)} />
        )}
      </TabInstanceProvider>
    </InstanceProvider>
  );
}

function Tombstone({ title, reason, onClose }: { title: string; reason: string; onClose: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center font-mono">
      <div className="text-[12px] text-foreground">{title}</div>
      <div className="max-w-[32ch] text-[11px] leading-relaxed text-muted-foreground">
        {reason === 'params-rejected'
          ? 'This tab was saved by an older version and can’t be restored.'
          : 'The app for this tab isn’t available here.'}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-input px-2.5 py-1 text-[11px] text-muted-foreground hover:border-ring/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Close tab
      </button>
    </div>
  );
}

// --- drag and drop -------------------------------------------------------------------

type DropZone = { edge: SplitEdge | 'center' };
const EDGE_SHARE = 0.25;
const DOCK_TARGET_PX = 28;

function zoneFor(e: DragEvent, el: HTMLElement, canSplit: boolean): DropZone {
  if (!canSplit) return { edge: 'center' };
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const [edge, dist] = (Object.entries(d) as Array<[SplitEdge, number]>).sort((a, b) => a[1] - b[1])[0]!;
  return dist < EDGE_SHARE ? { edge } : { edge: 'center' };
}

function previewStyle(zone: DropZone): React.CSSProperties {
  switch (zone.edge) {
    case 'left':
      return { left: 0, top: 0, bottom: 0, width: '50%' };
    case 'right':
      return { right: 0, top: 0, bottom: 0, width: '50%' };
    case 'top':
      return { left: 0, right: 0, top: 0, height: '50%' };
    case 'bottom':
      return { left: 0, right: 0, bottom: 0, height: '50%' };
    default:
      return { inset: 0 };
  }
}

function DropLayer({ rects, shownGroups }: { rects: ReadonlyMap<string, Rect>; shownGroups: ReadonlySet<string> }) {
  const ui = useTabAreaUi();
  const layout = ui.controller.state.ws.layout;
  const [hover, setHover] = useState<{ target: string; zone: DropZone } | null>(null);

  const drop = (e: DragEvent, placement: LayoutPlacement | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(TAB_DRAG_MIME) || ui.dragging;
    setHover(null);
    ui.setDragging(null);
    if (id && placement) ui.controller.ops.moveTo(id, placement);
  };

  const groups = [...shownGroups].filter((id) => rects.has(id));
  const docksMissing = (['right', 'bottom'] as TabDock[]).filter((d) => !layout.docks[d]?.visible);

  return (
    <div className="absolute inset-0 z-20" onDragLeave={(e) => {
      if (e.currentTarget === e.target) setHover(null);
    }}>
      {groups.map((groupId) => {
        const rect = rects.get(groupId)!;
        const isDock = !!dockOf(layout, groupId);
        const zone = hover?.target === groupId ? hover.zone : null;
        return (
          <div
            key={groupId}
            className="absolute"
            style={rect}
            onDragOver={(e) => {
              if (!hasTabDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const next = zoneFor(e, e.currentTarget, !isDock);
              if (hover?.target !== groupId || hover.zone.edge !== next.edge) setHover({ target: groupId, zone: next });
            }}
            onDrop={(e) => {
              const z = zoneFor(e, e.currentTarget, !isDock);
              const id = e.dataTransfer.getData(TAB_DRAG_MIME) || ui.dragging;
              const sameGroup = id ? locateTab(layout, id)?.group.id === groupId : false;
              if (z.edge === 'center') drop(e, sameGroup ? null : { kind: 'group', group: groupId });
              else drop(e, { kind: 'split', group: groupId, edge: z.edge });
            }}
          >
            {zone && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-sm border border-accent/60 bg-accent/10 transition-all duration-100"
                style={previewStyle(zone)}
              />
            )}
          </div>
        );
      })}
      {docksMissing.map((dock) => {
        const active = hover?.target === `dock:${dock}`;
        const style: React.CSSProperties =
          dock === 'right'
            ? { right: 0, top: 0, bottom: 0, width: DOCK_TARGET_PX }
            : { left: 0, right: 0, bottom: 0, height: DOCK_TARGET_PX };
        return (
          <div
            key={dock}
            className={`absolute flex items-center justify-center border-accent/50 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
              dock === 'right' ? 'border-l' : 'border-t'
            } ${active ? 'bg-accent/15 text-accent' : 'bg-background/70 text-muted-foreground'}`}
            style={style}
            onDragOver={(e) => {
              if (!hasTabDrag(e)) return;
              e.preventDefault();
              if (!active) setHover({ target: `dock:${dock}`, zone: { edge: 'center' } });
            }}
            onDrop={(e) => drop(e, { kind: 'dock', dock })}
          >
            <span className={dock === 'right' ? '[writing-mode:vertical-rl]' : ''}>{dock} dock</span>
          </div>
        );
      })}
    </div>
  );
}

// --- close confirmation (§7) -----------------------------------------------------------

function CloseConfirm() {
  const { controller } = useTabAreaUi();
  const id = controller.pendingClose!;
  const summary = controller.api.tabs.find((t) => t.instanceId === id);
  const holds = controller.tab.holds(id);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { cancelClose, confirmClose } = controller;
  useEffect(() => cancelRef.current?.focus(), []);
  // The tab may vanish, or its work may finish, while we ask.
  useEffect(() => {
    if (!summary) cancelClose();
    else if (holds.length === 0) confirmClose();
  }, [cancelClose, confirmClose, holds.length, summary]);
  if (!summary || holds.length === 0) return null;
  const title = summary.title;
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          controller.cancelClose();
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hud-tab-close-title"
        aria-describedby="hud-tab-close-body"
        className="w-[min(360px,calc(100%-32px))] rounded-md border bg-card p-4 font-mono shadow-lg"
        style={{ borderColor: 'var(--hud-chrome-border, oklch(var(--border)))' }}
      >
        <div id="hud-tab-close-title" className="text-[12px] text-foreground">
          Close “{title}”?
        </div>
        <div id="hud-tab-close-body" className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {holds.length === 1 ? `${holds[0]} will stop.` : `This will stop: ${holds.join(', ')}.`}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={controller.cancelClose}
            className="rounded border border-input px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={controller.confirmClose}
            className="rounded border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close tab
          </button>
        </div>
      </div>
    </div>
  );
}

// --- utils -------------------------------------------------------------------------------

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
