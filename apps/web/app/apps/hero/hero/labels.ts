// Display names that tell same-family fonts apart (Geist Pixel Square vs Grid).

function withStyle(family: string, style: string | null | undefined): string {
  if (!style || style === 'Regular' || family.endsWith(style)) return family;
  return `${family} ${style}`;
}

export function libraryFontLabel(meta: { familyName: string | null; subfamilyName: string | null; fileName: string }): string {
  return withStyle(meta.familyName ?? meta.fileName, meta.subfamilyName);
}

export function loadedFontLabel(f: { font: { metadata: { familyName: string | null; subfamilyName?: string | null } }; fileName: string }): string {
  return withStyle(f.font.metadata.familyName ?? f.fileName, f.font.metadata.subfamilyName);
}
