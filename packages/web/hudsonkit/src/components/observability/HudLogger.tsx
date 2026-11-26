'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from '../../icons';
import { HObservability, HObservabilityDefault } from '../../observability/core';
import {
  agentActionCommand,
  agentActionParentTraceId,
  agentActionTraceId,
  agentActionTraceSummary,
  dataString,
  eventData,
  formatAgentActionName,
  inferAgentActionAppId,
  isAgentActionEvent,
  prepareHudAgentActionEvents,
  summarizeAgentActionCommand,
  type HudAgentActionViewMode,
} from '../../observability/agent-action-view';
import { usePersistentState } from '../../hooks/usePersistentState';
import type {
  HLogLevel,
  HObservation,
  HObservationKind,
  HTraceSpan,
} from '../../types/observability';

type LevelFilter = HLogLevel | 'all';
type KindFilter = HObservationKind | 'all';
export type HudLoggerScopeFilter = 'all' | 'agent-actions';
type InspectorTone = 'neutral' | 'cyan' | 'emerald' | 'amber' | 'red';
type EventSortKey = 'time' | 'kind' | 'level' | 'category' | 'target' | 'message' | 'id';
type EventSortDirection = 'asc' | 'desc';

type EventSort = {
  key: EventSortKey;
  direction: EventSortDirection;
};

type InspectorRowData = {
  label: string;
  value: string;
  tone?: InspectorTone;
  mono?: boolean;
};

type InspectorSectionData = {
  title: string;
  rows: InspectorRowData[];
};

export interface HudLoggerUseEventsOptions {
  maxEvents?: number;
}

export interface HudLoggerSummary {
  total: number;
  errors: number;
  warnings: number;
  agentActions: number;
  activeSpans: number;
  lastEvent: HObservation | null;
}

export interface HudLoggerProps {
  observability?: HObservability;
  events?: readonly HObservation[];
  /** Historical events merged with the live in-memory buffer.
   *  Use this to seed the table from a server-side log (e.g. .jsonl file). */
  replayEvents?: readonly HObservation[];
  maxEvents?: number;
  title?: string;
  className?: string;
  emptyMessage?: ReactNode;
  showHeader?: boolean;
  showInspector?: boolean;
  initialTail?: boolean;
  initialScope?: HudLoggerScopeFilter;
}

export interface HudLoggerStatusItemProps {
  observability?: HObservability;
  maxEvents?: number;
  label?: string;
  className?: string;
  showCounts?: boolean;
}

const LEVELS: HLogLevel[] = ['debug', 'info', 'warn', 'error'];
const KINDS: HObservationKind[] = ['log', 'metric', 'span'];
const HUDSON_OPEN_APP_EVENT = 'hudson:open-app';
const INSPECTOR_MIN_WIDTH = 340;
const INSPECTOR_DEFAULT_WIDTH = 440;
const INSPECTOR_MAX_WIDTH = 900;
const MAIN_MIN_WIDTH = 420;
const INSPECTOR_WIDTH_STORAGE_KEY = 'hudson.hud-logger.inspector-width';
const INSPECTOR_WIDTH_STORAGE_VERSION = 1;
const DEFAULT_EVENT_SORT: EventSort = { key: 'time', direction: 'desc' };
const EVENT_TABLE_GRID =
  'grid-cols-[62px_64px_76px_58px_72px_112px_128px_minmax(260px,1fr)_92px]';

function migrateInspectorWidth(stored: unknown) {
  if (typeof stored !== 'number') return INSPECTOR_DEFAULT_WIDTH;
  return stored === 380 ? INSPECTOR_DEFAULT_WIDTH : stored;
}

export function useHudLoggerEvents(
  observability: HObservability = HObservabilityDefault,
  options: HudLoggerUseEventsOptions = {},
) {
  const maxEvents = options.maxEvents ?? 200;
  const [events, setEvents] = useState<HObservation[]>(() =>
    observability.snapshot().slice(-maxEvents).reverse(),
  );

  useEffect(() => {
    const sync = () => {
      setEvents(observability.snapshot().slice(-maxEvents).reverse());
    };
    const unsubscribe = observability.subscribe(sync);
    sync();
    return unsubscribe;
  }, [maxEvents, observability]);

  return events;
}

export function summarizeHudLoggerEvents(events: readonly HObservation[]): HudLoggerSummary {
  const spanStates = new Map<string, HTraceSpan['status']>();
  for (const event of events) {
    if (event.kind !== 'span') continue;
    const current = spanStates.get(event.id);
    if (!current || event.status !== 'active') spanStates.set(event.id, event.status);
  }

  return {
    total: events.length,
    errors: events.filter((event) => event.kind === 'log' && event.level === 'error').length,
    warnings: events.filter((event) => event.kind === 'log' && event.level === 'warn').length,
    agentActions: events.filter(isAgentActionEvent).length,
    activeSpans: Array.from(spanStates.values()).filter(status => status === 'active').length,
    lastEvent: events[0] ?? null,
  };
}

