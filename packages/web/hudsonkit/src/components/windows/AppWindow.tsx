'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Maximize2, Minimize2, X } from '../../icons';
import { HudsonContextMenu } from '../overlays/ContextMenu';
import type { ContextMenuEntry } from '../overlays/ContextMenu';

// ---------------------------------------------------------------------------
// AppWindow — draggable/resizable window that lives in world space (Layer 1)
// ---------------------------------------------------------------------------

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AppWindowProps {
  title: string;
  /** Content rendered in the center of the title bar (e.g. app-specific controls) */
  titleCenter?: React.ReactNode;
  bounds: Bounds;
  onBoundsChange: (b: Bounds) => void;
  isFocused: boolean;
  onFocus: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
  /** CSS zoom of the parent world layer — used for 1:1 drag/resize at any zoom */
  worldScale?: number;
  /** Controlled maximize state (lifted from parent) */
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  /** Context menu items shown on right-click */
  contextMenuItems?: ContextMenuEntry[];
  /** Where shell-level context menus should attach. Defaults to the full window for compatibility. */
  contextMenuScope?: 'window' | 'chrome';
  contextMenuActivationMode?: 'default' | 'modifier';
  /** Optional decorations rendered inside the window's positioned root,
   *  on top of the chrome — used by the shell for port dots, status pills,
   *  etc. The container has `pointer-events: none` so individual decorations
   *  must opt in to interaction. */
  decorations?: React.ReactNode;
  children: React.ReactNode;
}

const MIN_W = 400;
const MIN_H = 300;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const EDGE_CURSORS: Record<Edge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

const EDGE_LABELS: Record<Edge, string> = {
  n: 'top edge',
  s: 'bottom edge',
  e: 'right edge',
  w: 'left edge',
  ne: 'top-right corner',
  nw: 'top-left corner',
  se: 'bottom-right corner',
  sw: 'bottom-left corner',
};

function keyboardStep(event: React.KeyboardEvent): number {
  if (event.metaKey || event.ctrlKey) return 50;
  return 10;
}

function resizeBoundsByEdge(startBounds: Bounds, edge: Edge, dx: number, dy: number): Bounds {
  let { x, y, w, h } = startBounds;

  if (edge.includes('e')) w = Math.max(MIN_W, w + dx);
  if (edge.includes('w')) {
    const newW = Math.max(MIN_W, w - dx);
    x = x + (w - newW);
    w = newW;
  }
  if (edge.includes('s')) h = Math.max(MIN_H, h + dy);
  if (edge.includes('n')) {
    const newH = Math.max(MIN_H, h - dy);
    y = y + (h - newH);
    h = newH;
  }

  return { x, y, w, h };
}

function resizeHandleOrientation(edge: Edge): 'horizontal' | 'vertical' | undefined {
  if (edge === 'e' || edge === 'w') return 'vertical';
  if (edge === 'n' || edge === 's') return 'horizontal';
  return undefined;
}

