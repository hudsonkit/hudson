/**
 * Font loading: parse a TTF into a map of glyph paths for a given charset.
 */

import type { PathCommand } from '../types';
import opentype from 'opentype.js';

export interface StockGlyph {
  char: string;
  unicode: number;
  name: string | null;
  path: PathCommand[];
  advanceWidth: number;
}

export interface LoadedFontData {
  glyphs: Map<string, StockGlyph>;
  metrics: { unitsPerEm: number; ascender: number; descender: number };
  familyName: string;
}

// The printable ASCII charset we support (a-z, A-Z, 0-9, common punctuation + space)
export const FULL_CHARSET =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';

function convertCommands(commands: opentype.PathCommand[]): PathCommand[] {
  const result: PathCommand[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': result.push({ type: 'moveTo', x: cmd.x, y: cmd.y }); break;
      case 'L': result.push({ type: 'lineTo', x: cmd.x, y: cmd.y }); break;
      case 'Q': result.push({ type: 'quadraticCurveTo', x1: cmd.x1, y1: cmd.y1, x: cmd.x, y: cmd.y }); break;
      case 'C': result.push({ type: 'bezierCurveTo', x1: cmd.x1, y1: cmd.y1, x2: cmd.x2!, y2: cmd.y2!, x: cmd.x, y: cmd.y }); break;
      case 'Z': result.push({ type: 'closePath' }); break;
    }
  }
  return result;
}

/** Load a TTF from a URL and parse all glyphs in the given charset. */
export async function loadFont(url: string, charset: string = FULL_CHARSET): Promise<LoadedFontData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return parseFontBuffer(buffer, charset);
}

/** Parse a TTF ArrayBuffer into StockGlyph map for the given charset. */
export function parseFontBuffer(buffer: ArrayBuffer, charset: string = FULL_CHARSET): LoadedFontData {
  const font = opentype.parse(buffer);
  const glyphs = new Map<string, StockGlyph>();

  for (const ch of charset) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.unicode === undefined) continue;
    glyphs.set(ch, {
      char: ch,
      unicode: glyph.unicode ?? ch.charCodeAt(0),
      name: glyph.name ?? null,
      path: convertCommands(glyph.path.commands),
      advanceWidth: glyph.advanceWidth ?? 600,
    });
  }

  return {
    glyphs,
    metrics: {
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
    },
    familyName: font.names.fontFamily?.en ?? 'Unknown',
  };
}
