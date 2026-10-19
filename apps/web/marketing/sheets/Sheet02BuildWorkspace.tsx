'use client';

import { useMemo, useState } from 'react';
import {
  AppWindow,
  Cable,
  Command,
  Database,
  Layers,
  PanelTop,
  Save,
  Terminal,
  Waypoints,
} from 'hudsonkit/icons';
import type { HudsonIcon } from 'hudsonkit/icons';
import { Eyebrow } from '@/marketing/primitives/Eyebrow';
import { Sheet } from '@/marketing/primitives/Sheet';
import { sheetNumber } from './order';

type StoryStepId = 'surface' | 'app' | 'shell' | 'pipe' | 'workspace';

type StoryStep = {
  id: StoryStepId;
  n: string;
  title: string;
  verb: string;
  body: string;
  prompt: string;
  maps: {
    canvas: string;
    selection: string;
    layer: string;
    ux: string;
  };
  icon: HudsonIcon;
  activeNodes: string[];
  activeEdges: string[];
};

type StoryNode = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'canvas' | 'layer' | 'ux' | 'app';
  icon: HudsonIcon;
};

const STEPS: StoryStep[] = [
  {
    id: 'surface',
    n: '01',
    title: 'Start with a surface',
    verb: 'OWN',
    body: 'Hudson begins as a workspace plane: pan, zoom, and persistent coordinates before any app has to care about chrome.',
    prompt: 'canvas workspace',
    maps: {
      canvas: 'Workspace canvas',
      selection: 'Plane selected',
      layer: 'Coordinate layer',
      ux: 'Pan · zoom · minimap',
    },
    icon: Layers,
    activeNodes: ['canvas'],
    activeEdges: [],
  },
  {
    id: 'app',
    n: '02',
    title: 'Drop in an app',
    verb: 'EXPOSE',
    body: 'A React app keeps its Provider and state, then exposes slots, hooks, commands, intents, and ports through one contract.',
    prompt: 'logo studio',
    maps: {
      canvas: 'App window',
      selection: 'Provider halo',
      layer: 'State owner + app contract',
      ux: 'Windowed app surface',
    },
    icon: AppWindow,
    activeNodes: ['canvas', 'provider', 'slots', 'hooks', 'ports'],
    activeEdges: ['provider-slots', 'provider-hooks', 'provider-ports'],
  },
  {
    id: 'shell',
    n: '03',
    title: 'Let the shell appear',
    verb: 'COMPOSE',
    body: 'Hudson renders the shared surfaces around the app: nav, panels, command palette, status, terminal, and windows.',
    prompt: 'shared chrome',
    maps: {
      canvas: 'Shell zones',
      selection: 'Slot and hook paths',
      layer: 'Slots + hooks',
      ux: 'Nav · panels · command dock',
    },
    icon: PanelTop,
    activeNodes: ['canvas', 'provider', 'slots', 'hooks', 'nav', 'panel', 'terminal', 'commands'],
    activeEdges: ['provider-slots', 'provider-hooks', 'slots-panel', 'hooks-nav', 'hooks-commands', 'slots-terminal'],
  },
  {
    id: 'pipe',
    n: '04',
    title: 'Connect the work',
    verb: 'OPERATE',
    body: 'Typed ports make cross-app work visible. SVG, JSON, documents, and commands move through the workspace instead of disappearing into glue code.',
    prompt: 'typed pipe',
    maps: {
      canvas: 'Port dots + pipe curve',
      selection: 'Compatible handoff',
      layer: 'Typed input/output ports',
      ux: 'Data packet between apps',
    },
    icon: Cable,
    activeNodes: ['canvas', 'provider', 'ports', 'shaper', 'logo', 'commands'],
    activeEdges: ['provider-ports', 'ports-shaper', 'shaper-logo', 'hooks-commands'],
  },
  {
    id: 'workspace',
    n: '05',
    title: 'Save the workspace',
    verb: 'REMEMBER',
    body: 'The result is a durable arrangement: apps, positions, shell state, and typed relationships saved as one workspace.',
    prompt: 'hudson os',
    maps: {
      canvas: 'Whole arrangement',
      selection: 'Workspace selected',
      layer: 'Workspace definition',
      ux: 'Saved context',
    },
    icon: Save,
    activeNodes: ['canvas', 'provider', 'slots', 'hooks', 'ports', 'nav', 'panel', 'terminal', 'commands', 'shaper', 'logo', 'workspace'],
    activeEdges: [
      'provider-slots',
      'provider-hooks',
      'provider-ports',
      'slots-panel',
      'hooks-nav',
      'hooks-commands',
      'slots-terminal',
      'ports-shaper',
      'shaper-logo',
      'canvas-workspace',
    ],
  },
];

