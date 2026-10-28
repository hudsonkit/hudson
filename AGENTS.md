# Documentation publication boundary

Internal plans, proposals, and reports belong in `apps/studio/local/docs/`
(Git-ignored, local filesystem access for Studio and agents). Never place
them in public `docs/` or force-add local Studio content to Git.

# hudson

> Multi-app canvas workspace platform for React

## Critical Context

**IMPORTANT:** Read these rules before making any changes:

- Hudson uses bun as its package manager — never use npm or pnpm
- All UI components are custom-built — do not replace with library components
- Use `@base-ui-components/react` as the sanctioned headless *behaviors* layer (tooltip, menu, popover, select, context menu) via opt-in subpaths (`hudsonkit/behaviors`, `hudsonkit/context-menu`); Hudson owns all visual register. Motion sparingly.
- Every app must implement the HudsonApp interface from hudsonkit
- Apps do not manage shell chrome — the shell reads from app hooks and renders slots
- State is owned by each app Provider via React context
- NEVER use purple in designs — prefer cyan/blue/teal/emerald color ranges
- Agent action lifecycle logging is for agents fulfilling Hudson product actions, such as generating a logo, testing a route, running an app workflow, or exercising another intended HudsonKit capability. In that context, log a paired lifecycle; prefer `bun scripts/agent-action.ts run -- ...` when wrapping a command, and if you use `start`, close it with `complete` or `fail`. Do not use it for routine platform-development work like code edits, branch checks, reviews, Scout handoffs, or agent coordination unless the user explicitly asks or the task is exercising a product action path.

## Project Structure

| Component | Path | Purpose |
|-----------|------|---------|
| Shell | `packages/web/hudsonkit/src/workspace/shell/` | Runtime shell source exported via `hudsonkit/workspace` |
| Apps | `apps/web/app/apps/` | |
| Workspaces | `apps/web/app/workspaces/` | |
| Hudson SDK | `packages/web/hudsonkit/src/` | |
| Types | `packages/web/hudsonkit/src/types/` | |

## Quick Navigation

- Working with **new app**? → See docs/building-apps.md and apps/web/app/apps/hudson-docs/ or packages/web/hudsonkit/src/apps/notepad/ as references
- Working with **workspace**? → Check apps/web/app/workspaces/ for workspace definitions
- Working with **intent**? → See packages/web/hudsonkit/src/types/intent.ts and apps/web/app/lib/intent-catalog.ts
- Working with **component**? → Check packages/web/hudsonkit/src/components/ for chrome, canvas, windows, and overlays
- Working with **styling**? → Uses Tailwind v4, design tokens in packages/web/hudsonkit/src/lib/theme.ts

## Overview

> Introduction to Hudson — a multi-app canvas workspace platform for React

# Overview

Hudson is a **multi-app canvas workspace platform** built with React 19, Next.js 16, and Tailwind CSS v4. It provides a shared shell where multiple applications coexist — each rendering in draggable, resizable windows on an infinite pan/zoom canvas, or in a static panel layout.

Think of it as a desktop environment in the browser: apps register themselves, the shell provides chrome (navigation bar, side panels, command palette, status bar), and each app just focuses on its own UI and state.

## Minimal Example

A Hudson app is a plain object satisfying the `HudsonApp` interface:

```tsx
import type { HudsonApp } from 'hudsonkit';

export const counterApp: HudsonApp = {
  id: 'counter',
  name: 'Counter',
  mode: 'panel',
  Provider: ({ children }) => <CounterCtx.Provider value={state}>{children}</CounterCtx.Provider>,
  slots: { Content: () => <div>{count}</div> },
  hooks: {
    useCommands: () => [{ id: 'counter:reset', label: 'Reset', action: () => setCount(0) }],
    useStatus: () => ({ label: 'OK', color: 'emerald' }),
  },
};
```

Register it in a workspace and it immediately gets panels, command palette, status bar, and canvas windowing — all for free. See the [Quickstart](./quickstart.md) for a complete walkthrough.

## Architecture

Hudson has three layers:

### 1. Hudson web SDK (`packages/web/hudsonkit`)

The component library and type system. Provides:

- **Chrome components** — Frame, NavigationBar, SidePanel, StatusBar, CommandDock, ZoomControls
- **Canvas system** — Pan/zoom engine with space-bar gestures
- **Window system** — AppWindow with dragging, resizing, maximize/restore
- **Overlays** — CommandPalette (Cmd+K), TerminalDrawer, HudsonContextMenu
- **Type contracts** — `HudsonApp`, `HudsonWorkspace`, `AppIntent`
- **Utilities** — Web Audio sounds, persistent state, viewport math

### 2. Shell (`packages/web/hudsonkit/src/workspace/shell/`)

The runtime orchestrator. `WorkspaceShell` is the main entry point that:

- Nests all app Providers recursively
- Calls each app's hooks inside the correct context scope
- Renders app slots into shell chrome (panels, content area, terminal)
- Manages workspace switching, boot animations, and canvas state
- Provides the command palette, merging commands from all active apps

### 3. Apps (`apps/web/app/apps/`)

Self-contained applications that implement the `HudsonApp` interface. Each app provides:

- A **Provider** (React context) that owns all app state
- **Slot components** (Content, LeftPanel, RightPanel, Terminal) rendered by the shell
- **Hooks** that bridge app state into shell chrome (commands, status, search, nav)
- Optional **intents** for LLM/voice/search indexing

## Key Concepts

### Workspaces

A workspace is a collection of apps that coexist in a shared shell. Each workspace defines:

