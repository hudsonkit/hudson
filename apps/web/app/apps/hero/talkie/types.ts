/** Talkie wordmark studio parameter types */

/**
 * Schema version sentinel for saved TalkieParams.
 *
 * - v1 (implicit / undefined): pre-refactor. Builders placed each glyph at an
 *   idiosyncratic natural position (i: 0.64-weighted LSB, l-no-foot: hardcoded
 *   x=263, others: stock JBM coords). `*_padLeft` was an additive translate on
 *   top of that, so `padLeft = 0` did NOT mean "centered in cell".
 * - v2 (current): all builders auto-center so the glyph's reference point (stem
 *   center for geometric, bbox center for stock-path) sits at `advance / 2`.
 *   `*_offsetX` is a signed offset from cell-center. `offsetX = 0` is
 *   visually neutral and stable across width/stemWidth changes.
 *
 * The migrateParamsV1ToV2 helper in glyphOps converts v1 saves to v2 while
 * preserving the rendered output pixel-identical.
 */
export const TALKIE_PARAMS_VERSION = 2;

export interface TalkieParams {
  // ── Globals ──
  paramsVersion?: number;       // present in saves from v2+; absent → v1, migrate
  preset: 'A' | 'B' | 'C' | 'D' | 'custom';
  dotOverlay: boolean;
  displayScale: number; // 0.5–2.0, visual only

  // ── Hot Mic dot (rendered as a rounded rect; size + corner softness define the shape) ──
  dot_size: number;             // 50–200u, def 76 (was ~0.7 × stem)
  dot_aspect: number;           // 0.4–2.0, def 1.0 (height multiplier — 1=square/circle, <1=horizontal, >1=vertical)
  dot_cornerSoftness: number;   // 0–100% of half-min-side, def 100 (0=square, 100=circle/pill)
  dot_offsetX: number;          // -200..+200u, def 0 (shift relative to i stem center)
  dot_offsetY: number;          // -100..+200u, def 0 (shift relative to default y above i)

  // ── Corner rounding (global) ──
  cornerSoftnessExternal: number;  // 0–60u, def 0 — convex/outer corners
  cornerSoftnessInternal: number;  // 0–60u, def 0 — concave/inner corners

  // ── Guides ──
  guides_horizontal: boolean;
  guides_glyphMetrics: boolean;
  guides_pairGaps: boolean;

  // ── t: standard ──
  t_advance: number;          // 480–700u, def 600
  t_offsetX: number;          // -200..+200u, def 0 (signed shift from cell-center)
  t_height: number;           // 600–720u, def 705 (ascender)
  t_stemWidth: number;        // 80–140u, def 108
  t_cornerSoftness: number;   // 0–30u, def 0 (hook curvature)
  // ── t: specific ──
  t_crossbarLeft: number;     // 0–180u, def 49 (natural JBM left end)
  t_crossbarRight: number;    // 480–600u, def 544
  t_crossbarThickness: number; // 70–110u, def 88
  t_hookTightness: number;    // 50–110%, def 82%

  // ── a: standard ──
  a_advance: number;          // 480–700u, def 600
  a_offsetX: number;          // -200..+200u, def 0
  a_height: number;           // 450–600u, def 560 (x-height)
  a_stemWidth: number;        // 80–140u, def 108
  a_cornerSoftness: number;   // 0–30u, def 0
  // ── a: specific ──
  a_footCurl: boolean;
  a_footCurlAmount: number;   // 0–30u

  // ── l: standard ──
  l_advance: number;          // 180–600u, def 600
  l_offsetX: number;          // -200..+200u, def 0
  l_height: number;           // 550–730u, def 730 (ascender)
  l_stemWidth: number;        // 90–130u, def 108
  l_cornerSoftness: number;   // 0–30u, def 17
  // ── l: specific ──
  l_foot: boolean;
  l_footExtension: number;    // 0–250u

  // ── k: standard ──
  k_advance: number;          // 480–700u, def 600
  k_offsetX: number;          // -200..+200u, def 0
  k_height: number;           // 550–730u, def 730 (ascender)
  k_stemWidth: number;        // 80–140u, def 108
  k_cornerSoftness: number;   // 0–30u, def 0

  // ── i: standard ──
  i_advance: number;          // 180–340u, def 253
  i_offsetX: number;          // -200..+200u, def 0
  i_height: number;           // 450–720u, def 550 (x-height)
  i_stemWidth: number;        // 60–140u, def 108
  i_cornerSoftness: number;   // 0–30u, def 17

  // ── e: standard ──
  e_advance: number;          // 480–700u, def 600
  e_offsetX: number;          // -200..+200u, def 0
  e_height: number;           // 450–600u, def 560 (x-height)
  e_stemWidth: number;        // 80–140u, def 108
  e_cornerSoftness: number;   // 0–30u, def 0
}

export const DEFAULT_PARAMS: TalkieParams = {
  paramsVersion: TALKIE_PARAMS_VERSION,
  preset: 'custom',
  dotOverlay: false,
  displayScale: 1.0,

  dot_size: 76,
  dot_aspect: 1.0,
  dot_cornerSoftness: 100,
  dot_offsetX: 0,
  dot_offsetY: 0,

  cornerSoftnessExternal: 0,
  cornerSoftnessInternal: 0,

  guides_horizontal: false,
  guides_glyphMetrics: false,
  guides_pairGaps: false,

  t_advance: 600,
  t_offsetX: 0,
  t_height: 705,
  t_stemWidth: 108,
  t_cornerSoftness: 0,
  t_crossbarLeft: 49,
  t_crossbarRight: 544,
  t_crossbarThickness: 88,
  t_hookTightness: 82,

  a_advance: 600,
  a_offsetX: 0,
  a_height: 560,
  a_stemWidth: 108,
  a_cornerSoftness: 0,
  a_footCurl: false,
  a_footCurlAmount: 0,

  l_advance: 600,
  l_offsetX: 0,
  l_height: 730,
  l_stemWidth: 108,
  l_cornerSoftness: 17,
  l_foot: true,
  l_footExtension: 175,

  k_advance: 600,
  k_offsetX: 0,
  k_height: 730,
  k_stemWidth: 108,
  k_cornerSoftness: 0,

  i_advance: 253,
  i_offsetX: 0,
  i_height: 550,
  i_stemWidth: 108,
  i_cornerSoftness: 17,

  e_advance: 600,
  e_offsetX: 0,
  e_height: 560,
  e_stemWidth: 108,
  e_cornerSoftness: 0,
};

export const PRESETS: Record<string, Partial<TalkieParams>> = {
  A: {
    preset: 'A',
    l_height: 550,
    l_foot: false,
    k_height: 550,
    t_height: 705,
  },
  B: {
    preset: 'B',
    l_height: 700,
    l_foot: true,
    k_height: 700,
    t_height: 705,
  },
  C: {
    preset: 'C',
    l_height: 670,
    l_foot: true,
    k_height: 640,
    t_height: 705,
  },
  D: {
    preset: 'D',
    l_height: 560,
    l_foot: false,
    k_height: 620,
    t_height: 705,
  },
};

// Brand tokens
export const BRAND = {
  canvas: '#0E0D0A',
  ink: '#F4EFE6',
  muted: '#B8B2A4',
  accent: '#FF5346', // Hot Mic red
  tapeTan: '#7A6E5C',
  cassette: '#E68A3C',
  surface: '#1A1813',
  surfaceLight: '#211F18',
  border: '#16140e',
  labelDim: '#5e574a',
  labelMid: '#8a8273',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;
