// opentype.js ships no types; Hero handles its objects loosely.
declare module 'opentype.js' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type PathCommand = any;
  export type Glyph = any;
  export type Path = any;
  export type Font = any;
  export const Glyph: any;
  export const Path: any;
  export const Font: any;
  export function parse(buffer: ArrayBuffer): any;
  const opentype: any;
  export default opentype;
}
