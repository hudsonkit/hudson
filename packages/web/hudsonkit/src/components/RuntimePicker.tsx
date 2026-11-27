'use client';

/**
 * RuntimePicker — the runtime a message will run on (harness · model · effort)
 * as ONE control, and the panel that opens out of it.
 *
 * The web twin of `HudRuntimePicker` in HudsonUI (Apple). Same grammar, same
 * names, same rules; only the material is different. Ported from Scout, where
 * the shape was worked out on a phone.
 *
 * The resting shape is `RuntimeChip`: `✳ Opus 5 | AUTO ⌄`. Clicking it does NOT
 * replace the composer with a modal — the chip stays exactly where it is and
 * the panel GROWS out of it, upward, over a light scrim that keeps the draft
 * you were writing visible behind it. You are changing a setting on the message
 * in front of you, not leaving to a dialog and coming back.
 *
 *   ╭ panel ─────────────────────────────────╮
 *   │ ▌Claude │ ● Opus   5        DEFAULT    │  rail · one travelling marker
 *   │  Codex  │   Sonnet 4.6                 │  models · beside the rail
 *   │         │   Fable  alpha               │
 *   ├────────────────────────────────────────┤
 *   │  AUTO      LOW      MEDIUM      HIGH   │  effort · ordinal footer ladder
 *   ╰────────────────────────────────────────╯
 *                              ▲ grows from the chip, which stays lit below
 *
 * The ladder is the FOOTER so that on an upward-opening panel it lands nearest
 * the hand (or cursor) that just opened it — the setting you retune most often
 * is the one you can reach without moving.
 *
 * Picks COMMIT LIVE. The chip below IS the summary and it updates under the
 * cursor, so there is no draft, no running summary and no Done button. Ways
 * out: scrim click, Escape, or click the chip again. Keyboard inside the
 * panel: ↑↓ model · ←→ effort · Alt+↑↓ harness.
 *
 * The panel is PORTALLED to `document.body` and positioned from the chip's
 * real bounds, not laid out inside the composer: a composer that lives under
 * `overflow: hidden` or inside its own stacking context (a blurred chrome bar,
 * a transformed drawer) would otherwise clip the panel or trap it under the
 * scrim. Measured from the chip, it opens upward out of the chip wherever the
 * chip is, clamps to the viewport, and shortens rather than hides when the
 * chip is near the top.
 *
 * The catalog is the HOST's: pass the harnesses, models and efforts the surface
 * actually supports. HudsonKit owns the grammar, not the model list, and never
 * the brand artwork — pass a `mark` renderer or let the monogram stand in.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from '../icons';

// MARK: - Catalog (host-supplied)

/** One selectable model — a single flat pick, no separate version row. */
export interface RuntimeModel {
  id: string;
  /** Family name, e.g. "Opus". */
  label: string;
  /** Version, e.g. "5". Omit for one-piece names. */
  sublabel?: string;
  isDefault?: boolean;
}

/** One harness on the rail, with its model list and at most one default. */
export interface RuntimeHarness {
  id: string;
  /** Full label — menus, accessibility. */
  label: string;
  /** One word, for the rail. Defaults to the first word of `label`. */
  short?: string;
  /** Typographic stand-in used when `mark` renders nothing for this harness. */
  monogram?: string;
  models: RuntimeModel[];
  /**
   * A harness the host knows about but cannot reach right now. It stays on the
   * rail and stays pickable — a selection can be staged — but renders dimmed
   * and says so to assistive tech. Defaults to true.
   */
  isAvailable?: boolean;
}

/**
 * One reasoning-effort stop. `harnesses` empty/omitted means every harness;
 * `models` omitted means every model. Hosts with no effort concept pass none
 * and the ladder does not render. `isDefault` marks the rung a pick lands on
 * when the effort it had is not supported by the new harness/model pair;
 * without one, the first supported rung (usually Auto) is used.
 */
export interface RuntimeEffort {
  id: string;
  label: string;
  harnesses?: string[];
  models?: string[];
  isDefault?: boolean;
}

