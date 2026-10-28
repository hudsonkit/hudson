# Hudson Studio — Agent Notes

Internal exploration lab for Hudson. Vite + React SPA on port **3033** that
dogfoods hudsonkit primitives via the shared `studio` package. Recursive by
design: Hudson builds hudsonkit, and Hudson Studio uses hudsonkit (+ studio)
to render hudsonkit.

## Running it

```bash
bun run dev:studio   # from hudson repo root — builds hudsonkit, starts vite on :3033
bun --cwd apps/studio dev   # if hudsonkit dist is already built
```

The root `dev:studio` script does `bun run --filter hudsonkit build` first so
the studio's `hudsonkit/*` imports resolve. When iterating on hudsonkit
itself, you'll need to rebuild hudsonkit (or run its own watch) for changes
to propagate here — studio source updates are live (workspace symlink to raw
`.ts/.tsx`).

## Ownership boundary — what we use vs what we write

The whole point of building this here is to avoid reimplementing UI patterns
that already exist in the family. Update this table whenever you find
yourself writing code that duplicates a studio or hudsonkit primitive.

### From `hudsonkit` (Hudson chrome — never reimplement here)

| Subpath | Used as |
| --- | --- |
| `hudsonkit/app-shell` | `AppShell` — wraps the whole studio |
| `hudsonkit` (root) | `HudsonApp` type — the contract our `studioApp` satisfies |
| `hudsonkit/theme` | `ThemeProvider`, theme tokens via `tokens.css` |

### From `studio` (shared design-studio primitives — never reimplement here)

| Subpath | Used as |
| --- | --- |
| `studio/registry` | `createRegistry`, `StudioPage` type — page catalog |
| `studio/shell` | `RegistryNav` (sidebar), `PageStrip` (per-page breadcrumb strip) |
| `studio/router` | `StudioRouterProvider`, `StudioRouter`, `StudioLinkProps` |
| `studio/doc` | `EngMarkdown` body, `EngDocSheet` + `DataRow` for header/colophon sheets |
| `studio/atoms` | `createStatusPalette` → bound `StatusPill` for proposal status |
| `studio/flows` | `createStudioFlowsApp` + Flows model/UI — the journey canvas owned by Studio |
| `studio/theme.css` | CSS-var aliases `--studio-* → --hud-*` |
| `studio/doc.css` | Editorial typography + code-block styles |

### What we write (Hudson-specific — owned here)

- **Taxonomy** (`src/registry/taxonomy.ts`) — Hudson's `Bucket` / `Surface` /
  `Status` unions and their labels. Buckets:
  `foundations` · `atoms` · `compositions` · `proposals`.
- **Page catalog** (`src/registry/pages.ts`) — static entries for foundations
  / atoms / compositions exhibits. Proposals are **not** listed here —
  they flow in via `extraPages` from `src/content/`.
- **Content loaders** (`src/content/`) — auto-discover HUD-NNN proposals:
  - `proposals.ts` scans `docs/specs/*.md` + `packages/native/apple/HudsonKit/Docs/*.md`
    for `hud-NNN-*.md` filenames. Parses the HUD id, sorts by HUD number
    (then kind, then slug), tags each with origin (`specs` → web shell,
    `apple` → iOS/macOS shell). Sidebar listing shows the full catalog —
    `mtimeMs` stays on each `Proposal` for any consumer that still wants
    recency sorting.
  - `index.ts` exports `findEngBySlug(slug)` (proposal lookup by slug) and
    `buildEngExtraPages()` (full HUD-NNN-ordered listing for RegistryNav).
- **Vite plugin** (`vite.config.ts`) — `engMtimesPlugin` exposes
  filesystem mtimes for `docs/*.md`, `docs/specs/*.md`, and the Apple Docs as
  `virtual:eng-mtimes`. `import.meta.glob` has no mtime channel; the
  plugin closes that gap.

### What we deliberately do not surface

