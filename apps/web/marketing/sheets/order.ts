// Deck order. Sheet numbers and the "NN / total" counters are derived from
// this list, so reordering or adding a sheet never leaves a stale number.
// Every sheet that exists. Only the ones in SHEET_ORDER render; the rest stay
// buildable so they can be brought back by adding their id to the order.
export const ALL_SHEET_IDS = [
  'hero',
  'possession',
  'build-workspace',
  'plotter',
  'voice',
  'surfaces',
  'apps',
  'primitives',
  'quickstart',
] as const;

export type SheetId = (typeof ALL_SHEET_IDS)[number];

// Trimmed deck: the hero carries the live workspace, so 'possession' (same
// embed again), 'plotter', 'voice', and 'primitives' are parked.
export const SHEET_ORDER: readonly SheetId[] = [
  'hero',
  'build-workspace',
  'surfaces',
  'apps',
  'quickstart',
];

const pad = (n: number) => String(n).padStart(2, '0');

export const SHEET_TOTAL = pad(SHEET_ORDER.length);

export function sheetNumber(id: SheetId): string {
  return pad(SHEET_ORDER.indexOf(id) + 1);
}
