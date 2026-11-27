/**
 * Auto-layout for the Docs canvas: the hub card plus every open sheet, tiled
 * so nothing overlaps, and a scale that makes the whole group fit the frame.
 *
 * Positions are center points relative to the canvas center (the canvas
 * renders items at `calc(50% + x)` with `translate(-50%, -50%)`).
 */

export const HUB_W = 480;
export const SHEET_W = 340;
export const SHEET_H = 420;
const GAP = 32;
const PAD = 40;
const MIN_SCALE = 0.45;

export interface DocsLayout {
  positions: Record<string, { x: number; y: number }>;
  scale: number;
}

function arrange(ids: string[], hubH: number, vertical: boolean) {
  const n = ids.length;
  const positions: Record<string, { x: number; y: number }> = {};
  if (n === 0) {
    positions.hub = { x: 0, y: 0 };
    return { positions, w: HUB_W, h: hubH };
  }
  const cols = vertical ? Math.min(n, 2) : n <= 2 ? n : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gridW = cols * SHEET_W + (cols - 1) * GAP;
  const gridH = rows * SHEET_H + (rows - 1) * GAP;

  const totalW = vertical ? Math.max(HUB_W, gridW) : HUB_W + GAP * 1.5 + gridW;
  const totalH = vertical ? hubH + GAP * 1.5 + gridH : Math.max(hubH, gridH);

  positions.hub = vertical
    ? { x: 0, y: -totalH / 2 + hubH / 2 }
    : { x: -totalW / 2 + HUB_W / 2, y: 0 };
  const gridLeft = vertical ? -gridW / 2 : -totalW / 2 + HUB_W + GAP * 1.5;
  const gridTop = vertical ? -totalH / 2 + hubH + GAP * 1.5 : -gridH / 2;

  ids.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[id] = {
      x: Math.round(gridLeft + col * (SHEET_W + GAP) + SHEET_W / 2),
      y: Math.round(gridTop + row * (SHEET_H + GAP) + SHEET_H / 2),
    };
  });
  return { positions, w: totalW, h: totalH };
}

export function layoutDocsCanvas(
  ids: string[],
  frame: { width: number; height: number } | null,
  hubH: number,
): DocsLayout {
  const fit = (w: number, h: number) =>
    frame && frame.width > 0 && frame.height > 0
      ? Math.min(1, (frame.width - PAD) / w, (frame.height - PAD) / h)
      : 1;
  const across = arrange(ids, hubH, false);
  const stacked = arrange(ids, hubH, true);
  const acrossScale = fit(across.w, across.h);
  const stackedScale = fit(stacked.w, stacked.h);
  const best = stackedScale > acrossScale + 0.02 ? { ...stacked, scale: stackedScale } : { ...across, scale: acrossScale };
  return { positions: best.positions, scale: Math.max(MIN_SCALE, best.scale) };
}
