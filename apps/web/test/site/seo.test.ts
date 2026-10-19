// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { analyticsInitScript, assertIndexableHtml, isIndexableDoc, siteRedirect } from '../../site/seo';
import { rewriteDocLink } from '../../app/lib/remark-rewrite-links';
import { withCanonical } from '../../site/finalize-search.mjs';
vi.mock('../../app/api/ai/toolsets', () => ({ loadToolset: () => ({ system: '' }) }));
import worker from '../../site/cloudflare-static-worker';

describe('public site routing', () => {
  it.each([
    ['http://www.hudsonkit.com/landing/?utm_source=test', 'https://hudsonkit.com/?utm_source=test'],
    ['https://hudsonkit.com/docs', 'https://hudsonkit.com/docs/quickstart/'],
    ['https://hudsonkit.com/docs/index.html', 'https://hudsonkit.com/docs/quickstart/'],
    ['https://hudsonkit.com/docs/api', 'https://hudsonkit.com/docs/api/'],
    ['https://hudsonkit.com/docs/api/index.html', 'https://hudsonkit.com/docs/api/'],
    ['https://hudsonkit.com/license', 'https://hudsonkit.com/license/'],
  ])('normalizes %s', (input, expected) => {
    expect(siteRedirect(new URL(input))?.href).toBe(expected);
    expect(siteRedirect(new URL(expected))).toBeNull();
  });
  it('leaves valid canonical, product, and local paths alone', () => {
    for (const url of ['https://hudsonkit.com/', 'https://hudsonkit.com/docs/api/', 'https://hudsonkit.com/arc/editor?doc=123', 'http://localhost:3500/docs']) {
      expect(siteRedirect(new URL(url))).toBeNull();
    }
  });
  it('returns permanent redirects before fetching assets, preserving POST semantics', async () => {
    const fetch = vi.fn();
    const response = await worker.fetch(new Request('http://www.hudsonkit.com/api/ai/chat?x=1', { method: 'POST', body: '{}' }), { ASSETS: { fetch } });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://hudsonkit.com/api/ai/chat?x=1');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('serves the marketing home without a redirect to the duplicate landing path', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response('<html></html>'));
    const response = await worker.fetch(new Request('https://hudsonkit.com/'), { ASSETS: { fetch } });
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][0].url).toBe('https://hudsonkit.com/landing/');
  });
  it.each([
    ['https://hudsonkit.com/preview/', 'noindex, nofollow'],
    ['https://hudsonkit.com/app/', 'noindex, follow'],
    ['https://hudsonkit.com/theme-preview/', 'noindex, follow'],
    ['https://hudsonkit.com/docs/reports/conversational-voice-review/', 'noindex, follow'],
    ['https://app.hudsonkit.com/', 'noindex, follow'],
  ])('keeps utility routes accessible but excluded: %s', async (url, policy) => {
    const response = await worker.fetch(new Request(url), { ASSETS: { fetch: async () => new Response('<html></html>') } });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe(policy);
  });
});

describe('search and tracking policy', () => {
  it('retains useful unstructured docs and excludes explicit internal notes', () => {
    for (const slug of ['overview', 'guides/conversational-voice', 'native-terminal-canvas-roadmap', 'terminal-xterm-component-spec']) expect(isIndexableDoc(slug)).toBe(true);
    for (const slug of ['proposals/native-workflow-kit', 'plans/workspace-shell-decomposition', 'reports/transcription-acceptance-audit', 'inference-credits-codex-review', 'terminal-xterm-component-review']) expect(isIndexableDoc(slug)).toBe(false);
  });
  it('rejects sitemap pages without matching canonicals or with noindex/redirect metadata', () => {
    const canonical = '<link rel="canonical" href="https://hudsonkit.com/docs/api/">';
    expect(() => assertIndexableHtml('<link rel="canonical" href="https://hudsonkit.com">', 'https://hudsonkit.com/')).not.toThrow();
    expect(() => assertIndexableHtml(canonical, 'https://hudsonkit.com/docs/api/')).not.toThrow();
    expect(() => assertIndexableHtml('', 'https://hudsonkit.com/docs/api/')).toThrow(/canonical/);
    expect(() => assertIndexableHtml(canonical + '<meta name="robots" content="noindex, follow">', 'https://hudsonkit.com/docs/api/')).toThrow(/noindex/);
    expect(() => assertIndexableHtml(canonical + '<meta http-equiv="refresh" content="0;url=/">', 'https://hudsonkit.com/docs/api/')).toThrow(/redirect/);
  });
  it('normalizes ARC metadata without changing scripts or content', () => {
    const html = '<html><head><link rel="canonical" href="https://hudsonkit.com/arc/mcp"><script src="/arc/assets/main.js"></script></head><body>Content</body></html>';
    const updated = withCanonical(html, 'https://hudsonkit.com/arc/mcp/');
    expect(updated.match(/rel="canonical"/g)).toHaveLength(1);
    expect(updated).toContain('<script src="/arc/assets/main.js"></script>');
    expect(withCanonical(updated, 'https://hudsonkit.com/arc/mcp/')).toBe(updated);
    expect(() => assertIndexableHtml(updated, 'https://hudsonkit.com/arc/mcp/')).not.toThrow();
  });
  it('sends once to each existing destination only on production hosts', () => {
    for (const hostname of ['hudsonkit.com', 'www.hudsonkit.com', 'app.hudsonkit.com', 'localhost', 'preview.workers.dev']) {
      const dataLayer: IArguments[] = [];
      const window = { dataLayer, location: { hostname } };
      runInNewContext(analyticsInitScript(), { window, dataLayer });
      const destinations = dataLayer.filter(event => event[0] === 'config').map(event => event[1]);
      expect(destinations).toEqual(hostname.endsWith('hudsonkit.com') ? ['G-GSHDZPFRZG', 'G-R2H33Q2E9X'] : []);
    }
  });
});

describe('source-relative documentation links', () => {
  it('keeps the current nested directory and anchors', () => {
    expect(rewriteDocLink('transcription-configuration.md#the-options-dictionary', 'guides/conversational-voice')).toBe('/docs/guides/transcription-configuration/#the-options-dictionary');
    expect(rewriteDocLink('../reports/conversational-voice-review.md', 'guides/conversational-voice')).toBe('/docs/reports/conversational-voice-review/');
  });
  it('sends existing source files and directories to GitHub instead of nonexistent site routes', () => {
    expect(rewriteDocLink('../NOTICE.md', 'voice')).toBe('https://github.com/hudsonkit/hudson/blob/main/NOTICE.md');
    expect(rewriteDocLink('../packages/web/hudsonkit/src/types/', 'api')).toBe('https://github.com/hudsonkit/hudson/tree/main/packages/web/hudsonkit/src/types');
    expect(rewriteDocLink('../examples/conversational-voice/web-host-example.ts', 'guides/conversational-voice')).toBe('https://github.com/hudsonkit/hudson/blob/main/docs/examples/conversational-voice/web-host-example.ts');
  });
  it('preserves external URLs, website paths, anchors, and visibly broken targets for audit', () => {
    for (const url of ['#section', 'https://example.com/test.md', '/demo/side-nav', 'missing-document.md']) expect(rewriteDocLink(url, 'overview')).toBe(url);
  });
});
