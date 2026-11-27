'use client';

import React, { useRef } from 'react';
import { Play, Pause, SkipBack } from '../../icons';

interface AnimationTimelineProps {
  isPlaying: boolean;
  progress: number; // 0-1
  speed: number; // 0.25, 0.5, 1, 2, 4
  onPlayPause: () => void;
  onReset: () => void;
  onProgressChange: (progress: number) => void;
  onSpeedChange: (speed: number) => void;
  style?: React.CSSProperties;
}

const chromeBorderStyle = {
  borderColor: 'var(--hud-chrome-border, oklch(var(--border)))',
} satisfies React.CSSProperties;

const AnimationTimeline: React.FC<AnimationTimelineProps> = ({
  isPlaying,
  progress,
  speed,
  onPlayPause,
  onReset,
  onProgressChange,
  onSpeedChange,
  style,
}) => {
  const scrubberRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const latestProgressRef = useRef(progress);

  const applyProgressToDOM = (nextProgress: number) => {
    const pct = `${nextProgress * 100}%`;
    if (progressBarRef.current) progressBarRef.current.style.width = pct;
    if (playheadRef.current) playheadRef.current.style.left = pct;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const nextProgress = x / rect.width;
    applyProgressToDOM(nextProgress);
    latestProgressRef.current = nextProgress;
    onProgressChange(nextProgress);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!scrubberRef.current) return;
      const nextRect = scrubberRef.current.getBoundingClientRect();
      const nextX = Math.max(0, Math.min(ev.clientX - nextRect.left, nextRect.width));
      const nextProgressValue = nextX / nextRect.width;
      applyProgressToDOM(nextProgressValue);
      latestProgressRef.current = nextProgressValue;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onProgressChange(nextProgressValue);
        rafRef.current = null;
      });
    };

    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      onProgressChange(latestProgressRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const formatTime = (progress: number) => {
    const totalSeconds = 5 / speed; // Base 5 seconds at 1x
    const currentSeconds = totalSeconds * progress;
    const mins = Math.floor(currentSeconds / 60);
    const secs = Math.floor(currentSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed z-40 pointer-events-auto" style={style}>
      <div
        className="h-16 bg-card/95 border-t border-l border-r shadow-[var(--hud-shadow-bar)] flex items-center px-4 gap-4"
        style={chromeBorderStyle}
      >

        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="p-2 rounded hover:bg-accent/10 transition-colors text-muted-foreground hover:text-foreground"
            title="Reset (R)"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={onPlayPause}
            className={`p-2 rounded transition-colors ${
              isPlaying
                ? 'bg-warning/20 text-warning hover:bg-warning/30'
                : 'bg-accent/20 text-accent hover:bg-accent/30'
            }`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>

        {/* Timeline scrubber */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums min-w-[35px]">
            {formatTime(progress)}
          </span>

          <div
            ref={scrubberRef}
            className="flex-1 h-8 flex items-center cursor-pointer group"
            onMouseDown={handleMouseDown}
          >
            <div className="relative w-full h-1 bg-muted rounded-full overflow-hidden">
              {/* Progress bar */}
              <div
                ref={progressBarRef}
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
              {/* Playhead */}
              <div
                ref={playheadRef}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-card rounded-full shadow-lg border-2 border-info transition-transform group-hover:scale-125"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
          </div>

          <span className="text-[11px] font-mono text-muted-foreground tabular-nums min-w-[35px]">
            {formatTime(1)}
          </span>
        </div>

        {/* Speed controls */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground/80 uppercase mr-1">Speed</span>
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 rounded text-[11px] font-mono transition-all ${
                speed === s
                  ? 'bg-info/20 text-info border border-info/40'
                  : 'bg-muted/50 text-muted-foreground border hover:bg-muted hover:text-foreground'
              }`}
              style={speed === s ? undefined : chromeBorderStyle}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnimationTimeline;
