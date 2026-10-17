import opentype from "opentype.js";
import type { HeroFont, HeroGlyph, PathCommand, BoundingBox } from "../types";

function convertCommands(commands: opentype.PathCommand[]): PathCommand[] {
  const result: PathCommand[] = [];
  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        result.push({ type: "moveTo", x: cmd.x, y: cmd.y });
        break;
      case "L":
        result.push({ type: "lineTo", x: cmd.x, y: cmd.y });
        break;
      case "Q":
        result.push({ type: "quadraticCurveTo", x1: cmd.x1, y1: cmd.y1, x: cmd.x, y: cmd.y });
        break;
      case "C":
        result.push({ type: "bezierCurveTo", x1: cmd.x1, y1: cmd.y1, x2: cmd.x2, y2: cmd.y2, x: cmd.x, y: cmd.y });
        break;
      case "Z":
        result.push({ type: "closePath" });
        break;
    }
  }
  return result;
}

function countContours(commands: opentype.PathCommand[]): number {
  let count = 0;
  for (const cmd of commands) {
    if (cmd.type === "M") count++;
  }
  return count;
}

function parseGlyph(glyph: opentype.Glyph, index: number): HeroGlyph {
  const rawCommands = glyph.path.commands;
  const bb = rawCommands.length > 0 ? glyph.getBoundingBox() : null;

  let boundingBox: BoundingBox | null = null;
  if (bb && isFinite(bb.x1) && isFinite(bb.y1) && isFinite(bb.x2) && isFinite(bb.y2)) {
    boundingBox = { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 };
  }

  return {
    index,
    name: glyph.name ?? null,
    unicode: glyph.unicode ?? null,
    unicodes: glyph.unicodes ?? [],
    character: glyph.unicode != null ? String.fromCodePoint(glyph.unicode) : null,
    advanceWidth: glyph.advanceWidth ?? 0,
    boundingBox,
    path: convertCommands(rawCommands),
    numberOfContours: countContours(rawCommands),
  };
}

/** Parse a TTF/OTF ArrayBuffer into a HeroFont object. */
export function parseFontBuffer(buffer: ArrayBuffer, source: string): HeroFont {
  const font = opentype.parse(buffer);

  const names = font.names;
  const metadata = {
    familyName: names.fontFamily?.en ?? null,
    subfamilyName: names.fontSubfamily?.en ?? null,
    fullName: names.fullName?.en ?? null,
    postScriptName: names.postScriptName?.en ?? null,
    version: names.version?.en ?? null,
    copyright: names.copyright?.en ?? null,
  };

  const metrics = {
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
  };

  const glyphs: HeroGlyph[] = [];
  for (let i = 0; i < font.glyphs.length; i++) {
    glyphs.push(parseGlyph(font.glyphs.get(i), i));
  }

  return {
    version: "0.1.0",
    source,
    ingestedAt: new Date().toISOString(),
    metadata,
    metrics,
    glyphCount: glyphs.length,
    glyphs,
  };
}
