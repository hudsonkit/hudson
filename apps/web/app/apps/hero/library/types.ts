export interface LibraryFontMeta {
  id: string;
  source: "user" | "sample";
  fileName: string;
  familyName: string | null;
  subfamilyName: string | null;
  glyphCount: number;
  addedAt: string;
  fileSize: number;
  sampleUrl?: string;
}
