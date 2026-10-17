// ─────────────────────────────────────────────────────────────────────────────
// App Registry
// ─────────────────────────────────────────────────────────────────────────────
//
// This file is the single source of truth for which apps and workspaces
// are loaded at runtime. It merges two layers:
//
//   CORE APPS (tracked in git, always available)
//     hudson-docs, intent-explorer — live in app/apps/
//
//   LOCAL APPS (gitignored, opt-in per developer)
//     Defined in app/local/apps.local.ts — auto-created as an empty stub
//     on first `bun dev` if it doesn't exist (see next.config.ts).
//
// To add apps locally without touching tracked files, edit apps.local.ts.
// See app/catalog/apps.local.example.ts for a full working template.
//
// App references are read inside getter functions (not at module scope) to
// avoid circular-init TDZ errors in Vite ESM where intent-explorer →
// IntentProvider → registry → intent-explorer forms a cycle.
// ─────────────────────────────────────────────────────────────────────────────

import type { HudsonApp, HudsonWorkspace, WorkspaceAppConfig, CanvasParticipation } from 'hudsonkit';
import { uniqueWorkspaces, type WorkspaceRegistryEntry } from './registry-utils';

// --- In-tree apps -------------------------------------------------------------
// Full-stack, shell-runtime, or framework-showcase apps that still live in app/apps/.

import { hudsonDocsApp } from './hudson-docs';
import { hudsonAIApp } from './hudson-ai';
import { intentExplorerApp } from './intent-explorer';
import { themeDesignerApp } from './theme-designer';
import { stageDesignApp } from './stage-design';
import { hudLoggerApp } from './hud-logger';
import { hudsonVoiceApp } from './hudson-voice';
import { servicesApp } from './services';
import { terminalApp } from './terminal';
// Hero — font viewer/glyph editor, vendored from Atelier as a demo app (not part of hudsonkit).
import { heroApp } from './hero/hero';

// --- Built-in batteries (shipped with the kit) --------------------------------
// Generic, client-only utility apps now live in the kit as `hudsonkit/apps`.
// webFetchApp also ships there but isn't registered in this workspace.
import {
  notepadApp,
  codeEditorApp,
  documentLabApp,
  jsonExplorerApp,
  apiInspectorApp,
  traceViewerApp,
  workflowLabApp,
} from 'hudsonkit/apps';
// --- Environment gates --------------------------------------------------------
// process.env.NODE_ENV is statically replaced by Next.js at build time. It is
// 'development' only during `bun dev`; every preview/production build (and
// `bun run build`) sets it to 'production'. Keep gitignored local workspaces out
// of production bundles even when they exist on the deploying machine.
const IS_DEV_ENV = process.env.NODE_ENV === 'development';

function getLocalRegistry(): {
  localApps: WorkspaceAppConfig[];
  localWorkspaces: HudsonWorkspace[];
} {
  if (!IS_DEV_ENV) {
    return { localApps: [], localWorkspaces: [] };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../local/apps.local');
    return {
      localApps: mod.localApps ?? [],
      localWorkspaces: mod.localWorkspaces ?? [],
    };
  } catch {
    return { localApps: [], localWorkspaces: [] };
  }
}

// --- App lookup table (id → app) for data-driven workspace resolution --------

function getAppById(id: string): HudsonApp | null {
  const table: Record<string, HudsonApp> = {
    'hudson-docs': hudsonDocsApp,
    'hudson-ai': hudsonAIApp,
    'intent-explorer': intentExplorerApp,
    'trace-viewer': traceViewerApp,
    'api-inspector': apiInspectorApp,
    'json-explorer': jsonExplorerApp,
    'notepad': notepadApp,
    'code-editor': codeEditorApp,
    'document-lab': documentLabApp,
    'theme-designer': themeDesignerApp,
    'stage-design': stageDesignApp,
    'workflow-lab': workflowLabApp,
    'hud-logger': hudLoggerApp,
    'hudson-voice': hudsonVoiceApp,
    'services': servicesApp,
    'terminal': terminalApp,
    'hero': heroApp,
  };
  if (table[id]) return table[id];
  // Also search local apps (e.g., hero, external repos)
  const { localApps } = getLocalRegistry();
  const local = localApps.find(c => c.app.id === id);
  return local?.app ?? null;
}

// --- Data-driven workspaces (loaded from JSON) --------------------------------

interface WorkspaceJson {
  id: string;
  name: string;
  description?: string;
  mode?: 'canvas' | 'panel';
  defaultFocusedAppId?: string;
  defaultActivatedAppIds?: string[];
  apps: {
    appId: string;
    canvasMode?: CanvasParticipation;
    defaultWindowBounds?: { x: number; y: number; w: number; h: number };
  }[];
}

