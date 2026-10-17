/**
 * TalkieControls — side panel with uniform per-glyph control groups.
 * Each glyph has: Width, Height, Stem width, Corner softness (standard)
 * plus glyph-specific controls in a collapsed sub-section.
 */

import { useState, useEffect, useCallback } from 'react';
import type { TalkieParams } from './types';
import { PRESETS, DEFAULT_PARAMS, BRAND } from './types';

// ── Editable numeric readout — type-able with clamp + Enter/blur commit ──
function EditableNumber({
  value, min, max, step = 1, unit, disabled, onChange,
}: {
  value: number; min: number; max: number; step?: number;
  unit: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);
  // Sync incoming value when not actively editing (e.g., reset clicked)
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      // Snap to step for integer-valued sliders; for float steps keep the typed
      // value as-is so users can land on precise non-step values if they want.
      const snapped = step >= 1 ? Math.round(clamped) : clamped;
      if (snapped !== value) onChange(snapped);
      setDraft(String(snapped));
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  };
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); e.currentTarget.blur(); }
        }}
        className="text-[11px] tabular-nums text-right bg-transparent border-0 outline-none focus:bg-foreground/10 focus:ring-1 focus:ring-amber-600/50 rounded px-1 -mx-1"
        style={{
          color: 'oklch(var(--foreground))', fontFamily: BRAND.mono,
          width: `${Math.max(2, String(max).length + (min < 0 ? 1 : 0))}ch`,
        }}
      />
      <span style={{ color: 'oklch(var(--muted-foreground))' }}>{unit}</span>
    </span>
  );
}

interface TalkieControlsProps {
  params: TalkieParams;
  onChange: (p: TalkieParams) => void;
  onResetAll?: () => void;
  onShare?: (includeOverrides: boolean) => void;
  shareStatus?: 'idle' | 'copied' | 'copied-slim';
}

// ── Slider ──

function Slider({
  label, value, min, max, step = 1, unit = 'u', disabled = false, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1" style={{ opacity: disabled ? 0.35 : 1 }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{label}</span>
        <EditableNumber value={value} min={min} max={max} step={step} unit={unit} disabled={disabled} onChange={onChange} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-amber-600"
        style={{ background: 'oklch(var(--muted))' }} />
    </label>
  );
}

// ── Toggle ──

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center gap-2 py-0.5 cursor-pointer">
      <div className="w-6 h-3.5 rounded-full transition-colors relative" style={{ background: value ? BRAND.cassette : 'oklch(var(--muted))' }}>
        <div className="w-2.5 h-2.5 rounded-full absolute top-0.5 transition-all" style={{ left: value ? 11 : 2, background: 'oklch(var(--foreground))' }} />
      </div>
      <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{label}</span>
    </button>
  );
}

