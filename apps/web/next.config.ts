import type { NextConfig } from "next";
import { existsSync, lstatSync, mkdirSync, symlinkSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Auto-create app/local/apps.local.ts if missing
// ─────────────────────────────────────────────────────────────────────────────
// The local directory is gitignored and holds developer-specific app
// registrations. On a fresh clone this file won't exist, so we create an
// empty stub so the import in app/apps/registry.ts always resolves.
// See app/catalog/apps.local.example.ts for a full working template.
// ─────────────────────────────────────────────────────────────────────────────

const localDir = join(__dirname, "app", "local");
const localAppsFile = join(localDir, "apps.local.ts");

if (!existsSync(localDir)) {
  mkdirSync(localDir, { recursive: true });
}

if (!existsSync(localAppsFile)) {
  writeFileSync(
    localAppsFile,
    [
      "// ─────────────────────────────────────────────────────────────────────────",
      "// Local App Registration (gitignored)",
      "// ─────────────────────────────────────────────────────────────────────────",
      "// Add your apps here to load them into the Hudson workspace.",
      "// This file is auto-created on first run and never committed to git.",
      "//",
      "// For a full working example, see: app/catalog/apps.local.example.ts",
      "// ─────────────────────────────────────────────────────────────────────────",
      "",
      "import type { WorkspaceAppConfig, HudsonWorkspace } from 'hudsonkit';",
      "",
      "export const localApps: WorkspaceAppConfig[] = [];",
      "export const localWorkspaces: HudsonWorkspace[] = [];",
      "",
    ].join("\n"),
  );
}

const localWorkspacesFile = join(localDir, "workspaces.json");
if (!existsSync(localWorkspacesFile)) {
  writeFileSync(localWorkspacesFile, "[]\n");
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// turbopack.root
// ─────────────────────────────────────────────────────────────────────────────
// Default: the Hudson repo root (__dirname).
//
// The previous default — `join(__dirname, "..")` — pulled every sibling repo
// under ../ into Turbopack's watch graph. That dramatically expanded the
// FSEvents queue, multiplied watcher counts when consumers added their own
// dev servers, and contributed to the May runaway-watcher incident.
//
// If you genuinely need the broader root (e.g. you're integrating a sibling
// sandbox app from ../some-app while iterating in-tree), set
// HUDSON_TURBOPACK_PARENT=1 in your shell. The opt-in keeps the dangerous
// scope explicit per-shell instead of baked into the repo for everyone.
// ─────────────────────────────────────────────────────────────────────────────
// __dirname is now apps/web; the monorepo root (where node_modules is hoisted)
// is two levels up. Turbopack's root must be the monorepo root, not apps/web.
const repoRoot = join(__dirname, "..", "..");
const turbopackRoot = process.env.HUDSON_TURBOPACK_PARENT === "1"
  ? join(repoRoot, "..")
  : repoRoot;
const rootNodeModules = join(repoRoot, "node_modules");

// ─────────────────────────────────────────────────────────────────────────────
// Parent-root Tailwind resolution shim
// ─────────────────────────────────────────────────────────────────────────────
// When HUDSON_TURBOPACK_PARENT=1 widens the root to ../, turbopack reports the
// `from` of app/globals.css relative to that parent, so @tailwindcss/postcss
// resolves the `@import "tailwindcss"` from ../ (which has no node_modules) and
// fails. Worse, the dev CSS loader retries the failed compile in a loop. Note
// turbopack's `resolveAlias` below does NOT fix this — Tailwind's plugin uses
// its own enhanced-resolve, which ignores turbopack's alias table.
//
// So we make `tailwindcss` (and the @tailwindcss/* scope: postcss/node/oxide)
// resolvable from the parent by symlinking them into ../node_modules, pointing
// back at this repo's installed copies. Dev-only, idempotent, and scoped to the
// opt-in — sibling repos with their own tailwindcss still resolve theirs first
// (node walks the closest node_modules).
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.HUDSON_TURBOPACK_PARENT === "1") {
  const parentNodeModules = join(turbopackRoot, "node_modules");
  const linkIfMissing = (name: string) => {
    const target = join(rootNodeModules, name);
    const link = join(parentNodeModules, name);
    if (!existsSync(target)) return; // nothing to point at
    try {
      // existsSync follows symlinks; lstatSync catches a dangling link to replace.
      if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) return;
      mkdirSync(join(link, ".."), { recursive: true });
      symlinkSync(target, link, "dir");
    } catch {
      // Best-effort: a read-only parent or a race just leaves the original
      // (loud) resolution error, which is still better than a silent miss.
    }
  };
  linkIfMissing("tailwindcss");
  linkIfMissing("@tailwindcss");
  // hudsonkit: app/globals.css imports the precompiled SDK styles via the bare
  // specifier `hudsonkit/styles`, which must resolve from the parent.
  linkIfMissing("hudsonkit");
}
const singletonAliases = {
  "react": join(rootNodeModules, "react"),
  "react/jsx-runtime": join(rootNodeModules, "react", "jsx-runtime.js"),
  "react/jsx-dev-runtime": join(rootNodeModules, "react", "jsx-dev-runtime.js"),
  "react-dom": join(rootNodeModules, "react-dom"),
  "react-dom/client": join(rootNodeModules, "react-dom", "client.js"),
  "ai": join(rootNodeModules, "ai"),
  "@ai-sdk/react": join(rootNodeModules, "@ai-sdk", "react"),
};
const toTurbopackAliasPath = (target: string) => {
  const rel = relative(turbopackRoot, target).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
};
const turbopackSingletonAliases = Object.fromEntries(
  Object.entries(singletonAliases).map(([key, target]) => [key, toTurbopackAliasPath(target)]),
);

const nextConfig: NextConfig = {
  transpilePackages: ["hudsonkit", "@voxd/client"],
  serverExternalPackages: ["@earendil-works/pi-ai", "@openscout/agent-sessions", "esbuild"],
  turbopack: {
    root: turbopackRoot,
    resolveAlias: {
      ...turbopackSingletonAliases,
      tailwindcss: toTurbopackAliasPath(join(rootNodeModules, "tailwindcss")),
    },
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...singletonAliases,
    };
    return config;
  },
  async rewrites() {
    return [
      { source: "/llms.txt", destination: "/api/llms-txt" },
      { source: "/llms-full.txt", destination: "/api/llms-full-txt" },
    ];
  },
};

export default nextConfig;
