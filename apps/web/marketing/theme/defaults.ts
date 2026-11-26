export const STUDIO_COOKIE = 'hudson-studio-console-v2';

export type FontOption = { id: string; label: string; cssValue: string };

export type PaletteOption = {
  id: string;
  label: string;
  swatch: string;
  vars: Record<string, string>;
};

export const DISPLAY_FONTS: readonly FontOption[] = [
  { id: 'newsreader', label: 'Newsreader', cssValue: 'var(--font-newsreader), Times New Roman, serif' },
  { id: 'bodoni-moda', label: 'Bodoni Moda', cssValue: 'var(--font-bodoni-moda), Times New Roman, serif' },
  { id: 'spectral', label: 'Spectral', cssValue: 'var(--font-spectral), Times New Roman, serif' },
  { id: 'cormorant', label: 'Cormorant', cssValue: 'var(--font-cormorant), Times New Roman, serif' },
] as const;

export const BODY_FONTS: readonly FontOption[] = [
  { id: 'space-grotesk', label: 'Space Grotesk', cssValue: 'var(--font-space-grotesk), system-ui, sans-serif' },
  { id: 'plex-sans', label: 'IBM Plex', cssValue: 'var(--font-plex-sans), system-ui, sans-serif' },
  { id: 'geist', label: 'Geist', cssValue: 'var(--font-geist), system-ui, sans-serif' },
] as const;

export const MONO_FONTS: readonly FontOption[] = [
  { id: 'jetbrains', label: 'JetBrains', cssValue: 'var(--font-jetbrains-mono), ui-monospace, monospace' },
  { id: 'plex-mono', label: 'Plex Mono', cssValue: 'var(--font-plex-mono), ui-monospace, monospace' },
  { id: 'geist-mono', label: 'Geist', cssValue: 'var(--font-geist-mono), ui-monospace, monospace' },
] as const;

