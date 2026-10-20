// Builds product sites and mounts their static bundles under site/out/<name>/,
// so the Cloudflare worker serves them at hudsonkit.com/<name> — the same
// single-domain shape lattices.dev uses for its subproducts.
//
//   bun site/vendor-products.mjs            # build every product
//   bun site/vendor-products.mjs sfx        # build one product
//   SKIP_VENDOR_PRODUCTS=1 bun run build:site
//
// Arc deploys independently through deploy-arc.yml and wrangler.arc.jsonc.
// Each product pins a `ref` (overridable via <NAME>_REF) so deploys are
// reproducible; bump the ref to roll the product forward. <NAME>_REPO points
// a build at another clone, e.g. a local checkout.

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSearchFiles } from './finalize-search.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const outDir = join(root, 'site', 'out');
const vendorDir = join(root, 'site', '.vendor');

const PRODUCTS = [
  {
    name: 'studio',
    repo: 'https://github.com/hudsonkit/studio.git',
    ref: 'main',
    // Studio's workspace reaches for sibling checkouts. hudsonkit is copied
    // from this repo (built earlier in build:site); the other studios are only
    // workspace neighbours, so they get stubs written from Studio's lockfile.
    workspaceCopies: {
      '../hudson/packages/web/hudsonkit': join(repoRoot, 'packages', 'web', 'hudsonkit'),
    },
    stubMissingWorkspaces: true,
    buildCommand: ['bun', 'run', 'build:site'],
    distDir: 'apps/studio/site/dist',
  },
  {
    // Hudson Kit SFX — the former Peal site, exported by Next.js.
    name: 'sfx',
    repo: 'https://github.com/arach/peal.git',
    ref: 'sfx-conversation',
    buildEnv: {
      BUILD_STATIC: 'true',
      NEXT_PUBLIC_BUILD_STATIC: 'true',
      NEXT_PUBLIC_BASE_PATH: '/sfx',
      NEXT_PUBLIC_SITE_ORIGIN: 'https://hudsonkit.com',
    },
    buildCommand: ['bun', 'run', 'build:static'],
    distDir: 'out',
  },
  // { name: 'atelier', ... } — mount the same way when it lands.
];

function run(cmd, args, cwd, extraEnv = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
}

// Lay out the sibling directories a product's bun workspace expects, so
// `bun install --frozen-lockfile` resolves the same graph it was locked with.
async function prepareWorkspace(product, dir) {
  // Copied rather than linked: the product's install writes node_modules into
  // its workspace members, and those must not land in this checkout.
  for (const [workspace, source] of Object.entries(product.workspaceCopies ?? {})) {
    const target = resolve(dir, workspace);
    await rm(target, { recursive: true, force: true });
    await cp(source, target, {
      recursive: true,
      filter: path => !path.slice(source.length).split('/').includes('node_modules'),
    });
    console.log(`  copied ${workspace} from ${source}`);
  }
  if (!product.stubMissingWorkspaces) return;

  // bun.lock is JSON with trailing commas.
  const lock = JSON.parse((await readFile(join(dir, 'bun.lock'), 'utf8')).replace(/,(\s*[}\]])/g, '$1'));
  for (const [workspace, entry] of Object.entries(lock.workspaces ?? {})) {
    const stubDir = resolve(dir, workspace);
    if (!workspace.startsWith('..') || existsSync(join(stubDir, 'package.json'))) continue;
    const { bin: _bin, ...manifest } = entry;
    await mkdir(stubDir, { recursive: true });
    await writeFile(join(stubDir, 'package.json'), `${JSON.stringify({ private: true, ...manifest }, null, 2)}\n`);
    console.log(`  stubbed ${workspace} (${entry.name})`);
  }
}

async function vendorProduct(product) {
  const ref = process.env[`${product.name.toUpperCase()}_REF`] || product.ref;
  const repo = process.env[`${product.name.toUpperCase()}_REPO`] || product.repo;
  const dir = join(vendorDir, product.name);
  const url = `${repo}#${ref}`;

  console.log(`\n→ Vendoring ${product.name} (${url})`);

  if (existsSync(dir)) {
    // Keep the pinned checkout fresh without re-cloning.
    run('git', ['fetch', '--depth', '1', 'origin', ref], dir);
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], dir);
  } else {
    run('git', ['clone', '--depth', '1', '--branch', ref, repo, dir], vendorDir);
  }

  await prepareWorkspace(product, dir);
  run('bun', ['install', '--frozen-lockfile'], dir);
  run(product.buildCommand[0], product.buildCommand.slice(1), dir, product.buildEnv);

  const dist = join(dir, product.distDir);
  if (!existsSync(dist)) {
    throw new Error(`${product.name}: expected build output at ${dist}`);
  }

  const target = join(outDir, product.name);
  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await cp(dist, target, { recursive: true });
  console.log(`✓ ${product.name} → site/out/${product.name}`);
}

if (process.env.SKIP_VENDOR_PRODUCTS) {
  console.log('SKIP_VENDOR_PRODUCTS set — leaving site/out without vendored products');
  process.exit(0);
}

const selected = process.argv.slice(2);
const products = selected.length
  ? PRODUCTS.filter(p => selected.includes(p.name))
  : PRODUCTS;

if (selected.length && products.length === 0) {
  console.error(`Unknown product(s): ${selected.join(', ')}. Known: ${PRODUCTS.map(p => p.name).join(', ')}`);
  process.exit(1);
}

await mkdir(vendorDir, { recursive: true });
for (const product of products) {
  await vendorProduct(product);
}

await writeSearchFiles(outDir);
