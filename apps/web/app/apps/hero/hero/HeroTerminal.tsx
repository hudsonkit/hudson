// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { useHeroApp } from './HeroAppContext';
import { useSession } from '../session/SessionProvider';
import { pathToSvgD } from '../lib/svg';

/**
 * HeroTerminal — fills Hudson's Terminal slot in the bottom drawer.
 * Shows font/session info, selected glyph SVG path, and font metadata.
 * Chat is handled by Hudson's native Assistant tab (Cmd+J).
 */
export function HeroTerminal() {
  const { activeFont, selectedGlyph, fonts, view } = useHeroApp();
  const { session, saveStatus } = useSession();

  return (
    <div className="h-full overflow-auto p-3 text-[10px]">
      {/* Info */}
      <InfoSection
        activeFont={activeFont}
        fonts={fonts}
        view={view}
        session={session}
        saveStatus={saveStatus}
        selectedGlyph={selectedGlyph}
      />

      {/* SVG Path */}
      {selectedGlyph && <PathSection glyph={selectedGlyph} />}

      {/* Metadata */}
      {activeFont && <MetadataSection font={activeFont} />}
    </div>
  );
}

function InfoSection({ activeFont, fonts, view, session, saveStatus, selectedGlyph }: any) {
  const lines: [string, string][] = [];

  if (activeFont) {
    lines.push(
      ['Font', activeFont.font.metadata.familyName ?? activeFont.fileName],
      ['Glyphs', String(activeFont.font.glyphCount)],
      ['UPM', String(activeFont.font.metrics.unitsPerEm)],
    );
  }

  lines.push(
    ['View', view],
    ['Fonts loaded', String(fonts.length)],
  );

  if (session) {
    lines.push(
      ['Session', session.name],
      ['Save status', saveStatus],
      ['Edits', String(Object.keys(session.glyphEdits).length)],
    );
  }

  if (selectedGlyph) {
    lines.push(
      ['Selected', selectedGlyph.character ?? selectedGlyph.name ?? `#${selectedGlyph.index}`],
      ['Contours', String(selectedGlyph.numberOfContours)],
      ['Path cmds', String(selectedGlyph.path.length)],
    );
  }

  return (
    <div className="font-mono text-muted-foreground space-y-0.5">
      {lines.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4">
          <span className="opacity-60">{k}</span>
          <span className="tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

function PathSection({ glyph }: { glyph: any }) {
  const [copied, setCopied] = useState(false);
  const svgD = useMemo(() => pathToSvgD(glyph.path), [glyph]);
  if (!svgD) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(svgD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-muted-foreground text-[10px] uppercase tracking-wider select-none">
        SVG Path — {glyph.character ?? glyph.name ?? `#${glyph.index}`} · {glyph.path.length} cmds
      </summary>
      <div className="mt-1.5">
        <div className="flex justify-end mb-1">
          <button
            onClick={handleCopy}
            className="px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer text-[10px]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="font-mono text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-all opacity-70">
          {svgD}
        </pre>
      </div>
    </details>
  );
}

function MetadataSection({ font }: { font: any }) {
  const { metadata, metrics } = font.font;

  const entries: [string, string | null][] = [
    ['familyName', metadata.familyName],
    ['subfamilyName', metadata.subfamilyName],
    ['fullName', metadata.fullName],
    ['postScriptName', metadata.postScriptName],
    ['version', metadata.version],
    ['copyright', metadata.copyright],
    ['unitsPerEm', String(metrics.unitsPerEm)],
    ['ascender', String(metrics.ascender)],
    ['descender', String(metrics.descender)],
  ];

  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-muted-foreground text-[10px] uppercase tracking-wider select-none">
        Metadata
      </summary>
      <pre className="mt-1.5 font-mono text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap opacity-70">
        {entries
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')}
      </pre>
    </details>
  );
}