export const ACCENTS: readonly PaletteOption[] = [
  {
    id: 'azure',
    label: 'Azure',
    swatch: 'oklch(0.72 0.12 215)',
    vars: {
      '--accent': 'oklch(0.72 0.12 215)',
      '--accent-deep': 'oklch(0.58 0.12 220)',
      '--accent-soft': 'oklch(0.72 0.12 215 / 0.12)',
      '--accent-line': 'oklch(0.72 0.12 215 / 0.45)',
    },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    swatch: 'oklch(0.62 0.16 162)',
    vars: {
      '--accent': 'oklch(0.62 0.16 162)',
      '--accent-deep': 'oklch(0.50 0.16 162)',
      '--accent-soft': 'oklch(0.62 0.16 162 / 0.10)',
      '--accent-line': 'oklch(0.62 0.16 162 / 0.45)',
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    swatch: 'oklch(0.76 0.13 64)',
    vars: {
      '--accent': 'oklch(0.76 0.13 64)',
      '--accent-deep': 'oklch(0.62 0.13 56)',
      '--accent-soft': 'oklch(0.76 0.13 64 / 0.12)',
      '--accent-line': 'oklch(0.76 0.13 64 / 0.40)',
    },
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    swatch: 'oklch(0.58 0.19 250)',
    vars: {
      '--accent': 'oklch(0.58 0.19 250)',
      '--accent-deep': 'oklch(0.46 0.19 250)',
      '--accent-soft': 'oklch(0.58 0.19 250 / 0.12)',
      '--accent-line': 'oklch(0.58 0.19 250 / 0.45)',
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: 'oklch(0.62 0.20 18)',
    vars: {
      '--accent': 'oklch(0.62 0.20 18)',
      '--accent-deep': 'oklch(0.50 0.20 18)',
      '--accent-soft': 'oklch(0.62 0.20 18 / 0.12)',
      '--accent-line': 'oklch(0.62 0.20 18 / 0.45)',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    swatch: 'oklch(0.40 0.01 240)',
    vars: {
      '--accent': 'oklch(0.40 0.01 240)',
      '--accent-deep': 'oklch(0.28 0.01 240)',
      '--accent-soft': 'oklch(0.40 0.01 240 / 0.10)',
      '--accent-line': 'oklch(0.40 0.01 240 / 0.45)',
    },
  },
] as const;

export const PAPERS: readonly PaletteOption[] = [
  {
    id: 'linen',
    label: 'Linen',
    swatch: 'oklch(0.95 0.012 70)',
    vars: {
      '--paper': 'oklch(0.95 0.012 70)',
      '--paper-2': 'oklch(0.92 0.014 70)',
      '--paper-3': 'oklch(0.88 0.016 70)',
      '--paper-edge': 'oklch(0.82 0.018 70)',
      '--ink': 'oklch(0.22 0.014 60)',
      '--ink-1': 'oklch(0.34 0.012 60)',
      '--ink-2': 'oklch(0.52 0.010 60)',
      '--ink-3': 'oklch(0.66 0.008 60)',
      '--ink-faint': 'oklch(0.78 0.006 60)',
      '--line': 'oklch(0.78 0.010 60)',
      '--line-strong': 'oklch(0.56 0.014 60)',
      '--line-grid': 'oklch(0.86 0.010 60)',
    },
  },
  {
    id: 'cream',
    label: 'Cream',
    swatch: 'oklch(0.97 0.012 85)',
    vars: {
      '--paper': 'oklch(0.97 0.012 85)',
      '--paper-2': 'oklch(0.94 0.014 85)',
      '--paper-3': 'oklch(0.90 0.016 85)',
      '--paper-edge': 'oklch(0.85 0.018 85)',
      '--ink': 'oklch(0.20 0.02 60)',
      '--ink-1': 'oklch(0.32 0.02 60)',
      '--ink-2': 'oklch(0.52 0.015 60)',
      '--ink-3': 'oklch(0.68 0.012 60)',
      '--ink-faint': 'oklch(0.80 0.010 60)',
      '--line': 'oklch(0.80 0.015 60)',
      '--line-strong': 'oklch(0.58 0.02 60)',
      '--line-grid': 'oklch(0.88 0.012 60)',
    },
  },
  {
    id: 'bone',
    label: 'Bone',
    swatch: 'oklch(0.96 0.002 80)',
    vars: {
      '--paper': 'oklch(0.96 0.002 80)',
      '--paper-2': 'oklch(0.93 0.003 80)',
      '--paper-3': 'oklch(0.89 0.004 80)',
      '--paper-edge': 'oklch(0.84 0.005 80)',
      '--ink': 'oklch(0.18 0.005 80)',
      '--ink-1': 'oklch(0.30 0.005 80)',
      '--ink-2': 'oklch(0.50 0.004 80)',
      '--ink-3': 'oklch(0.66 0.003 80)',
      '--ink-faint': 'oklch(0.78 0.002 80)',
      '--line': 'oklch(0.78 0.005 80)',
      '--line-strong': 'oklch(0.55 0.006 80)',
      '--line-grid': 'oklch(0.86 0.004 80)',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    swatch: 'oklch(0.235 0.008 250)',
    vars: {
      '--paper': 'oklch(0.235 0.008 250)',
      '--paper-2': 'oklch(0.27 0.008 250)',
      '--paper-3': 'oklch(0.31 0.008 250)',
      '--paper-edge': 'oklch(0.17 0.008 250)',
      '--ink': 'oklch(0.97 0.003 250)',
      '--ink-1': 'oklch(0.88 0.004 250)',
      '--ink-2': 'oklch(0.75 0.005 250)',
      '--ink-3': 'oklch(0.63 0.006 250)',
      '--ink-faint': 'oklch(0.46 0.007 250)',
      '--line': 'oklch(0.36 0.007 250)',
      '--line-strong': 'oklch(0.50 0.007 250)',
      '--line-grid': 'oklch(0.33 0.007 250)',
    },
  },
] as const;

export const DEFAULTS = {
  display: 'newsreader',
  body: 'space-grotesk',
  mono: 'jetbrains',
  accent: 'amber',
  paper: 'slate',
  gridMinor: 0.08,
  gridMajor: 0.16,
  strokeW: 1.25,
  radiusUI: 4,
  radiusCard: 8,
  bodyWeight: 400,
  audio: false,
  audioUI: true,
  audioCount: true,
  audioType: true,
  audioPage: false,
  snap: false,
  grain: false,
} as const;

export type StudioState = {
  display: string;
  body: string;
  mono: string;
  accent: string;
  paper: string;
  gridMinor: number;
  gridMajor: number;
  strokeW: number;
  radiusUI: number;
  radiusCard: number;
  bodyWeight: number;
  audio: boolean;
  audioUI: boolean;
  audioCount: boolean;
  audioType: boolean;
  audioPage: boolean;
  snap: boolean;
  grain: boolean;
};

export type Preset = {
  id: string;
  label: string;
  hint: string;
  patch: Partial<StudioState>;
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'warm',
    label: 'Warm',
    hint: 'linen · emerald · spectral',
    patch: {
      paper: 'linen',
      accent: 'emerald',
      display: 'spectral',
      body: 'plex-sans',
      mono: 'jetbrains',
      strokeW: 1.25,
      radiusUI: 3,
      radiusCard: 4,
      bodyWeight: 300,
      grain: true,
    },
  },
  {
    id: 'modern',
    label: 'Modern',
    hint: 'bone · cobalt · bodoni',
    patch: {
      paper: 'bone',
      accent: 'cobalt',
      display: 'bodoni-moda',
      body: 'geist',
      mono: 'plex-mono',
      strokeW: 1,
      radiusUI: 6,
      radiusCard: 8,
      bodyWeight: 300,
      grain: false,
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    hint: 'slate · amber · newsreader',
    patch: {
      paper: 'slate',
      accent: 'amber',
      display: 'newsreader',
      body: 'space-grotesk',
      mono: 'jetbrains',
      strokeW: 1.25,
      radiusUI: 0,
      radiusCard: 0,
      bodyWeight: 300,
      grain: false,
    },
  },
] as const;

export const DISPLAY_IDS = DISPLAY_FONTS.map((f) => f.id);
export const BODY_IDS = BODY_FONTS.map((f) => f.id);
export const MONO_IDS = MONO_FONTS.map((f) => f.id);
export const ACCENT_IDS = ACCENTS.map((a) => a.id);
export const PAPER_IDS = PAPERS.map((p) => p.id);
export const PRESET_IDS = PRESETS.map((p) => p.id);
