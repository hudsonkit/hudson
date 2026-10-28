import { describe, expect, it, vi } from 'vitest';
import worker from '../../site/arc-worker';

describe('independent Arc routes', () => {
  it('preserves canonical host redirects after taking ownership from the parent worker', async () => {
    const env = { ASSETS: { fetch: vi.fn() } };
    const response = await worker.fetch(new Request('http://www.hudsonkit.com/arc/editor?x=1'), env);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://hudsonkit.com/arc/editor?x=1');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('redirects the bare product root and leaves sibling products alone', async () => {
    const env = { ASSETS: { fetch: vi.fn() } };
    const root = await worker.fetch(new Request('https://hudsonkit.com/arc?theme=dark'), env);
    expect(root.status).toBe(308);
    expect(root.headers.get('location')).toBe('https://hudsonkit.com/arc/?theme=dark');
    expect((await worker.fetch(new Request('https://hudsonkit.com/sfx/'), env)).status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('serves direct assets, falls back for editor routes, and preserves missing asset 404s', async () => {
    const fetch = vi.fn(async (req: Request) => new Response(new URL(req.url).pathname, {
      status: new URL(req.url).pathname === '/arc/' ? 200 : 404,
    }));
    const env = { ASSETS: { fetch } };
    const editor = await worker.fetch(new Request('https://hudsonkit.com/arc/editor/deep'), env);
    expect(await editor.text()).toBe('/arc/');
    const missing = await worker.fetch(new Request('https://hudsonkit.com/arc/assets/missing.js'), env);
    expect(missing.status).toBe(404);
    const root = await worker.fetch(new Request('https://hudsonkit.com/arc/'), env);
    expect(root.status).toBe(200);
  });

  it('serves generated blog pages without replacing their HTML or metadata', async () => {
    const html = '<html><head><title>Review a diagram</title></head><body><h1>Review a diagram</h1></body></html>';
    const fetch = vi.fn(async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const response = await worker.fetch(new Request('https://hudsonkit.com/arc/blog/review-a-diagram/'), { ASSETS: { fetch } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['GET', 'HEAD'])('keeps missing blog pages as 404s for %s', async (method) => {
    const fetch = vi.fn(async (request: Request) => new Response(null, {
      status: new URL(request.url).pathname === '/arc/' ? 200 : 404,
    }));
    for (const path of ['/arc/blog', '/arc/blog/missing', '/arc/blog/missing/']) {
      fetch.mockClear();
      const response = await worker.fetch(new Request(`https://hudsonkit.com${path}`, { method }), { ASSETS: { fetch } });
      expect(response.status).toBe(404);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
