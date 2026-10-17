// @ts-nocheck
'use client';

import { Pencil as Edit3 } from 'hudsonkit/icons';
import { ParamSection } from 'hudsonkit/controls';
import { useHeroApp } from './HeroAppContext';
import { useSession } from '../session/SessionProvider';
import { pathToSvgD, glyphViewBox } from '../lib/svg';
import { GlyphStage } from '../components/GlyphStage';
import { TalkieInspector } from '../talkie/TalkieInspector';
import { TalkieControls } from '../talkie/TalkieControls';
import { BRAND as TALKIE_BRAND } from '../talkie/types';

export function HeroInspector() {
  const { activeFont, selectedGlyph, editingGlyph, handleEditGlyph, view, editorState, talkieDrawState, talkieControlsBridge } = useHeroApp();
  const { session, saveStatus } = useSession();

  // Talkie draw mode: show focused-letter controls (brand-themed, untouched)
  if (view === 'talkie' && talkieDrawState) {
    return <TalkieInspector drawState={talkieDrawState} />;
  }

  // Talkie overview: render the Wordmark Studio controls in the Inspector
  // slot (consolidates what used to be a duplicate in-content sidebar).
  if (view === 'talkie') {
    if (!talkieControlsBridge) {
      return (
        <div className="p-4 text-[10px] font-mono" style={{ color: TALKIE_BRAND.labelDim }}>
          Loading Wordmark Studio…
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col" style={{ background: TALKIE_BRAND.canvas }}>
        <div
          className="px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${TALKIE_BRAND.border}` }}
        >
          <span
            className="text-[11px] uppercase tracking-[0.2em]"
            style={{ color: TALKIE_BRAND.muted, fontFamily: TALKIE_BRAND.mono }}
          >
            Wordmark Studio
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <TalkieControls
            params={talkieControlsBridge.params}
            onChange={talkieControlsBridge.onChange}
            onResetAll={talkieControlsBridge.onResetAll}
            onShare={talkieControlsBridge.onShare}
            shareStatus={talkieControlsBridge.shareStatus}
          />
        </div>
      </div>
    );
  }

  // Font Studio
  if (view === 'talkie-font') {
    return (
      <div className="p-4 text-[10px] text-muted-foreground font-mono">
        <div className="text-foreground/60 mb-2 uppercase tracking-wider text-[9px]">Font Studio</div>
        <div>Select a variant tab to preview and tune</div>
      </div>
    );
  }

  if (!activeFont) {
    return (
      <div className="p-4 text-[10px] text-muted-foreground">
        No font loaded
      </div>
    );
  }

  const { font } = activeFont;

  // ── Editor mode ──
  if (view === 'editor' && editorState && editingGlyph) {
    const glyph = editingGlyph;
    const label = glyph.character ?? glyph.name ?? `#${glyph.index}`;
    const unicode =
      glyph.unicode != null
        ? `U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}`
        : 'N/A';

    const totalSegments = editorState.contours.reduce((n, c) => n + c.segments.length, 0);

    let selectedInfo: { x: number; y: number; type: string } | null = null;
    if (editorState.selectedPoint) {
      const sp = editorState.selectedPoint;
      const seg = editorState.contours[sp.contourIndex]?.segments[sp.segmentIndex];
      if (seg) {
        const pt = seg[sp.pointType];
        selectedInfo = {
          x: Math.round(pt[0] * 100) / 100,
          y: Math.round(pt[1] * 100) / 100,
          type:
            sp.pointType === 'c1' || sp.pointType === 'c2'
              ? 'Control'
              : editorState.smoothStates[`${sp.contourIndex}-${sp.segmentIndex}-${sp.pointType}`]
                ? 'Smooth'
                : 'Corner',
        };
      }
    }

    return (
      <div className="flex flex-col text-[10px] px-3 py-1">
        <ParamSection label="Glyph" defaultExpanded>
          <div className="space-y-1">
            <Row label="Character" value={label} />
            <Row label="Unicode" value={unicode} />
            <Row label="Name" value={glyph.name ?? '—'} />
            <Row label="Index" value={String(glyph.index)} mono />
          </div>
        </ParamSection>

        <ParamSection label="Metrics" defaultExpanded>
          <div className="space-y-1">
            <Row label="Advance W" value={String(glyph.advanceWidth)} mono />
            <Row label="UPM" value={String(font.metrics.unitsPerEm)} mono />
            <Row label="Ascender" value={String(font.metrics.ascender)} mono />
            <Row label="Descender" value={String(font.metrics.descender)} mono />
          </div>
        </ParamSection>

        <ParamSection label="Contours" defaultExpanded>
          <div className="space-y-1">
            <Row label="Count" value={String(editorState.contours.length)} mono />
            <Row label="Segments" value={String(totalSegments)} mono />
            {editorState.contours.map((c, i) => (
              <Row key={i} label={`#${i + 1}`} value={`${c.segments.length} seg${c.closed ? ' (closed)' : ''}`} mono />
            ))}
          </div>
        </ParamSection>

        {selectedInfo && (
          <ParamSection label="Selected Point" defaultExpanded>
            <div className="space-y-1">
              <Row label="X" value={String(selectedInfo.x)} mono />
              <Row label="Y" value={String(selectedInfo.y)} mono />
              <Row label="Type" value={selectedInfo.type} />
            </div>
          </ParamSection>
        )}

        <ParamSection label="Legend" defaultExpanded={false}>
          <div className="space-y-1.5">
            <Legend color="#ef4444" label="Corner point" />
            <Legend color="#22c55e" label="Smooth point" />
            <Legend color="#3b82f6" label="Control point" />
            <Legend color="#eab308" label="Selected" />
            <Legend color="var(--color-baseline)" label="Baseline" />
            <Legend color="var(--color-ascender)" label="Ascender" />
            <Legend color="var(--color-descender)" label="Descender" />
          </div>
        </ParamSection>
      </div>
    );
  }

  // ── Grid / Compare mode ──
  const glyph = selectedGlyph;

  return (
    <div className="flex flex-col text-[10px] px-3 py-1">
      {glyph && (
        <ParamSection label="Selected Glyph" defaultExpanded>
          <div className="space-y-2">
            <div className="-mx-3 border-y border-border bg-background py-2">
              <GlyphStage glyph={glyph} font={font} />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-foreground truncate">{glyph.name ?? 'unnamed'}</span>
              <span className="text-muted-foreground font-mono">
                {glyph.unicode != null
                  ? `U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}`
                  : '—'}
              </span>
            </div>

            <div className="space-y-1">
              <Row label="Index" value={String(glyph.index)} />
              <Row label="Advance" value={String(glyph.advanceWidth)} mono />
              <Row label="Contours" value={String(glyph.numberOfContours)} mono />
              <Row label="Commands" value={String(glyph.path.length)} mono />
              {glyph.boundingBox && (
                <>
                  <Row label="Origin" value={`${glyph.boundingBox.x1}, ${glyph.boundingBox.y1}`} mono />
                  <Row label="Size" value={`${glyph.boundingBox.x2 - glyph.boundingBox.x1} × ${glyph.boundingBox.y2 - glyph.boundingBox.y1}`} mono />
                </>
              )}
            </div>

            {view !== 'editor' && (
              <button
                onClick={() => handleEditGlyph(glyph)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <Edit3 size={10} />
                Edit outline
              </button>
            )}
          </div>
        </ParamSection>
      )}

      <ParamSection label="Font" defaultExpanded>
        <div className="space-y-1">
          <Row label="Family" value={font.metadata.familyName ?? '—'} />
          <Row label="Style" value={font.metadata.subfamilyName ?? '—'} />
          <Row label="PostScript" value={font.metadata.postScriptName ?? '—'} />
          <Row label="Version" value={font.metadata.version ?? '—'} />
          {font.metadata.copyright && (
            <Row label="Copyright" value={font.metadata.copyright} />
          )}
        </div>
      </ParamSection>

      <ParamSection label="Metrics" defaultExpanded>
        <div className="space-y-1">
          <Row label="Glyphs" value={String(font.glyphCount)} mono />
          <Row label="UPM" value={String(font.metrics.unitsPerEm)} mono />
          <Row label="Ascender" value={String(font.metrics.ascender)} mono />
          <Row label="Descender" value={String(font.metrics.descender)} mono />
        </div>
      </ParamSection>

      {session && (
        <ParamSection label="Session" defaultExpanded>
          <div className="space-y-1">
            <Row label="Name" value={session.name} />
            <Row label="Version" value={session.version} />
            <Row
              label="Status"
              value={saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved'}
              color={saveStatus === 'saved' ? 'text-green-400' : saveStatus === 'saving' ? 'text-info' : undefined}
            />
          </div>
        </ParamSection>
      )}
    </div>
  );
}

// ── Sub-components ──

function GlyphPreview({ glyph, metrics }: {
  glyph: { path: any[]; boundingBox: any; advanceWidth: number; index: number };
  metrics: { unitsPerEm: number; ascender: number; descender: number };
}) {
  const d = pathToSvgD(glyph.path);
  const [vx, vy, vw, vh] = glyphViewBox(glyph as any, metrics);
  const pad = metrics.unitsPerEm * 0.08;

  return (
    <div className="w-10 h-10 rounded bg-muted/30 border border-border flex items-center justify-center shrink-0">
      <svg viewBox={`${vx - pad} ${vy - pad} ${vw + pad * 2} ${vh + pad * 2}`} className="w-7 h-7">
        <g transform="scale(1,-1)">
          <path d={d} fill="currentColor" className="text-muted-foreground" />
        </g>
      </svg>
    </div>
  );
}

function Row({ label, value, mono, color }: {
  label: string; value: string; mono?: boolean; color?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`truncate text-right ${color ?? 'text-foreground/80'} ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