function loadWorkspacesFromJson(): HudsonWorkspace[] {
  if (!IS_DEV_ENV) return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data: WorkspaceJson[] = require('../local/workspaces.json');
    return data
      .map(ws => {
        const apps: WorkspaceAppConfig[] = ws.apps
          .map(entry => {
            const app = getAppById(entry.appId);
            if (!app) {
              console.warn(`[registry] workspace "${ws.id}": unknown app "${entry.appId}", skipping`);
              return null;
            }
            return {
              app,
              canvasMode: entry.canvasMode,
              defaultWindowBounds: entry.defaultWindowBounds,
            } as WorkspaceAppConfig;
          })
          .filter((c): c is WorkspaceAppConfig => c !== null);

        if (apps.length === 0) return null;

        return {
          id: ws.id,
          name: ws.name,
          description: ws.description ?? '',
          mode: ws.mode ?? 'canvas',
          apps,
          defaultFocusedAppId: ws.defaultFocusedAppId,
          defaultActivatedAppIds: ws.defaultActivatedAppIds,
        } as HudsonWorkspace;
      })
      .filter((ws): ws is HudsonWorkspace => ws !== null);
  } catch {
    // No workspaces.json or parse error — that's fine
    return [];
  }
}

function getCoreApps(): WorkspaceAppConfig[] {
  return [
    {
      app: hudsonDocsApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -820, y: -340, w: 900, h: 650 },
    },
    {
      app: hudsonAIApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 140, y: -340, w: 760, h: 580 },
    },
    {
      app: intentExplorerApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 960, y: -340, w: 720, h: 560 },
    },
    {
      app: themeDesignerApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -820, y: 360, w: 1040, h: 720 },
    },
    {
      app: codeEditorApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 260, y: 360, w: 760, h: 560 },
    },
    {
      app: hudsonVoiceApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 1060, y: 360, w: 720, h: 560 },
    },
  ];
}

function getDeveloperModeApps(): WorkspaceAppConfig[] {
  return [
    {
      app: servicesApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -1180, y: -320, w: 760, h: 560 },
    },
    {
      app: terminalApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -380, y: -320, w: 860, h: 560 },
    },
    {
      app: apiInspectorApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 520, y: -320, w: 760, h: 560 },
    },
    {
      app: traceViewerApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -1180, y: 320, w: 660, h: 540 },
    },
    {
      app: jsonExplorerApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -480, y: 320, w: 620, h: 460 },
    },
    {
      app: codeEditorApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 980, y: 320, w: 760, h: 560 },
    },
  ];
}

function getWorkflowLabApps(): WorkspaceAppConfig[] {
  return [
    {
      app: workflowLabApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -520, y: -300, w: 1040, h: 700 },
    },
    {
      app: documentLabApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 600, y: -260, w: 720, h: 560 },
    },
  ];
}

// --- Exports ------------------------------------------------------------------

/** The main HudsonKit workspace — docs-first, with framework-native tooling close by. */
export function getHudsonKitWorkspace(): HudsonWorkspace {
  return {
    id: 'hudson-os',
    name: 'HudsonKit Docs',
    description: 'Documentation, AI, voice, intents, theming, and code surfaces for HudsonKit',
    mode: 'canvas',
    apps: getCoreApps(),
    defaultFocusedAppId: 'hudson-docs',
    defaultActivatedAppIds: ['hudson-docs', 'hudson-ai', 'intent-explorer', 'theme-designer'],
    defaultScale: 0.45,
    defaultPan: { x: -331, y: -222 },
    leftNavigation: 'on',
  };
}

/** Developer Mode — operational tools for services, terminals, traces, APIs, logs, and JSON. */
export function getDeveloperModeWorkspace(): HudsonWorkspace {
  return {
    id: 'developer-mode',
    name: 'Developer Mode',
    description: 'Services, terminal, traces, API, JSON, logs, and code tools',
    mode: 'canvas',
    apps: getDeveloperModeApps(),
    defaultFocusedAppId: 'services',
    defaultActivatedAppIds: ['services', 'terminal', 'api-inspector', 'trace-viewer'],
    defaultScale: 0.2,
    leftNavigation: 'hidden',
  };
}

/** Document Lab — shared text, markdown, code, workflow, theme, and visual surfaces. */
export function getDocumentLabWorkspace(): HudsonWorkspace {
  return {
    id: 'document-lab',
    name: 'Document + Visual Lab',
    description: 'Document, code, workflow, theme, and stage-design primitives',
    mode: 'canvas',
    apps: [{
      app: documentLabApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -460, y: -300, w: 920, h: 640 },
    }, {
      app: notepadApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 500, y: -260, w: 620, h: 560 },
    }, {
      app: codeEditorApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 500, y: 360, w: 760, h: 560 },
    }, {
      app: workflowLabApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -460, y: 380, w: 920, h: 620 },
    }, {
      app: themeDesignerApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 1220, y: -260, w: 920, h: 620 },
    }, {
      app: stageDesignApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: 1220, y: 380, w: 430, h: 560 },
    }],
    defaultFocusedAppId: 'document-lab',
    defaultActivatedAppIds: ['document-lab', 'notepad', 'code-editor', 'workflow-lab', 'theme-designer', 'stage-design'],
    defaultScale: 0.8,
    leftNavigation: 'on',
  };
}

