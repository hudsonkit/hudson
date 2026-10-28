import { isPublicDoc } from './docs-policy';
/** Public URL and indexing policy shared by Next metadata, the static exporter, and the worker. */
export const SITE_ORIGIN = 'https://hudsonkit.com';
export const APP_HOST = 'app.hudsonkit.com';
export const MARKETING_HOSTS = ['hudsonkit.com', 'www.hudsonkit.com'];
export const PRODUCTION_HOSTS = [...MARKETING_HOSTS, APP_HOST];
export const REPOSITORY_URL = 'https://github.com/hudsonkit/hudson';
export const DOCS_HOME = '/docs/quickstart/';
export const GA_SHARED_MEASUREMENT_ID = 'G-GSHDZPFRZG';
export const GA_HUDSON_MEASUREMENT_ID = 'G-R2H33Q2E9X';
export const GOOGLE_TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${GA_SHARED_MEASUREMENT_ID}`;

const UTILITY_ROOTS = ['/app', '/preview', '/theme-preview', '/embed'];

export function isIndexableDoc(slug: string): boolean {
  return isPublicDoc(slug);
}

export function canonicalUrl(pathname: string): string {
  return new URL(pathname, SITE_ORIGIN).href;
}

export function docPath(slug: string): string {
  return `/docs/${slug}/`;
}

export function isNoIndexPath(pathname: string): boolean {
  const path = pathname.replace(/\/(?:index\.html)?$/, '');
  if (UTILITY_ROOTS.some(root => path === root || path.startsWith(`${root}/`))) return true;
  return path.startsWith('/docs/') && !isIndexableDoc(path.slice('/docs/'.length));
}

/** Preserve both the existing portfolio destination and the dedicated Hudson property. */
export function analyticsInitScript(): string {
  return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
if (${JSON.stringify(PRODUCTION_HOSTS)}.includes(window.location.hostname)) {
  gtag('js', new Date());
  gtag('config', '${GA_SHARED_MEASUREMENT_ID}');
  gtag('config', '${GA_HUDSON_MEASUREMENT_ID}');
}`;
}

/** Permanent public aliases, applied before static asset routing. Query strings survive. */
export function siteRedirect(input: URL): URL | null {
  if (!PRODUCTION_HOSTS.includes(input.hostname)) return null;
  const target = new URL(input);
  target.protocol = 'https:';
  if (target.hostname === 'www.hudsonkit.com') target.hostname = 'hudsonkit.com';
  if (MARKETING_HOSTS.includes(input.hostname)) {
    if (/^\/(?:index\.html|landing(?:\/|\/index\.html)?)$/.test(target.pathname)) {
      target.pathname = '/';
    } else if (/^\/docs(?:\/|\/index\.html)?$/.test(target.pathname)) {
      target.pathname = DOCS_HOME;
    } else if (target.pathname.startsWith('/docs/')) {
      target.pathname = target.pathname.replace(/(?:\/index)?\.html$/, '/');
      if (!target.pathname.endsWith('/') && !target.pathname.split('/').pop()!.includes('.')) {
        target.pathname += '/';
      }
    } else if (target.pathname === '/license') {
      target.pathname = '/license/';
    }
  }
  return target.href === input.href ? null : target;
}

export function sitemapXml(urls: string[]): string {
  const escape = (url: string) => url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escape(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function assertIndexableHtml(html: string, url: string): void {
  const canonical = html.match(/<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"[^>]*>/i)?.[1];
  if (!canonical || new URL(canonical).href !== url) throw new Error(`Sitemap canonical mismatch for ${url}: ${canonical ?? 'missing'}`);
  if (/<meta\b[^>]*\bname="robots"[^>]*\bcontent="[^"]*noindex/i.test(html)) {
    throw new Error(`Sitemap contains a noindex page: ${url}`);
  }
  if (/<meta\b[^>]*http-equiv="refresh"/i.test(html)) throw new Error(`Sitemap contains a redirect: ${url}`);
}
