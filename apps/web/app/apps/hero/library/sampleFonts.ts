import type { LibraryFontMeta } from "./types";

export interface SampleFontEntry {
  file: string;
  name: string;
  style: string;
  category: string;
}

export const SAMPLE_FONTS: SampleFontEntry[] = [
  { file: "Talkie-Medium.ttf", name: "Talkie", style: "Medium", category: "Mono" },
  { file: "Inter-Regular.ttf", name: "Inter", style: "Regular", category: "Sans" },
  { file: "GeistMono-Regular.ttf", name: "Geist Mono", style: "Regular", category: "Mono" },
  { file: "JetBrainsMono-Thin.ttf", name: "JetBrains Mono", style: "Thin", category: "Mono" },
  { file: "NotoSerifDisplay-Regular.ttf", name: "Noto Serif Display", style: "Regular", category: "Serif" },
  { file: "NotoSerifDisplay-Italic.ttf", name: "Noto Serif Display", style: "Italic", category: "Serif" },
  { file: "GeistPixel-Square.ttf", name: "Geist Pixel", style: "Square", category: "Pixel" },
  { file: "GeistPixel-Grid.ttf", name: "Geist Pixel", style: "Grid", category: "Pixel" },
  { file: "GeistPixel-Circle.ttf", name: "Geist Pixel", style: "Circle", category: "Pixel" },
  { file: "GeistPixel-Triangle.ttf", name: "Geist Pixel", style: "Triangle", category: "Pixel" },
  { file: "GeistPixel-Line.ttf", name: "Geist Pixel", style: "Line", category: "Pixel" },
];

export function sampleToMeta(sample: SampleFontEntry): LibraryFontMeta {
  return {
    id: `sample-${sample.file}`,
    source: "sample",
    fileName: sample.file,
    familyName: sample.name,
    subfamilyName: sample.style,
    glyphCount: 0,
    addedAt: new Date(0).toISOString(),
    fileSize: 0,
    sampleUrl: `/hero/fonts/${sample.file}`,
  };
}
