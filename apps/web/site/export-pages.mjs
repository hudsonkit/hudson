import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { isPublicDoc } from './docs-policy.ts';
import { SITE_ORIGIN, docPath } from './seo.ts';
import { writeSearchFiles } from './finalize-search.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextAppDir = join(root, '.next', 'server', 'app');
const docsSourceDir = join(root, '..', '..', 'docs');
const primaryOut = join(root, 'site', 'out');

const missingRoutes = [];

const staticRoutes = [
  'index',
  'landing',
  'preview',
  'app',
  'demo',
  'demo/side-nav',
  'demo/multi-theme',
  'license',
  'docs',
  'theme-preview',
];

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, {
    recursive: true,
    filter: (source) => !source.split('/').some(part => part === '.DS_Store'),
  });
  return true;
}

async function copyRoute(route, outDir) {
  const source = join(nextAppDir, `${route}.html`);
  if (!existsSync(source)) {
    // Missing here means the route would 404 in production — fail the build
    // instead of silently exporting without it.
    missingRoutes.push(route);
    return;
  }

  const target = route === 'index'
    ? join(outDir, 'index.html')
    : join(outDir, route, 'index.html');
  await copyIfExists(source, target);
}

export async function copyDocs(outDir, docsDir = join(nextAppDir, 'docs')) {
  if (!existsSync(docsDir)) return;

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (!isPublicDoc(relative(docsDir, abs))) continue;
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;

      const rel = relative(docsDir, abs).replace(/\.html$/, '');
      await copyIfExists(abs, join(outDir, 'docs', rel, 'index.html'));
    }
  }

  await walk(docsDir);
}

async function collectDocs(sourceDir = docsSourceDir) {
  const results = [];
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!isPublicDoc(prefix ? `${prefix}/${entry.name}` : entry.name)) continue;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }
      if (!entry.name.endsWith('.md') || entry.name === 'index.md') continue;
      const slug = (prefix ? `${prefix}/` : '') + entry.name.replace(/\.md$/, '');
      const raw = await readFile(join(dir, entry.name), 'utf-8');
      const { data, content } = matter(raw);
      results.push({
        slug,
        title: data.title ?? slug,
        description: data.description ?? '',
        content,
      });
    }
  }
  await walk(sourceDir);
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return results;
}

export async function writeLLMsFiles(outDir, sourceDir = docsSourceDir) {
  if (!existsSync(sourceDir)) return;
  const docs = await collectDocs(sourceDir);

  const indexLines = [
    '# hudson',
    '> Multi-app canvas workspace platform for React, iOS, and macOS',
    '',
    '## Documentation',
    ...docs.map((d) => `- [${d.title}](${SITE_ORIGIN}${docPath(d.slug)}): ${d.description}`),
    '',
    '## Full documentation',
    `${SITE_ORIGIN}/llms-full.txt`,
    '',
  ];
  await writeFile(join(outDir, 'llms.txt'), indexLines.join('\n'));

  const fullLines = [
    '# hudson — full documentation',
    '',
  ];
  for (const d of docs) {
    fullLines.push(`# ${d.title}`, '', `> Source: ${SITE_ORIGIN}${docPath(d.slug)}`, '');
    if (d.description) fullLines.push(d.description, '');
    fullLines.push(d.content.trim(), '', '---', '');
  }
  await writeFile(join(outDir, 'llms-full.txt'), fullLines.join('\n'));
}

async function exportTo(outDir) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const route of staticRoutes) {
    await copyRoute(route, outDir);
  }
  await copyDocs(outDir);
  await writeLLMsFiles(outDir);

  await copyIfExists(join(root, '.next', 'static'), join(outDir, '_next', 'static'));
  await copyIfExists(join(root, 'public'), outDir);
  await writeSearchFiles(outDir);

  await writeFile(
    join(outDir, '_headers'),
    [
      '/_next/static/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
      '/*',
      '  X-Frame-Options: SAMEORIGIN',
      '',
    ].join('\n'),
  );
}

if (import.meta.main) {
  await exportTo(primaryOut);

  if (missingRoutes.length > 0) {
    console.error(
      `Missing prerendered HTML for route(s): ${[...new Set(missingRoutes)].join(', ')}\n` +
      `Expected under ${nextAppDir}. Check the staticRoutes allow-list in site/export-pages.mjs ` +
      'against app/ routes, and make sure `next build` ran first.',
    );
    process.exit(1);
  }

  console.log(`Exported HudsonKit Pages site to ${primaryOut}`);
}
