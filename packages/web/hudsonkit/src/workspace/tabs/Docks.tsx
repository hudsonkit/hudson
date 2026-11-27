'use client';

// ---------------------------------------------------------------------------
// <Docks> (HUD-015 §2, §4): right and bottom docks around any content.
//
// Presentational and controlled: the caller owns visibility and size. A
// dock holds anything (tabs, or a single slot such as Talkie's terminal).
// While dragging a divider the size lives in the DOM; it is written back
// through onSizeChange on release.
// ---------------------------------------------------------------------------
import { useCallback, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { TabDock } from '../../types/tabs';
import { DEFAULT_DOCK_SIZE } from './layout';

export interface DockSlot {
  content: ReactNode;
  visible: boolean;
  /** Width (right) or height (bottom) as a share of the Docks area, 0–1. */
  size: number;
  onSizeChange?: (size: number) => void;
  /** Accessible name for the dock region. */
  label?: string;
}

export interface DocksProps {
  children: ReactNode;
  right?: DockSlot;
  bottom?: DockSlot;
  className?: string;
  style?: CSSProperties;
}

const DIVIDER_STYLE: CSSProperties = { backgroundColor: 'var(--hud-chrome-border, oklch(var(--border) / 0.8))' };

const MIN_SHARE = 0.12;
const MAX_SHARE = 0.85;
const KEY_STEP = 0.02;

const clamp = (n: number) => Math.max(MIN_SHARE, Math.min(MAX_SHARE, n));

export function Docks({ children, right, bottom, className, style }: DocksProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const showRight = !!right?.visible;
  const showBottom = !!bottom?.visible;

  return (
    <div ref={rootRef} className={`flex h-full w-full min-h-0 min-w-0 ${className ?? ''}`} style={style}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        {showBottom && bottom && <DockPane dock="bottom" slot={bottom} rootRef={rootRef} />}
      </div>
      {showRight && right && <DockPane dock="right" slot={right} rootRef={rootRef} />}
    </div>
  );
}

function DockPane({
  dock,
  slot,
  rootRef,
}: {
  dock: TabDock;
  slot: DockSlot;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(slot.size);
  const horizontal = dock === 'right';
  const basis = `${(clamp(slot.size) * 100).toFixed(3)}%`;

  const applyLive = (share: number) => {
    liveRef.current = share;
    if (paneRef.current) paneRef.current.style.flexBasis = `${(share * 100).toFixed(3)}%`;
  };

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const root = rootRef.current;
      if (!root) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const rect = root.getBoundingClientRect();
      liveRef.current = slot.size;
      const move = (ev: globalThis.PointerEvent) => {
        const share = horizontal ? (rect.right - ev.clientX) / rect.width : (rect.bottom - ev.clientY) / rect.height;
        applyLive(clamp(share));
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        if (liveRef.current !== slot.size) slot.onSizeChange?.(liveRef.current);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    },
    [horizontal, rootRef, slot],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const shrink = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== grow && e.key !== shrink) return;
    e.preventDefault();
    slot.onSizeChange?.(clamp(slot.size + (e.key === grow ? KEY_STEP : -KEY_STEP)));
  };

  const label = slot.label ?? (horizontal ? 'Right dock' : 'Bottom dock');

  return (
    <div
      ref={paneRef}
      data-dock={dock}
      className={`relative flex min-h-0 min-w-0 shrink-0 grow-0 ${horizontal ? 'flex-row' : 'flex-col'}`}
      style={{ flexBasis: basis }}
    >
      <div
        role="separator"
        aria-label={`Resize ${label.toLowerCase()}`}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={Math.round(MIN_SHARE * 100)}
        aria-valuemax={Math.round(MAX_SHARE * 100)}
        aria-valuenow={Math.round(clamp(slot.size) * 100)}
        tabIndex={slot.onSizeChange ? 0 : -1}
        onPointerDown={slot.onSizeChange ? onPointerDown : undefined}
        onKeyDown={onKeyDown}
        className={`group relative z-10 shrink-0 outline-none ${horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}`}
          style={DIVIDER_STYLE}
      >
        {/* Wider hit area than the 1px line */}
        <span
          aria-hidden
          className={`absolute ${horizontal ? '-left-1 -right-1 inset-y-0' : '-top-1 -bottom-1 inset-x-0'} transition-colors group-hover:bg-accent/40 group-focus-visible:bg-accent/60`}
        />
      </div>
      <section aria-label={label} className="relative min-h-0 min-w-0 flex-1">
        {slot.content}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// usePersistentDocks — dock visibility and size, saved per key. For hosts
// that use <Docks> without tabs (e.g. a console under a detail view).
// ---------------------------------------------------------------------------
export interface PersistentDockState {
  visible: boolean;
  size: number;
}

export function usePersistentDocks(
  key: string,
  defaults: Partial<Record<TabDock, Partial<PersistentDockState>>> = {},
) {
  const [state, setState] = usePersistentState<Record<TabDock, PersistentDockState>>(`docks:${key}`, {
    right: { visible: defaults.right?.visible ?? false, size: defaults.right?.size ?? DEFAULT_DOCK_SIZE.right },
    bottom: { visible: defaults.bottom?.visible ?? false, size: defaults.bottom?.size ?? DEFAULT_DOCK_SIZE.bottom },
  });
  const setVisible = useCallback(
    (dock: TabDock, visible: boolean) => setState((s) => ({ ...s, [dock]: { ...s[dock], visible } })),
    [setState],
  );
  const toggle = useCallback(
    (dock: TabDock) => setState((s) => ({ ...s, [dock]: { ...s[dock], visible: !s[dock].visible } })),
    [setState],
  );
  const setSize = useCallback(
    (dock: TabDock, size: number) => setState((s) => ({ ...s, [dock]: { ...s[dock], size: clamp(size) } })),
    [setState],
  );
  return { state, setVisible, toggle, setSize };
}
