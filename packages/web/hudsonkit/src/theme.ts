// Narrow subpath — Hudson theme tokens plus runtime theming helpers.
export {
  SHELL_THEME,
  CHROME,
  CHROME_BASE,
  PANEL_STYLES,
  EDGE_EFFECTS,
  Z_LAYERS,
  LAYOUT,
} from './lib/theme';
export { HUD_SPRING, springEasing, springTransition } from './lib/motion';
export { ThemeProvider, useTheme, useOptionalTheme } from './theme/ThemeProvider';
export type { HudsonTheme, HudsonTemplate, ThemeProviderProps } from './theme/ThemeProvider';
export { HudsonThemeScript } from './theme/HudsonThemeScript';
