import type { WindowBounds } from './WorkspaceShell';

/**
 * Viewport-aware window arrangement.
 *
 * Fit-all zooms the camera out until whatever is on the canvas fits, which on
 * a small frame makes every window unreadable. This does the opposite: it
 * sizes a grid of windows to the frame at a readable zoom.
 *
 *  1. Try every column count; for each, find the highest zoom at which all
 *     windows still get a usable minimum size. Keep the best.
 *  2. If that zoom is readable, grow the windows to fill their cells (capped,
 *     so big screens don't get giant windows) and center the grid.
 *  3. If no grid is readable (phones, many windows), use a focus layout: the
 *     first window fills the visible area, the rest stack below it.
 *
 * Pure: give it ids, viewport and insets; it returns window bounds in world
 * units plus the camera (scale + pan, in the shell's pan convention where
 * `{ x: -cx, y: -cy }` centers world point `(cx, cy)`).
 */

export interface ArrangeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ArrangeResult {
  bounds: Record<string, WindowBounds>;
  scale: number;
  pan: { x: number; y: number };
  layout: 'grid' | 'focus';
}

export const ARRANGE = {
  minW: 560,
  minH: 380,
  maxW: 980,
  maxH: 700,
  gap: 36,
  /** Below this zoom, text in windows stops being comfortably readable. */
  readableScale: 0.62,
  maxScale: 1,
  focusScale: 0.75,
  focusMinW: 360,
  /** Widest cell aspect (w/h) before a layout is penalized. */
  maxAspect: 2,
} as const;

export function arrangeInsets(viewport: { width: number; height: number }): ArrangeInsets {
  const narrow = viewport.width < 640;
  // Top: navigation bar. Bottom: status bar. Sides: collapsed-panel toggles.
  return { top: 60, bottom: 40, left: narrow ? 12 : 56, right: narrow ? 12 : 56 };
}

export function arrangeForViewport(
  ids: string[],
  viewport: { width: number; height: number },
  insets: ArrangeInsets = arrangeInsets(viewport),
): ArrangeResult | null {
  const n = ids.length;
  if (n === 0 || viewport.width <= 0 || viewport.height <= 0) return null;

  const { minW, minH, maxW, maxH, gap, readableScale, maxScale } = ARRANGE;
  const availW = Math.max(1, viewport.width - insets.left - insets.right);
  const availH = Math.max(1, viewport.height - insets.top - insets.bottom);

  // Screen offset of the available area's center from the viewport center.
  const offsetX = (insets.left - insets.right) / 2;
  const offsetY = (insets.top - insets.bottom) / 2;

  let best: { cols: number; rows: number; scale: number; score: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // Skip layouts that leave a whole empty row.
    if ((rows - 1) * cols >= n) continue;
    const scale = Math.min(
      maxScale,
      availW / (cols * minW + (cols - 1) * gap),
      availH / (rows * minH + (rows - 1) * gap),
    );
    // Apps read badly in thin strips: prefer cells no wider than ~2:1.
    const cellW = Math.min(maxW, (availW / scale - (cols - 1) * gap) / cols);
    const cellH = Math.min(maxH, (availH / scale - (rows - 1) * gap) / rows);
    const score = scale * (cellW / cellH > ARRANGE.maxAspect ? 0.65 : 1);
    const balance = Math.abs(cols - Math.sqrt(n));
    if (
      !best ||
      score > best.score + 0.001 ||
      (Math.abs(score - best.score) <= 0.001 && balance < Math.abs(best.cols - Math.sqrt(n)))
    ) {
      best = { cols, rows, scale, score };
    }
  }

  if (best && best.scale >= readableScale) {
    const { cols, rows, scale } = best;
    const cellW = Math.min(maxW, (availW / scale - (cols - 1) * gap) / cols);
    const cellH = Math.min(maxH, (availH / scale - (rows - 1) * gap) / rows);
    const totalW = cols * cellW + (cols - 1) * gap;
    const totalH = rows * cellH + (rows - 1) * gap;
    const bounds: Record<string, WindowBounds> = {};
    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Center a short last row.
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const rowW = inRow * cellW + (inRow - 1) * gap;
      const rowX = -rowW / 2;
      bounds[id] = {
        x: Math.round(inRow === cols ? -totalW / 2 + col * (cellW + gap) : rowX + col * (cellW + gap)),
        y: Math.round(-totalH / 2 + row * (cellH + gap)),
        w: Math.round(cellW),
        h: Math.round(cellH),
      };
    });
    return { bounds, scale, pan: { x: offsetX / scale, y: offsetY / scale }, layout: 'grid' };
  }

  // Focus layout: the first window fills the visible area; the rest stack below.
  const scale = Math.min(maxScale, Math.max(ARRANGE.focusScale, availW / maxW));
  const cellW = Math.round(Math.max(ARRANGE.focusMinW, availW / scale));
  const cellH = Math.round(Math.max(minH * 0.8, availH / scale));
  const bounds: Record<string, WindowBounds> = {};
  ids.forEach((id, i) => {
    bounds[id] = { x: Math.round(-cellW / 2), y: Math.round(-cellH / 2 + i * (cellH + gap)), w: cellW, h: cellH };
  });
  return { bounds, scale, pan: { x: offsetX / scale, y: offsetY / scale }, layout: 'focus' };
}
