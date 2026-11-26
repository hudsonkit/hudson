// ─────────────────────────────────────────────────────────────────────────────
// Embed Consumer Registry — Worker copy (no React deps)
// Synced from: app/embed/registry.ts
// Keep in sync manually when adding new consumers.
// ─────────────────────────────────────────────────────────────────────────────

export type EmbedTheme = 'dark' | 'light';

export interface ConsumerConfig {
  ref: string;
  theme: EmbedTheme;
  template: string;
  defaultWorkspace: string;
  defaultFocus?: string;
  defaultApps?: string[];
  /** `--hud-*` semantic tokens. */
  palette: Record<string, string>;
  /** `--hud-font-*` family tokens. */
  fonts: Record<string, string>;
  shadcn?: Record<string, string>;
}

export const consumers: Record<string, ConsumerConfig> = {
  // Drafting marketing preset for the HudsonKit site.
  hudsonos: {
    ref: 'hudsonos',
    theme: 'dark',
    template: 'drafting',
    defaultWorkspace: 'hudson-os',
    defaultFocus: 'hudson-docs',
    defaultApps: ['stage-design', 'theme-designer', 'hudson-docs'],
    palette: {
      '--hud-bg':           'oklch(0.20 0.02 240)',
      '--hud-bg-2':         'oklch(0.24 0.02 240)',
      '--hud-bg-3':         'oklch(0.28 0.02 240)',
      '--hud-ink':          'oklch(0.94 0.005 240)',
      '--hud-ink-1':        'oklch(0.85 0.005 240)',
      '--hud-ink-2':        'oklch(0.70 0.008 240)',
      '--hud-ink-3':        'oklch(0.55 0.01 240)',
      '--hud-line':         'oklch(0.40 0.012 240)',
      '--hud-line-strong':  'oklch(0.62 0.012 240)',
      '--hud-accent':       'oklch(0.72 0.18 60)',
      '--hud-accent-soft':  'oklch(0.72 0.18 60 / 0.12)',
      '--hud-accent-line':  'oklch(0.72 0.18 60 / 0.45)',
      '--hud-border-width': '1.5px',
    },
    fonts: {
      '--hud-font-display': '"Times New Roman", serif',
      '--hud-font-body':    'system-ui, sans-serif',
      '--hud-font-mono':    'ui-monospace, monospace',
    },
  },

  // hudson-linen — cream-paper light showcase.
  'hudson-linen': {
    ref: 'hudson-linen',
    theme: 'light',
    template: 'drafting',
    defaultWorkspace: 'hudson-os',
    defaultFocus: 'hudson-docs',
    defaultApps: ['stage-design', 'theme-designer', 'hudson-docs'],
    palette: {
      '--hud-bg':           'oklch(0.95 0.012 70)',
      '--hud-bg-2':         'oklch(0.97 0.010 70)',
      '--hud-bg-3':         'oklch(0.93 0.014 70)',
      '--hud-ink':          'oklch(0.22 0.014 60)',
      '--hud-ink-1':        'oklch(0.32 0.014 60)',
      '--hud-ink-2':        'oklch(0.52 0.010 60)',
      '--hud-ink-3':        'oklch(0.70 0.010 60)',
      '--hud-line':         'oklch(0.88 0.010 70)',
      '--hud-line-strong':  'oklch(0.75 0.012 70)',
      '--hud-accent':       'oklch(0.62 0.18 50)',
      '--hud-accent-soft':  'oklch(0.62 0.18 50 / 0.08)',
      '--hud-accent-line':  'oklch(0.62 0.18 50 / 0.40)',
      '--hud-border-width': '1.5px',
    },
    fonts: {
      '--hud-font-display': '"Times New Roman", serif',
      '--hud-font-body':    'system-ui, sans-serif',
      '--hud-font-mono':    'ui-monospace, monospace',
    },
  },

  // Reference / unstyled embed — Hudson's native dark+emerald palette.
  hudson: {
    ref: 'hudson',
    theme: 'dark',
    template: 'hudson',
    defaultWorkspace: 'hudson-os',
    defaultFocus: 'hudson-docs',
    defaultApps: ['stage-design', 'theme-designer', 'hudson-docs'],
    palette: {
      '--hud-bg':           'oklch(0.16 0.005 240)',
      '--hud-bg-2':         'oklch(0.20 0.005 240)',
      '--hud-bg-3':         'oklch(0.24 0.005 240)',
      '--hud-ink':          'oklch(0.96 0.005 240)',
      '--hud-ink-1':        'oklch(0.86 0.005 240)',
      '--hud-ink-2':        'oklch(0.66 0.008 240)',
      '--hud-ink-3':        'oklch(0.50 0.01 240)',
      '--hud-line':         'oklch(0.32 0.012 240)',
      '--hud-line-strong':  'oklch(0.48 0.012 240)',
      '--hud-accent':       'oklch(0.70 0.11 42)',
      '--hud-accent-soft':  'oklch(0.70 0.11 42 / 0.10)',
      '--hud-accent-line':  'oklch(0.70 0.11 42 / 0.36)',
      '--hud-border-width': '1px',
    },
    fonts: {
      '--hud-font-display': '"Times New Roman", serif',
      '--hud-font-body':    'system-ui, sans-serif',
      '--hud-font-mono':    'ui-monospace, monospace',
    },
  },
};

/** Look up a consumer by `?ref=` value. Returns undefined if not registered. */
export function resolveConsumer(ref: string | null | undefined): ConsumerConfig | undefined {
  if (!ref) return undefined;
  return consumers[ref];
}
