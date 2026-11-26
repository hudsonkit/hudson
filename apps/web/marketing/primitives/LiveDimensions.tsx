'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Engineering-drawing dimension lines around a live element. The numbers
 * are the element's real rendered size, re-measured on resize, so the
 * drawing annotates the product instead of decorating it.
 */
export function LiveDimensions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const w = box ? box.inlineSize : entry.contentRect.width;
      const h = box ? box.blockSize : entry.contentRect.height;
      setSize({ w: Math.round(w), h: Math.round(h) });
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
        <span className="dim__label">{size ? `${size.w} px` : ' '}</span>
      </div>
      <div className="dim__v" aria-hidden="true">
        <span className="dim__label">{size ? `${size.h} px` : ' '}</span>
      </div>
    </div>
  );
}
