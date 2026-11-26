'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A single engineering-drawing width line under a live element. The number
 * is the element's real rendered width, re-measured on resize, so the
 * drawing annotates the product instead of decorating it.
 */
export function LiveDimensions({ children, label }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : entry.contentRect.width;
      setSize({ w: Math.round(w) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="dim">
      <div ref={ref} className="dim__subject">
        {children}
      </div>
      <div className="dim__h" aria-hidden="true">
        <span className="dim__label">{label ? `${label} — ` : ''}{size ? `${size.w} px` : ''}</span>
      </div>
    </div>
  );
}