export function useHudLoggerSummary(
  observability: HObservability = HObservabilityDefault,
  options: HudLoggerUseEventsOptions = {},
) {
  const events = useHudLoggerEvents(observability, options);
  return useMemo(() => summarizeHudLoggerEvents(events), [events]);
}

export function HudLoggerStatusItem({
  observability = HObservabilityDefault,
  maxEvents = 200,
  label = 'Logs',
  className = '',
  showCounts = false,
}: HudLoggerStatusItemProps) {
  const summary = useHudLoggerSummary(observability, { maxEvents });
  const tone = summary.errors > 0
    ? 'red'
    : summary.warnings > 0 || summary.activeSpans > 0
      ? 'amber'
      : 'emerald';

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 font-mono text-[9px] font-light uppercase tracking-[0.18em] ${statusItemToneClass(tone)} ${className}`}
      title={`${summary.total} events, ${summary.errors} errors, ${summary.activeSpans} active spans`}
    >
      {/* Healthy is quiet: the dot only appears when something needs attention. */}
      {tone !== 'emerald' && <span className={`h-1.5 w-1.5 rounded-full ${statusItemDotClass(tone)}`} />}
      <span>{label}</span>
      {showCounts && summary.errors > 0 ? (
        <span className="tabular-nums font-semibold">{summary.errors} err</span>
      ) : showCounts && summary.warnings > 0 ? (
        <span className="tabular-nums">{summary.warnings} warn</span>
      ) : null}
    </span>
  );
}

export function HudLogger({
  observability = HObservabilityDefault,
  events: controlledEvents,
  replayEvents,
  maxEvents = 200,
  title = 'HudLogger',
  className = '',
  emptyMessage = 'No events match the current filters.',
  showHeader = true,
  showInspector = true,
  initialTail = true,
  initialScope = 'all',
}: HudLoggerProps) {
  const liveEvents = useHudLoggerEvents(observability, { maxEvents });
  const events = useMemo(() => {
    if (controlledEvents) return controlledEvents.slice(0, maxEvents);
    if (!replayEvents || replayEvents.length === 0) return liveEvents;
    return mergeReplayWithLive(replayEvents, liveEvents, maxEvents);
  }, [controlledEvents, replayEvents, liveEvents, maxEvents]);
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<HudLoggerScopeFilter>(initialScope);
  const [agentActionView, setAgentActionView] = useState<HudAgentActionViewMode>(
    initialScope === 'agent-actions' ? 'actions' : 'raw',
  );
  const [query, setQuery] = useState('');
  const [tail, setTail] = useState(initialTail);
  const [sort, setSort] = useState<EventSort>(DEFAULT_EVENT_SORT);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = usePersistentState<number>(
    INSPECTOR_WIDTH_STORAGE_KEY,
    INSPECTOR_DEFAULT_WIDTH,
    {
      version: INSPECTOR_WIDTH_STORAGE_VERSION,
      migrate: migrateInspectorWidth,
    },
  );
  const sectionRef = useRef<HTMLElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const agentActionRows = useMemo(
    () => prepareHudAgentActionEvents(events, scopeFilter === 'agent-actions' ? agentActionView : 'raw'),
    [agentActionView, events, scopeFilter],
  );
  const scopedEvents = scopeFilter === 'agent-actions' ? agentActionRows.events : events;

  const filteredEvents = useMemo(
    () =>
      scopedEvents.filter((event) => {
        if (kindFilter !== 'all' && event.kind !== kindFilter) return false;
        if (levelFilter !== 'all' && (event.kind !== 'log' || event.level !== levelFilter)) return false;
        if (!query.trim()) return true;
        const traceId = agentActionTraceId(event) ?? event.id;
        const relatedEvents = agentActionRows.relatedEventsByTrace.get(traceId) ?? [];
        const haystack = eventSearchHaystack(event, relatedEvents);
        return haystack.includes(query.trim().toLowerCase());
      }),
    [agentActionRows.relatedEventsByTrace, kindFilter, levelFilter, query, scopedEvents],
  );

  const sortedEvents = useMemo(() => sortEvents(filteredEvents, sort), [filteredEvents, sort]);
  const effectiveTail = tail && sort.key === 'time' && sort.direction === 'desc';
  const effectiveSelectedEventKey = effectiveTail
    ? (sortedEvents[0] ? eventInstanceKey(sortedEvents[0]) : null)
    : selectedEventKey;
  const selectedEvent =
    sortedEvents.find((event) => eventInstanceKey(event) === effectiveSelectedEventKey) ??
    sortedEvents[0] ??
    null;
  const selectedTraceId = selectedEvent ? agentActionTraceId(selectedEvent) ?? selectedEvent.id : null;
  const selectedRelatedEvents = selectedTraceId
    ? agentActionRows.relatedEventsByTrace.get(selectedTraceId) ?? []
    : [];
  const summary = useMemo(() => summarizeHudLoggerEvents(events), [events]);

  const copyText = useCallback(async (text: string, key: string) => {
    const copied = await writeClipboardText(text);
    if (!copied) return;
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1200);
  }, []);

  const selectEvent = useCallback((event: HObservation) => {
    setTail(false);
    setSelectedEventKey(eventInstanceKey(event));
  }, []);

  const setTableSort = useCallback((key: EventSortKey) => {
    setTail(false);
    setSort((current) => {
      if (current.key !== key) {
        return { key, direction: defaultSortDirection(key) };
      }
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }, []);

  const toggleTail = useCallback(() => {
    if (!tail) setSort(DEFAULT_EVENT_SORT);
    setTail((current) => !current);
  }, [tail]);

  const openEventTarget = useCallback((event: HObservation) => {
    const appId = eventTargetAppId(event);
    if (!appId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(HUDSON_OPEN_APP_EVENT, {
      detail: {
        appId,
        workspaceId: eventTargetWorkspaceId(event),
        source: 'hud-logger',
      },
    }));
  }, []);

  const clampInspectorWidth = useCallback((desired: number, sectionWidth: number) => {
    const ceiling = Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, sectionWidth - MAIN_MIN_WIDTH));
    return Math.max(INSPECTOR_MIN_WIDTH, Math.min(ceiling, desired));
  }, []);

  const handleSplitterDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const section = sectionRef.current;
    const aside = asideRef.current;
    if (!section || !aside) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = aside.getBoundingClientRect().width;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (move: PointerEvent) => {
      const sectionWidth = section.getBoundingClientRect().width;
      const next = clampInspectorWidth(startWidth + (startX - move.clientX), sectionWidth);
      aside.style.setProperty('--inspector-width', `${next}px`);
    };

    const finalize = (final: PointerEvent) => {
      const sectionWidth = section.getBoundingClientRect().width;
      const next = clampInspectorWidth(startWidth + (startX - final.clientX), sectionWidth);
      setInspectorWidth(next);
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finalize);
      window.removeEventListener('pointercancel', finalize);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finalize);
    window.addEventListener('pointercancel', finalize);
  }, [clampInspectorWidth, setInspectorWidth]);

  const handleSplitterDoubleClick = useCallback(() => {
    setInspectorWidth(INSPECTOR_DEFAULT_WIDTH);
  }, [setInspectorWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const section = sectionRef.current;
    if (!section) return;
    const observer = new ResizeObserver(() => {
      const sectionWidth = section.getBoundingClientRect().width;
      setInspectorWidth((current) => {
        const next = clampInspectorWidth(current, sectionWidth);
        return next === current ? current : next;
      });
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, [clampInspectorWidth, setInspectorWidth]);

  const inspectorStyle = useMemo<CSSProperties>(
    () => ({ ['--inspector-width' as string]: `${inspectorWidth}px` }) as CSSProperties,
    [inspectorWidth],
  );

  return (
    <section
      ref={sectionRef}
      className={`flex min-h-[520px] flex-col overflow-hidden rounded-md border border-border bg-background text-foreground lg:flex-row ${className}`}
    >
      <main className="flex min-h-0 min-w-0 flex-col border-b border-border/70 lg:flex-1 lg:border-b-0">
        {showHeader && (
          <div className="shrink-0 border-b border-border/70 bg-card/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                ariaLabel="copy filtered table"
                copied={copiedKey === 'table'}
                disabled={sortedEvents.length === 0}
                label="copy all"
                onClick={() => void copyText(eventsToCopyTable(sortedEvents), 'table')}
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-muted-foreground">
                <span>{title}</span>
                <span className="text-accent">{sortedEvents.length} shown</span>
                <span>{summary.total} buffered</span>
                <span>{summary.agentActions} agent</span>
                <span>{summary.errors} errors</span>
                {summary.activeSpans > 0 && <span className="text-warning">{summary.activeSpans} active</span>}
                {scopeFilter === 'agent-actions' && agentActionView !== 'raw' && agentActionRows.hiddenDetailEvents > 0 && (
                  <span>{agentActionRows.hiddenDetailEvents} detail hidden</span>
                )}
                {scopeFilter === 'agent-actions' && agentActionRows.collapsedEvents > 0 && (
                  <span>{agentActionRows.collapsedEvents} collapsed</span>
                )}
              </div>
            </div>
            <label className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 font-mono text-[13px] font-normal text-accent transition-colors focus-within:border-accent/40 focus-within:bg-muted/30">
              <span className="shrink-0 text-success">$</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="grep message, category, payload"
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <details className="mt-2 text-left">
              <summary className="cursor-pointer font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
                filters / controls
              </summary>
              <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <FilterGroup label="Scope">
                  <FilterButton active={scopeFilter === 'all'} onClick={() => setScopeFilter('all')}>
                    all
                  </FilterButton>
                  <FilterButton active={scopeFilter === 'agent-actions'} onClick={() => setScopeFilter('agent-actions')}>
                    agent actions
                  </FilterButton>
                </FilterGroup>
                {scopeFilter === 'agent-actions' ? (
                  <FilterGroup label="Rows">
                    <FilterButton active={agentActionView === 'actions'} onClick={() => setAgentActionView('actions')}>
                      actions
                    </FilterButton>
                    <FilterButton active={agentActionView === 'details'} onClick={() => setAgentActionView('details')}>
                      details
                    </FilterButton>
                    <FilterButton active={agentActionView === 'raw'} onClick={() => setAgentActionView('raw')}>
                      raw
                    </FilterButton>
                  </FilterGroup>
                ) : (
                  <div />
                )}
                <FilterGroup label="Kind">
                  <FilterButton active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
                    all
                  </FilterButton>
                  {KINDS.map((kind) => (
                    <FilterButton key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
                      {kind}
                    </FilterButton>
                  ))}
                </FilterGroup>
                <FilterGroup label="Level">
                  <FilterButton active={levelFilter === 'all'} onClick={() => setLevelFilter('all')}>
                    all
                  </FilterButton>
                  {LEVELS.map((level) => (
                    <FilterButton key={level} active={levelFilter === level} onClick={() => setLevelFilter(level)}>
                      {level}
                    </FilterButton>
                  ))}
                </FilterGroup>
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={toggleTail}
                    className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-normal uppercase tracking-[0.12em] transition-colors ${
                      tail
                        ? 'border-accent/30 bg-accent/10 text-accent'
                        : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    tail {tail ? 'on' : 'off'}
                  </button>
                </div>
              </div>
            </details>
          </div>
        )}

        <div className="max-h-[650px] overflow-auto lg:max-h-none lg:flex-1 lg:min-h-0">
          <div className="min-w-[980px] font-mono text-[11px] font-normal">
            <div className={`sticky top-0 z-10 grid min-h-8 ${EVENT_TABLE_GRID} items-center border-b border-border/70 bg-card px-3 py-1.5 font-medium uppercase tracking-[0.12em] text-muted-foreground`}>
              <span className="sticky left-0 bg-card pr-2">Copy</span>
              <span>Open</span>
              <SortableHeader column="time" label="Time" sort={sort} onSort={setTableSort} />
              <SortableHeader column="kind" label="Kind" sort={sort} onSort={setTableSort} />
              <SortableHeader column="level" label="Level" sort={sort} onSort={setTableSort} />
              <SortableHeader column="category" label="Category" sort={sort} onSort={setTableSort} />
              <SortableHeader column="target" label="Target" sort={sort} onSort={setTableSort} />
              <SortableHeader column="message" label="Message" sort={sort} onSort={setTableSort} />
              <SortableHeader column="id" label="Id" sort={sort} onSort={setTableSort} />
            </div>
            {sortedEvents.map((event) => {
              const targetAppId = eventTargetAppId(event);
              const eventKey = eventInstanceKey(event);
              return (
                <div
                  key={eventKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectEvent(event)}
                  onKeyDown={(keyboardEvent) => {
                    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                      keyboardEvent.preventDefault();
                      selectEvent(event);
                    }
                  }}
                  className={`grid min-h-[34px] w-full ${EVENT_TABLE_GRID} items-center border-b border-l-2 px-3 py-2 text-left transition-colors ${
                    (selectedEvent ? eventInstanceKey(selectedEvent) === eventKey : false)
                      ? 'border-b-border/40 border-l-accent bg-accent/[0.08]'
                      : 'border-b-border/40 border-l-transparent hover:bg-muted/30'
                  }`}
                >
                <button
                  type="button"
                  aria-label={`copy row ${shortEventId(event.id)}`}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    void copyText(eventToCopyRow(event).join('\t'), `row:${eventKey}`);
                  }}
                  className={`sticky left-0 z-[1] justify-self-start rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] font-normal uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-accent/30 hover:text-accent ${
                    selectedEvent && eventInstanceKey(selectedEvent) === eventKey ? 'bg-accent/[0.08]' : 'bg-background'
                  }`}
                >
                  {copiedKey === `row:${eventKey}` ? 'copied' : 'copy'}
                </button>
                {targetAppId ? (
                  <button
                    type="button"
                    aria-label={`open ${eventTargetLabel(event)}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      openEventTarget(event);
                    }}
                    className="justify-self-start rounded border border-border/70 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] font-normal uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-accent/30 hover:text-accent"
                  >
                    open
                  </button>
                ) : (
                  <span className="text-muted-foreground/45">-</span>
                )}
                <span className="tabular-nums text-muted-foreground">{eventTimestampLabel(event)}</span>
                <span className="uppercase tracking-[0.13em] text-muted-foreground">{event.kind}</span>
                <span className={`uppercase tracking-[0.13em] ${eventSignalClass(event)}`}>{eventSignalLabel(event)}</span>
                <span className="truncate uppercase tracking-[0.13em] text-muted-foreground">{event.category ?? '-'}</span>
                <span className="truncate font-sans text-[12px] font-normal normal-case tracking-normal text-muted-foreground">{eventTargetLabel(event)}</span>
                <span className="truncate font-sans text-[13px] font-normal normal-case tracking-normal text-foreground">{eventLabel(event)}</span>
                <span className="truncate text-muted-foreground">{shortEventId(event.id)}</span>
                </div>
              );
            })}

            {sortedEvents.length === 0 && (
              <div className="border-b border-border/40 px-3 py-5 font-sans text-[13px] text-muted-foreground">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      </main>

      {showInspector && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize payload inspector"
            aria-valuenow={inspectorWidth}
            aria-valuemin={INSPECTOR_MIN_WIDTH}
            aria-valuemax={INSPECTOR_MAX_WIDTH}
            title="Drag to resize · Double-click to reset"
            onPointerDown={handleSplitterDown}
            onDoubleClick={handleSplitterDoubleClick}
            className={`group hidden shrink-0 cursor-col-resize items-stretch justify-center transition-colors lg:flex lg:w-[5px] ${
              isResizing ? 'bg-accent/15' : 'hover:bg-accent/10'
            }`}
          >
            <div
              className={`w-px transition-colors ${
                isResizing ? 'bg-accent/80' : 'bg-border group-hover:bg-accent/60'
              }`}
            />
          </div>
          <aside
            ref={asideRef}
            style={inspectorStyle}
            className="flex w-full shrink-0 flex-col bg-background lg:w-[var(--inspector-width)]"
          >
            <PayloadInspector
              copied={selectedEvent ? copiedKey === `inspector:${eventInstanceKey(selectedEvent)}` : false}
              event={selectedEvent}
              relatedEvents={selectedRelatedEvents}
              onCopyRow={(event) => void copyText(eventToCopyRow(event).join('\t'), `inspector:${eventInstanceKey(event)}`)}
              onOpenTarget={openEventTarget}
            />
          </aside>
        </>
      )}
    </section>
  );
}

