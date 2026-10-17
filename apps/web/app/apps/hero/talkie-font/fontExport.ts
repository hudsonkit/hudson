/**
 * TTF export for Talkie font variants using opentype.js in the browser.
 */

import opentype from 'opentype.js';
import type { PathCommand } from '../types';
import type { TransformedGlyph } from './variantSpec';

function buildPath(commands: PathCommand[]): opentype.Path {
  const path = new opentype.Path();
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'moveTo': path.moveTo(cmd.x, cmd.y); break;
      case 'lineTo': path.lineTo(cmd.x, cmd.y); break;
      case 'quadraticCurveTo': path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y); break;
      case 'bezierCurveTo': path.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y); break;
      case 'closePath': path.closePath(); break;
    }
  }
  return path;
}

export function exportTTF(
  glyphs: TransformedGlyph[],
  familyName: string,
  metrics: { unitsPerEm: number; ascender: number; descender: number },
): ArrayBuffer {
  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 600,
    path: new opentype.Path(),
  });

  const otGlyphs: opentype.Glyph[] = [notdefGlyph];

  for (const g of glyphs) {
    otGlyphs.push(
      new opentype.Glyph({
        name: g.name ?? `uni${g.unicode.toString(16).toUpperCase().padStart(4, '0')}`,
        unicode: g.unicode,
        advanceWidth: g.advanceWidth,
        path: buildPath(g.path),
      }),
    );
  }

  const font = new opentype.Font({
    familyName,
    styleName: 'Regular',
    unitsPerEm: metrics.unitsPerEm,
    ascender: metrics.ascender,
    descender: metrics.descender,
    glyphs: otGlyphs,
  });

  return font.toArrayBuffer();
}

/** Download an ArrayBuffer as a file in the browser. */
export function downloadBlob(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
