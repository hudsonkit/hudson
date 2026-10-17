/**
 * TalkieDrawMode — inline glyph path editor with sibling context.
 * The active glyph is fully editable; sibling glyphs are ghosted at 25% opacity.
 */

// @ts-nocheck
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { PathCommand } from '../types';
import type { EditableContour, SelectedPoint } from '../editor/types';
import { pathToContours, contoursToPath, contoursToSvgD } from '../lib/path-convert';
import { pathToSvgD } from '../lib/svg';
import { setPathOverride } from './glyphOps';
import type { WordGlyph } from './glyphOps';
import { BRAND } from './types';

type Point = [number, number];

interface TalkieDrawModeProps {
  char: string;
  path: PathCommand[];
  advanceWidth: number;
  /** All glyphs in the wordmark, for sibling context rendering */
  allGlyphs: WordGlyph[];
  onExit: () => void;
  onPathChange: (path: PathCommand[]) => void;
}

function hitTest(
  pos: Point,
  contours: EditableContour[],
  zoom: number,
): SelectedPoint | null {
  const threshold = 8 / zoom;
  for (let ci = 0; ci < contours.length; ci++) {
    const contour = contours[ci];
    for (let si = 0; si < contour.segments.length; si++) {
      const seg = contour.segments[si];
      for (const pt of ['p0', 'p3', 'c1', 'c2'] as const) {
        if (pt === 'p0' && si > 0) continue;
        const p = seg[pt];
        const dx = pos[0] - p[0];
        const dy = pos[1] - p[1];
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          return { contourIndex: ci, segmentIndex: si, pointType: pt };
        }
      }
    }
  }
  return null;
}

function getPointCoord(contours: EditableContour[], sel: SelectedPoint): Point {
  return contours[sel.contourIndex].segments[sel.segmentIndex][sel.pointType];
}

function setPointCoord(
  contours: EditableContour[],
  sel: SelectedPoint,
  pos: Point,
): EditableContour[] {
  return contours.map((c, ci) => {
    if (ci !== sel.contourIndex) return c;
    return {
      ...c,
      segments: c.segments.map((s, si) => {
        if (si !== sel.segmentIndex) return s;
        return { ...s, [sel.pointType]: pos };
      }),
    };
  });
}

