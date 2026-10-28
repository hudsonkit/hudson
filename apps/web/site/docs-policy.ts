/** Repository-only directories, shared by page loading and static exports. */
const INTERNAL_DIRECTORIES = new Set([
  'agent', 'prompts', 'coordination', 'specs', 'plans', 'proposals', 'reports',
]);

const INTERNAL_DOCUMENTS = new Set([
  'inference-credits-codex-review',
  'terminal-xterm-component-review',
]);

export function isPublicDoc(slug: string): boolean {
  const normalized = slug.replace(/(?:\/index)?\.(?:html|md)$/, '');
  if (INTERNAL_DOCUMENTS.has(normalized)) return false;
  const parts = normalized.split('/');
  return parts.every(part => part.length > 0 && !part.startsWith('.') &&
    !part.startsWith('_') && !part.includes('\\') && !INTERNAL_DIRECTORIES.has(part));
}

/** Reject direct requests too, including encoded paths and static HTML aliases. */
export function isInternalDocPath(pathname: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  if (!decoded.startsWith('/docs/')) return false;
  const slug = decoded.slice('/docs/'.length).replace(/\/$/, '');
  return slug.length > 0 && !isPublicDoc(slug);
}
