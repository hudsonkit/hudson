# HUD-015 — Tabs

Status: draft for review. No implementation yet.

## What

A tabbed layout for HudsonKit. A workspace shows its app instances as tabs in
groups, and groups split beside or below each other. Tabs restore on relaunch,
and a closed tab can be reopened.

HudsonKit has no tab, split-pane, or docking primitive today. It has side
panels, the command dock, and the `WorkspaceShell` canvas with free windows.
Linea's Electron workspace needed tabs, so it built its shell on dockview
outside HudsonKit. This spec adds the missing primitive so that Linea, and
every other Hudson app, can use the same shell.

Tabs are not an Electron feature. The layout runs on the web, in Electron, and
in the native WKWebView hosts. Electron adds two things only: native menu
commands, and file-backed persistence. Both arrive through the platform
adapter (`createElectronAdapter`, shipped in #288).

## Where this comes from

Linea's workspace (`linea/apps/linea-workspace`, LIN-063) is the reference.
It is in daily use and its behaviour is the acceptance bar.

| Linea file | What it gives this spec |
| --- | --- |
| `src/shared/contracts/tabs.ts` | Tab kinds, traits, params, descriptors |
| `src/renderer/tabs/registry.ts` | Per-tab props: `visible`, `setTitle`, `setParams`, `setIcon` |
| `src/renderer/shell/Shell.tsx` | Open, place, split, panes, close, reopen, cycle, persist |
| `src/shared/contracts/commands.ts` | One command list for menu, palette, and sidebar |
| `src/main/workspace/store.ts` | Layout snapshot and closed-tab stack (50 entries) |

## Decisions

### 1. A tab is an app instance

Hudson already has the right model. `WorkspaceShell` keeps
`instances: AppInstance[]`, and each instance references a `HudsonApp` by
`appId`. An app that sets `multiInstance: 'spawnable'` can have many
instances. A Linea tab kind (book, web, terminal, note) becomes a `HudsonApp`,
and a tab becomes an `AppInstance`.

Consequences:

- Apps keep the Provider + Slots + Hooks contract. A tab renders the app's
  `Content` slot. The app does not know whether it is in a tab or a window.
- The Provider already receives `visible` and `focused`. A hidden tab gets
  `visible: false` and pauses expensive work. This is Linea's `visible` prop.
- One workspace definition can render as a canvas or as tabs.

### 2. `TabShell` is a new shell beside the others

HudsonKit gets a third top-level shell, `TabShell`, exported from
`hudsonkit/workspace`. It takes the same `HudsonWorkspace` as
`WorkspaceShell`. `AppShell` and `WorkspaceShell` do not change.

`WorkspaceShell` is canvas-centred and large. A separate shell keeps that code
stable and keeps the tab layout easy to read. Shared parts (instance list,
Provider nesting, Bridge, command palette, status bar, side navigation) are
reused, not copied. If they are not yet separable from `WorkspaceShell`, the
first implementation PR extracts them.

### 3. Instances carry restore params

Linea's rule is: "A tab's params are all it needs to be restored." Hudson
instances have `instanceId`, `appId`, `title`, and `bounds`. They have no
params. This spec adds one optional field:

```ts
export interface AppInstance {
  instanceId: string;
  appId: string;
  title?: string;
  bounds?: { x: number; y: number; w: number; h: number };
  /** Serializable restore params, owned by the app. New in HUD-015. */
  params?: unknown;
}
```

An app reads and writes its params with a hook. The hook works in both shells.

### 4. The layout is a split tree of tab groups

```ts
export type TabLayoutNode =
  | { type: 'group'; id: string; tabs: string[]; active: string | null }
  | { type: 'split'; id: string; direction: 'row' | 'column';
      children: TabLayoutNode[]; sizes: number[] };

export interface TabLayoutSnapshot {
  version: 1;
  root: TabLayoutNode;
  /** Named groups the shell can toggle, e.g. { right: 'g3', bottom: 'g7' }. */
  docks: Partial<Record<TabDock, string>>;
  /** Which docks are currently shown. */
  dockVisible: Partial<Record<TabDock, boolean>>;
}

export type TabDock = 'right' | 'bottom';
```

`tabs` holds instance IDs. `sizes` are fractions that add up to 1. The
snapshot is versioned so a later layout can migrate it.

Docks are Linea's right and bottom panes. A dock is an ordinary group with a
name. Toggling a dock hides or shows its group without closing its tabs.
Opening a tab "in the right dock" creates the dock on first use at 38% width;
the bottom dock gets 30% height. These are Linea's values.

### 5. Persistence goes through a store adapter

```ts
export interface TabStore {
  load(): Promise<TabWorkspaceState | null>;
  save(state: TabWorkspaceState): Promise<void>;
}

export interface TabWorkspaceState {
  instances: AppInstance[];
  layout: TabLayoutSnapshot;
  /** Most recent first, capped at 50. */
  recentlyClosed: ClosedTab[];
}

export interface ClosedTab {
  instance: AppInstance;
  /** Group the tab left, and its index there, so reopen can put it back. */
  groupId: string;
  index: number;
}
```

The default store uses the same localStorage backing as
`usePersistentState()`, namespaced by workspace ID. An Electron host passes a
file-backed store (Linea's `WorkspaceStore`). Saves are debounced by 300 ms,
as in Linea. Live drag and resize state stays in refs, like `WorkspaceShell`
window bounds, and is flushed on release.

The `TabStore` is passed as a `TabShell` prop. It is not part of
`PlatformAdapter`, because a web app may also want a server-backed store.

### 6. Opening a tab

```ts
interface OpenTabRequest {
  appId: string;
  title?: string;
  params?: unknown;
}

interface OpenTabOptions {
  /** Where the tab goes. Default: the active group. */
  placement?: 'active' | 'beside' | 'right' | 'below' | { dock: TabDock } | { group: string };
  /** Open without focusing it (⌘-click a link). */
  inactive?: boolean;
  /** Focus an existing tab with the same appId and equal params instead. */
  reuse?: boolean;
}

function useTabs(): {
  open(request: OpenTabRequest, options?: OpenTabOptions): string; // instanceId
  close(instanceId: string): void;
  reopen(): void;
  focus(instanceId: string): void;
  /** Read-only view for palettes and sidebars. */
  tabs: ReadonlyArray<{ instanceId: string; appId: string; title: string; groupId: string; active: boolean }>;
};
```

`'beside'` puts the new tab in the group of the tab that asked, directly after
it. This is how links opened from a guest land beside the tab that opened
them. `'right'` and `'below'` split the active group. `reuse` covers Linea's
"one canvas per book" rule without special-casing a kind in the shell.

### 7. A tab controls its own strip entry

```ts
function useTab(): {
  instanceId: string;
  visible: boolean;
  setTitle(title: string): void;
  setIcon(url: string | null): void; // null restores the app icon
  params: unknown;
  setParams(params: unknown): void;
};
```

This is Linea's `TabProps`, delivered as a hook inside the Provider so that
apps keep the Hudson pattern. Outside `TabShell`, `setTitle` sets the window
title, `setIcon` does nothing, and `visible` follows the Provider prop.

### 8. Traits

Linea declares four traits per kind. Hudson places them as follows.

| Linea trait | Hudson |
| --- | --- |
| `splittable` | Dropped. Every tab can split. No Linea kind sets it to false. |
| `persists` | New optional `HudsonApp.tab.persists` (default `true`). `false` tabs are not saved and not reopened. |
| `sleeps` | New optional `HudsonApp.tab.sleeps` (default `false`). A hidden tab may unmount its `Content` and remount on focus. Deferred to v2. |
| `carriesContext` | Not a shell concern. It stays in Linea's reading-context code. |

```ts
export interface HudsonApp {
  // ...existing fields
  /** Tab behaviour in TabShell. New in HUD-015. */
  tab?: { persists?: boolean; sleeps?: boolean };
}
```

### 9. Commands

`TabShell` adds built-in commands to the command palette:

| ID | Default keys | Action |
| --- | --- | --- |
| `tabs.close` | ⌘W | Close the active tab |
| `tabs.reopen` | ⌘⇧T | Reopen the last closed tab where it was |
| `tabs.next` / `tabs.previous` | ⌃⇥ / ⌃⇧⇥ | Cycle tabs in the active group |
| `tabs.split-right` / `tabs.split-below` | — | Move the active tab to a new split |
| `tabs.dock.right` / `tabs.dock.bottom` | — | Toggle a dock |
| `tabs.focus-group.N` | ⌘1–⌘9 | Focus group N |

Apps add their own commands through `hooks.useCommands`, as today.

Native menus: if the platform adapter has a `commands` bridge, `TabShell`
subscribes to it and runs each command ID it receives. The Electron main
process owns the accelerators, so shortcuts work while a webview guest has
focus. This is how Linea's `shell:command` path works today. On the web the
shell binds the keys itself. A browser keeps ⌘W and ⌘T, so the web defaults
for those commands use alternatives; this is open question 3.

### 10. Interaction

v1:

- Click a tab to focus it. Middle-click or the close button closes it.
- Drag a tab to reorder it in its strip, or onto another group's strip.
- Drag a split divider to resize. Double-click a divider to equalise.
- An empty group closes, and its split collapses.
- Keyboard: the tab strip is a `tablist`. Arrow keys move between tabs, Enter
  focuses, Delete closes.

v2:

- Drop a tab on a group edge to split there, with a drop preview.
- Sleeping tabs (`tab.sleeps`).
- Electron: drag a tab out to a new window.

### 11. Small screens

Below the phone breakpoint, `TabShell` shows one group at a time with a tab
switcher in the navigation bar. The split tree is kept, not changed, so a
wider screen restores it. This keeps iOS a first-class host.

### 12. Look

Hudson owns the visual register. The tab strip uses existing chrome tokens,
and the active tab uses the existing accent. No purple. No new library: tabs,
splits, and drag are custom, and `@base-ui-components/react` is used only for
the tab context menu, through `hudsonkit/context-menu`.

## Linea migration

These steps follow this spec. They are listed to show that the spec covers
Linea.

| Linea today | With HudsonKit |
| --- | --- |
| dockview `DockviewReact` | `TabShell` |
| `registerTab({ kind, glyph, component })` | One `HudsonApp` per kind, with `multiInstance: 'spawnable'` |
| `TabDescriptor.params` | `AppInstance.params`, read through `useTab()` |
| `open(kind, title, params, placement, { pane })` | `useTabs().open({ appId, title, params }, { placement: { dock } })` |
| `ws.pane.right` / `ws.pane.bottom` prefs | `TabLayoutSnapshot.docks` |
| `workspace:save-layout` IPC | A `TabStore` backed by the same IPC |
| `shell:command` → `runCommand` | Adapter `commands` bridge → `TabShell` |
| `openCanvas` one-per-book check | `open(..., { reuse: true })` |

The webview guest, the terminal, and the reading context stay Linea app code.
The Electron window setup, preload bridge, and menu move to
`@hudsonkit/electron` as a separate change.

## Delivery

1. Extract shared shell parts from `WorkspaceShell` if needed. No change in
   behaviour.
2. `AppInstance.params`, `HudsonApp.tab`, `useTab()`. Works in `WorkspaceShell`
   too.
3. `TabShell` v1: split tree, docks, strip, drag reorder, persistence,
   commands, small screens. A Hudson example workspace runs in it at
   `/app?shell=tabs`.
4. Linea moves its shell onto `TabShell` (Linea repo, with the shell owner's
   agreement).
5. v2 items as needed.

Every step ships with vitest tests. Step 3 also ships a browser check on
desktop and phone widths.

## Open questions

1. **Name.** `TabShell`, or a `layout: 'tabs'` option on `WorkspaceShell`?
   This spec chooses a separate shell (decision 2).
2. **Free splits or docks only?** Linea uses both: book and canvas split in
   the main area, and web and terminal go to named docks. This spec keeps both.
   Docks only would be simpler but would not cover the canvas beside its book.
3. **Web shortcuts.** A browser reserves ⌘W, ⌘T, and ⌘⇧T. Which keys should
   the web build use: ⌥W and ⌥⇧T, or none by default?
4. **Mixed layouts.** Should a canvas workspace be able to hold a tab group as
   one of its windows? This spec says not in v1.
