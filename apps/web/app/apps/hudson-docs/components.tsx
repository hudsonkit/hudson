'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Move,
  LayoutList,
  LayoutGrid,
  Settings,
  RotateCcw,
  Bot,
  Copy,
  Check,
  ExternalLink,
} from 'hudsonkit/icons';
import type { HudsonIcon } from 'hudsonkit/icons';
import type { AgentDocEntry, ComponentEntry, ViewMode, HudsonSettings } from './types';
import { AGENT_DOCS } from './data';
import '@/app/docs/docs.css';

// ---------------------------------------------------------------------------
// Shared resize hook + handle
// ---------------------------------------------------------------------------
function useResize(defaults: { w: number; h: number }, min: { w: number; h: number }) {
  const [size, setSize] = useState(defaults);
  const resizingRef = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    // Read zoom from the world layer
    const worldEl = document.querySelector('[data-hudson-world]');
    const zoomEl = worldEl?.parentElement?.parentElement;
    const scale = zoomEl ? parseFloat((zoomEl as HTMLElement).style.zoom || '1') : 1;

    const onMove = (ev: MouseEvent) => {
      const dw = (ev.clientX - startX) / scale;
      const dh = (ev.clientY - startY) / scale;
      setSize({
        w: Math.max(min.w, startW + dw),
        h: Math.max(min.h, startH + dh),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => { resizingRef.current = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size.w, size.h, min.w, min.h]);

  return { size, onResizeStart, resizingRef };
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize pointer-events-auto z-10 group"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-0.5 right-0.5 text-muted-foreground/60 group-hover:text-foreground/70 transition-colors">
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component doc sheet (floating card in world space)
// ---------------------------------------------------------------------------
export function ComponentSheet({ entry, onClose, isSelected, onSelect, onDragStart, glowIntensity = 0 }: {
  entry: ComponentEntry;
  onClose: () => void;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  glowIntensity?: number;
}) {
  const { size, onResizeStart } = useResize({ w: 340, h: 420 }, { w: 260, h: 200 });
  const Icon = entry.icon;
  const g = glowIntensity / 100;
  const selectedShadow = `0 0 40px color-mix(in srgb, oklch(var(--accent)) ${(0.3*g*100).toFixed(1)}%, transparent), 0 0 80px color-mix(in srgb, oklch(var(--accent)) ${(0.15*g*100).toFixed(1)}%, transparent), inset 0 1px 0 color-mix(in srgb, oklch(var(--accent)) ${(0.2*g*100).toFixed(1)}%, transparent)`;
  return (
    <div
      onClick={onSelect}
      onMouseDown={onDragStart}
      style={{ boxShadow: isSelected && g > 0 ? selectedShadow : 'none', width: size.w, height: size.h }}
      className={`relative border rounded-lg bg-card/88 backdrop-blur-md overflow-hidden flex flex-col pointer-events-auto cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-accent/80'
          : 'border-border/70 hover:border-border'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 shrink-0 bg-card/92">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-accent" />
          <div>
            <span className="text-[13px] font-mono font-bold text-foreground tracking-wider">{entry.label}</span>
            <div className="text-[10px] font-mono text-muted-foreground">{entry.ns}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-accent/10 rounded transition-colors text-muted-foreground hover:text-foreground pointer-events-auto"
        >
          <X size={12} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto frame-scrollbar">
        {/* Overview */}
        <div className="px-4 py-3 border-b border-border/60">
          <div className="text-[11px] font-mono text-foreground/82 leading-relaxed">{entry.overview}</div>
        </div>

        {/* Props table */}
        <div className="px-4 py-3 border-b border-border/60">
          <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Props</div>
          <div className="space-y-2">
            {entry.props.map(p => (
              <div key={p.name}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono text-accent">{p.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{p.type}</span>
                </div>
                <div className="text-[10px] font-mono text-foreground/74 mt-0.5">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Usage */}
        <div className="px-4 py-3 border-b border-border/60">
          <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Usage</div>
          <pre className="text-[10px] font-mono text-foreground/82 bg-secondary/90 rounded px-3 py-2 overflow-x-auto whitespace-pre">{entry.usage}</pre>
        </div>

        {/* Notes */}
        {entry.notes && entry.notes.length > 0 && (
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Notes</div>
            <ul className="space-y-1">
              {entry.notes.map((n, i) => (
                <li key={i} className="text-[10px] font-mono text-foreground/74 flex items-start gap-1.5">
                  <span className="text-accent/60 mt-px">-</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ResizeHandle onMouseDown={onResizeStart} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent doc sheet (floating card in world space — fetches markdown content)
// ---------------------------------------------------------------------------
export function AgentDocSheet({ slug, onClose, isSelected, onSelect, onDragStart, glowIntensity = 0 }: {
  slug: string;
  onClose: () => void;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  glowIntensity?: number;
}) {
  const { size, onResizeStart } = useResize({ w: 340, h: 420 }, { w: 260, h: 200 });
  const entry = AGENT_DOCS.find(d => d.slug === slug);
  const [html, setHtml] = useState<string | null>(null);
  const [raw, setRaw] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets loading/content when the selected doc (slug dep) changes before re-fetching; a bounded reaction to a dep change, not a per-render cascade
    setLoading(true);
    setHtml(null);
    fetch(`/api/agent-docs/${slug}`)
      .then(r => r.json())
      .then(d => { setHtml(d.html); setRaw(d.raw); })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleCopy = useCallback(async () => {
    if (!raw) return;
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [raw]);

  const g = glowIntensity / 100;
  const selectedShadow = `0 0 40px color-mix(in srgb, oklch(var(--accent)) ${(0.3*g*100).toFixed(1)}%, transparent), 0 0 80px color-mix(in srgb, oklch(var(--accent)) ${(0.15*g*100).toFixed(1)}%, transparent), inset 0 1px 0 color-mix(in srgb, oklch(var(--accent)) ${(0.2*g*100).toFixed(1)}%, transparent)`;

  return (
    <div
      onClick={onSelect}
      onMouseDown={onDragStart}
      style={{ boxShadow: isSelected && g > 0 ? selectedShadow : 'none', width: size.w, height: size.h }}
      className={`relative border rounded-lg bg-card/88 backdrop-blur-md overflow-hidden flex flex-col pointer-events-auto cursor-grab active:cursor-grabbing ${
        isSelected
          ? 'border-accent/80'
          : 'border-border/70 hover:border-border'
      }`}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/70 shrink-0 bg-card/92">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot size={9} className="text-accent/50 shrink-0" />
          <span className="text-[8px] font-mono text-muted-foreground tracking-widest uppercase truncate">{entry?.title ?? slug}</span>
        </div>
        <div className="flex items-center gap-0 shrink-0">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-0.5 rounded transition-colors text-muted-foreground/70 hover:bg-accent/10 hover:text-foreground/80 pointer-events-auto"
            title="Open docs site"
          >
            <ExternalLink size={9} />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className={`p-0.5 rounded transition-colors ${
              copied ? 'text-accent' : 'text-muted-foreground/70 hover:bg-accent/10 hover:text-foreground/80'
            } pointer-events-auto`}
            title={copied ? 'Copied!' : 'Copy raw markdown'}
          >
            {copied ? <Check size={9} /> : <Copy size={9} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-0.5 hover:bg-accent/10 rounded transition-colors text-muted-foreground/70 hover:text-foreground/80 pointer-events-auto"
            title="Close"
          >
            <X size={9} />
          </button>
        </div>
      </div>

      {/* Metadata preamble — warm tint to distinguish from content */}
      <div className="px-2.5 py-1.5 border-b border-border/60 shrink-0 bg-secondary/70 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-px text-[8px] font-mono">
        <span className="text-muted-foreground">title</span>
        <span className="text-foreground/78 truncate">{entry?.title ?? slug}</span>
        <span className="text-muted-foreground">desc</span>
        <span className="text-foreground/78 truncate">{entry?.description ?? ''}</span>
        <span className="text-muted-foreground">source</span>
        <span className="text-foreground/62 truncate">{entry?.file ?? slug}</span>
      </div>

      <div className="flex-1 overflow-y-auto frame-scrollbar bg-background/55 px-3 py-2 [&>div>*:first-child]:!mt-0
        [&_.docs-prose]:!text-[10px] [&_.docs-prose]:!leading-[1.5]
        [&_.docs-prose_h2]:!text-[11px] [&_.docs-prose_h2]:!mt-3 [&_.docs-prose_h2]:!mb-1.5 [&_.docs-prose_h2]:!pb-1 [&_.docs-prose_h2]:!font-semibold
        [&_.docs-prose_h3]:!text-[10px] [&_.docs-prose_h3]:!mt-2.5 [&_.docs-prose_h3]:!mb-1 [&_.docs-prose_h3]:!font-semibold
        [&_.docs-prose_h4]:!text-[10px] [&_.docs-prose_h4]:!mt-2 [&_.docs-prose_h4]:!mb-1
        [&_.docs-prose_p]:!mb-2 [&_.docs-prose_p]:!text-[10px]
        [&_.docs-prose_li]:!text-[10px] [&_.docs-prose_li]:!mb-0.5
        [&_.docs-prose_ul]:!mb-2 [&_.docs-prose_ol]:!mb-2 [&_.docs-prose_ul]:!pl-3 [&_.docs-prose_ol]:!pl-3
        [&_.docs-prose_pre]:!text-[9px] [&_.docs-prose_pre]:!p-2 [&_.docs-prose_pre]:!mb-2 [&_.docs-prose_pre]:!rounded
        [&_.docs-prose_table]:!text-[9px] [&_.docs-prose_table]:!mb-2
        [&_.docs-prose_th]:!px-1.5 [&_.docs-prose_th]:!py-1 [&_.docs-prose_td]:!px-1.5 [&_.docs-prose_td]:!py-1
        [&_.docs-prose_code]:!text-[9px] [&_.docs-prose_code]:!px-1 [&_.docs-prose_code]:!py-0
        [&_.docs-prose_blockquote]:!mb-2 [&_.docs-prose_hr]:!my-3
        [&_.docs-prose_strong]:!font-medium
      ">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground font-mono text-[9px]">
              <div className="w-2.5 h-2.5 border border-accent/30 border-t-accent rounded-full animate-spin" />
              Loading
            </div>
          </div>
        ) : html ? (
          <div
            className="docs-prose font-sans"
            dangerouslySetInnerHTML={{ __html: html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, '') }}
          />
        ) : (
          <div className="text-muted-foreground font-mono text-[9px] text-center py-8">Document not found.</div>
        )}
      </div>

      <ResizeHandle onMouseDown={onResizeStart} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// View mode toggle (center slot in NavigationBar)
// ---------------------------------------------------------------------------
export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const modes: { value: ViewMode; label: string; icon: HudsonIcon }[] = [
    { value: 'canvas', label: 'Canvas', icon: Move },
    { value: 'list', label: 'List', icon: LayoutList },
    { value: 'tiles', label: 'Tiles', icon: LayoutGrid },
  ];
  return (
    <div className="flex bg-card/82 rounded border border-border overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
      {modes.map((m, i) => {
        const MIcon = m.icon;
        const active = value === m.value;
        return (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-colors ${
              active
                ? 'bg-accent/20 text-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/8'
            } ${i > 0 ? 'border-l border-border' : ''}`}
          >
            <MIcon size={12} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------
export function ListView({ components, searchValue, selectedId, onSelect }: {
  components: ComponentEntry[];
  searchValue: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    if (!searchValue) return components;
    const q = searchValue.toLowerCase();
    return components.filter(c => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.ns.toLowerCase().includes(q));
  }, [components, searchValue]);

  return (
    <div className="pt-16 pb-16 px-4">
      <div className="max-w-3xl mx-auto space-y-1">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground text-[12px] font-mono py-12">No components match &quot;{searchValue}&quot;</div>
        )}
        {filtered.map(c => {
          const Icon = c.icon;
          const isExpanded = expandedId === c.id;
          const isSelected = selectedId === c.id;
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`border rounded-lg transition-all cursor-pointer ${
                isSelected
                  ? 'border-accent/60 bg-card/88 backdrop-blur-md ring-1 ring-accent/20'
                  : isExpanded ? 'border-accent/30 bg-card/84 backdrop-blur-md' : 'border-border/60 bg-card/68 hover:border-border hover:bg-card/84'
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(c.id); setExpandedId(isExpanded ? null : c.id); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <Icon size={14} className={isSelected || isExpanded ? 'text-accent' : 'text-muted-foreground'} />
                <div className="flex-1 min-w-0">
                  <div>
                    <span className={`text-[13px] font-mono font-bold tracking-wider ${isSelected || isExpanded ? 'text-accent' : 'text-foreground'}`}>{c.label}</span>
                    <span className="text-[11px] font-mono text-foreground/70 ml-3">{c.desc}</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">{c.ns}</div>
                </div>
                {isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/60">
                  <div className="pt-3">
                    <div className="text-[11px] font-mono text-foreground/82 leading-relaxed">{c.overview}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Props</div>
                    <div className="space-y-2">
                      {c.props.map(p => (
                        <div key={p.name}>
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] font-mono text-accent">{p.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{p.type}</span>
                          </div>
                          <div className="text-[10px] font-mono text-foreground/74 mt-0.5">{p.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Usage</div>
                    <pre className="text-[10px] font-mono text-foreground/82 bg-secondary/90 rounded px-3 py-2 overflow-x-auto whitespace-pre">{c.usage}</pre>
                  </div>
                  {c.notes && c.notes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Notes</div>
                      <ul className="space-y-1">
                        {c.notes.map((n, i) => (
                          <li key={i} className="text-[10px] font-mono text-foreground/74 flex items-start gap-1.5">
                            <span className="text-accent/60 mt-px">-</span>
                            <span>{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiles view
// ---------------------------------------------------------------------------
export function TilesView({ components, openIds, onClose, glowIntensity, selectedId, onSelect }: {
  components: ComponentEntry[];
  openIds: Set<string>;
  onClose: (id: string) => void;
  glowIntensity: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const tiled = useMemo(() => components.filter(c => openIds.has(c.id)), [components, openIds]);
  const count = tiled.length;
  const g = glowIntensity / 100;

  const gridCols = count <= 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-1 md:grid-cols-2' : count <= 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  if (count === 0) {
    return (
      <div className="pt-16 pb-16 px-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <LayoutGrid size={24} className="text-muted-foreground mx-auto" />
          <div className="text-[12px] font-mono text-muted-foreground">No components tiled</div>
          <div className="text-[11px] font-mono text-muted-foreground">Open components from the left panel to tile them here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-16 pb-16 px-4">
      <div className={`max-w-7xl mx-auto grid ${gridCols} gap-3 auto-rows-min`}>
        {tiled.map(c => {
          const Icon = c.icon;
          const isSelected = selectedId === c.id;
          const tileShadow = isSelected
            ? `0 0 40px color-mix(in srgb, oklch(var(--accent)) ${(0.3*g*100).toFixed(1)}%, transparent), 0 0 80px color-mix(in srgb, oklch(var(--accent)) ${(0.15*g*100).toFixed(1)}%, transparent)`
            : 'none';
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{ boxShadow: g > 0 ? tileShadow : 'none' }}
              className={`border rounded-lg bg-card/88 backdrop-blur-md overflow-hidden flex flex-col cursor-pointer transition-all ${
                isSelected
                  ? 'border-accent/80 ring-1 ring-accent/20'
                  : 'border-border/70'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 shrink-0">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-accent" />
                  <div>
                    <span className="text-[13px] font-mono font-bold text-foreground tracking-wider">{c.label}</span>
                    <div className="text-[10px] font-mono text-muted-foreground">{c.ns}</div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(c.id); }}
                  className="p-1 hover:bg-accent/10 rounded transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="overflow-y-auto frame-scrollbar flex-1">
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[11px] font-mono text-foreground/82 leading-relaxed">{c.overview}</div>
                </div>
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Props</div>
                  <div className="space-y-2">
                    {c.props.map(p => (
                      <div key={p.name}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] font-mono text-accent">{p.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{p.type}</span>
                        </div>
                        <div className="text-[10px] font-mono text-foreground/74 mt-0.5">{p.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Usage</div>
                  <pre className="text-[10px] font-mono text-foreground/82 bg-secondary/90 rounded px-3 py-2 overflow-x-auto whitespace-pre">{c.usage}</pre>
                </div>
                {c.notes && c.notes.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-2">Notes</div>
                    <ul className="space-y-1">
                      {c.notes.map((n, i) => (
                        <li key={i} className="text-[10px] font-mono text-foreground/74 flex items-start gap-1.5">
                          <span className="text-accent/60 mt-px">-</span>
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings sub-components
// ---------------------------------------------------------------------------
export function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-border/70">
      <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-4">{label}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function SettingsSlider({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-[12px] font-mono text-foreground/84 w-[140px] shrink-0">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 appearance-none bg-muted rounded-full cursor-pointer accent-accent
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:shadow-[0_0_6px_oklch(var(--accent)_/_0.4)]"
      />
      <div className="text-[11px] font-mono text-foreground/84 w-[48px] text-right tabular-nums">{format(value)}</div>
    </div>
  );
}

export function SettingsToggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[12px] font-mono text-foreground/84">{label}</div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-accent' : 'bg-muted'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export function SettingsSegment<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-[12px] font-mono text-foreground/84 w-[140px] shrink-0">{label}</div>
      <div className="flex bg-card rounded border border-border overflow-hidden">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-[11px] font-mono transition-colors ${
              value === opt.value
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/8'
            } ${opt.value !== options[0].value ? 'border-l border-border' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App settings entry passed from WorkspaceShell
// ---------------------------------------------------------------------------
export interface AppSettingsEntry {
  appId: string;
  appName: string;
  config: import('hudsonkit').AppSettingsConfig;
  values: import('hudsonkit').AppSettingsValues;
  onUpdate: (patch: Partial<import('hudsonkit').AppSettingsValues>) => void;
}

export function SettingsText({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-[12px] font-mono text-foreground/84 w-[140px] shrink-0">{label}</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-card border border-border rounded px-2 py-1 text-[11px] font-mono text-foreground/84 focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  );
}

export function SettingsSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="text-[12px] font-mono text-foreground/84 w-[140px] shrink-0">{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-card border border-border rounded px-2 py-1.5 text-[11px] font-mono text-foreground/84 focus:border-accent/50 focus:outline-none transition-colors appearance-none cursor-pointer"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable font settings card — use at shell (global) or workspace level
// ---------------------------------------------------------------------------

const FONT_FAMILIES = [
  { value: 'system-ui', label: 'System UI' },
  { value: "'SF Pro', system-ui", label: 'SF Pro' },
  { value: "'SF Rounded', system-ui", label: 'SF Rounded' },
  { value: "'Inter', system-ui", label: 'Inter' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'Hack Nerd Font', monospace", label: 'Hack Nerd Font' },
  { value: "'SF Mono', monospace", label: 'SF Mono' },
  { value: "'IBM Plex Sans', system-ui", label: 'IBM Plex Sans' },
  { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono' },
];

export function FontSettingsCard({ fontSize, fontFamily, onChangeFontSize, onChangeFontFamily }: {
  fontSize: number;
  fontFamily: string;
  onChangeFontSize: (size: number) => void;
  onChangeFontFamily: (family: string) => void;
}) {
  return (
    <>
      <SettingsSlider
        label="Font Size"
        value={fontSize}
        min={10}
        max={20}
        step={1}
        format={v => `${v}px`}
        onChange={onChangeFontSize}
      />
      <SettingsSelect
        label="Font Family"
        value={fontFamily}
        options={FONT_FAMILIES}
        onChange={onChangeFontFamily}
      />
      {/* Live preview */}
      <div className="mt-1 px-3 py-2 rounded bg-card/70 border border-border/60">
        <div
          className="text-foreground/78 leading-relaxed"
          style={{ fontSize: `${fontSize}px`, fontFamily }}
        >
          The quick brown fox jumps over the lazy dog
        </div>
        <div
          className="text-muted-foreground mt-1"
          style={{ fontSize: `${Math.max(fontSize - 2, 9)}px`, fontFamily }}
        >
          0123456789 — ABCDEF abcdef
        </div>
      </div>
    </>
  );
}

export function SettingsPanel({ isOpen, onClose, settings, onUpdate, onReset }: {
  isOpen: boolean;
  onClose: () => void;
  settings: HudsonSettings;
  onUpdate: (patch: Partial<HudsonSettings>) => void;
  onReset: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-[2px] pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[90vw] bg-card border border-border shadow-2xl rounded-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-accent" />
            <span className="text-[13px] font-mono font-bold text-foreground tracking-wider">SETTINGS</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent/10 rounded transition-colors text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] frame-scrollbar">
          <SettingsSection label="Appearance">
            <SettingsSegment
              label="Theme"
              value={settings.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={v => onUpdate({ theme: v })}
            />
            <SettingsSegment
              label="Template"
              value={settings.template}
              options={[
                { value: 'hudson', label: 'Hudson' },
                { value: 'editorial', label: 'Editorial' },
                { value: 'drafting', label: 'Drafting' },
              ]}
              onChange={v => onUpdate({ template: v })}
            />
            <SettingsSlider
              label="Glow Intensity"
              value={settings.glowIntensity}
              min={0} max={100} step={1}
              format={v => `${v}%`}
              onChange={v => onUpdate({ glowIntensity: v })}
            />
            <SettingsSegment
              label="Connector Style"
              value={settings.connectorStyle}
              options={[
                { value: 'dashed', label: 'Dashed' },
                { value: 'solid', label: 'Solid' },
                { value: 'dotted', label: 'Dotted' },
              ]}
              onChange={v => onUpdate({ connectorStyle: v })}
            />
            <div className="rounded border border-border/60 bg-secondary/70 px-3 py-2 text-[10px] font-mono text-muted-foreground">
              Theme updates the workspace chrome immediately. Template swaps the token bundle that
              drives shell surfaces, accents, and radius.
            </div>
          </SettingsSection>
          <SettingsSection label="Navigation">
            <SettingsSlider
              label="Zoom Sensitivity"
              value={settings.zoomSensitivity ?? 1.0}
              min={0.5} max={3} step={0.1}
              format={v => `${(v ?? 1.0).toFixed(1)}x`}
              onChange={v => onUpdate({ zoomSensitivity: v })}
            />
          </SettingsSection>
          <SettingsSection label="Sound">
            <SettingsToggle label="Master Mute" checked={settings.masterMute} onChange={v => onUpdate({ masterMute: v })} />
            <SettingsToggle label="Click Sounds" checked={settings.uiClickSounds} onChange={v => onUpdate({ uiClickSounds: v })} />
            <SettingsToggle label="Transition Sounds" checked={settings.uiTransitionSounds} onChange={v => onUpdate({ uiTransitionSounds: v })} />
          </SettingsSection>
          <SettingsSection label="Shortcuts">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px] font-mono">
              {[
                ['Space + Drag', 'Pan canvas'],
                ['Cmd + Scroll', 'Zoom in / out'],
                ['Cmd + 0', 'Reset view'],
                ['Cmd + 1 / 2 / 3', 'Canvas / List / Tiles view'],
                ['Cmd + K', 'Command palette'],
                ['Cmd + ,', 'Settings'],
                ['Cmd + Shift + ,', 'Workspace Manager'],
                ['Cmd + [', 'Toggle left panel'],
                ['Cmd + ]', 'Toggle right panel'],
                ['Cmd + \\', 'Toggle crosshair guides'],
                ['Ctrl + `', 'Toggle terminal'],
                ['Cmd + M', 'Toggle mute'],
              ].map(([key, desc]) => (
                  <div key={key} className="contents">
                    <div className="text-accent/80 whitespace-nowrap">{key}</div>
                  <div className="text-foreground/76">{desc}</div>
                </div>
              ))}
            </div>
          </SettingsSection>
        </div>
        <div className="px-6 py-3 bg-card/95 backdrop-blur-sm border-t border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-foreground/76">Settings</span>
            <div className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[11px] text-foreground/82 font-mono">&#8984;,</div>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono text-foreground/82 hover:text-foreground hover:bg-accent/10 transition-colors"
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
}

export function ServiceActionButton({ label, variant = 'primary', onClick, loading = false }: {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  loading?: boolean;
}) {
  const colors = {
    primary: 'bg-accent/20 text-accent hover:bg-accent/30 border-accent/20',
    secondary: 'bg-card text-muted-foreground hover:bg-accent/10 border-border',
    danger: 'bg-destructive/20 text-destructive hover:bg-destructive/30 border-destructive/20',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1 text-[11px] font-mono font-medium rounded border transition-colors inline-flex items-center gap-1.5 ${colors[variant]} ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {loading && (
        <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
      )}
      {label}
    </button>
  );
}
