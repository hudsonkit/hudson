import { ACCENT_IDS, DEFAULTS, type StudioState } from './defaults';

/* The console persists a full snapshot. Exact former defaults and the former
   Ink preset are safe to advance to the new baked baseline; any deviation is
   a real user choice and remains untouched. */
const LEGACY_EMERALD_DEFAULTS: StudioState = {
  display: 'cormorant',
  body: 'space-grotesk',
  mono: 'jetbrains',
  accent: 'emerald',
  paper: 'slate',
  gridMinor: 0.18,
  gridMajor: 0.3,
  strokeW: 1.5,
  radiusUI: 0,
  radiusCard: 0,
  bodyWeight: 300,
  audio: false,
  audioUI: true,
  audioCount: true,
  audioType: true,
  audioPage: false,
  snap: false,
  grain: false,
};

const LEGACY_AZURE_DEFAULTS: StudioState = {
  ...LEGACY_EMERALD_DEFAULTS,
  accent: 'azure',
};

const LEGACY_INK_PRESET: StudioState = {
  ...LEGACY_EMERALD_DEFAULTS,
  display: 'newsreader',
  accent: 'amber',
};

/* Pre-"quiet" baseline: slate + amber at full grid. Advanced to the quiet
   azure baseline with the faint grid. */
const LEGACY_AMBER_DEFAULTS: StudioState = {
  ...LEGACY_INK_PRESET,
  strokeW: 1.25,
};

/* First quiet pass: azure with the faintest grid. Superseded by the
   softened amber plotter ink. */
const LEGACY_QUIET_AZURE_DEFAULTS: StudioState = {
  ...LEGACY_AMBER_DEFAULTS,
  accent: 'azure',
  gridMinor: 0.06,
  gridMajor: 0.12,
};

/* Second quiet pass: amber plotter ink, square corners, light body
   weight. Superseded by crisp radii and a 400 body weight. */
const LEGACY_QUIET_AMBER_DEFAULTS: StudioState = {
  ...LEGACY_QUIET_AZURE_DEFAULTS,
  accent: 'amber',
  gridMinor: 0.08,
  gridMajor: 0.16,
};

/** Crisp radii + regular weight, still on amber (before the ember accent). */
const LEGACY_CRISP_AMBER_DEFAULTS: StudioState = {
  ...DEFAULTS,
  accent: 'amber',
};

/* Slate + ember baseline, before the Frost + Harbor default. */
const LEGACY_SLATE_EMBER_DEFAULTS: StudioState = { ...DEFAULTS, accent: 'ember', paper: 'slate' };

const REPLACED_BASELINES = [
  LEGACY_SLATE_EMBER_DEFAULTS,
  LEGACY_CRISP_AMBER_DEFAULTS,
  LEGACY_QUIET_AMBER_DEFAULTS,
  LEGACY_EMERALD_DEFAULTS,
  LEGACY_AZURE_DEFAULTS,
  LEGACY_INK_PRESET,
  LEGACY_AMBER_DEFAULTS,
  LEGACY_QUIET_AZURE_DEFAULTS,
] as const;

function matchesSnapshot(state: Partial<StudioState>, snapshot: StudioState): boolean {
  const keys = Object.keys(snapshot) as (keyof StudioState)[];
  return keys.every((key) => state[key] === snapshot[key]);
}

export function migrateStudioState(parsed: Partial<StudioState>): {
  state: Partial<StudioState>;
  changed: boolean;
} {
  const state: Partial<StudioState> = { ...parsed };
  let changed = false;

  if (REPLACED_BASELINES.some((baseline) => matchesSnapshot(state, baseline))) {
    return { state: { ...DEFAULTS }, changed: true };
  }

  /* Accents removed from the catalog (e.g. violet) — normalize to the
     current default instead of leaving a dangling id that every renderer
     falls back on independently. */
  if (state.accent !== undefined && !ACCENT_IDS.includes(state.accent)) {
    state.accent = DEFAULTS.accent;
    changed = true;
  }

  return { state, changed };
}