export function TalkieDrawMode({
  char,
  path,
  advanceWidth,
  allGlyphs,
  onExit,
  onPathChange,
}: TalkieDrawModeProps) {
  const [contours, setContours] = useState<EditableContour[]>(() => pathToContours(path));
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const dragStartRef = useRef<{ original: Point; screenX: number; screenY: number } | null>(null);

  // Compute sibling context: all glyphs with x-offsets, frozen at mount time
  const siblingContext = useMemo(() => {
    let cursor = 0;
    const siblings: { char: string; d: string; startX: number; advance: number }[] = [];
    for (const g of allGlyphs) {
      if (g.char !== char) {
        const translated = g.path.map(cmd => {
          const c = { ...cmd } as any;
          if ('x' in c) c.x += cursor;
          if ('x1' in c) c.x1 += cursor;
          if ('x2' in c) c.x2 += cursor;
          return c;
        });
        siblings.push({ char: g.char, d: pathToSvgD(translated), startX: cursor, advance: g.advanceWidth });
      }
      cursor += g.advanceWidth;
    }
    return siblings;
  }, [allGlyphs, char]);

  // Active glyph's x-offset in the wordmark
  const activeGlyphOffset = useMemo(() => {
    let cursor = 0;
    for (const g of allGlyphs) {
      if (g.char === char) return cursor;
      cursor += g.advanceWidth;
    }
    return 0;
  }, [allGlyphs, char]);

  // Total wordmark width for viewport
  const totalAdvance = useMemo(
    () => allGlyphs.reduce((sum, g) => sum + g.advanceWidth, 0),
    [allGlyphs],
  );

  // Auto-fit to show full wordmark on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const height = 1320;
    const scaleX = rect.width / (totalAdvance * 1.3);
    const scaleY = rect.height / (height * 1.2);
    const fitZoom = Math.min(scaleX, scaleY, 2);
    setZoom(fitZoom);
    setPan([rect.width / 2, rect.height / 2]);
  }, [totalAdvance]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      } else if (e.key === ' ') {
        e.preventDefault();
        setSpaceHeld(e.type === 'keydown');
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedPoint) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        setContours(prev => {
          const coord = getPointCoord(prev, selectedPoint);
          const next = setPointCoord(prev, selectedPoint, [coord[0] + dx, coord[1] + dy]);
          const newPath = contoursToPath(next);
          setPathOverride(char, newPath);
          onPathChange(newPath);
          return next;
        });
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [selectedPoint, char, onExit, onPathChange]);

  // Center on wordmark center, not just the active glyph
  const centerY = -300 + 1320 / 2;
  const glyphOffset: Point = [totalAdvance * -0.5, -centerY];

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point => {
      const el = containerRef.current;
      if (!el) return [0, 0];
      const rect = el.getBoundingClientRect();
      const svgX = screenX - rect.left;
      const svgY = screenY - rect.top;
      const x1 = svgX - pan[0];
      const y1 = svgY - pan[1];
      const x2 = x1 / zoom;
      const y2 = y1 / -zoom;
      // Convert to active glyph's local space
      return [x2 - glyphOffset[0] - activeGlyphOffset, y2 - glyphOffset[1]];
    },
    [pan, zoom, glyphOffset, activeGlyphOffset],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.1, Math.min(50, z * factor)));
    } else {
      setPan(([px, py]) => [px - e.deltaX, py - e.deltaY]);
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (spaceHeld || e.button === 1) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, px: pan[0], py: pan[1] };
        e.preventDefault();
        return;
      }
      if (e.button === 0) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        const hit = hitTest(pos, contours, zoom);
        if (hit) {
          setSelectedPoint(hit);
          setIsDragging(true);
          const coord = getPointCoord(contours, hit);
          dragStartRef.current = { original: coord, screenX: e.clientX, screenY: e.clientY };
        } else {
          setSelectedPoint(null);
        }
        e.preventDefault();
      }
    },
    [spaceHeld, pan, contours, zoom, screenToCanvas],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan([panStartRef.current.px + dx, panStartRef.current.py + dy]);
        return;
      }
      if (isDragging && selectedPoint && dragStartRef.current) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        const snapped: Point = e.shiftKey
          ? [Math.round(pos[0] / 10) * 10, Math.round(pos[1] / 10) * 10]
          : pos;
        setContours(prev => setPointCoord(prev, selectedPoint, snapped));
      }
    },
    [isPanning, isDragging, selectedPoint, screenToCanvas],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      const newPath = contoursToPath(contours);
      setPathOverride(char, newPath);
      onPathChange(newPath);
    }
    setIsPanning(false);
    panStartRef.current = null;
  }, [isDragging, contours, char, onPathChange]);

  const d = useMemo(() => contoursToSvgD(contours), [contours]);

  const cursor = isPanning ? 'grabbing' : spaceHeld ? 'grab' : 'default';
  const anchorR = 5 / zoom;
  const anchorSelectedR = 8 / zoom;
  const controlR = 3.5 / zoom;
  const controlSelectedR = 6 / zoom;
  const handleStroke = 1 / zoom;

  return (
    <div className="h-full flex flex-col" style={{ background: BRAND.canvas }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="text-xs cursor-pointer flex items-center gap-1" style={{ color: BRAND.muted, fontFamily: BRAND.mono }}>
            <span>←</span><span>Back to wordmark</span>
          </button>
          <div className="w-px h-4" style={{ background: BRAND.border }} />
          <span className="text-sm font-medium" style={{ color: BRAND.ink, fontFamily: BRAND.mono }}>{char}</span>
          <span className="text-[10px]" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
            {contours.length} contour{contours.length !== 1 ? 's' : ''} · {contours.reduce((n, c) => n + c.segments.length, 0)} segments
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: BRAND.labelDim, fontFamily: BRAND.mono }}>
          <span>Esc to exit</span>
          <span>Space+drag to pan</span>
          <span>Arrow keys to nudge</span>
          <span>Shift for 10u steps</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg className="w-full h-full" style={{ position: 'absolute', inset: 0 }}>
          <g transform={`translate(${pan[0]}, ${pan[1]}) scale(${zoom}, ${-zoom}) translate(${glyphOffset[0]}, ${glyphOffset[1]})`}>

            {/* ── Ghosted siblings (25% opacity, no controls) ── */}
            {siblingContext.map(sib => (
              <path key={sib.char} d={sib.d} fill={BRAND.ink} fillOpacity={0.18} />
            ))}

            {/* ── Active glyph selection indicator ── */}
            <rect
              x={activeGlyphOffset - 4}
              y={-50}
              width={advanceWidth + 8}
              height={850}
              fill="none"
              stroke={BRAND.cassette}
              strokeWidth={1.5 / zoom}
              strokeOpacity={0.2}
              rx={4 / zoom}
            />

            {/* ── Metric guides for active glyph ── */}
            <g opacity={0.25}>
              <line x1={activeGlyphOffset - 20} y1={0} x2={activeGlyphOffset + advanceWidth + 20} y2={0} stroke={BRAND.tapeTan} strokeWidth={0.5 / zoom} />
              <line x1={activeGlyphOffset - 20} y1={550} x2={activeGlyphOffset + advanceWidth + 20} y2={550} stroke={BRAND.tapeTan} strokeWidth={0.5 / zoom} />
              <line x1={activeGlyphOffset} y1={-50} x2={activeGlyphOffset} y2={800} stroke={BRAND.tapeTan} strokeWidth={0.5 / zoom} strokeOpacity={0.5} />
              <line x1={activeGlyphOffset + advanceWidth} y1={-50} x2={activeGlyphOffset + advanceWidth} y2={800} stroke={BRAND.tapeTan} strokeWidth={0.5 / zoom} strokeOpacity={0.5} />
            </g>

            {/* ── Active glyph: path + editor controls, translated to its position ── */}
            <g transform={`translate(${activeGlyphOffset}, 0)`}>
              {/* Filled path */}
              <path d={d} fill={BRAND.ink} fillOpacity={0.12} />
              <path d={d} fill="none" stroke={BRAND.ink} strokeWidth={1.5 / zoom} strokeOpacity={0.7} />

              {/* Control handles and points */}
              {contours.map((contour, ci) =>
                contour.segments.map((seg, si) => {
                  const isP0Sel = selectedPoint?.contourIndex === ci && selectedPoint?.segmentIndex === si && selectedPoint?.pointType === 'p0';
                  const isP3Sel = selectedPoint?.contourIndex === ci && selectedPoint?.segmentIndex === si && selectedPoint?.pointType === 'p3';
                  const isC1Sel = selectedPoint?.contourIndex === ci && selectedPoint?.segmentIndex === si && selectedPoint?.pointType === 'c1';
                  const isC2Sel = selectedPoint?.contourIndex === ci && selectedPoint?.segmentIndex === si && selectedPoint?.pointType === 'c2';

                  return (
                    <g key={`${ci}-${si}`}>
                      <line x1={seg.p0[0]} y1={seg.p0[1]} x2={seg.c1[0]} y2={seg.c1[1]} stroke={BRAND.cassette} strokeWidth={handleStroke} opacity={0.45} />
                      <line x1={seg.p3[0]} y1={seg.p3[1]} x2={seg.c2[0]} y2={seg.c2[1]} stroke={BRAND.cassette} strokeWidth={handleStroke} opacity={0.45} />
                      <circle cx={seg.c1[0]} cy={seg.c1[1]} r={isC1Sel ? controlSelectedR : controlR} fill={isC1Sel ? BRAND.cassette : BRAND.tapeTan} />
                      <circle cx={seg.c2[0]} cy={seg.c2[1]} r={isC2Sel ? controlSelectedR : controlR} fill={isC2Sel ? BRAND.cassette : BRAND.tapeTan} />
                      {si === 0 && (
                        <rect x={seg.p0[0] - (isP0Sel ? anchorSelectedR : anchorR)} y={seg.p0[1] - (isP0Sel ? anchorSelectedR : anchorR)}
                          width={(isP0Sel ? anchorSelectedR : anchorR) * 2} height={(isP0Sel ? anchorSelectedR : anchorR) * 2}
                          fill={isP0Sel ? BRAND.cassette : BRAND.ink} />
                      )}
                      <rect x={seg.p3[0] - (isP3Sel ? anchorSelectedR : anchorR)} y={seg.p3[1] - (isP3Sel ? anchorSelectedR : anchorR)}
                        width={(isP3Sel ? anchorSelectedR : anchorR) * 2} height={(isP3Sel ? anchorSelectedR : anchorR) * 2}
                        fill={isP3Sel ? BRAND.cassette : BRAND.ink} />
                    </g>
                  );
                }),
              )}
            </g>
          </g>
        </svg>

        {/* Coordinate display */}
        {selectedPoint && (
          <div className="absolute bottom-3 left-3 text-[10px] px-2 py-1 rounded tabular-nums"
            style={{ background: BRAND.surface, color: BRAND.muted, fontFamily: BRAND.mono }}>
            {(() => {
              const coord = getPointCoord(contours, selectedPoint);
              return `${selectedPoint.pointType} x:${Math.round(coord[0])} y:${Math.round(coord[1])}`;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