- A **mode** (`canvas` or `panel`) — the global layout strategy
- A list of **apps** with canvas participation settings
- A **default focused app**

Hudson supports multiple workspaces. Users switch between them at runtime.

### Frame Modes

Apps can render in two modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `canvas` | Infinite pan/zoom world space | Editors, graph UIs, spatial tools |
| `panel` | Static scrollable viewport | Dashboards, admin interfaces, docs |

Individual apps can override the workspace-level mode via the `useLayoutMode` hook.

### Canvas Participation

In canvas-mode workspaces, each app chooses how it appears:

| Participation | Behavior | Example |
|---------------|----------|---------|
| `native` | Renders directly on canvas, no window frame | Hudson Docs |
| `windowed` | Renders inside AppWindow with title bar, dragging, resizing | Hudson Docs, Intent Explorer |

### Intent System

Hudson includes an intent catalog for LLM/voice integration. Apps declare intents — structured metadata about their commands — which are indexed into a searchable catalog. An execution bridge maps intent `commandId` values to live command actions.

## Current Apps

| App | Description | Mode |
|-----|-------------|------|
| **Hudson Docs** | Documentation browser | Canvas windowed |
| **Hudson AI** | AI workbench/settings surface | Canvas windowed |
| **Intent Explorer** | Browsable intent catalog inspector | Canvas windowed |
| **Theme Designer** | Theme token/design surface | Canvas windowed |
| **Stage Design** | Compact stage/layout design reference | Canvas windowed |

## Next Steps

- [Quickstart](./quickstart.md) — Get Hudson running locally and create your first app
- [Building Apps](./building-apps.md) — Full integration guide (Provider, slots, hooks, intents, workspaces)
- [API Reference](./api.md) — Complete reference for hudsonkit exports

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Icons | Iconoir through HudsonKit's semantic icon adapter |
| Fonts | SF Rounded (UI), JetBrains Mono (monospace) |
| Package manager | bun |
| Dev server | Port 3500 |

## Quickstart

> Get Hudson running locally in under 5 minutes

# Quickstart