export interface RuntimeSelection {
  harnessId: string;
  modelId: string;
  effortId: string;
}

export const RUNTIME_EFFORT_AUTO = 'auto';

export function runtimeModelDisplayName(model: RuntimeModel): string {
  return model.sublabel ? `${model.label} ${model.sublabel}` : model.label;
}

function harnessShort(harness: RuntimeHarness): string {
  return harness.short ?? harness.label.split(' ')[0] ?? harness.id;
}

/** The initial of the harness id, so a named harness with no monogram still gets a glyph. */
function fallbackMonogram(harnessId: string | undefined): string {
  return (harnessId ?? '').slice(0, 1).toUpperCase();
}

function harnessMonogram(harness: RuntimeHarness): string {
  return harness.monogram ?? fallbackMonogram(harness.id);
}

function defaultModel(harness: RuntimeHarness | undefined): RuntimeModel | undefined {
  if (!harness) return undefined;
  return harness.models.find((m) => m.isDefault) ?? harness.models[0];
}

/**
 * What a selection currently names, resolved against the catalog with the same
 * tolerance the panel uses: an unknown harness settles on the first, an unknown
 * model on that harness's default, an unknown effort on the first rung. The
 * chip's readout and the panel's lit rows both come from here, so they never
 * disagree. Exported so a host rendering `RuntimeChip` by hand resolves the
 * same way.
 */
export function resolveRuntimeSelection(
  value: RuntimeSelection,
  harnesses: RuntimeHarness[],
  efforts: RuntimeEffort[] = [],
): { harness?: RuntimeHarness; model?: RuntimeModel; effort?: RuntimeEffort } {
  const harness = harnesses.find((h) => h.id === value.harnessId) ?? harnesses[0];
  const model = harness?.models.find((m) => m.id === value.modelId) ?? defaultModel(harness);
  const effort = efforts.length ? (efforts.find((o) => o.id === value.effortId) ?? efforts[0]) : undefined;
  return { harness, model, effort };
}

/** How a harness draws itself. Return null to fall back to the monogram. */
export type RuntimeMarkRenderer = (harnessId: string | undefined, size: number) => ReactNode | null;

function Mark({
  harnessId,
  monogram,
  size,
  render,
  className,
}: {
  harnessId?: string;
  monogram: string;
  size: number;
  render?: RuntimeMarkRenderer;
  className?: string;
}) {
  const custom = render?.(harnessId, size) ?? null;
  const glyph = monogram || fallbackMonogram(harnessId);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {custom ?? (
        <span className="font-mono font-semibold leading-none" style={{ fontSize: size * 0.78 }}>
          {glyph}
        </span>
      )}
    </span>
  );
}

// MARK: - Chip

export interface RuntimeChipProps {
  harnessId?: string;
  monogram?: string;
  /** Display name of the picked model. */
  model?: string;
  /**
   * Reasoning effort — the third of the triplet. Omit where nothing can change
   * it and the segment is dropped.
   */
  effort?: string;
  /**
   * The panel is open on this chip. The chip does NOT go away while it is — the
   * panel grows out of it and it stays as the live readout — so it takes an
   * active state instead: a rimmed seat and a flipped chevron.
   */
  isPicking?: boolean;
  /** Non-null only where the pick genuinely takes effect. */
  onPick?: () => void;
  mark?: RuntimeMarkRenderer;
  id?: string;
  panelId?: string;
  /** The chip's own element — the picker measures the panel's origin from it. */
  ref?: Ref<HTMLElement>;
}

/**
 * The runtime as ONE chip — the harness is a MARK, not a word, because once the
 * mark is sitting there writing "claude" beside it is redundant. Hugs its
 * content: the toolbar spends its width on the message, not on config.
 */