const NODES: StoryNode[] = [
  { id: 'canvas', label: 'Workspace canvas', sub: 'pan · zoom · place', x: 72, y: 76, w: 190, h: 74, kind: 'canvas', icon: Layers },
  { id: 'provider', label: 'App Provider', sub: 'state owner', x: 414, y: 82, w: 190, h: 74, kind: 'layer', icon: Database },
  { id: 'slots', label: 'Slots', sub: 'content · panels', x: 318, y: 226, w: 150, h: 64, kind: 'layer', icon: AppWindow },
  { id: 'hooks', label: 'Hooks', sub: 'commands · status', x: 542, y: 226, w: 150, h: 64, kind: 'layer', icon: Waypoints },
  { id: 'ports', label: 'Ports', sub: 'typed handoff', x: 430, y: 362, w: 150, h: 64, kind: 'layer', icon: Cable },
  { id: 'nav', label: 'Navigation', sub: 'shell chrome', x: 74, y: 232, w: 148, h: 58, kind: 'ux', icon: PanelTop },
  { id: 'panel', label: 'Side panel', sub: 'app slot', x: 86, y: 362, w: 148, h: 58, kind: 'ux', icon: AppWindow },
  { id: 'terminal', label: 'Terminal', sub: 'drawer slot', x: 732, y: 362, w: 148, h: 58, kind: 'ux', icon: Terminal },
  { id: 'commands', label: 'Command dock', sub: 'one palette', x: 732, y: 232, w: 148, h: 58, kind: 'ux', icon: Command },
  { id: 'shaper', label: 'Shaper', sub: 'svg output', x: 272, y: 504, w: 150, h: 62, kind: 'app', icon: AppWindow },
  { id: 'logo', label: 'Logo Studio', sub: 'svg input', x: 598, y: 504, w: 150, h: 62, kind: 'app', icon: AppWindow },
  { id: 'workspace', label: 'Saved workspace', sub: 'apps + layout', x: 760, y: 76, w: 154, h: 74, kind: 'canvas', icon: Save },
];

const EDGES: Array<{ id: string; from: string; to: string; label?: string }> = [
  { id: 'provider-slots', from: 'provider', to: 'slots', label: 'render' },
  { id: 'provider-hooks', from: 'provider', to: 'hooks', label: 'project' },
  { id: 'provider-ports', from: 'provider', to: 'ports', label: 'type' },
  { id: 'slots-panel', from: 'slots', to: 'panel' },
  { id: 'hooks-nav', from: 'hooks', to: 'nav' },
  { id: 'hooks-commands', from: 'hooks', to: 'commands' },
  { id: 'slots-terminal', from: 'slots', to: 'terminal' },
  { id: 'ports-shaper', from: 'ports', to: 'shaper', label: 'svg' },
  { id: 'shaper-logo', from: 'shaper', to: 'logo', label: 'svg' },
  { id: 'canvas-workspace', from: 'canvas', to: 'workspace', label: 'persist' },
];

const NODE_BY_ID = Object.fromEntries(NODES.map((node) => [node.id, node]));

const MAP_ROWS: Array<[string, keyof StoryStep['maps']]> = [
  ['CANVAS', 'canvas'],
  ['SELECTION', 'selection'],
  ['LAYER DEF', 'layer'],
  ['UX', 'ux'],
];