Get Hudson running locally and create your first app.

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [bun](https://bun.sh) (package manager and runtime)
- git

## Setup

```bash
# Clone the repository
git clone https://github.com/arach/hudson.git
cd hudson

# Install dependencies
bun install

# Start the dev server (port 3500)
bun dev
```

Open [http://localhost:3500](http://localhost:3500). You should see the Hudson workspace with the boot animation, then the canvas with existing apps.

## Project Structure

```
hudson/
  apps/web/
    app/
      page.tsx                # Redirects to /app
      app/page.tsx            # Mounts WorkspaceShell from hudsonkit/workspace
      apps/                   # App implementations
        hudson-docs/          # Docs browser
        intent-explorer/      # Intent catalog inspector
        stage-design/         # Compact reference app
      apps/registry.ts        # Core + local app/workspace registry
      lib/                    # Shared utilities (intent catalog, etc.)
      hooks/                  # Shared hooks (intent executor, etc.)
  packages/
    web/hudsonkit/                  # Component library + types
      src/
        components/           # Chrome, Canvas, Windows, Overlays
        types/                # HudsonApp, HudsonWorkspace, AppIntent
        hooks/                # usePersistentState
        lib/                  # sounds, logger, viewport, chrome tokens
```

## Create Your First App

The fastest way to add an app is to scaffold it in `apps/web/app/apps/`:

### 1. Create the app directory

```bash
mkdir -p apps/web/app/apps/my-app
```

### 2. Create the Provider

```tsx
// apps/web/app/apps/my-app/MyAppProvider.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface MyAppState {
  count: number;
  increment: () => void;
}

const Ctx = createContext<MyAppState | null>(null);
export const useMyApp = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMyApp must be inside MyAppProvider');
  return ctx;
};

export function MyAppProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  return (
    <Ctx.Provider value={{ count, increment: () => setCount(c => c + 1) }}>
      {children}
    </Ctx.Provider>
  );
}
```

### 3. Create the Content slot

```tsx
// apps/web/app/apps/my-app/MyAppContent.tsx
'use client';

import { useMyApp } from './MyAppProvider';

export function MyAppContent() {
  const { count, increment } = useMyApp();
  return (
    <div className="flex items-center justify-center h-full gap-4">
      <span className="text-4xl font-bold text-white">{count}</span>
      <button onClick={increment} className="px-4 py-2 bg-emerald-600 rounded">
        +1
      </button>
    </div>
  );
}
```

### 4. Define the app

```tsx
// apps/web/app/apps/my-app/index.ts
import type { HudsonApp } from 'hudsonkit';
import { MyAppProvider } from './MyAppProvider';
import { MyAppContent } from './MyAppContent';

export const myApp: HudsonApp = {
  id: 'my-app',
  name: 'My App',
  description: 'A minimal counter app',
  mode: 'panel',

  Provider: MyAppProvider,
  slots: { Content: MyAppContent },

  hooks: {
    useCommands: () => [],
    useStatus: () => ({ label: 'OK', color: 'emerald' }),
  },
};
```

### 5. Register in a workspace

```tsx
// apps/web/app/workspaces/hudsonOS.ts — add to apps array
import { myApp } from '../apps/my-app';

// Inside the apps array:
{
  app: myApp,
  canvasMode: 'windowed',
  defaultWindowBounds: { x: 0, y: 0, w: 400, h: 300 },
}
```

Save, and your app appears as a draggable window on the canvas. See [Building Apps](./building-apps.md) for the full guide.

## Building Apps

> Complete guide to building apps for the Hudson platform

# Building Apps

This guide covers everything you need to build a Hudson app — from the interface contract to workspace registration.

## The HudsonApp Interface

Every app implements the `HudsonApp` interface exported from `hudsonkit`:

```typescript
import type { HudsonApp } from 'hudsonkit';
```

### Full Interface

```typescript
interface HudsonApp {
  // Identity
  id: string;                    // Unique ID (key + localStorage namespace)
  name: string;                  // Display name in app switcher
  description?: string;          // Tooltip / palette description
  mode: 'canvas' | 'panel';     // Default frame mode

  // Panel configuration (optional)
  leftPanel?: {
    title: string;
    icon?: ReactNode;
    headerActions?: React.FC;    // Rendered in left panel header
  };
  rightPanel?: {
    title: string;
    icon?: ReactNode;
  };

  // State owner
  Provider: React.FC<{ children: ReactNode }>;

  // UI slots rendered by the shell
  slots: {
    Content: React.FC;           // Main content area (required)
    LeftPanel?: React.FC;        // Left sidebar content
    RightPanel?: React.FC;       // Right sidebar content
    LeftFooter?: React.FC;       // Footer of left panel
    Terminal?: React.FC;         // Terminal drawer content
  };

  // Intent declarations (optional)
  intents?: AppIntent[];

  // Hooks called inside Provider scope
  hooks: {
    useCommands: () => CommandOption[];              // Required
    useStatus: () => { label: string; color: StatusColor };  // Required
    useSearch?: () => SearchConfig;
    useNavCenter?: () => ReactNode | null;
    useNavActions?: () => ReactNode | null;
    useLayoutMode?: () => 'canvas' | 'panel';
  };
}
```

### Required vs Optional

| Field | Required | Purpose |
|-------|----------|---------|
| `id`, `name`, `mode` | Yes | Identity and default layout |
| `Provider` | Yes | Wraps all slots, owns state |
| `slots.Content` | Yes | Main UI |
| `hooks.useCommands` | Yes | Commands for palette (can return `[]`) |
| `hooks.useStatus` | Yes | Status bar label and color |
| `leftPanel`, `rightPanel` | No | Panel header config |
| `slots.LeftPanel`, `RightPanel`, `LeftFooter`, `Terminal` | No | Additional UI slots |
| `hooks.useSearch`, `useNavCenter`, `useNavActions`, `useLayoutMode` | No | Nav bar integration |
| `intents` | No | LLM/voice/search declarations |

## Architecture Pattern

Hudson uses a **Provider + Slots + Hooks** architecture:

```
WorkspaceShell
  └── App.Provider            ← Your context wraps everything
        ├── slots.Content     ← Rendered in main area
        ├── slots.LeftPanel   ← Rendered in left SidePanel
        ├── slots.RightPanel  ← Rendered in right SidePanel
        ├── slots.Terminal    ← Rendered in TerminalDrawer
        └── hooks.*           ← Called via Bridge component inside Provider
```

The shell nests Providers recursively for all apps in the workspace:

```typescript
// Inside WorkspaceShell
let tree = <WorkspaceInner />;
for (const { app } of workspace.apps.reverse()) {
  tree = <app.Provider>{tree}</app.Provider>;
}
```

This means every app's hooks and slots have access to every app's context. However, apps should only access their own context — cross-app communication goes through the shell.

## Provider Pattern

The Provider owns all app state via React context:

```tsx
'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface GlyphEditorState {
  // View state
  view: 'overview' | 'editor';
  setView: (v: 'overview' | 'editor') => void;

  // Data state
  selectedGlyphId: string | null;
  selectGlyph: (id: string) => void;

  // Tool state
  activeTool: 'select' | 'pen' | 'eraser';
  setTool: (t: 'select' | 'pen' | 'eraser') => void;
}

const Ctx = createContext<GlyphEditorState | null>(null);

export function useGlyphEditor() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGlyphEditor must be inside GlyphEditorProvider');
  return ctx;
}

export function GlyphEditorProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<'overview' | 'editor'>('overview');
  const [selectedGlyphId, setSelectedGlyphId] = useState<string | null>(null);
  const [activeTool, setTool] = useState<'select' | 'pen' | 'eraser'>('select');

  const selectGlyph = useCallback((id: string) => {
    setSelectedGlyphId(id);
    setView('editor');
  }, []);

  return (
    <Ctx.Provider value={{ view, setView, selectedGlyphId, selectGlyph, activeTool, setTool }}>
      {children}
    </Ctx.Provider>
  );
}
```

## Slot Components

Slots are plain React components that use your app's context:

### Content (required)

The main content area. In canvas mode, this renders in world space. In panel mode, it fills the viewport between the panels.

```tsx
'use client';

import { useGlyphEditor } from './GlyphEditorProvider';
import { GlyphOverview } from './components/GlyphOverview';
import { GlyphCanvas } from './components/GlyphCanvas';

export function GlyphEditorContent() {
  const { view } = useGlyphEditor();
  return view === 'overview' ? <GlyphOverview /> : <GlyphCanvas />;
}
```

### LeftPanel

Rendered inside the left SidePanel. Good for navigation, project trees, tool palettes.

```tsx
'use client';

import { useGlyphEditor } from './GlyphEditorProvider';

export function GlyphEditorLeftPanel() {
  const { selectGlyph } = useGlyphEditor();
  return (
    <div className="p-2 space-y-1">
      {glyphs.map(g => (
        <button key={g.id} onClick={() => selectGlyph(g.id)}
          className="w-full text-left px-2 py-1 rounded hover:bg-white/5">
          {g.name}
        </button>
      ))}
    </div>
  );
}
```

### RightPanel

Inspector, properties, metadata. Rendered inside the right SidePanel.

### LeftFooter

Rendered at the bottom of the left panel. Use this for compact app-specific summaries, previews, or actions.

### Terminal

Rendered inside the TerminalDrawer (toggled via Cmd+`). Good for logs, REPL, debug output.

## Hooks

Hooks bridge your app state into the shell chrome. They are called inside your Provider's scope.

### useCommands (required)

Return an array of `CommandOption` objects. These appear in the command palette (Cmd+K).

```tsx
import { useMemo } from 'react';
import type { CommandOption } from 'hudsonkit';
import { useGlyphEditor } from './GlyphEditorProvider';

export function useGlyphCommands(): CommandOption[] {
  const { setView, setTool, view } = useGlyphEditor();

  return useMemo(() => [
    {
      id: 'glyph:overview',
      label: 'Show Glyph Overview',
      action: () => setView('overview'),
      shortcut: 'Cmd+1',
    },
    {
      id: 'glyph:editor',
      label: 'Open Glyph Editor',
      action: () => setView('editor'),
      shortcut: 'Cmd+2',
    },
    {
      id: 'glyph:pen-tool',
      label: 'Pen Tool',
      action: () => setTool('pen'),
      shortcut: 'P',
    },
  ], [setView, setTool, view]);
}
```

### useStatus (required)

Return a label and color for the status bar.

```tsx
export function useGlyphStatus() {
  const { view, activeTool } = useGlyphEditor();
  if (view === 'editor') return { label: activeTool.toUpperCase(), color: 'emerald' as const };
  return { label: 'OVERVIEW', color: 'neutral' as const };
}
```

Valid colors: `'emerald'`, `'amber'`, `'red'`, `'neutral'`.

### useSearch (optional)

Provides a search bar in the navigation bar.

```tsx
export function useGlyphSearch() {
  const [query, setQuery] = useState('');
  return { value: query, onChange: setQuery, placeholder: 'Search glyphs...' };
}
```

### useNavCenter (optional)

Returns content rendered in the center of the navigation bar (between left/right actions).

### useNavActions (optional)

Returns content rendered on the right side of the navigation bar. Good for action buttons.

### useLayoutMode (optional)

Overrides the workspace-level mode for this app. Useful when an app needs canvas mode even in a panel workspace, or vice versa.

```tsx
export function useGlyphLayoutMode(): 'canvas' | 'panel' {
  const { view } = useGlyphEditor();
  return view === 'editor' ? 'canvas' : 'panel';
}
```

## Intents

Intents declare structured metadata about your commands for LLM/voice/search integration.

```typescript
import type { AppIntent } from 'hudsonkit';

export const glyphIntents: AppIntent[] = [
  {
    commandId: 'glyph:pen-tool',        // Must match a CommandOption.id
    title: 'Switch to Pen Tool',
    description: 'Activate the pen tool for drawing bezier paths',
    category: 'tool',
    keywords: ['pen', 'draw', 'bezier', 'path', 'curve'],
    shortcut: 'P',
  },
  {
    commandId: 'glyph:export',
    title: 'Export Glyph',
    description: 'Export the current glyph as SVG',
    category: 'file',
    keywords: ['export', 'save', 'svg', 'download'],
    dangerous: true,  // Requires confirmation
    params: [
      { name: 'format', description: 'Export format', type: 'string', enum: ['svg', 'png'], default: 'svg' },
    ],
  },
];
```

### Intent Categories

| Category | Use Case |
|----------|----------|
| `tool` | Tool switching (pen, select, eraser) |
| `edit` | Data mutations (delete, duplicate, transform) |
| `file` | I/O operations (save, export, import) |
| `view` | View changes (zoom, pan, fit) |
| `navigation` | Navigation (go to glyph, switch view) |
| `toggle` | Boolean toggles (grid, snap, rulers) |
| `workspace` | Workspace-level actions |
| `settings` | Preference changes |

### Execution Bridge

The shell automatically bridges intents to commands. When an intent is executed (via LLM, voice, or the Intent Explorer), the shell looks up the matching `commandId` in your `useCommands()` output and calls its `action()`.

## Workspace Registration

### Add to an existing workspace

```typescript
// apps/web/app/workspaces/hudsonOS.ts
import { glyphEditorApp } from '../apps/glyph-editor';

export const hudsonOSWorkspace: HudsonWorkspace = {
  id: 'hudson-os',
  name: 'HudsonKit',
  mode: 'canvas',
  apps: [
    // ... existing apps
    {
      app: glyphEditorApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -300, y: -200, w: 700, h: 500 },
    },
  ],
};
```

### Create a standalone workspace

```typescript
// apps/web/app/workspaces/glyphDev.ts
import type { HudsonWorkspace } from 'hudsonkit';
import { glyphEditorApp } from '../apps/glyph-editor';

export const glyphDevWorkspace: HudsonWorkspace = {
  id: 'glyph-dev',
  name: 'Glyph Editor',
  description: 'Standalone glyph editing workspace',
  mode: 'panel',
  apps: [{ app: glyphEditorApp }],
};
```

### Register the workspace

```typescript
// apps/web/app/app/page.tsx
import { glyphDevWorkspace } from '../workspaces/glyphDev';

export default function Page() {
  return (
    <WorkspaceShell
      workspaces={[hudsonOSWorkspace, glyphDevWorkspace]}
      defaultWorkspaceId="hudson-os"
      bootMode="condensed"
    />
  );
}
```

## Canvas vs Panel Mode

### Canvas mode (`mode: 'canvas'`)

- Content renders in world space (infinite pan/zoom)
- Mouse wheel zooms, space+drag pans
- Option+drag on windows to move them
- Window bounds persisted to localStorage
- Best for: editors, spatial tools, graph UIs

### Panel mode (`mode: 'panel'`)

- Content renders in viewport space (static, scrollable)
- No pan/zoom controls
- Full-width layout between side panels
- Best for: dashboards, admin interfaces, documentation

Apps can dynamically switch modes using `useLayoutMode()`.

## Persistent State

Use `usePersistentState` from hudsonkit for state that survives page reloads:

```tsx
import { usePersistentState } from 'hudsonkit';

function MyComponent() {
  const [gridVisible, setGridVisible] = usePersistentState('my-app.grid', true);
  // Backed by localStorage with key 'my-app.grid'
}
```

## Sounds

Hudson includes a Web Audio synthesizer for UI feedback:

```tsx
import { sounds } from 'hudsonkit';

// Available sounds
sounds.blipUp();    // Positive feedback
sounds.click();     // Button press
sounds.whoosh();    // Transitions
sounds.thock();     // Heavy press
```

## File Structure Convention

```
apps/web/app/apps/my-app/
  index.ts                 # App definition (exports HudsonApp)
  MyAppProvider.tsx         # Context provider
  hooks.ts                 # Hook implementations
  intents.ts               # Intent declarations
  MyAppContent.tsx          # Content slot
  MyAppLeftPanel.tsx        # Left panel slot
  MyAppRightPanel.tsx       # Right panel slot
  MyAppTerminal.tsx         # Terminal slot
  components/               # App-specific components
    ComponentA.tsx
    ComponentB.tsx
```

## Reference Implementation

The **Hudson Docs** app (`apps/web/app/apps/hudson-docs/`) is the most complete in-tree reference, with Provider-owned state, Content/LeftPanel/RightPanel slots, hooks, and intents. For a compact built-in kit app, see `packages/web/hudsonkit/src/apps/notepad/`.

The **Intent Explorer** (`apps/web/app/apps/intent-explorer/`) is a simpler example if you want a minimal starting point.

## Further Reading

- [Overview](./overview.md) — Architecture and key concepts
- [Quickstart](./quickstart.md) — Get running and create a minimal app
- [API Reference](./api.md) — Complete reference for all hudsonkit exports

## Consuming hudsonkit externally

> How to safely use hudsonkit from a downstream project (Next.js, Vite, etc.)
> outside this monorepo. These rules exist because we hit a real
> runaway-watcher incident; treat them as load-bearing, not stylistic.

Hudson ships hudsonkit as a sealed npm tarball (`dist/` + `bin/` only — no
`src/`). Consumers should depend on the published version, a sealed tgz, or a
git URL — **never** a `file:` path to a hudsonkit source folder.

### The four rules

1. **Install from a sealed artifact, never a source folder.**
   ```jsonc
   // package.json — consumer
   "dependencies": {
     // Good: published or local tgz
     "hudsonkit": "^0.3.0",
     // …or…
     "hudsonkit": "file:/path/to/hudsonkit-0.3.0.tgz"

     // Bad: never point at a folder. Compiles our source live + multiplies watchers.
     // "hudsonkit": "file:../hudson/packages/web/hudsonkit"
   }
   ```
   Generate a local tgz with `bun run pack` from inside
   `packages/web/hudsonkit/`.

2. **Do not put `hudsonkit` in `transpilePackages`.** The package already
   ships ESM + `.d.ts` from `dist/`. Adding it forces Next.js / Turbopack to
   recompile Hudson source on every change.
   ```ts
   // next.config.ts — consumer
   // transpilePackages: ['hudsonkit'],  // ← delete this line
   ```

3. **Do not point Tailwind at the hudsonkit tree.** Import the prebuilt
   bundle instead:
   ```ts
   // app/layout.tsx — consumer (external project)
   import 'hudsonkit/styles';
   ```
   ```css
   /* DO NOT do this in globals.css */
   /* @source "../node_modules/hudsonkit/dist/**"; */
   ```

4. **Keep `turbopack.root` inside your project.** A root above the project
   pulls every sibling repo into the watch graph.
   ```ts
   // next.config.ts — consumer
   turbopack: { root: __dirname }, // not join(__dirname, '..')
   ```

### Wire `hudsonkit preflight` into `predev`

The package ships a fail-fast scanner for all four rules above plus a few
related hazards (missing `dist/styles.css`, a hudson `next dev` already
running). Wire it so the dev server refuses to start when the config is
hostile:

```jsonc
// package.json — consumer
"scripts": {
  "predev":   "hudsonkit preflight --fail-on-risk",
  "prebuild": "hudsonkit preflight --fail-on-risk",
  "dev":      "next dev",
  "build":    "next build"
}
```

`--fail-on-risk` exits 1 on any HIGH finding. `--json` is available for CI.
Run `hudsonkit preflight --help` for full flags.

### If the watchers do escape

```sh
# Show every Hudson-related process on this host
hudsonkit status

# Dry-run: print what would be killed without signaling anything
hudsonkit panic

# Actually terminate them (SIGTERM → 3s grace → SIGKILL)
hudsonkit panic --yes

# Only target one role
hudsonkit panic --yes --filter next-dev
```

Detection uses, in order of confidence: `HUDSONKIT_RUN_ID` /
`HUDSONKIT_ROLE` / `HUDSONKIT_ROOT` env vars, a run registry at
`~/Library/Application Support/HudsonKit/runs/*.json`, and command-line
heuristics (`next dev` / `tsup --watch` / `vitest watch` inside a hudson
checkout). The env-var / registry path is forward-compatible — Hudson dev
wrappers don't write them yet.

### Embedding a plain React component

For passive embeds (think mockups, journey-map nodes) you don't need to
implement the full `HudsonApp` contract:

```tsx
import { createEmbedApp, WorkspaceShell } from 'hudsonkit/app-shell';
import { Home, Library } from './surfaces';

const apps = [
  createEmbedApp({
    id: 'home', title: 'Home', component: Home,
    initialPosition: { x: -190, y: -380 },
    initialSize:     { w: 380,  h: 760 },
  }),
  createEmbedApp({
    id: 'library', title: 'Library', component: Library,
    initialPosition: { x: 220, y: -380 },
    initialSize:     { w: 380, h: 760 },
  }),
];

export default function Map() {
  return <WorkspaceShell apps={apps} storageKey="my.app.windows" />;
}
```

This is the v1 explicit-placement API. A declarative variant
(`apps={...}` + `edges={...}` + `layout="auto"`) is in design — it will be
additive, not a replacement.

## API Reference

> Complete API reference for the hudsonkit package

# API Reference

Everything exported from the `hudsonkit` package.

```tsx
import { Frame, NavigationBar, SidePanel, ... } from 'hudsonkit';
```

## Types

### HudsonApp

The core interface every app must implement. See [Building Apps](./building-apps.md) for full details.

```typescript
import type { HudsonApp } from 'hudsonkit';
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier |
| `name` | `string` | Yes | Display name |
| `description` | `string` | No | Short description |
| `mode` | `'canvas' \| 'panel'` | Yes | Default frame mode |
| `leftPanel` | `{ title, icon?, headerActions? }` | No | Left panel config |
| `rightPanel` | `{ title, icon? }` | No | Right panel config |
| `Provider` | `React.FC<{ children }>` | Yes | State owner |
| `slots` | `{ Content, LeftPanel?, RightPanel?, LeftFooter?, Terminal? }` | Yes | UI slots |
| `intents` | `AppIntent[]` | No | Intent declarations |
| `hooks` | `{ useCommands, useStatus, ... }` | Yes | Shell bridge hooks |

### HudsonWorkspace

Defines a collection of apps in a shared shell.

```typescript
import type { HudsonWorkspace, WorkspaceAppConfig, CanvasParticipation } from 'hudsonkit';
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique workspace ID |
| `name` | `string` | Yes | Display name |
| `description` | `string` | No | Workspace description |
| `mode` | `'canvas' \| 'panel'` | Yes | Global frame mode |
| `apps` | `WorkspaceAppConfig[]` | Yes | App configurations |
| `defaultFocusedAppId` | `string` | No | Initially focused app |

**WorkspaceAppConfig:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `app` | `HudsonApp` | Yes | The app instance |
| `canvasMode` | `'native' \| 'windowed'` | No | Canvas participation (default: `'native'`) |
| `defaultWindowBounds` | `{ x, y, w, h }` | No | Initial window position/size |

### AppIntent

Structured metadata for LLM/voice/search integration.

```typescript
import type { AppIntent, IntentCategory, IntentParameter } from 'hudsonkit';
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `commandId` | `string` | Yes | Must match a CommandOption.id |
| `title` | `string` | Yes | Human-readable title |
| `description` | `string` | Yes | Natural-language description |
| `category` | `IntentCategory` | Yes | One of: tool, edit, file, view, navigation, toggle, workspace, settings |
| `keywords` | `string[]` | Yes | Synonyms for matching |
| `params` | `IntentParameter[]` | No | Typed parameters |
| `shortcut` | `string` | No | Keyboard shortcut |
| `dangerous` | `boolean` | No | Requires confirmation |

### StatusColor

```typescript
type StatusColor = 'emerald' | 'amber' | 'red' | 'neutral';
```

### SearchConfig

```typescript
interface SearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
```

### CommandOption

```typescript
interface CommandOption {
  id: string;
  label: string;
  action: () => void;
  shortcut?: string;
  icon?: ReactNode;
  section?: string;
}
```

## Chrome Components

### Frame

Root container. Manages viewport/world transforms and renders HUD elements.

```tsx
<Frame
  panOffset={{ x: 0, y: 0 }}
  scale={1}
  onPan={(offset) => void}
  onZoom={(scale) => void}
  hud={<>{/* NavigationBar, SidePanel, etc. */}</>}
