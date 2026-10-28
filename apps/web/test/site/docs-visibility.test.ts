// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAllDocs, getAllSlugs, getDocBySlug } from '../../app/lib/docs';
import { copyDocs, writeLLMsFiles } from '../../site/export-pages.mjs';
vi.mock('../../app/api/ai/toolsets', () => ({ loadToolset: () => ({ system: '' }) }));
import worker from '../../site/cloudflare-static-worker';

const internal = ['plans/shell-graduation-2026-06-05', 'proposals/native-workflow-kit', 'reports/conversational-voice-review', 'inference-credits-codex-review', 'terminal-xterm-component-review'];
const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('repository-only documentation', () => {
  it('omits internal docs from navigation/static params and rejects direct lookups', () => {
    const docs = getAllDocs();
    for (const slug of internal) {
      expect(docs.some(doc => doc.slug === slug)).toBe(false);
      expect(getAllSlugs()).not.toContain(slug);
      expect(getDocBySlug(slug)).toBeNull();
    }
    expect(getDocBySlug('guides/../plans/shell-graduation-2026-06-05')).toBeNull();
    expect(getDocBySlug('quickstart')).not.toBeNull();
    expect(getDocBySlug('examples/transcription-reference-walkthrough')).not.toBeNull();
  });

  it.each(internal.flatMap(slug => [
    `/docs/${slug}/`, `/docs/${slug}/index.html`, `/docs/${slug}.html`,
    `/docs/${slug.replace('/', '%2F')}/`,
  ]))('returns 404 before assets can serve an old page: %s', async path => {
    const fetch = vi.fn(async () => new Response('old internal content'));
    const response = await worker.fetch(new Request(`https://hudsonkit.com${path}`), { ASSETS: { fetch } });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('old internal content');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('excludes stale internal HTML and internal content from both LLM exports', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hudson-docs-'));
    temporary.push(root);
    const source = join(root, 'source');
    const html = join(root, 'html');
    const out = join(root, 'out');
    mkdirSync(out);
    for (const slug of ['quickstart', ...internal]) {
      for (const [dir, ext, content] of [[source, '.md', `# ${slug}\n\n${slug === 'quickstart' ? 'public instructions' : 'internal-only-marker'}`], [html, '.html', '<html>rendered doc</html>']]) {
        const file = join(dir, slug + ext);
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, content);
      }
    }
    await copyDocs(out, html);
    await writeLLMsFiles(out, source);
    expect(existsSync(join(out, 'docs/quickstart/index.html'))).toBe(true);
    for (const slug of internal) expect(existsSync(join(out, `docs/${slug}/index.html`))).toBe(false);
    for (const filename of ['llms.txt', 'llms-full.txt']) {
      const text = readFileSync(join(out, filename), 'utf8');
      expect(text).toContain('quickstart');
      expect(text).not.toContain('internal-only-marker');
      for (const slug of internal) expect(text).not.toContain(slug);
    }
  });
});