export function Sheet02BuildWorkspace() {
  const [activeId, setActiveId] = useState<StoryStepId>('surface');
  const [draft, setDraft] = useState('canvas workspace');
  const activeStep = STEPS.find((step) => step.id === activeId) ?? STEPS[0];

  const activeNodeSet = useMemo(() => new Set(activeStep.activeNodes), [activeStep]);
  const activeEdgeSet = useMemo(() => new Set(activeStep.activeEdges), [activeStep]);

  const commitPrompt = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const matched =
      STEPS.find((step) => normalized.includes(step.prompt)) ??
      STEPS.find((step) => normalized.includes(step.verb.toLowerCase())) ??
      STEPS.find((step) => normalized.includes(step.title.toLowerCase().split(' ')[0]));

    if (matched) {
      setActiveId(matched.id);
      setDraft(matched.prompt);
    }
  };

  return (
    <Sheet
      id="build-workspace"
      slugTitle="BUILD THE WORKSPACE"
      slugSub="interactive diagram"
      sheetTitle="Apps Own The Work · Hudson Owns The Workspace"
      footer={{
        left: ['STORY', 'interactive'],
        mid: 'OWN → EXPOSE → COMPOSE → OPERATE — the Hudson contract, running as a diagram',
        right: ['STATUS', activeStep.verb],
      }}
    >
      <div style={{ maxWidth: 1300, margin: '96px auto 0' }}>
        <div style={{ marginBottom: 24 }}>
          <Eyebrow>{sheetNumber('build-workspace')} / Story diagram · workspace grammar</Eyebrow>
        </div>

        <div
          className="reflow-stack"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 350px',
            gap: 34,
            alignItems: 'start',
          }}
        >
          <div>
            <h2 className="h-section" style={{ marginBottom: 16, maxWidth: '18ch' }}>
              Apps own the work. <em>Hudson owns the workspace</em>.
            </h2>
            <p className="subhead" style={{ marginBottom: 30, maxWidth: '58ch', fontSize: 16 }}>
              Select a thing once; watch the canvas object, layer definition, and shell UX light
              up together. The deck is the map between what you touch and what Hudson knows.
            </p>

            <div className="workspace-story-plate" data-cal data-cal-label="build workspace diagram">
              <div className="embed-plate__caption">
                <span className="live" />
                FIG. 02-B · INTERACTIVE CONTRACT
                <span style={{ color: 'var(--ink-faint)' }}> · </span>
                <span>{activeStep.verb}</span>
              </div>
              <span className="embed-plate__corner embed-plate__corner--tl" />
              <span className="embed-plate__corner embed-plate__corner--tr" />
              <span className="embed-plate__corner embed-plate__corner--bl" />
              <span className="embed-plate__corner embed-plate__corner--br" />

              <div className="workspace-story-canvas">
                <div className="workspace-story-canvas__chrome workspace-story-canvas__chrome--nav" />
                <div className="workspace-story-canvas__chrome workspace-story-canvas__chrome--left" />
                <div className="workspace-story-canvas__chrome workspace-story-canvas__chrome--status" />

                <svg className="workspace-story-edges" viewBox="0 0 980 650" aria-hidden="true">
                  <defs>
                    <marker
                      id="workspace-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="4"
                      orient="auto"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
                    </marker>
                  </defs>
                  {EDGES.map((edge) => {
                    const from = NODE_BY_ID[edge.from];
                    const to = NODE_BY_ID[edge.to];
                    if (!from || !to) return null;
                    const active = activeEdgeSet.has(edge.id);
                    const x1 = from.x + from.w / 2;
                    const y1 = from.y + from.h / 2;
                    const x2 = to.x + to.w / 2;
                    const y2 = to.y + to.h / 2;
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    return (
                      <g key={edge.id} className={active ? 'is-active' : ''}>
                        <path
                          d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                          className="workspace-story-edge"
                          markerEnd={active ? 'url(#workspace-arrow)' : undefined}
                        />
                        {edge.label ? (
                          <text x={midX + 6} y={midY - 6} className="workspace-story-edge-label">
                            {edge.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {NODES.map((node) => {
                  const Icon = node.icon;
                  const active = activeNodeSet.has(node.id);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`workspace-story-node workspace-story-node--${node.kind}${active ? ' is-active' : ''}`}
                      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                      onClick={() => {
                        const next =
                          STEPS.find((step) => step.activeNodes.includes(node.id)) ?? activeStep;
                        setActiveId(next.id);
                        setDraft(next.prompt);
                      }}
                    >
                      <Icon size={15} strokeWidth={1.7} />
                      <span>
                        <strong>{node.label}</strong>
                        <small>{node.sub}</small>
                      </span>
                    </button>
                  );
                })}

                <div className="workspace-story-command">
                  <span>Describe something. It appears on the canvas.</span>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitPrompt(e.currentTarget.value);
                    }}
                    onBlur={(e) => commitPrompt(e.currentTarget.value)}
                    aria-label="Diagram prompt"
                  />
                </div>
              </div>
            </div>
          </div>

          <aside className="workspace-story-deck">
            <div className="workspace-story-deck__head">
              <span>Story Deck</span>
              <span>HUD-STORY · v01</span>
            </div>

            <div className="workspace-story-active">
              <div>{activeStep.n}</div>
              <h3>{activeStep.title}</h3>
              <p>{activeStep.body}</p>
            </div>

            <div className="workspace-story-steps">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const active = step.id === activeId;
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={'workspace-story-step' + (active ? ' is-active' : '')}
                    onClick={() => {
                      setActiveId(step.id);
                      setDraft(step.prompt);
                    }}
                    aria-pressed={active}
                  >
                    <span>{step.n}</span>
                    <Icon size={14} strokeWidth={1.8} />
                    <strong>{step.verb}</strong>
                  </button>
                );
              })}
            </div>

            <div className="spec" data-cal data-cal-label="story contract spec">
              <div className="spec__row spec__row--header">
                <div>Map</div>
                <div>Highlight</div>
              </div>
              {MAP_ROWS.map(([k, key]) => (
                <div key={k} className="spec__row workspace-story-map-row">
                  <div className="spec__k">{k}</div>
                  <div className="spec__v spec__v--accent">{activeStep.maps[key]}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </Sheet>
  );
}