>
  {/* Content in world/viewport space */}
</Frame>
```

### NavigationBar

Top bar with title, optional search, and action slots.

```tsx
<NavigationBar
  title="APP NAME"
  subtitle="context"
  search={{ value, onChange, placeholder }}
  center={<>{/* Center content */}</>}
  actions={<>{/* Right-aligned actions */}</>}
/>
```

### SidePanel

Collapsible left or right panel with resize handle.

```tsx
<SidePanel
  side="left"
  title="Project"
  icon={<Layers size={12} />}
  headerActions={<HeaderActions />}
  footer={<FooterContent />}
  collapsed={false}
  onToggle={() => void}
  width={280}
  onResize={(w) => void}
>
  {/* Panel content */}
</SidePanel>
```

### StatusBar

Bottom bar showing app status.

```tsx
<StatusBar label="READY" color="emerald" />
```

### CommandDock

Floating command button (bottom center). Opens the command palette on click.

```tsx
<CommandDock onClick={() => void} />
```

### ZoomControls

Zoom in/out/reset buttons for canvas mode.

```tsx
<ZoomControls
  scale={1}
  onZoomIn={() => void}
  onZoomOut={() => void}
  onReset={() => void}
/>
```

### Minimap

Canvas minimap showing window positions and viewport indicator.

```tsx
<Minimap
  windowBoundsMap={boundsMap}
  panOffset={pan}
  scale={zoom}
  viewportSize={{ w, h }}
  onPanTo={(offset) => void}