/** Hero Studio — font viewer and glyph editor running on the Hudson shell. */
export function getHeroStudioWorkspace(): HudsonWorkspace {
  return {
    id: 'hero-studio',
    name: 'Hero Studio',
    description: 'Font viewer, glyph inspection, and wordmark editing',
    mode: 'canvas',
    apps: [{
      app: heroApp,
      canvasMode: 'windowed',
      defaultWindowBounds: { x: -490, y: -360, w: 980, h: 720 },
    }],
    defaultFocusedAppId: 'hero',
    defaultActivatedAppIds: ['hero'],
    leftNavigation: 'on',
  };
}

/** Workflow Lab — read-only fixture harness for the shared workflow graph primitive. */
export function getWorkflowLabWorkspace(): HudsonWorkspace {
  return {
    id: 'workflow-lab',
    name: 'Workflow Lab',
    description: 'Read-only workflow graph fixture lab',
    mode: 'canvas',
    apps: getWorkflowLabApps(),
    defaultFocusedAppId: 'workflow-lab',
    defaultActivatedAppIds: ['workflow-lab'],
    defaultScale: 0.72,
    defaultPan: { x: -160, y: -80 },
    leftNavigation: 'on',
  };
}


// Backwards-compat: callers that import `hudsonOSWorkspace` as a const get
// a cached snapshot created on first access.
let _ws: HudsonWorkspace | undefined;
export const hudsonOSWorkspace = new Proxy({} as HudsonWorkspace, {
  get(_, prop, receiver) {
    _ws ??= getHudsonKitWorkspace();
    return Reflect.get(_ws, prop, receiver);
  },
  ownKeys() {
    _ws ??= getHudsonKitWorkspace();
    return Reflect.ownKeys(_ws);
  },
  getOwnPropertyDescriptor(_, prop) {
    _ws ??= getHudsonKitWorkspace();
    return Object.getOwnPropertyDescriptor(_ws, prop);
  },
});

/** Core public workspaces used by the hosted demo and production app. */
export function getCoreWorkspaces(): HudsonWorkspace[] {
  return uniqueWorkspaces([
    { workspace: getHudsonKitWorkspace(), source: 'core:hudsonkit' },
    { workspace: getDeveloperModeWorkspace(), source: 'core:developer-mode' },
    { workspace: getDocumentLabWorkspace(), source: 'core:document-lab' },
    { workspace: getWorkflowLabWorkspace(), source: 'core:workflow-lab' },
    { workspace: getHeroStudioWorkspace(), source: 'core:hero-studio' },
  ]);
}

let _core: HudsonWorkspace[] | undefined;
export const coreWorkspaces = new Proxy([] as HudsonWorkspace[], {
  get(_, prop, receiver) {
    _core ??= getCoreWorkspaces();
    const val = Reflect.get(_core, prop, receiver);
    return typeof val === 'function' ? val.bind(_core) : val;
  },
  ownKeys() {
    _core ??= getCoreWorkspaces();
    return Reflect.ownKeys(_core);
  },
  getOwnPropertyDescriptor(_, prop) {
    _core ??= getCoreWorkspaces();
    return Object.getOwnPropertyDescriptor(_core, prop);
  },
});

/** All workspaces available to WorkspaceShell — production core + dev-only local workspace sources. */
export function getAllWorkspaces(): HudsonWorkspace[] {
  const { localWorkspaces } = getLocalRegistry();
  const entries: WorkspaceRegistryEntry[] = [
    ...getCoreWorkspaces().map(workspace => ({
      workspace,
      source: `core:${workspace.id}`,
    })),
    ...(IS_DEV_ENV
      ? [
          ...loadWorkspacesFromJson().map(workspace => ({
            workspace,
            source: 'app/local/workspaces.json',
          })),
          ...localWorkspaces.map(workspace => ({
            workspace,
            source: 'app/local/apps.local.ts',
          })),
        ]
      : []),
  ];

  return uniqueWorkspaces(entries, duplicate => {
    if (IS_DEV_ENV) {
      console.warn(
        `[registry] duplicate workspace "${duplicate.id}" from ${duplicate.skippedSource}; keeping ${duplicate.keptSource}`,
      );
    }
  });
}

let _all: HudsonWorkspace[] | undefined;
export const allWorkspaces = new Proxy([] as HudsonWorkspace[], {
  get(_, prop, receiver) {
    _all ??= getAllWorkspaces();
    const val = Reflect.get(_all, prop, receiver);
    return typeof val === 'function' ? val.bind(_all) : val;
  },
  ownKeys() {
    _all ??= getAllWorkspaces();
    return Reflect.ownKeys(_all);
  },
  getOwnPropertyDescriptor(_, prop) {
    _all ??= getAllWorkspaces();
    return Object.getOwnPropertyDescriptor(_all, prop);
  },
});
