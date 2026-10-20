#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DIST_TAG = /^[a-z][a-z0-9._-]*$/;

function assertVersion(version, label) {
  if (!STRICT_SEMVER.test(version)) {
    throw new Error(`${label} is not a strict semantic version: ${version}`);
  }
}

export function planPackagePublish({ packageName, localVersion, distTag, metadata }) {
  assertVersion(localVersion, `${packageName} local version`);
  if (!DIST_TAG.test(distTag)) {
    throw new Error(`Invalid npm dist-tag: ${distTag}`);
  }

  const versions = metadata?.versions ?? {};
  if (Object.hasOwn(versions, localVersion)) {
    return {
      action: 'skip',
      packageName,
      localVersion,
      distTag,
      reason: 'exact version already published',
    };
  }

  const prerelease = localVersion.includes('-');
  if (prerelease && distTag === 'latest') {
    throw new Error(`${packageName}@${localVersion} is a prerelease and requires an explicit non-latest dist-tag`);
  }
  if (!prerelease && distTag !== 'latest') {
    throw new Error(`${packageName}@${localVersion} is stable and must publish to the latest dist-tag`);
  }

  const publishedTagVersion = metadata?.['dist-tags']?.[distTag];
  if (publishedTagVersion) {
    assertVersion(publishedTagVersion, `${packageName} published ${distTag} version`);
    if (Bun.semver.order(localVersion, publishedTagVersion) <= 0) {
      throw new Error(
        `${packageName}@${localVersion} would move ${distTag} backward from ${publishedTagVersion}`,
      );
    }
  }

  return {
    action: 'publish',
    packageName,
    localVersion,
    distTag,
    reason: publishedTagVersion
      ? `advances ${distTag} from ${publishedTagVersion}`
      : `creates ${distTag}`,
  };
}

export async function fetchRegistryMetadata(packageName, registry = 'https://registry.npmjs.org') {
  const url = `${registry.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
  } catch (error) {
    throw new Error(`npm registry query failed for ${packageName}: ${error.message}`);
  }

  if (response.status === 404) {
    return { versions: {}, 'dist-tags': {} };
  }
  if (!response.ok) {
    throw new Error(`npm registry query failed for ${packageName}: HTTP ${response.status}`);
  }

  const metadata = await response.json();
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`npm registry returned invalid metadata for ${packageName}`);
  }
  return metadata;
}

async function main() {
  const [packageDirectory, expectedPackageName, distTag = 'latest'] = process.argv.slice(2);
  if (!packageDirectory || !expectedPackageName) {
    throw new Error('usage: npm-publish-plan.mjs <package-directory> <package-name> [dist-tag]');
  }

  const manifest = JSON.parse(
    await readFile(resolve(packageDirectory, 'package.json'), 'utf8'),
  );
  if (manifest.name !== expectedPackageName) {
    throw new Error(
      `package name mismatch: expected ${expectedPackageName}, found ${manifest.name ?? '<missing>'}`,
    );
  }

  if (manifest.private) throw new Error(`${manifest.name} is internal and cannot be published`);

  const metadata = await fetchRegistryMetadata(
    expectedPackageName,
    process.env.NPM_CONFIG_REGISTRY,
  );
  const plan = planPackagePublish({
    packageName: expectedPackageName,
    localVersion: manifest.version,
    distTag,
    metadata,
  });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