/>
```

## Canvas

### Canvas

Pan/zoom input layer. Handles scroll-to-zoom, space+drag-to-pan, and gesture events.

```tsx
<Canvas
  panOffset={pan}
  scale={zoom}
  onPan={setPan}
  onZoom={setZoom}
/>
```

## Windows

### AppWindow

Draggable, resizable window with title bar chrome. Used for `windowed` canvas participation.

```tsx
<AppWindow
  title="My App"
  bounds={{ x: 0, y: 0, w: 600, h: 400 }}
  onBoundsChange={(bounds) => void}
  onReportBounds={(bounds) => void}
  maximized={false}
  onMaximizedChange={(v) => void}
  panOffset={pan}
  scale={zoom}
>
  {/* Window content */}
</AppWindow>
```

Features:
- Drag via title bar (Option+drag anywhere)
- 8-edge resize handles
- Maximize/restore toggle
- Context menu (Bring to Center, Maximize, Reset Window)
- Bounds persisted to localStorage

## Overlays

### CommandPalette

Searchable command menu triggered by Cmd+K.

```tsx
<CommandPalette
  open={true}
  onClose={() => void}
  commands={commandOptions}
/>
```

### TerminalDrawer

Bottom slide-out panel, toggled via Cmd+`.

```tsx
<TerminalDrawer open={true} onClose={() => void}>
  {/* Terminal content */}
</TerminalDrawer>
```

