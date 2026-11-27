import type { IntentCategory } from 'hudsonkit';

// ---------------------------------------------------------------------------
// Category badge colors (shared across components)
// ---------------------------------------------------------------------------
export const CATEGORY_COLORS: Record<IntentCategory, string> = {
  tool: 'text-cyan-600 bg-cyan-500/12',
  edit: 'text-amber-600 bg-amber-500/12',
  file: 'text-emerald-600 bg-emerald-500/12',
  view: 'text-sky-600 bg-sky-500/12',
  navigation: 'text-teal-600 bg-teal-500/12',
  toggle: 'text-muted-foreground bg-muted',
  workspace: 'text-blue-600 bg-blue-500/12',
  settings: 'text-muted-foreground bg-muted',
};

// ---------------------------------------------------------------------------
// Floating card
// ---------------------------------------------------------------------------
export interface FloatingCard {
  id: string;        // unique card instance id
  intentId: string;  // commandId of the pinned intent
  zIndex: number;
}