export function RuntimeChip({
  harnessId,
  monogram = '',
  model,
  effort,
  isPicking = false,
  onPick,
  mark,
  id,
  panelId,
  ref,
}: RuntimeChipProps) {
  // A runtime that names neither a harness nor a model has nothing to say.
  if (!harnessId && !model) return null;

  const readout = [model, effort].filter(Boolean).join(', ');
  const content = (
    <>
      <Mark
        harnessId={harnessId}
        monogram={monogram}
        size={13}
        render={mark}
        className={isPicking ? 'text-accent' : 'text-muted-foreground'}
      />
      {model && <span className="font-mono text-[10px] font-medium text-foreground truncate">{model}</span>}
      {effort && (
        <>
          {/* A hairline rule, not a middot — it separates the two runs without
              adding a third piece of punctuation. */}
          <span className="w-px h-2.5 bg-border shrink-0" aria-hidden />
          <span className="font-mono text-[9px] font-semibold tracking-[0.06em] text-muted-foreground/80 shrink-0">
            {effort.toUpperCase()}
          </span>
        </>
      )}
      {onPick && (
        <ChevronDown
          size={9}
          className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
            isPicking ? 'rotate-180 text-accent' : 'text-muted-foreground/80'
          }`}
        />
      )}
    </>
  );

  // Opening changes the chip's MATERIAL and its SHAPE, not its size: a capsule
  // at rest, squaring toward the panel's corner radius while the panel is up.
  const seat = [
    'inline-flex items-center gap-1.5 h-6 px-2.5 border transition-[background-color,border-color,border-radius] duration-150 motion-reduce:transition-none',
    isPicking
      ? 'rounded-lg bg-accent/10 border-accent/45'
      : 'rounded-full bg-muted/50 border-border/60',
  ].join(' ');

  if (!onPick) {
    return (
      <span ref={ref as Ref<HTMLSpanElement>} className={seat} aria-label={`Runtime: ${readout}`} id={id}>
        {content}
      </span>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      id={id}
      onClick={onPick}
      aria-expanded={isPicking}
      aria-haspopup="dialog"
      aria-controls={isPicking ? panelId : undefined}
      aria-label={`Runtime: ${readout}. Change`}
      className={`${seat} hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50`}
    >
      {content}
    </button>
  );
}

// MARK: - Panel

interface RuntimePanelProps {
  harnesses: RuntimeHarness[];
  efforts: RuntimeEffort[];
  value: RuntimeSelection;
  onChange: (next: RuntimeSelection) => void;
  onDismiss: () => void;
  mark?: RuntimeMarkRenderer;
  id: string;
  labelledBy?: string;
  /** Room above the chip, in px. The panel hugs its rows and only consults this when short of space. */
  maxHeight?: number;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The panel itself: harness rail · model list · effort ladder. Every pick is
 * live — the chip under the scrim updates as you go.
 */
function RuntimePanel({
  harnesses,
  efforts,
  value,
  onChange,
  onDismiss,
  mark,
  id,
  labelledBy,
  maxHeight,
  ref,
}: RuntimePanelProps) {
  // Resolution is tolerant: a stale or unknown id settles onto the first entry
  // and that harness's default model rather than trapping the panel.
  const harness = harnesses.find((h) => h.id === value.harnessId) ?? harnesses[0];
  const models = harness?.models ?? [];
  const resolvedModelId = (models.find((m) => m.id === value.modelId) ?? defaultModel(harness))?.id ?? '';

  const supportedEfforts = useCallback(
    (harnessId: string, modelId?: string) =>
      efforts.filter((option) => {
        if (option.harnesses?.length && !option.harnesses.includes(harnessId)) return false;
        if (option.models?.length && modelId && !option.models.includes(modelId)) return false;
        return true;
      }),
    [efforts],
  );

  const ladder = harness ? supportedEfforts(harness.id, resolvedModelId) : [];
  // A host with no effort concept gets no footer, rather than a ladder with one
  // dead rung.
  const showsLadder = ladder.length > 1;
  const effortIndex = Math.max(0, ladder.findIndex((o) => o.id === value.effortId));

  /**
   * A pick that leaves the current effort unsupported moves it to the rung the
   * host marked default, else the first supported rung, rather than leaving a
   * dead rung lit.
   */
  const reconcileEffort = useCallback(
    (harnessId: string, modelId: string | undefined, effortId: string) => {
      const supported = supportedEfforts(harnessId, modelId);
      if (supported.some((o) => o.id === effortId)) return effortId;
      return supported.find((o) => o.isDefault)?.id ?? supported[0]?.id ?? RUNTIME_EFFORT_AUTO;
    },
    [supportedEfforts],
  );

  const pickHarness = (entry: RuntimeHarness) => {
    const model = defaultModel(entry);
    onChange({
      harnessId: entry.id,
      modelId: model?.id ?? '',
      effortId: reconcileEffort(entry.id, model?.id, value.effortId),
    });
  };

  const pickModel = (model: RuntimeModel) => {
    onChange({
      harnessId: harness?.id ?? value.harnessId,
      modelId: model.id,
      effortId: reconcileEffort(harness?.id ?? value.harnessId, model.id, value.effortId),
    });
  };

  const pickEffort = (option: RuntimeEffort) => {
    onChange({ harnessId: harness?.id ?? value.harnessId, modelId: resolvedModelId, effortId: option.id });
  };

  // ↑↓ walk the models, ←→ the ladder, Alt+↑↓ the rail; Escape is handled by
  // the picker on the document. Each step is the same live pick a click is.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (list: readonly { id: string }[], currentId: string, delta: number) => {
      if (!list.length) return -1;
      const current = Math.max(0, list.findIndex((item) => item.id === currentId));
      const next = Math.min(Math.max(0, current + delta), list.length - 1);
      return next === current ? -1 : next;
    };
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        const delta = event.key === 'ArrowUp' ? -1 : 1;
        if (event.altKey) {
          const next = step(harnesses, harness?.id ?? '', delta);
          if (next >= 0) pickHarness(harnesses[next]);
        } else {
          const next = step(models, resolvedModelId, delta);
          if (next >= 0) pickModel(models[next]);
        }
        event.preventDefault();
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (!showsLadder) return;
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        const next = Math.min(Math.max(0, effortIndex + delta), ladder.length - 1);
        if (next !== effortIndex) pickEffort(ladder[next]);
        event.preventDefault();
        return;
      }
      default:
    }
  };

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : 'Runtime'}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={maxHeight ? { maxHeight } : undefined}
      className="flex w-full flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_10px_22px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.4)] focus:outline-none"
    >
      <div className="flex min-h-0 flex-1">
        {/* Harness rail — one marker travels between rows instead of every row
            growing an edge, which is why the rail reads as a single control. */}
        <div className="w-[100px] shrink-0 overflow-y-auto py-1.5" role="radiogroup" aria-label="Harness">
          {harnesses.map((entry) => {
            const on = entry.id === harness?.id;
            const available = entry.isAvailable ?? true;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={entry.label}
                aria-description={available ? undefined : 'Unavailable'}
                onClick={() => pickHarness(entry)}
                className={`relative flex w-full items-center gap-2 py-2 pl-2.5 pr-2 text-left hover:bg-foreground/[0.045] focus-visible:outline-none focus-visible:bg-foreground/[0.06] ${
                  available ? '' : 'opacity-50'
                }`}
              >
                {on && (
                  <span className="absolute left-0 top-1/2 h-[18px] w-0.5 -translate-y-1/2 rounded-full bg-accent" aria-hidden />
                )}
                <Mark
                  harnessId={entry.id}
                  monogram={harnessMonogram(entry)}
                  size={14}
                  render={mark}
                  className={on ? 'text-accent' : 'text-muted-foreground/80'}
                />
                <span
                  className={`font-mono text-[11px] truncate ${
                    on ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                  }`}
                >
                  {harnessShort(entry)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-px shrink-0 bg-border" aria-hidden />

        {/* Models — beside the rail. A different harness is a different LIST,
            not the same list with its rows rewritten; the key re-mounts it. */}
        <div key={harness?.id ?? ''} className="min-w-0 flex-1 overflow-y-auto py-1.5" role="listbox" aria-label="Model">
          {models.map((model) => {
            const on = model.id === resolvedModelId;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pickModel(model)}
                className="flex w-full items-baseline gap-1.5 px-3 py-2 text-left hover:bg-foreground/[0.045] focus-visible:outline-none focus-visible:bg-foreground/[0.06]"
              >
                <span
                  className={`mb-px h-[5px] w-[5px] shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-transparent'}`}
                  aria-hidden
                />
                <span
                  className={`font-mono text-[12px] truncate ${
                    on ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                  }`}
                >
                  {model.label}
                </span>
                {model.sublabel && (
                  <span className="font-mono text-[10px] text-muted-foreground/80">{model.sublabel}</span>
                )}
                <span className="flex-1" />
                {model.isDefault && (
                  <span className="font-mono text-[9px] tracking-[0.06em] text-muted-foreground/60 shrink-0">
                    DEFAULT
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showsLadder && (
        <>
          <div className="h-px shrink-0 bg-border" aria-hidden />
          {/* Ordinal, so it reads as a ladder rather than a list: everything up
              to the pick is filled, the pick itself is lit. Auto is the
              exception it looks like — it is "let the harness decide", not a
              rung below Low, so selecting it fills nothing. */}
          <div className="flex shrink-0 gap-1 px-3 pb-1" role="radiogroup" aria-label="Effort">
            {ladder.map((option, index) => {
              const current = index === effortIndex;
              const filled = index > 0 && index < effortIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={current}
                  aria-label={`${option.label} effort`}
                  onClick={() => pickEffort(option)}
                  className="flex flex-1 flex-col items-stretch gap-1.5 py-2.5 hover:bg-foreground/[0.045] focus-visible:outline-none focus-visible:bg-foreground/[0.06]"
                >
                  <span
                    className={`h-[3px] rounded-full ${
                      current ? 'bg-accent' : filled ? 'bg-accent/35' : 'bg-border'
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`font-mono text-[9px] tracking-[0.07em] truncate ${
                      current ? 'font-bold text-foreground' : 'font-medium text-muted-foreground/80'
                    }`}
                  >
                    {option.label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// MARK: - Picker

export interface RuntimePickerProps {
  harnesses: RuntimeHarness[];
  /** Omit for hosts with no reasoning-effort setting; the ladder disappears. */
  efforts?: RuntimeEffort[];
  value: RuntimeSelection;
  onChange: (next: RuntimeSelection) => void;
  /** Host brand artwork; return null for a harness you have no mark for. */
  mark?: RuntimeMarkRenderer;
  /** Render the chip as identity only — no chevron, no panel. */
  readOnly?: boolean;
  className?: string;
}

/** Fallback panel width — room for the rail and a model list. */
const PANEL_WIDTH = 288;
/** Side margin the panel keeps from the viewport edges. */
const MARGIN = 12;
/** Air between the chip's top edge and the panel's bottom edge. */
const GAP = 10;
/** Headroom kept above the panel so it never butts into the chrome. */
const HEADROOM = 8;

interface PanelPlacement {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
  /** The chip's centre in the panel's own space, 0…1 — the growth origin. */
  originX: number;
}

/**
 * Geometry, in viewport space, from the chip's real bounds:
 *   · the panel's BOTTOM edge sits a hair above the chip's top edge, so it
 *     always opens upward — above the composer it configures;
 *   · its LEFT edge is the chip's when that fits, else its RIGHT edge is the
 *     chip's (a chip at the far end of a toolbar opens leftward), then it is
 *     clamped to the viewport;
 *   · it can be no taller than the room above the chip.
 */
function placePanel(chip: DOMRect): PanelPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(PANEL_WIDTH, Math.max(0, vw - MARGIN * 2));
  let left = chip.left;
  if (left + width > vw - MARGIN) left = chip.right - width;
  left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - MARGIN - width));
  const bottom = Math.max(0, vh - chip.top + GAP);
  const maxHeight = Math.max(140, chip.top - GAP - HEADROOM);
  const originX = width > 0 ? Math.min(Math.max((chip.left + chip.width / 2 - left) / width, 0), 1) : 1;
  return { left, bottom, width, maxHeight, originX };
}

/**
 * Chip + panel. Place it in the composer's control row: the panel is positioned
 * against the chip and opens UPWARD, so the composer it configures stays
 * visible underneath.
 */
export function RuntimePicker({
  harnesses,
  efforts = [],
  value,
  onChange,
  mark,
  readOnly = false,
  className,
}: RuntimePickerProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const chipRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipId = useId();
  const panelId = `${chipId}-panel`;

  const resolved = useMemo(() => resolveRuntimeSelection(value, harnesses, efforts), [value, harnesses, efforts]);
  const { harness, model, effort } = resolved;

  const close = useCallback(() => setIsPicking(false), []);

  // Measure the chip whenever the panel is up, and again on any resize or
  // scroll — the composer relays under a raised keyboard and the panel has
  // to follow the chip, not where the chip used to be.
  useLayoutEffect(() => {
    if (!isPicking) return;
    const measure = () => {
      const el = chipRef.current;
      if (!el) return;
      setPlacement(placePanel(el.getBoundingClientRect()));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isPicking]);

  // Ways out: scrim click, Escape, or the chip again. Escape is bound on the
  // document because focus may be inside the panel or still on the chip.
  useEffect(() => {
    if (!isPicking) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isPicking, close]);

  // Focus follows the dialog: in, onto the model that is picked (the row most
  // likely to be retuned), and back out onto the chip when it closes, so a
  // keyboard user is never dropped on the body.
  useEffect(() => {
    if (isPicking) {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ?? panel;
      target?.focus();
      return () => {
        chipRef.current?.focus();
      };
    }
    return undefined;
  }, [isPicking]);

  const canPortal = typeof document !== 'undefined';
  const panelStyle: CSSProperties | undefined = isPicking && placement
    ? {
        position: 'fixed',
        left: placement.left,
        bottom: placement.bottom,
        width: placement.width,
        transformOrigin: `${placement.originX * 100}% 100%`,
      }
    : { position: 'fixed', left: MARGIN, bottom: MARGIN, width: PANEL_WIDTH, visibility: 'hidden' };

  const overlay = isPicking && canPortal && (
    <>
      {/* The scrim covers the whole surface, including the composer it is
          dimming — otherwise a click meant for "put this away" lands in the
          draft field instead. Light enough to keep the draft readable: this
          is a panel on top of your message, not a modal instead of it. */}
      <div
        className="fixed inset-0 z-40 bg-black/35"
        onClick={close}
        aria-label="Close runtime picker"
        role="button"
        tabIndex={-1}
      />
      {/* Grows out of the chip: scaled from the chip's centre so it rises out
          of the point that was clicked and collapses back into it. */}
      <div
        className="z-50 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        style={panelStyle}
      >
        <RuntimePanel
          ref={panelRef}
          harnesses={harnesses}
          efforts={efforts}
          value={value}
          onChange={onChange}
          onDismiss={close}
          mark={mark}
          id={panelId}
          labelledBy={chipId}
          maxHeight={placement?.maxHeight}
        />
      </div>
    </>
  );

  return (
    <div className={`relative ${className ?? ''}`}>
      {overlay && createPortal(overlay, document.body)}
      <RuntimeChip
        ref={chipRef}
        id={chipId}
        panelId={panelId}
        harnessId={harness?.id}
        monogram={harness ? harnessMonogram(harness) : ''}
        model={model ? runtimeModelDisplayName(model) : undefined}
        effort={effort?.label}
        isPicking={isPicking}
        mark={mark}
        onPick={readOnly ? undefined : () => setIsPicking((open) => !open)}
      />
    </div>
  );
}