const AppWindow: React.FC<AppWindowProps> = ({
  title,
  titleCenter,
  bounds,
  onBoundsChange,
  isFocused,
  onFocus,
  onMinimize,
  onClose,
  worldScale,
  isMaximized: isMaximizedProp,
  onToggleMaximize: onToggleMaximizeProp,
  contextMenuItems,
  contextMenuScope = 'window',
  contextMenuActivationMode,
  decorations,
  children,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  // Internal maximize state (used when not controlled by parent)
  const [isMaximizedInternal, setIsMaximizedInternal] = useState(false);
  const [preMaxBounds, setPreMaxBounds] = useState<Bounds | null>(null);
  const isMaximized = isMaximizedProp ?? isMaximizedInternal;
  const [altHeld, setAltHeld] = useState(false);

  // Drag guard: when true, the component is being dragged/resized.
  // During drag, liveBoundsRef holds the authoritative position and
  // React renders read from it instead of the (stale) bounds prop.
  const isDraggingRef = useRef(false);
  const liveBoundsRef = useRef(bounds);
  // eslint-disable-next-line react-hooks/refs -- reading the drag guard during render is intentional; it decides whether the (stale-during-drag) bounds prop should be synced
  if (!isDraggingRef.current) {
    // eslint-disable-next-line react-hooks/refs -- syncing bounds into liveBoundsRef during render is intentional; bounds is authoritative only when not dragging, and using state here would thrash re-renders every frame during drag
    liveBoundsRef.current = bounds;
  }

  // Ref to onBoundsChange so closures always call the latest version
  const onBoundsChangeRef = useRef(onBoundsChange);
  // eslint-disable-next-line react-hooks/refs -- latest-callback ref updated during render so drag/resize handlers always call the current onBoundsChange without re-binding listeners
  onBoundsChangeRef.current = onBoundsChange;

  /** Apply bounds directly to DOM (no React re-render). */
  const applyBoundsToDOM = useCallback((b: Bounds) => {
    const el = windowRef.current;
    if (!el) return;
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
  }, []);

  // --- Track Alt key ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Alt') setAltHeld(false); };
    const onBlur = () => setAltHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // --- Option+Drag (move window from anywhere on body) ---
  const handleWindowMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onFocus();
      if (!e.altKey || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startBounds = { ...liveBoundsRef.current };
      const zoom = worldScale ?? 1;
      isDraggingRef.current = true;
      document.body.style.cursor = 'grabbing';

      const onMouseMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        liveBoundsRef.current = { ...startBounds, x: startBounds.x + dx, y: startBounds.y + dy };
        applyBoundsToDOM(liveBoundsRef.current);
      };
      const onMouseUp = () => {
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        isDraggingRef.current = false;
        onBoundsChangeRef.current(liveBoundsRef.current);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onFocus, worldScale, applyBoundsToDOM],
  );

  // --- Drag ---
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startBounds = { ...liveBoundsRef.current };
      isDraggingRef.current = true;

      const zoom = worldScale ?? 1;
      const onMouseMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        liveBoundsRef.current = { ...startBounds, x: startBounds.x + dx, y: startBounds.y + dy };
        applyBoundsToDOM(liveBoundsRef.current);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        isDraggingRef.current = false;
        onBoundsChangeRef.current(liveBoundsRef.current);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onFocus, worldScale, applyBoundsToDOM],
  );

  // --- Resize ---
  const handleResizeStart = useCallback(
    (edge: Edge) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFocus();
      const startX = e.clientX;
      const startY = e.clientY;
      const startBounds = { ...liveBoundsRef.current };
      isDraggingRef.current = true;

      const zoom = worldScale ?? 1;
      const onMouseMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;

        liveBoundsRef.current = resizeBoundsByEdge(startBounds, edge, dx, dy);
        applyBoundsToDOM(liveBoundsRef.current);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        isDraggingRef.current = false;
        onBoundsChangeRef.current(liveBoundsRef.current);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onFocus, worldScale, applyBoundsToDOM],
  );

  const handleToggleMaximize = useCallback(() => {
    if (onToggleMaximizeProp) {
      onToggleMaximizeProp();
      return;
    }
    if (isMaximized && preMaxBounds) {
      onBoundsChange(preMaxBounds);
      setIsMaximizedInternal(false);
      setPreMaxBounds(null);
    } else {
      setPreMaxBounds(bounds);
      const zoom = worldScale ?? 1;
      // 98% of viewport — leaves a thin padding around the edges
      const maxW = (window.innerWidth / zoom) * 0.98;
      const maxH = (window.innerHeight / zoom) * 0.98;
      onBoundsChange({ x: -(maxW / 2), y: -(maxH / 2), w: maxW, h: maxH });
      setIsMaximizedInternal(true);
    }
  }, [isMaximized, preMaxBounds, bounds, onBoundsChange, worldScale, onToggleMaximizeProp]);

  const commitKeyboardBounds = useCallback((nextBounds: Bounds) => {
    liveBoundsRef.current = nextBounds;
    applyBoundsToDOM(nextBounds);
    onBoundsChangeRef.current(nextBounds);
  }, [applyBoundsToDOM]);

  const handleTitleBarKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!e.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    if (isMaximized) return;

    const step = keyboardStep(e);
    const next = { ...liveBoundsRef.current };
    if (e.shiftKey) {
      if (e.key === 'ArrowRight') next.w += step;
      if (e.key === 'ArrowLeft') next.w = Math.max(MIN_W, next.w - step);
      if (e.key === 'ArrowDown') next.h += step;
      if (e.key === 'ArrowUp') next.h = Math.max(MIN_H, next.h - step);
    } else {
      if (e.key === 'ArrowRight') next.x += step;
      if (e.key === 'ArrowLeft') next.x -= step;
      if (e.key === 'ArrowDown') next.y += step;
      if (e.key === 'ArrowUp') next.y -= step;
    }
    commitKeyboardBounds(next);
  }, [commitKeyboardBounds, isMaximized, onFocus]);

  const handleResizeHandleKeyDown = useCallback(
    (edge: Edge) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      onFocus();
      if (isMaximized) return;

      const step = keyboardStep(e);
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
      commitKeyboardBounds(resizeBoundsByEdge(liveBoundsRef.current, edge, dx, dy));
    },
    [commitKeyboardBounds, isMaximized, onFocus],
  );

  const GRIP = 6;
  const menuItems = contextMenuItems ?? [];
  const hasContextMenu = menuItems.length > 0;
  const withChromeContextMenu = (node: React.ReactNode) => {
    if (!hasContextMenu || contextMenuScope !== 'chrome') return node;
    return <HudsonContextMenu items={menuItems} activationMode={contextMenuActivationMode}>{node}</HudsonContextMenu>;
  };

  const titleBar = (
    <div
      className="h-8 shrink-0 flex items-center px-3 gap-2 border-b border-border/70 bg-card cursor-grab active:cursor-grabbing select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      onMouseDown={handleDragStart}
      onKeyDown={handleTitleBarKeyDown}
      onFocus={onFocus}
      tabIndex={0}
      role="group"
      aria-label={`${title} window title bar. Press Option plus arrow keys to move; press Option Shift plus arrow keys to resize.`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
    >
      {/* Left controls: expand */}
      <div className="flex items-center gap-1">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggleMaximize}
          className="p-1 rounded hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
          title={isMaximized ? 'Restore' : 'Expand'}
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          type="button"
        >
          {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        {onMinimize && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onMinimize}
            className="p-1 rounded hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
            aria-label="Minimize window"
            type="button"
          >
            <Minus size={11} />
          </button>
        )}
      </div>
      <span className="flex-1 text-[12px] font-mono tracking-wider text-foreground truncate text-center">
        {title}
      </span>
      {titleCenter && (
        <div className="flex items-center shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {titleCenter}
        </div>
      )}
      {/* Right controls: close */}
      <div className="flex items-center gap-1">
        {onClose && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
            title="Close"
            aria-label="Close window"
            type="button"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );

  // Maximized windows float above all siblings.
  const windowStyle: React.CSSProperties = { ...(isMaximized ? { zIndex: 9999 } : undefined) };
  // During drag, liveBoundsRef holds the authoritative window position; reading it in
  // render is intentional (the bounds prop is stale until drag ends) and avoids a
  // re-render on every pointer frame. Applied via Object.assign so the position stays
  // authoritative even if an unrelated state change re-renders mid-drag.
  // eslint-disable-next-line react-hooks/refs -- see comment above; intentional ref read during render for drag performance
  Object.assign(windowStyle, { left: liveBoundsRef.current.x, top: liveBoundsRef.current.y, width: liveBoundsRef.current.w, height: liveBoundsRef.current.h });
  const windowEl = (
    <div
      ref={windowRef}
      className={`absolute pointer-events-auto${altHeld ? ' cursor-grab' : ''}`}
      data-app-window
      style={windowStyle}
      onMouseDown={handleWindowMouseDown}
      onFocusCapture={onFocus}
      role="region"
      aria-label={`${title} window`}
    >
      {/* Window chrome */}
      <div
        className={`w-full h-full flex flex-col rounded-lg overflow-hidden border transition-colors duration-200 ${
          isFocused
            ? 'border-foreground/20'
            : 'border-border/80'
        }`}
        style={{ background: 'oklch(var(--card))' }}
      >
        {/* Title bar */}
        {withChromeContextMenu(titleBar)}

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative bg-card/78 select-text">
          {children}
        </div>
      </div>

      {/* Resize handles */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Edge[]).map((edge) => {
        const isCorner = edge.length === 2;
        const size = isCorner ? GRIP * 2 : GRIP;
        const style: React.CSSProperties = { position: 'absolute', zIndex: 10, cursor: EDGE_CURSORS[edge] };

        if (edge.includes('n')) { style.top = -size / 2; style.height = size; }
        if (edge.includes('s')) { style.bottom = -size / 2; style.height = size; }
        if (edge.includes('e')) { style.right = -size / 2; style.width = size; }
        if (edge.includes('w')) { style.left = -size / 2; style.width = size; }

        // Edges span the full length
        if (edge === 'n' || edge === 's') { style.left = size; style.right = size; }
        if (edge === 'e' || edge === 'w') { style.top = size; style.bottom = size; }

        // Corners are fixed-size squares
        if (isCorner) { style.width = size; style.height = size; }

        const orientation = resizeHandleOrientation(edge);

        return (
          <div
            key={edge}
            style={style}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            onMouseDown={handleResizeStart(edge)}
            onKeyDown={handleResizeHandleKeyDown(edge)}
            onFocus={onFocus}
            tabIndex={0}
            role="separator"
            aria-label={`Resize ${title} window from the ${EDGE_LABELS[edge]}`}
            aria-orientation={orientation}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          />
        );
      })}

      {decorations && (
        <div
          className="absolute inset-0"
          style={{ pointerEvents: 'none', zIndex: 20 }}
          aria-hidden="false"
        >
          {decorations}
        </div>
      )}
    </div>
  );

  if (hasContextMenu && contextMenuScope === 'window') {
    return <HudsonContextMenu items={menuItems} activationMode={contextMenuActivationMode}>{windowEl}</HudsonContextMenu>;
  }

  return windowEl;
};

export default AppWindow;