- **Top-level `docs/*.md`** (Engineering Notes) — these are the canonical
  Hudson docs already published at `hudsonkit.com/docs/*` via the Next.js
  route at `app/docs/[...slug]`. Duplicating them in studio creates a
  second URL space for the same content. If you need them while iterating
  here, open them in another tab from the live docs site. Studio is for
  the *unpublished* working material — HUD proposals, design exhibits,
  internal exploration.
- **The annotation tool** in `studio-dev/annotations/eng-doc` — it's a
  pre-merge mock. Wait for it to graduate into `studio/doc`.
- **Router adapter** (`src/router/index.tsx`) — SPA Link + pushState
  navigation, exposed as a `StudioRouter` so studio components stay aware of
  client-side nav (avoids full-page reloads when EngMarkdown emits links).
- **Pages** (`src/pages/`) — Home, Doc, Exhibit, NotFound page shells.
- **Exhibits** (`src/exhibits/<slug>/`) — one folder per study. Each exports
  a single component registered in `src/exhibits/index.ts`.
- **Flows adapter** (`src/flows/FlowsApp.tsx`) — registers Hudson-specific
  Fieldwork surfaces and navigation with the Studio-owned Flows app.
- **Tailwind v4 recipe** (`src/styles/tailwind.css`) — the `@import`,
  `@source`, and `@theme` plumbing that wires studio's CSS vars into v4
  utility classes. **Worth contributing back to studio's README** — Hudson is
  the first v4 consumer; the other consumers (talkie, openscout, lattices)
  are all on v3.

## Not yet wired (intentional)

- `PageStrip` (`studio/shell`) — DocPage uses it; `ExhibitPage` still rolls
  its own hand-built header. Worth consolidating onto `PageStrip` next.
- `CodeViewer` (`studio/code`) — read-only CodeMirror. Wire when we add an
  exhibit that needs to show source files.
- `useResizableWidth` (`studio/shell`) — only relevant if we ever roll our
  own panel chrome instead of using hudsonkit's `SidePanel`.
- **Annotation tool** — not in the `studio` package yet; lives as a mock in
  `studio-dev/annotations/eng-doc`. Wait for it to graduate into
  `studio/doc` rather than building our own.

## Discoverability of new studio exports

When `studio` ships a new primitive, it lands automatically (workspace
symlink — no install step). The canonical list is in
`/Users/arach/dev/studio/package.json` `exports`. Diff against the tables
above to see whether anything new is worth adopting here.

## Theme bootstrap

`index.html` inlines the no-FOUC theme bootstrap script in `<head>` (mirrors
`getHudsonThemeScript()` from `packages/web/hudsonkit/src/theme/script.ts`).
**Keep that script in sync** if hudsonkit's bootstrap logic changes — it
can't be a React component in Vite because the FOUC window is before
hydration. Hudsonkit's `HudsonThemeScript` React component is for Next.js
consumers; here it'd run too late.

## Vite gotchas (baked into the config — don't undo)

- `optimizeDeps.exclude: ['studio', 'hudsonkit']` — without this, Vite
  pre-bundles them and source changes stop propagating live.
- `server.fs.allow` includes the Hudson root **and** `../studio` — needed
  because both are workspace-linked from outside `node_modules`.
- `@source` directives in `tailwind.css` scan both
  `packages/web/hudsonkit/src/**` and the linked `node_modules/studio/src/**`. Skip these and
  utility classes work in dev but **disappear in prod** (every consumer
  hits this once).

## Adding an exhibit

1. New folder under `src/exhibits/<slug>/` with one component file.
2. Register it in `src/exhibits/index.ts` (slug → component).
3. Add a page entry in `src/registry/pages.ts` with
   `href: "/exhibits/<slug>"` and a bucket.

The sidebar updates automatically.

## Local working documents

Keep internal plans, proposals, and reports in `apps/studio/local/docs/`,
organized into `plans/`, `proposals/`, and `reports/`. This directory is
Git-ignored and available to local agents through the filesystem. It is not
part of the public site or a production Studio bundle. Do not force-add it.

Use the repository root `docs/` only for publishable product documentation.
Do not put internal working documents back under `docs/`. Local documents
are machine-local; a fresh clone will not include them.
