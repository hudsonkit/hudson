'use client';

// ---------------------------------------------------------------------------
// TabStrip (HUD-015 §7, §10, §11): one group's tabs as a tablist.
//
// Click focuses, middle-click or × closes, drag reorders or moves. Keyboard:
// arrows move between tabs, Enter or Space selects, Delete closes. When the
// strip overflows it scrolls and shows an overflow menu.
// ---------------------------------------------------------------------------
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { HudMenu, type HudMenuEntry } from '../../components/behaviors/HudMenu';
import { MoreHorizontal, X } from '../../icons';
import type { ActivitySnapshot } from '../../types/activity';
import type { TabGroupNode, TabSummary } from '../../types/tabs';
import { TAB_DRAG_MIME, hasTabDrag, useTabAreaUi } from './areaContext';
import { focusedTab } from './layout';

export interface TabStripProps {
  /** The group, or null for the compact (phone) strip of every tab. */
  group: TabGroupNode | null;
  focused: boolean;
  actions?: ReactNode;
}

export function TabStrip({ group, focused, actions }: TabStripProps) {
  const ui = useTabAreaUi();
  const { controller } = ui;
  const { api, ops, apps } = controller;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const byId = new Map(api.tabs.map((t) => [t.instanceId, t]));
  const tabs: TabSummary[] = group
    ? group.tabs.map((id) => byId.get(id)).filter((t): t is TabSummary => !!t)
    : api.tabs.slice();
  const activeId = group ? group.active : focusedTab(controller.state.ws.layout);

  // Overflow detection.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // Keep the active tab in view, scrolling only the strip.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !activeId) return;
    const tab = el.querySelector<HTMLElement>(`[data-tab-id="${cssEscape(activeId)}"]`);
    if (!tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = left - 8;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
  }, [activeId]);

  const indexFromPointer = (clientX: number): number => {
    const el = scrollerRef.current;
    if (!el) return tabs.length;
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-tab-id]'));
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i]!.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return nodes.length;
  };

  const onDragOver = (e: DragEvent) => {
    if (!group || !hasTabDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setInsertAt(indexFromPointer(e.clientX));
  };

  const onDrop = (e: DragEvent) => {
    if (!group || !hasTabDrag(e)) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(TAB_DRAG_MIME) || ui.dragging;
    setInsertAt(null);
    ui.setDragging(null);
    if (!id) return;
    let index = indexFromPointer(e.clientX);
    const from = group.tabs.indexOf(id);
    // Same strip: the index is counted with the tab still in place.
    if (from !== -1 && from < index) index -= 1;
    if (from === index) return;
    ops.moveTo(id, { kind: 'group', group: group.id, index });
  };

  const focusTabButton = (index: number) => {
    const nodes = scrollerRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]');
    if (!nodes || nodes.length === 0) return;
    nodes[(index + nodes.length) % nodes.length]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, index: number, tab: TabSummary) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusTabButton(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusTabButton(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTabButton(0);
        break;
      case 'End':
        e.preventDefault();
        focusTabButton(tabs.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        api.focus(tab.instanceId);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        api.close(tab.instanceId);
        break;
    }
  };

  const overflowItems: HudMenuEntry[] = tabs.map((t) => ({
    id: t.instanceId,
    label: t.detail ? `${t.title} — ${t.detail}` : t.title,
    action: () => api.focus(t.instanceId),
  }));

  return (
    <div
      className="relative flex h-8 shrink-0 items-stretch border-b bg-background/95 select-none"
      style={{ borderColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' }}
      onDragOver={onDragOver}
      onDragLeave={() => setInsertAt(null)}
      onDrop={onDrop}
      onPointerDown={group ? () => ops.focusGroup(group.id) : undefined}
    >
      <div
        ref={scrollerRef}
        role="tablist"
        aria-orientation="horizontal"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => (
          <TabButton
            key={tab.instanceId}
            tab={tab}
            selected={tab.instanceId === activeId}
            focusedGroup={focused}
            insertBefore={insertAt === index}
            glyph={apps.get(tab.appId)?.tab?.glyph}
            icon={controller.state.meta.get(tab.instanceId)?.icon ?? null}
            activity={ui.activityFor(tab.instanceId)}
            held={controller.tab.holds(tab.instanceId).length > 0}
            draggable={!!group && !ui.compact}
            onSelect={() => api.focus(tab.instanceId)}
            onClose={() => api.close(tab.instanceId)}
            onKeyDown={(e) => onKeyDown(e, index, tab)}
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DRAG_MIME, tab.instanceId);
              e.dataTransfer.setData('text/plain', tab.title);
              e.dataTransfer.effectAllowed = 'move';
              // Defer: changing the DOM inside dragstart can cancel the drag.
              setTimeout(() => ui.setDragging(tab.instanceId), 0);
            }}
            onDragEnd={() => {
              setInsertAt(null);
              ui.setDragging(null);
            }}
          />
        ))}
        {insertAt === tabs.length && tabs.length > 0 && <InsertMarker />}
        <div className="min-w-4 flex-1" aria-hidden />
      </div>
      {(overflowing || actions) && (
        <div className="flex shrink-0 items-center gap-0.5 pl-1 pr-1.5">
          {overflowing && (
            <HudMenu items={overflowItems} align="end">
              <button
                type="button"
                aria-label="All tabs"
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal size={14} />
              </button>
            </HudMenu>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

function InsertMarker() {
  return <span aria-hidden className="pointer-events-none relative z-10 -mx-px w-0.5 self-stretch bg-accent" />;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

// --- one tab -------------------------------------------------------------------

function TabButton({
  tab,
  selected,
  focusedGroup,
  insertBefore,
  glyph,
  icon,
  activity,
  held,
  draggable,
  onSelect,
  onClose,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  tab: TabSummary;
  selected: boolean;
  focusedGroup: boolean;
  insertBefore: boolean;
  glyph?: string;
  icon: string | null;
  activity: ActivitySnapshot | null;
  held: boolean;
  draggable: boolean;
  onSelect(): void;
  onClose(): void;
  onKeyDown(e: KeyboardEvent): void;
  onDragStart(e: DragEvent): void;
  onDragEnd(): void;
}) {
  // Remember which URL failed, so a new icon gets a fresh try.
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const iconFailed = !!icon && failedIcon === icon;
  const dot = statusDot(tab, activity);
  const label = [tab.title, tab.detail, dot?.label, tab.badge ? `${tab.badge} unread` : null, held ? 'has running work' : null]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      {insertBefore && <InsertMarker />}
      <div
        role="tab"
        data-tab-id={tab.instanceId}
        aria-selected={selected}
        aria-label={label}
        tabIndex={selected ? 0 : -1}
        draggable={draggable}
        onClick={onSelect}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose();
          }
        }}
        onMouseDown={(e) => {
          // Stop middle-click autoscroll.
          if (e.button === 1) e.preventDefault();
        }}
        onKeyDown={onKeyDown}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={tab.detail ? `${tab.title} — ${tab.detail}` : tab.title}
        className={`group/tab relative flex max-w-[220px] min-w-[96px] shrink-0 cursor-default items-center gap-1.5 border-r pl-2.5 pr-1 font-mono text-[11px] tracking-[0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          selected
            ? 'bg-card text-foreground'
            : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
        }`}
        style={{ borderColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.6))' }}
      >
        {selected && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] ${focusedGroup ? 'bg-accent' : 'bg-muted-foreground/40'}`}
          />
        )}
        <span aria-hidden className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] leading-none text-muted-foreground">
          {icon && !iconFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- favicons from arbitrary hosts; next/image is not available in the kit
            <img src={icon} alt="" className="h-3.5 w-3.5 rounded-[2px]" onError={() => setFailedIcon(icon)} />
          ) : (
            glyph ?? tab.title.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {tab.title}
          {tab.detail && <span className="ml-1.5 text-muted-foreground/70">{tab.detail}</span>}
        </span>
        {dot && <span aria-hidden title={dot.label} className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot.className}`} />}
        {tab.badge ? (
          <span aria-hidden className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[9px] leading-4 text-accent">
            {tab.badge > 99 ? '99+' : tab.badge}
          </span>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Close ${tab.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-foreground/10 hover:text-foreground ${
            selected ? 'opacity-70' : 'opacity-0 group-hover/tab:opacity-70'
          } hover:!opacity-100`}
        >
          {held ? <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 group-hover/tab:hidden" /> : null}
          <X size={11} className={held ? 'hidden group-hover/tab:block' : ''} />
        </button>
      </div>
    </>
  );
}

/** Activity state wins over UI-only status (HUD-015 §7). */
function statusDot(tab: TabSummary, activity: ActivitySnapshot | null): { className: string; label: string } | null {
  if (activity) {
    switch (activity.state) {
      case 'running':
      case 'starting':
        return { className: 'bg-success animate-pulse', label: activity.state === 'starting' ? 'starting' : 'live' };
      case 'paused':
        return { className: 'bg-warning', label: 'paused' };
      case 'failed':
        return { className: 'bg-destructive', label: 'failed' };
      case 'unreachable':
        return { className: 'border border-muted-foreground bg-transparent', label: 'host unreachable' };
      case 'ended':
        break;
    }
  }
  if (tab.status === 'needs-input') return { className: 'bg-warning', label: 'needs input' };
  if (tab.status === 'error') return { className: 'bg-destructive', label: 'error' };
  return null;
}
