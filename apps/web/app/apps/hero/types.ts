export interface HeroFont {
  version: string;
  source: string;
  ingestedAt: string;
  metadata: FontMetadata;
  metrics: FontMetrics;
  glyphCount: number;
  glyphs: HeroGlyph[];
}

export interface FontMetadata {
  familyName: string | null;
  subfamilyName: string | null;
  fullName: string | null;
  postScriptName: string | null;
  version: string | null;
  copyright: string | null;
}

export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  descender: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HeroGlyph {
  index: number;
  name: string | null;
  unicode: number | null;
  unicodes: number[];
  character: string | null;
  advanceWidth: number;
  boundingBox: BoundingBox | null;
  path: PathCommand[];
  numberOfContours: number;
}

export interface LoadedFont {
  font: HeroFont;
  fileName: string;
}

export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | { type: "quadraticCurveTo"; x1: number; y1: number; x: number; y: number }
  | { type: "bezierCurveTo"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "closePath" };
