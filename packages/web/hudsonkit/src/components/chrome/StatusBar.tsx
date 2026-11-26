'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Map, Maximize2 } from '../../icons';
import { PANEL_STYLES } from '../../lib/theme';
import type { StatusState } from '../../types/app';

interface StatusBarProps {
  /** Left section content — app-specific status items */
  left?: React.ReactNode;
  /** Viewport data for the center section */
  viewport?: {
    pan: { x: number; y: number };
    zoom: number;
    canvasSize?: { w: number; h: number };
  };
  /** Right section content — app-specific items before system info */
  right?: React.ReactNode;
  /** Whether the minimap is collapsed (shows MAP button in status bar) */
  isMinimapCollapsed?: boolean;
  /** Callback to expand the minimap */
  onExpandMinimap?: () => void;
  /** Status label and color for the online indicator */
  status?: StatusState;
  /** Optional action for the status indicator. Renders the indicator as a button when supplied. */
  onStatusClick?: () => void;
  /** Callback to toggle the terminal drawer */
  onToggleTerminal?: () => void;
  /** Whether the terminal is currently open */
  isTerminalOpen?: boolean;
  /** Label for the terminal toggle (defaults to "Console") */
  terminalLabel?: string;
  /** Position inside an anchored shell row instead of against the viewport. */
  embedded?: boolean;
}

const STATUS_COLORS = {
  // Healthy is quiet: muted label, no dot. Color is reserved for states that need attention.
  emerald: { dot: '', ping: '', text: 'text-muted-foreground' },
  amber: { dot: 'bg-warning', ping: 'bg-warning', text: 'text-warning' },
  red: { dot: 'bg-destructive', ping: 'bg-destructive', text: 'text-destructive' },
  neutral: { dot: 'bg-muted-foreground', ping: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

const chromeBorderStyle = {
  borderColor: 'var(--hud-chrome-border, oklch(var(--border)))',
} satisfies React.CSSProperties;

const chromeDividerStyle = {
  backgroundColor: 'var(--hud-chrome-border, oklch(var(--border)))',
} satisfies React.CSSProperties;

const StatusBar: React.FC<StatusBarProps> = ({
  left,
  viewport,
  right,
  isMinimapCollapsed = false,
  onExpandMinimap,
  status = { label: 'READY', color: 'emerald' },
  onStatusClick,
  onToggleTerminal,
  isTerminalOpen = false,
  terminalLabel = 'Console',
  embedded = false,
}) => {
  const [time, setTime] = useState(new Date());
  const [vpCopied, setVpCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-mount gate (avoids SSR/client clock hydration mismatch); runs once on mount, not a cascade
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const colors = STATUS_COLORS[status.color];
  const statusLabel = status.title ?? status.label;
  const statusClassName = `shrink-0 flex items-center gap-2 ${colors.text}`;
  const statusContent = (
    <>
      {colors.dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`} />}
      <span className="font-light tracking-[0.18em] uppercase text-[9px]">{status.label}</span>
    </>
  );

  const handleCopyViewport = async () => {
    if (!viewport) return;
    const payload = `PAN: ${viewport.pan.x.toFixed(0)},${viewport.pan.y.toFixed(0)} | SIZE: ${viewport.canvasSize?.w ?? 1024}x${viewport.canvasSize?.h ?? 1024} | ZOOM: ${(viewport.zoom * 100).toFixed(0)}%`;
    try {
      await navigator.clipboard.writeText(payload);
      setVpCopied(true);
      setTimeout(() => setVpCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const surfaceClassName = embedded
    ? 'relative h-full w-full bg-card/95 backdrop-blur-xl'
    : PANEL_STYLES.statusBar;

  return (
    <div
      data-frame-panel="status-bar"
      className={`${surfaceClassName} h-7 flex items-center justify-between gap-3 px-3 select-none font-mono text-[9px] md:text-[10px] text-foreground pointer-events-auto overflow-hidden`}
      style={chromeBorderStyle}
    >
      {/* LEFT: Minimap toggle + Status indicator + App-specific */}
      <div className="min-w-0 flex items-center gap-3 md:gap-4 overflow-hidden">
        {/* Collapsed minimap toggle */}
        {isMinimapCollapsed && onExpandMinimap && (
          <>
            <button
              onClick={onExpandMinimap}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
              title="Expand minimap"
            >
              <Map size={10} />
              <span className="text-[9px] font-light tracking-[0.18em] uppercase">Map</span>
            </button>
            <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
          </>
        )}

        {/* System status indicator */}
        {onStatusClick ? (
          <button
            type="button"
            onClick={onStatusClick}
            className={`${statusClassName} rounded transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
            title={statusLabel}
            aria-label={statusLabel}
          >
            {statusContent}
          </button>
        ) : (
          <div className={statusClassName} title={status.title}>
            {statusContent}
          </div>
        )}

        {left && (
          <>
            <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
            {left}
          </>
        )}
      </div>

      {/* CENTER: Viewport data (clickable to copy) */}
      {viewport && (
        <div
          className="hidden lg:flex absolute -translate-x-1/2 items-center gap-3 opacity-70 hover:opacity-100 transition-[left,opacity] duration-200"
          style={{ left: 'calc(50% - var(--hud-player-status-inline-offset, 0px))' }}
        >
          <button
            onClick={handleCopyViewport}
            className="flex items-center gap-3 hover:text-foreground transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
            title="Copy viewport data"
          >
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground tracking-[0.18em] text-[9px] uppercase">Pan</span>
              <span className={`tabular-nums ${vpCopied ? 'text-accent' : ''}`}>
                {viewport.pan.x.toFixed(0)},{viewport.pan.y.toFixed(0)}
              </span>
            </div>
            <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground tracking-[0.18em] text-[9px] uppercase">Size</span>
              <span className={`tabular-nums ${vpCopied ? 'text-accent' : ''}`}>
                {viewport.canvasSize?.w ?? 1024}x{viewport.canvasSize?.h ?? 1024}
              </span>
            </div>
            <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground tracking-[0.18em] text-[9px] uppercase">Zoom</span>
              <span className={`tabular-nums ${vpCopied ? 'text-accent' : ''}`}>
                {(viewport.zoom * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        </div>
      )}

      {/* RIGHT: Console toggle + app/system status items + Clock */}
      <div className="shrink-0 flex items-center gap-3 md:gap-4">
        {onToggleTerminal && (
          <>
            <button
              onClick={onToggleTerminal}
              className={`flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded ${
                isTerminalOpen
                  ? 'text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={`Toggle ${terminalLabel} (Ctrl+\`)`}
            >
              <span className="text-[10px]">{'>'}_</span>
              <span className="uppercase text-[9px] font-light tracking-[0.18em]">{terminalLabel}</span>
            </button>
            <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>
          </>
        )}

        {right}

        {right && <span aria-hidden="true" className="text-muted-foreground/40 select-none">·</span>}

        <div className="flex items-center gap-1.5 text-foreground min-w-[60px] justify-end">
          <Clock size={11} className="text-muted-foreground" />
          <span>{mounted ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
