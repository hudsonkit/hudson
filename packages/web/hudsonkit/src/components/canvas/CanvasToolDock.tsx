'use client';

import React from 'react';
import { Hand, RotateCcw } from '../../icons';
import ZoomControls from '../chrome/ZoomControls';

interface CanvasToolDockProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  handMode: boolean;
  onHandModeChange: (enabled: boolean) => void;
  onResetView: () => void;
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  right?: number;
  bottom?: number;
  className?: string;
}

const CanvasToolDock: React.FC<CanvasToolDockProps> = ({
  scale,
  onScaleChange,
  handMode,
  onHandModeChange,
  onResetView,
  minScale = 0.2,
  maxScale = 3,
  zoomStep = 0.1,
  right = 16,
  bottom = 44,
  className = '',
}) => (
  <div
    className={`absolute z-20 flex flex-row items-center gap-2 ${className}`}
    style={{
      right,
      bottom,
      transition: 'right 200ms ease, bottom 200ms ease',
    }}
  >
    <div className="pointer-events-auto flex flex-row overflow-hidden rounded-md border border-border bg-card shadow-[var(--hud-shadow-panel)]">
      <button
        onClick={() => onHandModeChange(!handMode)}
        className={`flex h-7 w-7 items-center justify-center transition-colors ${
          handMode
            ? 'bg-accent/10 text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
        }`}
        title={handMode ? 'Hand mode on' : 'Hand mode'}
      >
        <Hand size={14} />
      </button>
      <button
        onClick={onResetView}
        className="flex h-7 w-7 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
        title="Reset preview view"
      >
        <RotateCcw size={13} />
      </button>
    </div>
    <ZoomControls
      scale={scale}
      onZoom={onScaleChange}
      min={minScale}
      max={maxScale}
      step={zoomStep}
    />
  </div>
);

export default CanvasToolDock;