### HudsonContextMenu

Right-click context menu (powered by `@base-ui-components/react` + motion).

```tsx
<HudsonContextMenu entries={[
  { type: 'action', label: 'Copy', action: () => void, shortcut: 'Cmd+C' },
  { type: 'separator' },
  { type: 'action', label: 'Delete', action: () => void, destructive: true },
]}>
  {/* Trigger element */}
</HudsonContextMenu>
```

## Hooks

### usePersistentState

localStorage-backed state hook. Works like `useState` but persists across reloads.

```tsx
import { usePersistentState } from 'hudsonkit';

const [value, setValue] = usePersistentState('storage-key', defaultValue);
```

## Utilities

### sounds

Web Audio synthesizer for UI feedback.

```tsx
import { sounds } from 'hudsonkit';

sounds.blipUp();     // Positive feedback / success
sounds.click();      // Button press
sounds.whoosh();     // Transition / navigation
sounds.thock();      // Heavy press / confirm
```

### logger

Event bus for Frame activity logging.

```tsx
import { logEvent, FRAME_LOG_EVENT } from 'hudsonkit';

logEvent({ type: 'app:action', detail: 'something happened' });

// Listen for events
window.addEventListener(FRAME_LOG_EVENT, (e) => {
  console.log(e.detail);
});
```

