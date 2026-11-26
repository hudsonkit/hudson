'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// SkeletonWindow — visual placeholder matching AppWindow chrome.
//
// Renders at the same position/size as a real AppWindow but with a shimmer
// body instead of app content. Shown during the hydration window before
// usePersistentState + app effects settle, so the first paint shows
// "windows loading" rather than an empty canvas.
//
// Styling intentionally mirrors AppWindow:
//   - Same border, border-radius, shadow tokens
//   - Same title-bar height (h-8), font, and padding
//   - Body replaced with an animated shimmer strip
//
// Usage:
//   <SkeletonWindow
//     bounds={{ x: -400, y: -300, w: 800, h: 600 }}
//     title="My App"
//   />
// ---------------------------------------------------------------------------

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SkeletonWindowProps {
  bounds: Bounds;
  title: string;
  /** Whether this is the focused window (applies accent border). */
  isFocused?: boolean;
  /** Opacity multiplier — lets the caller fade the skeleton out (0–1). */
  opacity?: number;
}

const SkeletonWindow: React.FC<SkeletonWindowProps> = ({
  bounds,
  title,
  isFocused = false,
  opacity = 1,
}) => {
  return (
    <div
      aria-hidden="true"
      data-skeleton-window
      className="absolute pointer-events-none"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        opacity,
      }}
    >
      {/* Window chrome — mirrors AppWindow's outer wrapper */}
      <div
        className={`w-full h-full flex flex-col rounded-lg overflow-hidden border shadow-[0_20px_60px_rgba(0,0,0,0.22)] ${
          isFocused ? 'border-accent/45' : 'border-border/80'
        }`}
        style={{
          background: 'color-mix(in srgb, oklch(var(--card)) 92%, transparent)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Title bar — h-8, matching AppWindow exactly */}
        <div className="h-8 shrink-0 flex items-center px-3 gap-2 border-b border-border/70 bg-card select-none">
          {/* Maximize placeholder dot */}
          <div className="w-[18px] h-[18px] rounded flex items-center justify-center">
            <div className="w-[11px] h-[11px] rounded-sm bg-muted-foreground/20" />
          </div>
          {/* Title text — dimmed, non-interactive */}
          <span className="flex-1 text-[12px] font-mono tracking-wider text-muted-foreground/50 truncate text-center">
            {title}
          </span>
          {/* Close placeholder dot */}
          <div className="w-[18px] h-[18px] rounded flex items-center justify-center">
            <div className="w-[11px] h-[11px] rounded-sm bg-muted-foreground/20" />
          </div>
        </div>

        {/* Body — shimmer strip */}
        <div className="flex-1 relative bg-card/78 overflow-hidden">
          <ShimmerStrip />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ShimmerStrip — a single left-to-right shimmer sweep using a CSS animation.
// Uses only Tailwind tokens (no hardcoded colours) so it adapts to both
// dark and light themes automatically.
// ---------------------------------------------------------------------------
function ShimmerStrip() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, oklch(var(--muted-foreground) / 0.06) 40%, oklch(var(--muted-foreground) / 0.12) 50%, oklch(var(--muted-foreground) / 0.06) 60%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 2s ease-in-out infinite',
      }}
    />
  );
}

export default SkeletonWindow;

// ---------------------------------------------------------------------------
// CSS keyframes for the shimmer — injected once via a <style> tag so this
// component is self-contained and works without modifying global CSS.
// We use a module-level side-effect guard so the <style> is only appended
// once across all instances, even with React strict-mode double-invocation.
// ---------------------------------------------------------------------------
let _keyframesInjected = false;

if (typeof document !== 'undefined' && !_keyframesInjected) {
  _keyframesInjected = true;
  const style = document.createElement('style');
  style.dataset.hudsonSkeleton = 'shimmer';
  style.textContent = `
    @keyframes skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);
}
