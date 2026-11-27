/**
 * The landing hero's walkthrough: what is said, and what the live workspace
 * does while it is said.
 *
 * Each step's `say` is both the caption and the voiceover line (rendered
 * ahead of time by `scripts/render-walkthrough-voice.ts`). `moves` are tool
 * calls relayed into the embed (see EmbedDriver for what is allowed), each at
 * `at` seconds into the step. A step lasts as long as its audio, or a reading
 * time when sound is off.
 *
 * The last step puts the workspace back the way the hero started it.
 */

export type WalkthroughMove = {
  at: number;
  name:
    | 'set_panel'
    | 'open_command_palette'
    | 'close_command_palette'
    | 'set_console'
    | 'queue_ai_prompt'
    | 'set_app_state'
    | 'run_command';
  args?: Record<string, unknown>;
  /** Only on frames wide enough for the inspector to stay open (≥ 960px). */
  wide?: boolean;
};

export type WalkthroughStep = {
  id: string;
  label: string;
  say: string;
  moves: WalkthroughMove[];
};

/** Type a query into the palette a few characters at a time. */
function typeQuery(text: string, start: number, perChar = 0.09): WalkthroughMove[] {
  return Array.from(text, (_, i) => ({
    at: start + i * perChar,
    name: 'open_command_palette' as const,
    args: { query: text.slice(0, i + 1) },
  }));
}

export const WALKTHROUGH: WalkthroughStep[] = [
  {
    id: 'live',
    label: 'Live',
    say: 'This is Hudson, running live in the page. What you are about to see is the real app, moving on its own.',
    moves: [],
  },
  {
    id: 'windows',
    label: 'Windows',
    say: 'Apps open as windows on one shared canvas. Open another, and the canvas re-tiles so every app stays readable.',
    moves: [
      { at: 1.2, name: 'set_app_state', args: { appId: 'hudson-ai', visible: true } },
      { at: 4.2, name: 'set_app_state', args: { appId: 'intent-explorer', visible: true } },
    ],
  },
  {
    id: 'slots',
    label: 'Panels',
    say: 'Apps don’t draw their own chrome. They fill slots the shell provides: navigation on the left, an inspector on the right.',
    moves: [
      { at: 0.4, name: 'set_app_state', args: { appId: 'hudson-docs', focused: true } },
      { at: 2.6, name: 'set_panel', args: { side: 'left', collapsed: false } },
      { at: 4.8, name: 'set_panel', args: { side: 'right', collapsed: false } },
    ],
  },
  {
    id: 'palette',
    label: 'Commands',
    say: 'Every action an app declares becomes a command, so the whole workspace is searchable from one place.',
    moves: [
      { at: 0.4, name: 'set_panel', args: { side: 'left', collapsed: true } },
      { at: 0.6, name: 'set_panel', args: { side: 'right', collapsed: true } },
      { at: 1.4, name: 'open_command_palette', args: { query: '' } },
      ...typeQuery('toggle', 2.6),
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    say: 'Agents call those same commands. This walkthrough runs on them too: each move you see is a Hudson action.',
    moves: [
      { at: 0.6, name: 'close_command_palette' },
      { at: 1.6, name: 'run_command', args: { commandId: 'view-tiles' } },
      { at: 5.0, name: 'run_command', args: { commandId: 'view-canvas' } },
    ],
  },
  {
    id: 'console',
    label: 'Console',
    say: 'Underneath it all sits a console, with Hudson AI and a terminal a keystroke away.',
    moves: [
      { at: 0.8, name: 'set_console', args: { open: true } },
      { at: 2.6, name: 'queue_ai_prompt', args: { text: 'Tile my windows side by side' } },
    ],
  },
  {
    id: 'everywhere',
    label: 'Everywhere',
    say: 'The same primitives ship on iOS, macOS, and the web, so your apps feel at home on each.',
    moves: [
      { at: 0.6, name: 'set_console', args: { open: false } },
      { at: 1.6, name: 'set_app_state', args: { appId: 'intent-explorer', visible: false } },
      { at: 2.6, name: 'set_app_state', args: { appId: 'hudson-ai', visible: false } },
    ],
  },
  {
    id: 'close',
    label: 'Yours',
    say: 'That’s Hudson. Your apps bring the work; Hudson gives them a shared workspace.',
    moves: [
      { at: 0.4, name: 'set_app_state', args: { appId: 'hudson-docs', focused: true } },
      { at: 1.2, name: 'set_panel', args: { side: 'right', collapsed: false }, wide: true },
    ],
  },
];

/** Moves that return the hero to its starting state (used on stop). */
export const WALKTHROUGH_RESET: Omit<WalkthroughMove, 'at'>[] = [
  { name: 'close_command_palette' },
  { name: 'set_console', args: { open: false } },
  { name: 'set_panel', args: { side: 'left', collapsed: true } },
  { name: 'set_app_state', args: { appId: 'intent-explorer', visible: false } },
  { name: 'set_app_state', args: { appId: 'hudson-ai', visible: false } },
  { name: 'run_command', args: { commandId: 'view-canvas' } },
  { name: 'set_app_state', args: { appId: 'hudson-docs', focused: true } },
  { name: 'set_panel', args: { side: 'right', collapsed: false }, wide: true },
];