### viewport

Coordinate conversion between world and screen space.

```tsx
import { worldToScreen, screenToWorld } from 'hudsonkit';

const screenPos = worldToScreen(worldPos, panOffset, scale);
const worldPos = screenToWorld(screenPos, panOffset, scale);
```

### chrome

Design tokens and styling constants.

```tsx
import { CHROME, CHROME_BASE, PANEL_STYLES, EDGE_EFFECTS, Z_LAYERS, LAYOUT } from 'hudsonkit';

// CHROME — computed styles (borders, backgrounds, shadows)
// CHROME_BASE — raw color values
// PANEL_STYLES — panel-specific styling
// EDGE_EFFECTS — edge glow/shadow effects
// Z_LAYERS — z-index layer map
// LAYOUT — spacing and sizing constants
```

## Architecture

> Hudson project structure and architectural decisions

# Architecture

Hudson is a monorepo with two main packages: the **shell application** (Next.js) and the **hudsonkit web library**.

## Monorepo Structure

```
hudson/
  apps/web/                     # Next.js application + marketing + deploy (App Router)
    app/
      page.tsx                  # Redirects to /app
      app/page.tsx              # Entry: mounts WorkspaceShell from hudsonkit/workspace
      layout.tsx                # Root layout
      globals.css               # Tailwind + global styles
      apps/                     # App implementations
        hudson-docs/            # Docs browser
        intent-explorer/        # Intent catalog viewer
        stage-design/           # Compact reference app
      apps/registry.ts          # Core + local app/workspace registry
  packages/web/hudsonkit/src/
    workspace/shell/WorkspaceShell.tsx # Main orchestrator
    apps/notepad/               # Compact built-in kit app reference
    lib/                        # Shared utilities
      intent-catalog.ts         # buildIntentCatalog()
    hooks/                      # Shared hooks
      useIntentExecutor.ts      # Intent → command bridge
    api/                        # API routes
  packages/
    web/hudsonkit/                    # Component library
      src/
        index.ts                # Public exports
        components/
          chrome/               # Frame, NavBar, SidePanel, StatusBar, CommandDock, ZoomControls, Minimap
          canvas/               # Canvas (pan/zoom engine)
          windows/              # AppWindow (draggable/resizable)
          overlays/             # CommandPalette, TerminalDrawer, ContextMenu
        types/
          app.ts                # HudsonApp interface
          workspace.ts          # HudsonWorkspace interface
          intent.ts             # AppIntent, IntentCatalog
        hooks/
          usePersistentState.ts # localStorage-backed state
        lib/
          chrome.ts             # Design tokens (CHROME, Z_LAYERS, LAYOUT)
          sounds.ts             # Web Audio synthesizer
          logger.ts             # Event bus
          viewport.ts           # Coordinate math (worldToScreen, screenToWorld)
      README.md
      package.json
```

