'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Minus } from '../../icons';

interface ZoomControlsProps {
  scale: number;
  onZoom: (newScale: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Row (− 100% +, the default) or the older column (+ 100% −). */
  orientation?: 'horizontal' | 'vertical';
}

const chromeBorderStyle = {
  borderColor: 'var(--hud-chrome-border, oklch(var(--border)))',
} satisfies React.CSSProperties;

const ZoomControls: React.FC<ZoomControlsProps> = ({
  scale,
  onZoom,
  min = 0.2,
  max = 3,
  step = 0.1,
  orientation = 'horizontal',
}) => {
  const horizontal = orientation === 'horizontal';
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const handleZoomIn = useCallback(() => {
    onZoom(clamp(scale + step));
  }, [scale, step, onZoom, clamp]);

  const handleZoomOut = useCallback(() => {
    onZoom(clamp(scale - step));
  }, [scale, step, onZoom, clamp]);

  const startEditing = useCallback(() => {
    setEditValue(Math.round(scale * 100).toString());
    setIsEditing(true);
  }, [scale]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onZoom(clamp(parsed / 100));
    }
  }, [editValue, onZoom, clamp]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') setIsEditing(false);
  }, [commitEdit]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const stepButton =
    'flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';
  const readout = 'w-11 h-7 text-center text-[10px] font-mono tabular-nums text-foreground/80';
  const zoomOut = (
    <button onClick={handleZoomOut} disabled={scale <= min} className={stepButton} title="Zoom out" aria-label="Zoom out">
      <Minus size={12} />
    </button>
  );
  const zoomIn = (
    <button onClick={handleZoomIn} disabled={scale >= max} className={stepButton} title="Zoom in" aria-label="Zoom in">
      <Plus size={12} />
    </button>
  );

  return (
    <div
      className={`pointer-events-auto flex ${horizontal ? 'flex-row' : 'flex-col'} items-stretch bg-card/95 border rounded-md shadow-[var(--hud-shadow-panel)] overflow-hidden`}
      style={chromeBorderStyle}
    >
      {horizontal ? zoomOut : zoomIn}

      <div className={horizontal ? 'border-x' : 'border-y'} style={chromeBorderStyle}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            aria-label="Zoom percentage"
            className={`${readout} block bg-background/60 outline-none`}
          />
        ) : (
          <button
            onClick={startEditing}
            className={`${readout} block hover:bg-accent/10 hover:text-foreground transition-colors cursor-text`}
            title="Click to set zoom"
          >
            {Math.round(scale * 100)}%
          </button>
        )}
      </div>

      {horizontal ? zoomIn : zoomOut}
    </div>
  );
};

export default ZoomControls;
