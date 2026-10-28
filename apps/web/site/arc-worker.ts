interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

// This worker owns only /arc and /arc/* through specific Cloudflare routes.
// Arc's Vite build already uses /arc/ as its base; no origin proxy is involved.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'www.hudsonkit.com' || (url.hostname === 'hudsonkit.com' && url.protocol !== 'https:')) {
      url.hostname = 'hudsonkit.com';
      url.protocol = 'https:';
      if (url.pathname === '/arc') url.pathname = '/arc/';
      return Response.redirect(url.href, 308);
    }
    if (url.pathname === '/arc') {
      url.pathname = '/arc/';
      return Response.redirect(url.href, 308);
    }
    if (!url.pathname.startsWith('/arc/')) return new Response('Not found', { status: 404 });
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) return response;
    // Blog pages are generated HTML. A missing article must stay a real 404,
    // rather than exposing the homepage as a successful search result.
    const isBlogPath = url.pathname === '/arc/blog' || url.pathname.startsWith('/arc/blog/');
    if (isBlogPath || url.pathname.split('/').pop()?.includes('.')) return response;
    // Extensionless editor routes still use the SPA shell.
    url.pathname = '/arc/';
    return env.ASSETS.fetch(new Request(url, request));
  },
};