function PayloadInspector({
  copied,
  event,
  relatedEvents,
  onCopyRow,
  onOpenTarget,
}: {
  copied: boolean;
  event: HObservation | null;
  relatedEvents: readonly HObservation[];
  onCopyRow: (event: HObservation) => void;
  onOpenTarget: (event: HObservation) => void;
}) {
  const targetAppId = event ? eventTargetAppId(event) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-card/40 px-3 py-2.5 lg:px-4">
        <div className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-foreground/80">
          Payload inspector
        </div>
        {event ? (
          <div className="flex items-center gap-2">
            {targetAppId ? (
              <button
                type="button"
                onClick={() => onOpenTarget(event)}
                className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 font-mono text-[11px] font-normal uppercase tracking-[0.11em] text-muted-foreground transition hover:border-accent/30 hover:text-accent"
              >
                open app
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onCopyRow(event)}
              className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 font-mono text-[11px] font-normal uppercase tracking-[0.11em] text-muted-foreground transition hover:border-accent/30 hover:text-accent"
            >
              {copied ? 'copied' : 'copy row'}
            </button>
            <div className={`font-mono text-[11px] uppercase tracking-[0.12em] ${eventSignalClass(event)}`}>
              {eventSignalLabel(event)}
            </div>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4 lg:py-4">
        {event ? (
          <div className="grid gap-3">
            <div className="overflow-hidden rounded-md border border-accent/25 bg-accent/[0.07]">
              <div className="flex flex-wrap items-center gap-2 border-b border-accent/15 px-3 py-2">
                <EventPill event={event} />
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {event.kind}
                </span>
              </div>
              <div className="px-3 py-2">
                <div className="font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-accent">
                  selected event
                </div>
                <div className="mt-1 break-words text-[14px] font-normal leading-5 text-foreground">
                  {eventLabel(event)}
                </div>
              </div>
            </div>

            {inspectorSections(event).map((section) => (
              <InspectorSection key={section.title} section={section} />
            ))}

            <TraceTimeline events={relatedEvents} selectedId={event.id} />

            <JsonBlock label="payload.data" value={event.data ?? {}} />
            {event.kind === 'metric' && event.tags ? (
              <JsonBlock label="metric.tags" value={event.tags} />
            ) : null}
            {event.kind === 'span' && event.error ? (
              <JsonBlock label="span.error" value={event.error} />
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-[13px] leading-6 text-muted-foreground">
            No event selected.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
        active
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-border/70 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SortableHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: EventSortKey;
  label: string;
  sort: EventSort;
  onSort: (column: EventSortKey) => void;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const directionLabel = sort.direction === 'asc' ? 'ascending' : 'descending';

  return (
    <button
      type="button"
      aria-label={`Sort by ${label}${active ? `, currently ${directionLabel}` : ''}`}
      aria-pressed={active}
      onClick={() => onSort(column)}
      className={`flex min-w-0 items-center gap-1.5 text-left uppercase tracking-[0.14em] transition ${
        active ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Icon size={10} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
    </button>
  );
}

function CopyButton({
  ariaLabel,
  copied,
  disabled = false,
  label,
  onClick,
}: {
  ariaLabel: string;
  copied: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 font-mono text-[11px] font-normal uppercase tracking-[0.11em] text-muted-foreground transition hover:border-accent/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? 'copied' : label}
    </button>
  );
}

function EventPill({ event }: { event: HObservation }) {
  const label = eventSignalLabel(event);
  const tone = eventSignalTone(event);
  const toneClass =
    tone === 'red'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : tone === 'amber'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : tone === 'emerald'
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-accent/30 bg-accent/10 text-accent';

  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.11em] ${toneClass}`}>
      {label}
    </span>
  );
}

function InspectorSection({ section }: { section: InspectorSectionData }) {
  return (
    <section className="overflow-hidden rounded-md border border-border/60 bg-muted/15">
      <div className="border-b border-border/50 bg-muted/30 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/70">
        {section.title}
      </div>
      <div className="divide-y divide-border/40">
        {section.rows.map((row) => (
          <InspectorRow key={`${section.title}-${row.label}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function TraceTimeline({
  events,
  selectedId,
}: {
  events: readonly HObservation[];
  selectedId: string;
}) {
  if (events.length <= 1) return null;

  return (
    <section className="overflow-hidden rounded-md border border-border/60 bg-muted/15">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-2">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/70">
          Trace lines
        </div>
        <div className="font-mono text-[10px] font-light uppercase tracking-[0.12em] text-muted-foreground">
          {events.length}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {events.map((traceEvent) => {
          const commandLabel = summarizeAgentActionCommand(agentActionCommand(traceEvent));
          return (
            <div
              key={`${traceEvent.id}-${traceEvent.timestamp}`}
              className={`grid grid-cols-[74px_82px_minmax(0,1fr)] gap-2 px-3 py-1.5 ${
                traceEvent.id === selectedId ? 'bg-accent/10' : ''
              }`}
            >
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {eventTimestampLabel(traceEvent)}
              </span>
              <span className={`font-mono text-[10px] uppercase tracking-[0.11em] ${eventSignalClass(traceEvent)}`}>
                {eventSignalLabel(traceEvent)}
              </span>
              <span className="min-w-0 truncate text-[12px] text-foreground/80">
                {commandLabel ?? eventLabel(traceEvent)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InspectorRow({ row }: { row: InspectorRowData }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 px-3 py-2">
      <div className="font-mono text-[10px] font-light uppercase tracking-[0.12em] text-muted-foreground">
        {row.label}
      </div>
      <div className={`min-w-0 break-words text-[12px] leading-5 ${row.mono ? 'font-mono tabular-nums' : 'font-sans'} ${inspectorToneClass(row.tone)}`}>
        {row.value}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15">
      <div className="border-b border-border/50 bg-muted/30 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/70">
        {label}
      </div>
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] font-light leading-5 text-foreground/80 lg:max-h-none lg:overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function eventTargetAppId(event: HObservation): string | null {
  return inferAgentActionAppId(event);
}

function eventTargetWorkspaceId(event: HObservation): string | null {
  const data = eventData(event);
  return dataString(data, 'workspaceId') ?? dataString(data, 'targetWorkspaceId');
}

function eventTargetLabel(event: HObservation) {
  const data = eventData(event);
  const inferredAppId = inferAgentActionAppId(event);
  return (
    dataString(data, 'appName') ??
    dataString(data, 'appId') ??
    inferredAppId ??
    dataString(data, 'workspaceName') ??
    dataString(data, 'workspaceId') ??
    dataString(data, 'serviceId') ??
    dataString(data, 'target') ??
    '-'
  );
}

function inspectorSections(event: HObservation): InspectorSectionData[] {
  const sections: InspectorSectionData[] = [
    {
      title: 'Identity',
      rows: [
        { label: 'id', value: event.id, mono: true },
        { label: 'kind', value: event.kind, tone: 'cyan', mono: true },
        { label: 'category', value: event.category ?? 'none', mono: true },
      ],
    },
    {
      title: 'Signal',
      rows: [
        { label: signalLabelName(event), value: eventSignalLabel(event), tone: eventSignalTone(event), mono: true },
        { label: 'timestamp', value: formatTimestamp(event.timestamp), mono: true },
      ],
    },
  ];

  if (isAgentActionEvent(event)) {
    const data = eventData(event);
    const traceId = agentActionTraceId(event);
    const parentTraceId = agentActionParentTraceId(event);
    sections.push({
      title: 'Agent Action',
      rows: [
        { label: 'source', value: dataString(data, 'source') ?? 'agent', mono: true },
        { label: 'status', value: dataString(data, 'status') ?? eventSignalLabel(event), tone: eventSignalTone(event), mono: true },
        { label: 'action', value: dataString(data, 'action') ?? eventLabel(event), mono: true },
        { label: 'target', value: eventTargetLabel(event), mono: true },
        { label: 'workspace', value: dataString(data, 'workspaceName') ?? dataString(data, 'workspaceId') ?? 'unknown', mono: true },
        ...(traceId ? [{ label: 'trace', value: traceId, mono: true }] : []),
        ...(parentTraceId ? [{ label: 'parent', value: parentTraceId, mono: true }] : []),
      ],
    });

    const prompt = promptPreview(event);
    const traceSummary = agentActionTraceSummary(event);
    if (prompt || traceSummary) {
      sections.push({
        title: 'Request',
        rows: [
          ...(prompt ? [{ label: 'prompt', value: prompt }] : []),
          ...(traceSummary ? [
            { label: 'lines', value: String(traceSummary.eventCount), mono: true },
            { label: 'duration', value: `${traceSummary.durationMs}ms`, mono: true },
          ] : []),
        ],
      });
    }
  }

  if (event.kind === 'log') {
    sections.push({
      title: 'Log',
      rows: [
        { label: 'message', value: event.message },
        { label: 'level', value: event.level, tone: eventSignalTone(event), mono: true },
      ],
    });
  }

  if (event.kind === 'metric') {
    sections.push({
      title: 'Metric',
      rows: [
        { label: 'name', value: event.name },
        { label: 'type', value: event.metricType, tone: 'emerald', mono: true },
        { label: 'value', value: formatMetricValue(event), tone: 'emerald', mono: true },
        { label: 'unit', value: event.unit ?? 'none', mono: true },
      ],
    });
  }

  if (event.kind === 'span') {
    sections.push({
      title: 'Trace',
      rows: [
        { label: 'name', value: event.name },
        { label: 'trace id', value: event.traceId, mono: true },
        { label: 'parent id', value: event.parentId ?? 'none', mono: true },
        { label: 'status', value: event.status, tone: eventSignalTone(event), mono: true },
        { label: 'duration', value: event.durationMs === undefined ? 'active' : `${event.durationMs}ms`, mono: true },
        { label: 'started', value: formatTimestamp(event.startTime), mono: true },
        { label: 'ended', value: event.endTime === undefined ? 'pending' : formatTimestamp(event.endTime), mono: true },
      ],
    });
  }

  return sections;
}

function eventLabel(event: HObservation) {
  if (event.kind === 'log') {
    if (isAgentActionEvent(event)) {
      const data = eventData(event);
      const commandLabel = summarizeAgentActionCommand(agentActionCommand(event));
      if (commandLabel) {
        const status = dataString(data, 'status');
        return status ? `${commandLabel} ${status}` : commandLabel;
      }
      const action =
        dataString(data, 'action') ??
        dataString(data, 'commandId') ??
        event.message;
      const status = dataString(data, 'status');
      const label = formatAgentActionName(action);
      return status ? `${label} ${status}` : label;
    }
    return event.message;
  }
  if (isAgentActionEvent(event)) return formatAgentActionName(event.name);
  return event.name;
}

function eventSignalLabel(event: HObservation) {
  if (event.kind === 'log') {
    if (isAgentActionEvent(event)) {
      return dataString(eventData(event), 'status') ?? event.level;
    }
    return event.level;
  }
  if (event.kind === 'metric') return event.metricType;
  return event.status;
}

function eventSignalClass(event: HObservation) {
  const label = eventSignalLabel(event);
  if (label === 'error' || label === 'failed') return 'text-destructive';
  if (label === 'warn' || label === 'active' || label === 'started') return 'text-warning';
  if (event.kind === 'metric' || label === 'ok' || label === 'completed') return 'text-success';
  return 'text-accent';
}

function eventSignalTone(event: HObservation): InspectorTone {
  const label = eventSignalLabel(event);
  if (label === 'error' || label === 'failed') return 'red';
  if (label === 'warn' || label === 'active' || label === 'started') return 'amber';
  if (event.kind === 'metric' || label === 'ok' || label === 'completed') return 'emerald';
  return 'cyan';
}

function inspectorToneClass(tone: InspectorTone = 'neutral') {
  if (tone === 'red') return 'text-destructive';
  if (tone === 'amber') return 'text-warning';
  if (tone === 'emerald') return 'text-success';
  if (tone === 'cyan') return 'text-accent';
  return 'text-foreground';
}

function signalLabelName(event: HObservation) {
  if (event.kind === 'log') return 'level';
  if (event.kind === 'metric') return 'type';
  return 'status';
}

function formatMetricValue(event: Extract<HObservation, { kind: 'metric' }>) {
  return `${event.value}${event.unit ? ` ${event.unit}` : ''}`;
}

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const base = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function shortEventId(id: string) {
  return id.length > 10 ? id.slice(-10) : id;
}

function eventInstanceKey(event: HObservation) {
  if (event.kind === 'span') {
    return `${event.kind}:${event.id}:${event.status}:${event.endTime ?? 'active'}`;
  }
  return `${event.kind}:${event.id}:${event.timestamp}`;
}

function eventTimestampLabel(event: HObservation) {
  return new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function eventToCopyRow(event: HObservation) {
  return [
    eventTimestampLabel(event),
    event.kind,
    eventSignalLabel(event),
    event.category ?? '',
    eventTargetLabel(event),
    eventLabel(event),
    event.id,
    JSON.stringify(event.data ?? {}),
  ].map(copyCell);
}

function eventSearchHaystack(event: HObservation, relatedEvents: readonly HObservation[]) {
  const parts = [
    eventLabel(event),
    event.category ?? '',
    JSON.stringify(event.data ?? {}),
    ...relatedEvents.map((related) => `${eventLabel(related)} ${JSON.stringify(related.data ?? {})}`),
  ];
  return parts.join(' ').toLowerCase();
}

function promptPreview(event: HObservation) {
  const data = eventData(event);
  const args = data.args;
  const prompt = args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>).prompt
    : undefined;
  if (typeof prompt !== 'string' || !prompt.trim()) return null;
  return prompt.replace(/\s+/g, ' ').trim().slice(0, 360);
}

function eventsToCopyTable(events: readonly HObservation[]) {
  return [
    ['time', 'kind', 'signal', 'category', 'target', 'message', 'id', 'payload'].join('\t'),
    ...events.map((event) => eventToCopyRow(event).join('\t')),
  ].join('\n');
}

function copyCell(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function defaultSortDirection(key: EventSortKey): EventSortDirection {
  return key === 'time' ? 'desc' : 'asc';
}

function sortEvents(events: readonly HObservation[], sort: EventSort): HObservation[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const compared = compareSortValues(
        eventSortValue(left.event, sort.key),
        eventSortValue(right.event, sort.key),
      );
      return compared === 0 ? left.index - right.index : compared * direction;
    })
    .map(({ event }) => event);
}

function eventSortValue(event: HObservation, key: EventSortKey): string | number {
  switch (key) {
    case 'time':
      return event.timestamp;
    case 'kind':
      return event.kind;
    case 'level':
      return eventSignalLabel(event);
    case 'category':
      return event.category ?? '';
    case 'target':
      return eventTargetLabel(event);
    case 'message':
      return eventLabel(event);
    case 'id':
      return shortEventId(event.id);
  }
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path, which also works on non-HTTPS local previews.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

/** Merge file-replayed events with in-memory live events, deduping by id and
 *  returning the newest-first slice. `liveEvents` is already newest-first;
 *  `replayEvents` may be in either order (we resort by timestamp). */
function mergeReplayWithLive(
  replayEvents: readonly HObservation[],
  liveEvents: readonly HObservation[],
  maxEvents: number,
): HObservation[] {
  const seen = new Set<string>();
  const merged: HObservation[] = [];
  for (const event of liveEvents) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  for (let i = replayEvents.length - 1; i >= 0; i--) {
    const event = replayEvents[i];
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged.slice(0, maxEvents);
}

function statusItemToneClass(tone: InspectorTone) {
  if (tone === 'red') return 'text-destructive';
  if (tone === 'amber') return 'text-warning';
  return 'text-muted-foreground';
}

function statusItemDotClass(tone: InspectorTone) {
  if (tone === 'red') return 'bg-destructive';
  if (tone === 'amber') return 'bg-warning';
  return 'bg-success';
}
