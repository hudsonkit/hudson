// Deck order. Sheet numbers and the "NN / total" counters are derived from
// this list, so reordering or adding a sheet never leaves a stale number.
export const SHEET_ORDER = [
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

export type SheetId = (typeof SHEET_ORDER)[number];

const pad = (n: number) => String(n).padStart(2, '0');

export const SHEET_TOTAL = pad(SHEET_ORDER.length);

export function sheetNumber(id: SheetId): string {
  return pad(SHEET_ORDER.indexOf(id) + 1);
}