## Data Flow

```
page.tsx
  └── WorkspaceShell(workspaces, defaultWorkspaceId)
        │
        ├── Nests all app Providers (recursive wrapping)
        │     AppA.Provider → AppB.Provider → ... → WorkspaceInner
        │
        └── WorkspaceInner
              ├── Calls each app's hooks (useCommands, useStatus, etc.)
              ├── Merges commands from all apps + shell into CommandPalette
              ├── Renders Frame with chrome (NavBar, SidePanel, StatusBar)
              ├── Renders active app's slots into chrome slots
              │     ├── slots.Content → main area (canvas world or viewport)
              │     ├── slots.LeftPanel → left SidePanel
              │     ├── slots.RightPanel → right SidePanel
              │     └── slots.Terminal → TerminalDrawer
              └── In canvas mode: wraps windowed apps in AppWindow
```

## Key Architectural Decisions

### Provider-first state management

Each app owns its state via a React context Provider. The shell never accesses app state directly — it only reads through hooks. This keeps apps fully decoupled.

### Hook bridge pattern

The shell calls app hooks inside the Provider's scope. This means hooks can call `useMyAppContext()` safely. The shell doesn't import app internals — it only calls the hook functions declared in the `HudsonApp` object.

### Ref-based window tracking

Window positions are tracked in a `useRef` (not state) during drag operations to avoid re-renders on every mouse move. Positions are flushed to state via a 60ms debounce for minimap rendering.

### Static intent declarations

Intents are declared as plain data (not runtime code) so they can be indexed, serialized, and searched without executing app logic. The execution bridge connects them to live commands at runtime.

### Recursive Provider nesting

All app Providers wrap the entire workspace content. This enables cross-app context sharing if needed, while keeping the default pattern of isolated state per app.

## State Persistence

All persistent state uses `usePersistentState()` backed by localStorage:

| Key Pattern | Data |
|-------------|------|
| `hudson.ws.{workspaceId}.win.{appId}` | Window bounds |
| `hudson.leftW` | Left panel width |
| `hudson.rightW` | Right panel width |
| `hudson.session` | Active session |
| `{appId}.{key}` | App-specific state |

## Build & Dev

| Command | Purpose |
|---------|---------|
| `bun install` | Install all dependencies |
| `bun dev` | Start dev server (port 3500) |
| `bun run build` | Production build |
| `bun run lint` | ESLint |

## Skills

> Pre-built skill definitions for AI agents working with Hudson

# Skills

Pre-built skill definitions that agents can use when working with Hudson.

## hudson-app-creator

**When to use:** When asked to create a new app for the Hudson platform.

**Steps:**
1. Read `packages/web/hudsonkit/src/types/app.ts` to understand the HudsonApp interface
2. Read `apps/web/app/apps/hudson-docs/index.ts` or `packages/web/hudsonkit/src/apps/notepad/index.ts` as the reference implementation
3. Follow the task template in `docs/prompts/create-app.md`
4. Create all required files (Provider, Content, hooks, index.ts)
5. Register in workspace and test with `bun dev`

**Key rules:**
- Every app needs at minimum: id, name, mode, Provider, slots.Content, hooks.useCommands, hooks.useStatus
- Provider must use React context pattern
- Hooks are called inside Provider scope by the shell
- Never use purple, never use library UI components

## hudson-intent-author

**When to use:** When asked to add LLM/voice intents to an existing app.

**Steps:**
1. Read the app's `hooks.ts` to find all command IDs
2. Follow `docs/prompts/add-intents.md` template
3. Create `intents.ts` with AppIntent[] matching each command
4. Add `intents` field to the HudsonApp definition

**Key rules:**
- Every intent `commandId` must match a `CommandOption.id` from `useCommands()`
- Include diverse keywords for fuzzy matching
- Mark destructive actions as `dangerous: true`

## hudson-workspace-builder

**When to use:** When asked to create or modify a workspace.

**Steps:**
1. Read `packages/web/hudsonkit/src/types/workspace.ts` for the HudsonWorkspace interface
2. Read `apps/web/app/workspaces/hudsonOS.ts` as reference
3. Create workspace file in `apps/web/app/workspaces/`
4. Register in `apps/web/app/app/page.tsx` workspaces array

**Key rules:**
- Each workspace has a mode (canvas or panel)
- Apps specify canvasMode: 'native' or 'windowed'
- Windowed apps need defaultWindowBounds: { x, y, w, h }

## hudsonkit-contributor

**When to use:** When asked to add or modify hudsonkit components.

**Steps:**
1. Read `packages/web/hudsonkit/src/index.ts` for current exports
2. Check `packages/web/hudsonkit/src/lib/theme.ts` for design tokens
3. Follow existing component patterns (stateless, callback-based)
4. Export from `packages/web/hudsonkit/src/index.ts`

**Key rules:**
- Components are stateless — apps manage all state
- Use callback pattern (props in, events out)
- Dark theme only (hardcoded)
- Use Tailwind v4 for styling
- Use HudsonKit's semantic Iconoir adapter for icons

---
Generated by [Dewey](https://github.com/arach/dewey) | Last updated: 2026-02-23
