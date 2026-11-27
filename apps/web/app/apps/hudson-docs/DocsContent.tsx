'use client';

import { useEffect, useRef, useState } from 'react';
import { useDocs } from './DocsProvider';
import { COMPONENTS, AGENT_DOCS } from './data';
import { Bot } from 'hudsonkit/icons';
import { ComponentSheet, AgentDocSheet, ListView, TilesView } from './components';

/** Latest mounted canvas instance; only it may report the frame size. */
let frameOwnerSeq = 0;

export function DocsContent() {
  const {
    viewMode, openSheets, selectedCard, setSelectedCard,
    searchValue, settings, sheetPositions, getSheetPos,
    handleSheetDragStart, isDraggingRef, toggleSheet, closeSheet,
    canvasScale, hubHidden, setCanvasFrame, setHubHeight,
  } = useDocs();

  // Measure the frame (only inside an app window: on the shell's own canvas
  // the shell zooms) and the hub card, so the auto-layout can fit them.
  const frameRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const isCanvas = viewMode === 'canvas';
  useEffect(() => {
    const frame = frameRef.current;
    if (!isCanvas || !frame) return;
    // Window membership is checked on every measure (the frame may not sit
    // inside its window yet on the first run). No clearing on cleanup: an old
    // window instance can unmount after its replacement has measured.
    // Re-tiling remounts the window; the outgoing instance can still report
    // its old (larger) frame after the new one has measured. The most
    // recently mounted canvas owns the measurement.
    const owner = ++frameOwnerSeq;
    const observer = new ResizeObserver(() => {
      if (owner !== frameOwnerSeq) return;
      setCanvasFrame(
        frame.closest('[data-app-window]') ? { width: frame.clientWidth, height: frame.clientHeight } : null,
      );
      if (hubRef.current) setHubHeight(hubRef.current.offsetHeight);
    });
    observer.observe(frame);
    if (hubRef.current) observer.observe(hubRef.current);
    return () => observer.disconnect();
  }, [isCanvas, setCanvasFrame, setHubHeight]);

  const isCanvasMode = viewMode === 'canvas';

  // Collect open agent doc IDs for canvas/tiles
  const openAgentDocs = AGENT_DOCS.filter(d => openSheets.has(`agent:${d.slug}`));

  return (
    <>
      {isCanvasMode && (
      <div ref={frameRef} className="absolute inset-0 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${canvasScale})`, transformOrigin: '50% 50%', transition: 'transform 320ms var(--hud-ease-spring, ease-out)' }}
      >
      {/* Canvas-only: hub card, floating sheets, connectors */}
      {isCanvasMode && (() => {
        const hubPos = getSheetPos('hub');
        const isHubSelected = selectedCard === 'hub';
        const g = settings.glowIntensity / 100;
        const hubShadow = isHubSelected && g > 0
          ? `0 0 40px color-mix(in srgb, oklch(var(--accent)) ${(0.3 * g * 100).toFixed(1)}%, transparent), 0 0 80px color-mix(in srgb, oklch(var(--accent)) ${(0.15 * g * 100).toFixed(1)}%, transparent), inset 0 1px 0 color-mix(in srgb, oklch(var(--accent)) ${(0.2 * g * 100).toFixed(1)}%, transparent)`
          : 'none';
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              // visibility, not display: its height must stay measurable.
              visibility: hubHidden ? 'hidden' : undefined,
              left: `calc(50% + ${hubPos.x}px)`,
              top: `calc(50% + ${hubPos.y}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              ref={hubRef}
              onMouseDown={(e) => handleSheetDragStart('hub', e)}
              onClick={() => { if (!isDraggingRef.current) setSelectedCard('hub'); }}
              style={{ boxShadow: hubShadow }}
              className={`w-[480px] p-6 border rounded-lg bg-card/78 backdrop-blur-sm pointer-events-auto cursor-grab active:cursor-grabbing transition-all ${
                isHubSelected ? 'border-accent/80' : 'border-border/70 hover:border-border'
              }`}
            >
              <h1 className="text-xl font-bold text-foreground mb-1 font-mono tracking-wider">HUDSON</h1>
              <p className="text-muted-foreground text-[11px] font-mono mb-5">
                Reference cards for the Hudson component library. Click to open.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                {COMPONENTS.map(c => {
                  const Icon = c.icon;
                  const isOpen = openSheets.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleSheet(c.id)}
                      className={`p-2.5 rounded border text-left transition-all cursor-pointer pointer-events-auto ${
                        isOpen
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-border/60 bg-background/55 hover:border-border hover:bg-accent/8'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Icon size={10} className={isOpen ? 'text-accent' : 'text-muted-foreground'} />
                        <span className={`font-bold tracking-wider text-[10px] ${isOpen ? 'text-accent' : 'text-foreground/86'}`}>{c.label}</span>
                      </div>
                      <div className="text-muted-foreground text-[9px] font-mono leading-tight mb-0.5">{c.ns}</div>
                      <div className="text-foreground/76 text-[10px] leading-tight">{c.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Guides section */}
              <div className="mt-5 pt-4 border-t border-border/60">
                <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Guides</div>
                <div className="space-y-1.5">
                  {AGENT_DOCS.map(doc => {
                    const sheetId = `agent:${doc.slug}`;
                    const isOpen = openSheets.has(sheetId);
                    return (
                      <button
                        key={doc.slug}
                        onClick={() => toggleSheet(sheetId)}
                        className={`w-full p-2 rounded border text-left transition-all cursor-pointer pointer-events-auto flex items-center gap-2 ${
                          isOpen
                            ? 'border-accent/50 bg-accent/5'
                            : 'border-border/60 bg-background/55 hover:border-border hover:bg-accent/8'
                        }`}
                      >
                        <Bot size={10} className={isOpen ? 'text-accent' : 'text-muted-foreground'} />
                        <div className="min-w-0">
                          <span className={`font-bold tracking-wider text-[10px] ${isOpen ? 'text-accent' : 'text-foreground/86'}`}>{doc.title}</span>
                          <div className="text-foreground/76 text-[10px] leading-tight">{doc.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating component doc sheets */}
      {isCanvasMode && COMPONENTS.filter(c => openSheets.has(c.id)).map(c => {
        const pos = getSheetPos(c.id);
        return (
          <div
            key={c.id}
            className="absolute pointer-events-none"
            style={{
              left: `calc(50% + ${pos.x}px)`,
              top: `calc(50% + ${pos.y}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <ComponentSheet
              entry={c}
              onClose={() => closeSheet(c.id)}
              isSelected={selectedCard === c.id}
              onSelect={() => { if (!isDraggingRef.current) setSelectedCard(c.id); }}
              onDragStart={(e) => handleSheetDragStart(c.id, e)}
              glowIntensity={settings.glowIntensity}
            />
          </div>
        );
      })}

      {/* Floating agent doc sheets */}
      {isCanvasMode && openAgentDocs.map(doc => {
        const sheetId = `agent:${doc.slug}`;
        const pos = getSheetPos(sheetId);
        return (
          <div
            key={sheetId}
            className="absolute pointer-events-none"
            style={{
              left: `calc(50% + ${pos.x}px)`,
              top: `calc(50% + ${pos.y}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <AgentDocSheet
              slug={doc.slug}
              onClose={() => closeSheet(sheetId)}
              isSelected={selectedCard === sheetId}
              onSelect={() => { if (!isDraggingRef.current) setSelectedCard(sheetId); }}
              onDragStart={(e) => handleSheetDragStart(sheetId, e)}
              glowIntensity={settings.glowIntensity}
            />
          </div>
        );
      })}

      {/* Connection lines from hub to open sheets */}
      {isCanvasMode && !hubHidden && <ConnectorLines />}
      </div>
      </div>
      )}

      {/* List view */}
      {viewMode === 'list' && <ListView components={COMPONENTS} searchValue={searchValue} selectedId={selectedCard} onSelect={setSelectedCard} />}

      {/* Tiles view */}
      {viewMode === 'tiles' && <TilesView components={COMPONENTS} openIds={openSheets} onClose={closeSheet} glowIntensity={settings.glowIntensity} selectedId={selectedCard} onSelect={setSelectedCard} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Connector lines sub-component (reads from context)
// ---------------------------------------------------------------------------
function ConnectorLines() {
  const { openSheets, selectedCard, settings, sheetPositions, getSheetPos } = useDocs();
  // Measures the DOM, so it only draws on the client.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-mount gate
  useEffect(() => setMounted(true), []);

  // Collect all open sheet IDs (both component and agent docs)
  const allOpenIds: string[] = [
    ...COMPONENTS.filter(c => openSheets.has(c.id)).map(c => c.id),
    ...AGENT_DOCS.filter(d => openSheets.has(`agent:${d.slug}`)).map(d => `agent:${d.slug}`),
  ];

  if (!mounted) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: -1 }}
    >
      {allOpenIds.map(id => {
        const pos = getSheetPos(id);
        const svgEl = document.querySelector('[data-hudson-world] svg');
        const svgW = svgEl?.clientWidth ?? window.innerWidth;
        const svgH = svgEl?.clientHeight ?? window.innerHeight;
        const halfVW = svgW / 2;
        const halfVH = svgH / 2;
        const hubPos = getSheetPos('hub');
        const hubCenter = { x: halfVW + hubPos.x, y: halfVH + hubPos.y };
        const sheetCenter = { x: halfVW + pos.x, y: halfVH + pos.y };

        const dx = sheetCenter.x - hubCenter.x;
        const dy = sheetCenter.y - hubCenter.y;
        const CARD_HW = 170;
        const HUB_HH = 130;
        const SHEET_HH = 200;

        let hubAnchor, sheetAnchor;
        if (dx === 0 && dy === 0) {
          hubAnchor = hubCenter;
          sheetAnchor = sheetCenter;
        } else if (Math.abs(dx) * HUB_HH > Math.abs(dy) * CARD_HW) {
          const dir = dx > 0 ? 1 : -1;
          hubAnchor = { x: hubCenter.x + dir * CARD_HW, y: hubCenter.y };
          sheetAnchor = { x: sheetCenter.x - dir * CARD_HW, y: sheetCenter.y };
        } else {
          const dir = dy > 0 ? 1 : -1;
          hubAnchor = { x: hubCenter.x, y: hubCenter.y + dir * HUB_HH };
          sheetAnchor = { x: sheetCenter.x, y: sheetCenter.y - dir * SHEET_HH };
        }

        const isSelected = selectedCard === id;
        const lineColor = isSelected ? 'oklch(var(--accent) / 0.34)' : 'oklch(var(--accent) / 0.16)';
        const dotColor = isSelected ? 'oklch(var(--accent) / 0.5)' : 'oklch(var(--accent) / 0.24)';
        const dash = { dashed: '4 4', solid: undefined, dotted: '2 2' }[settings.connectorStyle];
        return (
          <g key={id}>
            <line
              x1={hubAnchor.x} y1={hubAnchor.y}
              x2={sheetAnchor.x} y2={sheetAnchor.y}
              stroke={lineColor}
              strokeWidth={isSelected ? 1.5 : 1}
              strokeDasharray={dash}
            />
            <circle cx={hubAnchor.x} cy={hubAnchor.y} r={3} fill="oklch(var(--background))" stroke={dotColor} strokeWidth={1.5} />
            <circle cx={sheetAnchor.x} cy={sheetAnchor.y} r={3} fill="oklch(var(--background))" stroke={dotColor} strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}