// ── Section ──

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid oklch(var(--border))` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-2.5 px-4 cursor-pointer">
        <span className="text-[11px] uppercase tracking-[0.2em] font-medium" style={{ color: BRAND.cassette, fontFamily: BRAND.mono }}>{title}</span>
        <span className="text-[10px]" style={{ color: 'oklch(var(--muted-foreground))' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-4 pb-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// ── Sub-section (for glyph-specific controls) ──

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
        <span className="text-[9px]" style={{ color: 'oklch(var(--muted-foreground))' }}>{open ? '▾' : '▸'}</span>
        <span className="text-[9px] uppercase tracking-[0.14em]" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>{title}</span>
      </button>
      {open && <div className="pl-2 pt-1.5 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// ── Draw mode hint for disabled sliders ──

function DrawModeHint() {
  return (
    <span className="text-[9px] mt-0.5 block" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>
      edit in draw mode
    </span>
  );
}

// ── Glyph config: describes standard slider ranges per glyph ──

interface GlyphConfig {
  char: string;
  advanceKey: keyof TalkieParams;
  advanceRange: [number, number];
  offsetXKey: keyof TalkieParams;
  heightKey: keyof TalkieParams;
  heightRange: [number, number];
  heightLabel: string; // 'Ascender' or 'Height'
  stemWidthKey: keyof TalkieParams;
  stemWidthRange: [number, number];
  cornerKey: keyof TalkieParams;
  cornerRange: [number, number];
}

const OFFSET_RANGE: [number, number] = [-200, 200];

const GLYPH_CONFIGS: GlyphConfig[] = [
  { char: 't', advanceKey: 't_advance', advanceRange: [480, 700], offsetXKey: 't_offsetX', heightKey: 't_height', heightRange: [600, 720], heightLabel: 'Ascender', stemWidthKey: 't_stemWidth', stemWidthRange: [80, 140], cornerKey: 't_cornerSoftness', cornerRange: [0, 30] },
  { char: 'a', advanceKey: 'a_advance', advanceRange: [480, 700], offsetXKey: 'a_offsetX', heightKey: 'a_height', heightRange: [450, 600], heightLabel: 'Height', stemWidthKey: 'a_stemWidth', stemWidthRange: [80, 140], cornerKey: 'a_cornerSoftness', cornerRange: [0, 30] },
  { char: 'l', advanceKey: 'l_advance', advanceRange: [180, 600], offsetXKey: 'l_offsetX', heightKey: 'l_height', heightRange: [550, 730], heightLabel: 'Ascender', stemWidthKey: 'l_stemWidth', stemWidthRange: [90, 130], cornerKey: 'l_cornerSoftness', cornerRange: [0, 30] },
  { char: 'k', advanceKey: 'k_advance', advanceRange: [480, 700], offsetXKey: 'k_offsetX', heightKey: 'k_height', heightRange: [550, 730], heightLabel: 'Ascender', stemWidthKey: 'k_stemWidth', stemWidthRange: [80, 140], cornerKey: 'k_cornerSoftness', cornerRange: [0, 30] },
  { char: 'i', advanceKey: 'i_advance', advanceRange: [180, 340], offsetXKey: 'i_offsetX', heightKey: 'i_height', heightRange: [450, 720], heightLabel: 'Height', stemWidthKey: 'i_stemWidth', stemWidthRange: [60, 140], cornerKey: 'i_cornerSoftness', cornerRange: [0, 30] },
  { char: 'e', advanceKey: 'e_advance', advanceRange: [480, 700], offsetXKey: 'e_offsetX', heightKey: 'e_height', heightRange: [450, 600], heightLabel: 'Height', stemWidthKey: 'e_stemWidth', stemWidthRange: [80, 140], cornerKey: 'e_cornerSoftness', cornerRange: [0, 30] },
];

// ── Main Controls ──

export function TalkieControls({ params, onChange, onResetAll, onShare, shareStatus = 'idle' }: TalkieControlsProps) {
  const set = useCallback(
    <K extends keyof TalkieParams>(key: K, value: TalkieParams[K]) => {
      onChange({ ...params, [key]: value, preset: 'custom' });
    },
    [params, onChange],
  );

  const applyPreset = useCallback(
    (presetKey: string) => {
      const preset = PRESETS[presetKey];
      if (preset) onChange({ ...DEFAULT_PARAMS, ...preset });
    },
    [onChange],
  );

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'oklch(var(--background))' }}>
      {/* ── Globals ── */}
      <Section title="Preset">
        <div className="flex flex-wrap gap-1">
          {(['A', 'B', 'C', 'D'] as const).map((key) => (
            <button key={key} onClick={() => applyPreset(key)}
              className="px-3 py-1.5 rounded-md text-[11px] transition-colors cursor-pointer"
              style={{
                fontFamily: BRAND.mono,
                background: params.preset === key ? BRAND.cassette + '33' : 'oklch(var(--muted))',
                color: params.preset === key ? BRAND.cassette : 'oklch(var(--muted-foreground))',
                border: `1px solid ${params.preset === key ? BRAND.cassette + '55' : 'oklch(var(--border))'}`,
              }}>
              {key}
            </button>
          ))}
          <button onClick={() => onChange({ ...DEFAULT_PARAMS, preset: 'custom' })}
            className="px-3 py-1.5 rounded-md text-[11px] transition-colors cursor-pointer"
            style={{
              fontFamily: BRAND.mono,
              background: params.preset === 'custom' ? BRAND.cassette + '33' : 'oklch(var(--muted))',
              color: params.preset === 'custom' ? BRAND.cassette : 'oklch(var(--muted-foreground))',
              border: `1px solid ${params.preset === 'custom' ? BRAND.cassette + '55' : 'oklch(var(--border))'}`,
            }}>
            Custom
          </button>
        </div>
        <Slider label="Display scale" value={params.displayScale} min={0.5} max={2.0} step={0.05} unit="×" onChange={(v) => set('displayScale', v)} />
      </Section>

      {/* ── Mic dot ── */}
      <Section title="Mic dot" defaultOpen={false}>
        <Toggle label="Show dot" value={params.dotOverlay} onChange={(v) => set('dotOverlay', v)} />
        <Slider label="Size" value={params.dot_size} min={50} max={200} disabled={!params.dotOverlay} onChange={(v) => set('dot_size', v)} />
        <Slider label="Aspect" value={params.dot_aspect} min={0.4} max={2.0} step={0.05} unit="×" disabled={!params.dotOverlay} onChange={(v) => set('dot_aspect', v)} />
        <Slider label="Corner softness" value={params.dot_cornerSoftness} min={0} max={100} unit="%" disabled={!params.dotOverlay} onChange={(v) => set('dot_cornerSoftness', v)} />
        <Slider label="Offset X" value={params.dot_offsetX} min={-200} max={200} disabled={!params.dotOverlay} onChange={(v) => set('dot_offsetX', v)} />
        <Slider label="Offset Y" value={params.dot_offsetY} min={-100} max={200} disabled={!params.dotOverlay} onChange={(v) => set('dot_offsetY', v)} />
      </Section>

      {/* ── Corner Rounding (global) ── */}
      <Section title="Corner rounding" defaultOpen={false}>
        <Slider label="External (convex)" value={params.cornerSoftnessExternal} min={0} max={60} onChange={(v) => set('cornerSoftnessExternal', v)} />
        <Slider label="Internal (concave)" value={params.cornerSoftnessInternal} min={0} max={60} onChange={(v) => set('cornerSoftnessInternal', v)} />
      </Section>

      {/* ── Guides ── */}
      <Section title="Guides" defaultOpen={false}>
        <Toggle label="Horizontal metrics" value={params.guides_horizontal} onChange={(v) => set('guides_horizontal', v)} />
        <Toggle label="Glyph metrics" value={params.guides_glyphMetrics} onChange={(v) => set('guides_glyphMetrics', v)} />
        <Toggle label="Pair gaps" value={params.guides_pairGaps} onChange={(v) => set('guides_pairGaps', v)} />
      </Section>

      {/* ── Per-glyph groups ── */}
      {GLYPH_CONFIGS.map((cfg, idx) => {
        const isFirstThree = idx < 3;
        // Stem width: active for i, a, l-bar only
        const stemActive = cfg.char === 'i' || cfg.char === 'a' || (cfg.char === 'l' && !params.l_foot);
        // Corner softness: stays expressive across all glyphs
        const cornerActive = true;
        return (
          <Section key={cfg.char} title={cfg.char} defaultOpen={isFirstThree}>
            {/* Standard: Width, Offset X, Height, Stem width, Corner softness */}
            <Slider label="Width" value={params[cfg.advanceKey] as number} min={cfg.advanceRange[0]} max={cfg.advanceRange[1]} onChange={(v) => set(cfg.advanceKey, v)} />
            <Slider label="Offset X" value={params[cfg.offsetXKey] as number} min={OFFSET_RANGE[0]} max={OFFSET_RANGE[1]} onChange={(v) => set(cfg.offsetXKey, v)} />
            <Slider label={cfg.heightLabel} value={params[cfg.heightKey] as number} min={cfg.heightRange[0]} max={cfg.heightRange[1]} onChange={(v) => set(cfg.heightKey, v)} />
            <div>
              <Slider label="Stem width" value={params[cfg.stemWidthKey] as number} min={cfg.stemWidthRange[0]} max={cfg.stemWidthRange[1]} disabled={!stemActive} onChange={(v) => set(cfg.stemWidthKey, v)} />
              {!stemActive && <DrawModeHint />}
            </div>
            <div>
              <Slider label="Corner softness" value={params[cfg.cornerKey] as number} min={cfg.cornerRange[0]} max={cfg.cornerRange[1]} disabled={!cornerActive} onChange={(v) => set(cfg.cornerKey, v)} />
              {!cornerActive && <DrawModeHint />}
            </div>

            {/* Specifics — only for glyphs that have them */}
            {cfg.char === 't' && (
              <SubSection title="Specifics">
                <Slider label="Crossbar left" value={params.t_crossbarLeft} min={0} max={180} onChange={(v) => set('t_crossbarLeft', v)} />
                <Slider label="Crossbar right" value={params.t_crossbarRight} min={480} max={600} onChange={(v) => set('t_crossbarRight', v)} />
                <Slider label="Crossbar thickness" value={params.t_crossbarThickness} min={70} max={110} onChange={(v) => set('t_crossbarThickness', v)} />
                <Slider label="Hook tightness" value={params.t_hookTightness} min={50} max={110} unit="%" onChange={(v) => set('t_hookTightness', v)} />
              </SubSection>
            )}
            {cfg.char === 'l' && (
              <SubSection title="Specifics">
                <Toggle label="Foot (serifs)" value={params.l_foot} onChange={(v) => set('l_foot', v)} />
              </SubSection>
            )}
            {cfg.char === 'a' && (
              <SubSection title="Specifics">
                <Toggle label="Foot curl" value={params.a_footCurl} onChange={(v) => set('a_footCurl', v)} />
                <Slider label="Curl amount" value={params.a_footCurlAmount} min={0} max={30} disabled={!params.a_footCurl} onChange={(v) => set('a_footCurlAmount', v)} />
              </SubSection>
            )}
          </Section>
        );
      })}

      {/* ── Footer: metrics readout + reset ── */}
      <div className="px-4 py-3" style={{ borderTop: `1px solid oklch(var(--border))` }}>
        <div className="text-[9px] leading-relaxed mb-3" style={{ color: 'oklch(var(--muted-foreground))', fontFamily: BRAND.mono }}>
          {GLYPH_CONFIGS.map(cfg => (
            <div key={cfg.char}>
              {cfg.char}: {params[cfg.stemWidthKey] as number}u stem · {params[cfg.advanceKey] as number}u adv · {params[cfg.heightKey] as number}u
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {onResetAll && (
            <button
              onClick={onResetAll}
              className="text-[9px] uppercase tracking-[0.16em] py-1 px-2 rounded cursor-pointer transition-colors"
              style={{
                fontFamily: BRAND.mono,
                color: 'oklch(var(--muted-foreground))',
                background: 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'oklch(var(--foreground))'; e.currentTarget.style.background = 'oklch(var(--muted))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'oklch(var(--muted-foreground))'; e.currentTarget.style.background = 'transparent'; }}
            >
              Reset all
            </button>
          )}
          {onShare && (
            <button
              onClick={() => onShare(true)}
              className="text-[9px] uppercase tracking-[0.16em] py-1 px-2 rounded cursor-pointer transition-colors"
              style={{
                fontFamily: BRAND.mono,
                color: shareStatus !== 'idle' ? BRAND.cassette : 'oklch(var(--muted-foreground))',
                background: shareStatus !== 'idle' ? BRAND.cassette + '15' : 'transparent',
              }}
              onMouseEnter={(e) => { if (shareStatus === 'idle') { e.currentTarget.style.color = 'oklch(var(--foreground))'; e.currentTarget.style.background = 'oklch(var(--muted))'; } }}
              onMouseLeave={(e) => { if (shareStatus === 'idle') { e.currentTarget.style.color = 'oklch(var(--muted-foreground))'; e.currentTarget.style.background = 'transparent'; } }}
            >
              {shareStatus === 'copied' ? 'Copied' : shareStatus === 'copied-slim' ? 'Copied (slim)' : 'Copy link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
