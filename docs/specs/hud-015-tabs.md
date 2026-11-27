# HUD-015 — Tabs

Status: draft, revised after review by OpenScout, Linea (LIN-063), Talkie and
Scout. No implementation yet. See [Review](#review) for what changed.

## What

A tabbed layout for HudsonKit. Tabs live in groups, groups split beside or
below each other, and named docks sit on the right and bottom. Tabs restore on
relaunch, and a closed tab can be reopened.

HudsonKit has no tab, split-pane or docking primitive today. It has side
panels, the command dock, and the `WorkspaceShell` canvas with free windows.
Linea's Electron workspace needed tabs, so it built its shell on dockview
outside HudsonKit. This spec adds the missing primitive so that Linea, Scout,
Talkie and every other Hudson app can use the same one.

Tabs are not an Electron feature. The layout runs on the web, in Electron, and
in the native WKWebView hosts (Scout.app, Talkie). Native hosts add two
things: menu commands and file-backed persistence. Both arrive through the
platform adapter.

## Who uses it

| App | Where | What goes in tabs |
| --- | --- | --- |
| Linea workspace | Electron | Books, web pages, notes, canvases, terminals, agent sessions. Free splits and both docks. The reference app and first migration. |
| Scout | Web and Scout.app (WKWebView) | A "watch" area under Work: flights, session threads, conversations, terminals and diffs side by side. Mounted inside the existing `AppShell`, not as the top-level shell. |
| Iris (Talkie on the web) | Web | Library, hooks, runs, object viewer, terminal. A recording split beside its transcript. Likely Talkie's first consumer. |
| Talkie for Mac | WKWebView | Docks only: a right inspector and a bottom drawer. No tab strip in the main area. |

The motivating case: an operator sends three review asks through Scout and
wants to watch the three agent threads side by side.

Native iOS apps (Scout, Talkie) are SwiftUI and are not covered. Section 12
covers phone-width web only.

## Where this comes from

Linea's workspace (`linea/apps/linea-workspace`, LIN-063) is the reference.
It is in daily use, and parity with it is the acceptance bar for the first
migration.

| Linea file | What it gives this spec |
| --- | --- |
| `src/shared/contracts/tabs.ts` | Tab kinds, traits, params, descriptors |
| `src/renderer/tabs/registry.ts` | Per-tab props: `visible`, `setTitle`, `setParams`, `setIcon` |
| `src/renderer/shell/Shell.tsx` | Open, place, split, panes, close, reopen, cycle, persist, `adoptPanes` |
| `src/shared/contracts/commands.ts` | One command list for menu, palette and sidebar |
| `src/main/workspace/store.ts` | Layout snapshot, closed-tab stack (50), window bounds |

Prior art in the other reviewers' code is listed in [Reuse](#reuse).

## Principles

These came out of review and hold across every section.

1. **A tab is a view onto a resource, not the resource.** Closing, hiding or
   unmounting a tab never stops a recording, cancels a flight, kills an agent
   or deletes history. The app decides what close means through
   `onClose` (section 7).
2. **The shell never closes a tab on its own.** A tab whose target has ended or
   vanished stays open and shows its final state or a tombstone. A tab whose
   host is offline restores in an offline state.
3. **Hidden does not mean paused.** `visible: false` tells the app it is not on
   screen, so it can stop rendering work. Playback, streams and attention
   tracking may continue, and status keeps updating in the tab strip.
4. **The shell does not move focus on its own** while an editable element has
   it. Dictation, composers and terminals must not lose their target.
5. **Layout logic is pure.** Split-tree operations are plain functions over
   the snapshot, tested without a DOM.

## Decisions

### 1. A tab is an app instance

Hudson already has the right model. `WorkspaceShell` keeps
`instances: AppInstance[]`, and each instance references a `HudsonApp` by
`appId`. An app that sets `multiInstance: 'spawnable'` can have many
instances. A Linea tab kind (book, web, terminal, note) becomes a `HudsonApp`,
and a tab becomes an `AppInstance`.

- Apps keep the Provider + Slots + Hooks contract. A tab renders the app's
  `Content` slot. The app does not need to know whether it is in a tab, a
  dock or a window.
- Instance identity (`instanceId`) is separate from resource identity (what
  the params name). Two tabs can show the same resource. Reuse (section 6)
  is how an app prevents that when it wants to.
- Providers that stream data hold one stream per app, not per tab. Each tab
  subscribes by resource ID. Ten open threads must not mean ten broker
  streams.

### 2. Three layers: `TabArea`, `Docks`, `TabShell`

Review was clear that a top-level shell alone is not enough. Scout wants tabs
inside one content area of its existing `AppShell`. Talkie wants docks with no
tabs at all. So the primitive ships in three layers, all from
`hudsonkit/workspace`:

| Export | What it is | Who uses it |
| --- | --- | --- |
| `<TabArea>` | A split tree of tab groups, mountable anywhere, including `AppShell` content | Scout's watch area, Iris |
| `<Docks>` | Named right and bottom docks around any content, toggled, sized and persisted. A dock holds tabs or a single slot. | Talkie for Mac, and `TabShell` |
| `<TabShell>` | Hudson chrome (nav, side navigation, status bar, palette) around `<Docks>` around `<TabArea>`. Takes a `HudsonWorkspace`, like `WorkspaceShell`. | Linea |

`AppShell` and `WorkspaceShell` do not change, except that `AppShell` can host
`<Docks>` and `<TabArea>` in its content. Shared parts (instance list,
Provider nesting, Bridge, command registration) are extracted from
`WorkspaceShell` and reused, not copied.

### 3. Instances carry restore params

Linea's rule is: "A tab's params are all it needs to be restored." This spec
adds one optional field to `AppInstance`:

```ts
export interface AppInstance {
  instanceId: string;
  appId: string;
  title?: string;
  bounds?: { x: number; y: number; w: number; h: number };
  /** Serializable restore params, owned by the app. New in HUD-015. */
  params?: unknown;
  /** The app's params version when these params were written. */
  paramsVersion?: number;
}
```

Rules for params:

- Params name durable objects (a recording ID, a conversation ID, a book ID
  and location). They never hold a live handle or a content snapshot.
- Params may be a URL path. An app with a URL-addressable route union, like
  Scout's `Route` (`lib/router.ts`), can store `routePath(route)` and get
  deep links, restore and "open in tab" from one format.
- An app declares its current params version and a migration:

```ts
export interface HudsonApp {
  // ...existing fields
  tab?: HudsonAppTabConfig;
}

export interface HudsonAppTabConfig {
  /** Restore this tab on relaunch. Default true. */
  persists?: boolean;
  /** Current params version. Default 1. */
  paramsVersion?: number;
  /** Upgrade older params. Return null to restore as a tombstone. */
  migrateParams?: (params: unknown, fromVersion: number) => unknown | null;
  /** Canonical identity for reuse (section 6). Same key = same resource. */
  reuseKey?: (params: unknown) => string | null;
  /** Where a new tab of this app goes when the caller gives no placement. */
  defaultPlacement?: OpenTabOptions['placement'];
  /** Preferred share of a new split or dock, 0–1. */
  defaultSize?: number;
  /** Text glyph for the strip when no icon is set. */
  glyph?: string;
  /** Unmount when hidden and idle (v2, section 8). Default false. */
  sleeps?: boolean;
}
```

### 4. Layout: a split tree plus docks

```ts
export type TabLayoutNode =
  | { type: 'group'; id: string; tabs: string[]; active: string | null }
  | { type: 'split'; id: string; direction: 'row' | 'column';
      children: TabLayoutNode[]; sizes: number[] };

export type TabDock = 'right' | 'bottom';

export interface DockState {
  /** The dock's own group. Docks are not nodes in the main tree. */
  group: Extract<TabLayoutNode, { type: 'group' }>;
  visible: boolean;
  /** Width (right) or height (bottom) as a share of the window, 0–1. */
  size: number;
}

export interface TabLayoutSnapshot {
  version: 1;
  root: TabLayoutNode;
  docks: Partial<Record<TabDock, DockState>>;
  /** The focused group: a group ID in root, or a dock name. */
  focusedGroup: string;
}
```

`tabs` holds instance IDs. `sizes` are fractions that add up to 1.

Dock invariants (Linea and OpenScout asked for these to be explicit):

- A dock is not part of the main split tree, so a split, move or collapse in
  the main area never changes which group is a dock.
- A dock exists from its first tab. Hiding it keeps its tabs and size.
  Closing its last tab removes it; reopening a dock tab recreates it at its
  last size.
- A tab can move between a dock and the main area by drag or command.
- Default sizes are 38% (right) and 30% (bottom), Linea's values, unless the
  opening app's `tab.defaultSize` says otherwise. Size changes persist.
- Hiding a focused dock moves focus to the last focused main group.

Main-area invariants:

- An empty group closes, and a split with one child collapses into it.
- The main area always has at least one group. If the last tab closes, an
  empty group remains for the app's empty state.

### 5. Persistence

```ts
export interface TabStore {
  load(key: TabStoreKey): Promise<TabWorkspaceState | null>;
  save(key: TabStoreKey, state: TabWorkspaceState): Promise<void>;
}

export interface TabStoreKey {
  workspaceId: string;
  /** One layout per window or scene. Default 'main'. */
  windowId: string;
}

export interface TabWorkspaceState {
  instances: AppInstance[];
  layout: TabLayoutSnapshot;
  /** Most recent first, capped at 50. */
  recentlyClosed: ClosedTab[];
}

export interface ClosedTab {
  instance: AppInstance;
  /** Where it was: a group ID or a dock name, and its index there. */
  from: { group: string; index: number };
}
```

- The store key includes a window ID, so two windows never overwrite each
  other's layout. Whether two windows may share one workspace's instances is
  out of scope for v1: each window has its own.
- The default store uses the same localStorage backing as
  `usePersistentState()`. Electron passes a file-backed store. Hosts may add
  fields of their own (Linea's `windowBounds`) to the same file; the store
  must preserve fields it does not own.
- Saves are debounced by 300 ms. The store also flushes on `pagehide`,
  `beforeunload` and the native quit command, so a quit inside the debounce
  window loses nothing.
- Live drag and resize state stays in refs, like `WorkspaceShell` window
  bounds, and is written on release.

Restore is lazy and tolerant:

- On relaunch, only the active tab of each visible group mounts. Other tabs
  mount on first focus. Their strip entries still show title, icon and the
  last saved status.
- Each tab is validated on its own. An unknown `appId`, failed
  `migrateParams`, or missing instance restores as a tombstone tab with the
  saved title, and the rest of the workspace restores normally.
- An invalid layout (bad sizes, a tab ID in two groups, an unknown group in
  `focusedGroup`) is repaired: sizes are normalised, duplicates dropped,
  focus falls back to the first group. A snapshot that cannot be read falls
  back to the workspace's default layout, and the unreadable copy is kept
  beside it for recovery.
- The broker or the app stays authoritative for its own records. The tab
  store holds layout and view state only, never secrets.

### 6. Opening a tab

```ts
interface OpenTabRequest {
  appId: string;
  title?: string;
  params?: unknown;
}

interface OpenTabOptions {
  /** Where the tab goes. Default: the app's defaultPlacement, else the focused group. */
  placement?:
    | 'focused'
    | 'beside'                    // after the requesting tab, in its group
    | 'right' | 'below'           // split the focused group
    | { dock: TabDock }
    | { group: string }
    | { besideTabWith: { appId: string; reuseKey: string }; split?: 'right' | 'below' };
  /** Open without focusing it, and without moving focus (⌘-click). */
  inactive?: boolean;
  /** If a tab with the same reuseKey exists, focus it instead. */
  reuse?: boolean;
}

function useTabs(): TabsApi;

interface TabsApi {
  open(request: OpenTabRequest, options?: OpenTabOptions): string; // instanceId
  close(instanceId: string): void;
  reopen(): void;
  focus(instanceId: string): void;
  move(instanceId: string, to: OpenTabOptions['placement']): void;
  /** Read-only list for palettes, sidebars and switchers. */
  tabs: ReadonlyArray<TabSummary>;
}

interface TabSummary {
  instanceId: string;
  appId: string;
  title: string;
  /** Extra label when titles collide, e.g. a host or folder. */
  detail?: string;
  group: string;
  active: boolean;
  activity: TabActivity | null;
}
```

- **Reuse uses the app's key, not param equality.** `reuse: true` compares
  `tab.reuseKey(params)`. Linea's "one canvas per book" is a key of
  `bookId`. Scout's key is `routeKey`, which already treats a flight, its
  session and its conversation as one thread.
- **Placing relative to another tab.** `besideTabWith` opens next to a
  specific tab, for example a canvas beside its book, rather than beside
  whichever tab is focused.
- **Opening into a hidden dock** shows the dock. With `inactive: true` it
  shows the dock but does not move focus.
- **Opening from outside the tree.** `TabArea` and `TabShell` accept a
  `ref` with the same `TabsApi`, and the command bridge accepts
  `tabs.open` with a request as its argument (section 9). This covers
  "Scoutbot, put these three asks side by side" and voice commands.

Guest links: Linea's shell opens links from a book or web guest into the
right dock, keeping `openedFrom`, and opens them inactive on ⌘-click. With
this API that is `{ placement: { dock: 'right' }, inactive }`. The first
draft said guest links land beside their opener; that described Linea's
README, not its code.

### 7. A tab controls its own strip entry

```ts
type TabActivity =
  | 'live'          // recording, streaming, running
  | 'playing'
  | 'unread'
  | 'needs-input'   // waiting on the operator
  | 'error';

function useTab(): {
  instanceId: string;
  /** On screen right now. Not a signal to stop work (principle 3). */
  visible: boolean;
  setTitle(title: string): void;
  setIcon(url: string | null): void;       // null restores the glyph
  setActivity(activity: TabActivity | null): void;
  setBadge(count: number | null): void;
  params: unknown;
  setParams(params: unknown): void;
  /** Close this tab, e.g. after the user deletes its resource. */
  close(): void;
  /** Run when the user closes the tab, not when it unmounts. */
  onClose(handler: () => void | Promise<void>): () => void;
};
```

- **Activity and badges update while the tab is hidden.** The strip, the
  palette's tab list and the dock toggle show them. An app can also report
  activity for a tab that has not mounted yet (lazy restore) through
  `useTabs`, so a background thread can mark itself unread.
- **Closing a busy tab asks first.** If a tab's activity is `live` or
  `playing`, ⌘W and the close button ask before closing. Closing still does
  not stop the resource (principle 1) unless the app's `onClose` does.
- **`onClose` is the cleanup hook.** Linea kills a terminal's process in
  `onClose`, not on unmount, so a remount after a move does not kill it.
  Tabs with `persists: false` are not saved and not added to the reopen
  stack.
- **Icons** fall back to the app's `glyph` when `setIcon` is null or the
  image fails to load (Linea's favicon behaviour).
- Outside `TabArea`, `setTitle` sets the window title and the strip-only
  calls do nothing.

### 8. Hidden tabs and sleeping

- v1 never unmounts a mounted tab because it is hidden. Terminals, webview
  guests and players keep running. Lazy restore (section 5) is the only v1
  memory saving.
- v2 adds `tab.sleeps`. A sleeping app's hidden tab may unmount after a delay,
  but never while its activity is `live` or `playing`, and never while it
  holds focus.
- Audio is owned outside tabs. A shell-level "now playing" owner across tabs
  is out of scope for this spec; apps that play audio keep it in their
  Provider or a host process.

### 9. Commands

`TabArea` and `TabShell` register built-in commands in the command palette:

| ID | Native default | Action |
| --- | --- | --- |
| `tabs.close` | ⌘W | Close the focused tab (asks if busy) |
| `tabs.reopen` | ⌘⇧T | Reopen the last closed tab |
| `tabs.next` / `tabs.previous` | ⌃⇥ / ⌃⇧⇥ | Cycle tabs |
| `tabs.split-right` / `tabs.split-below` | — | Move the focused tab to a new split |
| `tabs.dock.right` / `tabs.dock.bottom` | — | Toggle a dock |
| `tabs.focus-group.N` | ⌘1–⌘9 | Focus group N |
| `tabs.switch` | — | Searchable list of open tabs |
| `tabs.open` | — | Open a tab; takes an `OpenTabRequest` and options |

- **Cycling scope** is configurable: `'workspace'` (every tab, in layout
  order) or `'group'`. The default is `'workspace'`, which is what Linea does.
- **The web has no default key bindings.** Browsers reserve ⌘W, ⌘T, ⌘⇧T,
  ⌃⇥ and ⌘1–9, and Option combinations type characters in text fields on a
  Mac. On the web every tab command is a palette entry, and an app can opt in
  to bindings.
- **Native hosts get the defaults** through the platform adapter. The host
  owns the accelerators, so they work while a webview guest has focus.
- **The command bridge is platform-neutral.** The adapter's `commands` bridge
  (shipped for Electron in #288) gains an argument and is specified for any
  host:

  ```ts
  export interface PlatformCommandBridge {
    subscribe(listener: (command: string, args?: unknown) => void): () => void;
  }
  ```

  Electron feeds it from the preload script. A WKWebView host feeds it from a
  script message handler, which a Swift `CommandGroup` can call. A WKWebView
  adapter is part of this work, so Scout.app and Talkie keep their shortcuts.
- **Commands go to the focused window and group**, and each command runs once:
  when a native bridge is present, the shell does not also bind the same keys
  in the page.
- **Editable targets are respected.** Shell key handling skips events from
  inputs, textareas and contenteditable elements, as
  `OpenScoutAppShell.tsx` does today. Global push-to-talk keys belong to the
  voice agent; the shell never binds them.

### 10. Interaction

v1:

- Click a tab to focus it. Middle-click or the close button closes it.
- Drag a tab to reorder it in its strip, onto another group's strip, or into
  a dock.
- **Drop a tab on a group's edge to split there,** with a drop preview. The
  first draft deferred this; Linea uses it today through dockview, so leaving
  it out would be a regression for the first migration.
- Drag a split divider to resize. Double-click a divider to equalise.
- Many tabs: when a strip overflows, it scrolls and shows an overflow menu.
  `tabs.switch` searches all open tabs. Colliding titles show a `detail`
  label, such as Scout's host name.
- Focus after close goes to the tab that was active before it in the same
  group, else the neighbour, else the last focused group.
- Keyboard: the tab strip is a `tablist`. Arrow keys move between tabs, Enter
  focuses, Delete closes. Move and split are palette commands, so they work
  without a pointer.

v2:

- Sleeping tabs (section 8).
- Native hosts: drag a tab out into its own window (prior art: Talkie's
  `ConsolePopoutManager.swift`).

### 11. Look

Hudson owns the visual register. The tab strip uses existing chrome tokens,
and the active tab uses the existing accent. Activity uses the existing status
colours (emerald live, amber needs-input, red error). No purple. No new
library: tabs, splits, docks and drag are custom, and
`@base-ui-components/react` is used only for the tab context menu and the
overflow menu.

### 12. Phone width

On phone-width web:

- `TabArea` shows one group at a time, with a tab switcher in the navigation
  bar. The split tree is kept unchanged, so a wider screen restores it.
- Docks open as sheets, not as hidden groups.
- An app can mark controls that must stay reachable (Talkie's record
  button); the switcher never covers them.

Native iOS apps are out of scope.

## Reuse

| Source | Use it for |
| --- | --- |
| OpenScout `packages/web/client/OpenScoutAppShell.tsx` | Command registration from `hooks.useCommands`, and the editable-target key guard (section 9) |
| Scout `lib/router.ts` (`routeFromUrl`, `routePath`, `routeKey`), `lib/types.ts` (`Route`) | The pattern for URL params and reuse keys (sections 3, 6) |
| Scout `lib/scoutbot.ts`, `lib/world-command.ts` | Opening views from outside the UI, including before it mounts (section 6) |
| Scout `components/hud-grid/hud-grid-layout.ts` | Pure, DOM-free layout operations (principle 5) |
| Scout `lib/sessionRead.ts` | The shape of unread state behind badges (section 7) |
| Scout `lib/persistent-state.ts`, `lib/host-layout.ts` | Versioned persistent keys (section 5) |
| Talkie `TerminalDrawer.swift` | A bottom dock that keeps its height (section 4) |
| Talkie `TalkieDetailLayout.swift`, `layout.json` | Per-kind default layouts (`defaultPlacement`, `defaultSize`) |
| Talkie `ConsolePopoutManager.swift` | Drag a tab out to a window (v2) |
| Talkie `TabDefinitionRegistry.swift` | User-defined tab kinds as files, if Hudson wants presets later |

## Linea migration

| Linea today | With HudsonKit |
| --- | --- |
| dockview `DockviewReact` | `TabShell` |
| `registerTab({ kind, glyph, component })` | One `HudsonApp` per kind, `multiInstance: 'spawnable'`, `tab.glyph` |
| `TabDescriptor.params` | `AppInstance.params`, read through `useTab()` |
| `open(kind, title, params, placement, { pane })` | `useTabs().open({ appId, title, params }, { placement: { dock } })` |
| Guest links into the right pane, ⌘-click in background | `{ placement: { dock: 'right' }, inactive: true }` |
| `openCanvas` one-per-book check | `reuseKey: p => p.bookId`, `besideTabWith` the book |
| `ws.pane.right` / `ws.pane.bottom` prefs, `adoptPanes` | `TabLayoutSnapshot.docks`, set by the importer |
| `workspace:save-layout` IPC | A file-backed `TabStore` on the same IPC that keeps `windowBounds` |
| `reopenTab` routing by kind | `ClosedTab.from`, falling back to the app's `defaultPlacement` if that group or dock is gone |
| Cycling `api.panels` | `tabs.next` with scope `'workspace'` |
| Terminal cleanup on close | `onClose` |
| `shell:command` → `runCommand` | Adapter `commands` bridge → `TabShell` |

The migration order:

1. **Adapter first.** Linea keeps dockview and gains a thin layer that speaks
   the HudsonKit contracts: commands through the bridge, tab props through
   `useTab()`, and the store format.
2. **Importer.** Convert saved dockview JSON, the `ws.pane.*` prefs (running
   `adoptPanes` logic for pre-pane layouts), open tabs and the closed-tab
   history (old `{ kind, title, params }` entries) into a `TabWorkspaceState`.
   Keep the original file for rollback. Import only after validation passes.
3. **Compatibility suite.** Run `TabShell` against real saved Linea layouts:
   pre-pane snapshots, hidden docks, closed history, book and canvas
   placement, background guest links, favicon failures, terminal close and
   reset, and restart.
4. **Switch.** Replace dockview with `TabShell` in one bounded change, with
   the shell owner's agreement.

The webview guest, the terminal and the reading context stay Linea app code.
The Electron window setup, preload bridge and menu move to
`@hudsonkit/electron` as a separate change.

## Delivery

1. Extract shared shell parts from `WorkspaceShell`. No change in behaviour.
2. `AppInstance.params`, `HudsonApp.tab`, `useTab()`, `useTabs()`. Works in
   `WorkspaceShell` too.
3. Pure layout module: the split tree, docks, moves, repairs and import. Full
   unit tests, no DOM.
4. `<Docks>`, `<TabArea>`, `<TabShell>` v1, including edge-drop and lazy
   restore. A Hudson example workspace runs at `/app?shell=tabs`, and an
   `AppShell` example mounts `<TabArea>` in its content.
5. The platform-neutral command bridge, with Electron and WKWebView adapters.
6. Linea migration, in the order above (Linea repo).
7. v2 items as needed.

Every step ships with vitest tests. Step 4 also ships a browser check at
desktop and phone widths.

## Open questions

The four questions from the first draft are settled (see Review). These
remain:

1. **Shared instances across windows.** v1 gives each window its own layout
   and instances. Should two windows ever share a workspace's instances?
   (OpenScout)
2. **A shell-level "now playing" owner.** Talkie suggested one owner for
   audio across tabs. This spec leaves audio to apps. Is that enough?
3. **User-defined tab kinds.** Talkie defines tabs as user-owned files. Is
   that worth a HudsonKit feature, or app-specific?

## Review

Reviewed on 2026-11-27 by agents in OpenScout (this Mac), Linea (this Mac,
as the LIN-063 shell owner), Talkie (mini) and Scout (arts-mini).

**First-draft open questions, all settled:**

| Question | Outcome |
| --- | --- |
| Separate `TabShell` or a mode of `WorkspaceShell`? | Separate, and split into `TabArea`, `Docks` and `TabShell` so tabs and docks can be used inside `AppShell` (Scout, Talkie). |
| Free splits plus docks, or docks only? | Both, unanimously. Dock invariants are now explicit. |
| Web shortcuts? | None by default, unanimously. Palette entries plus opt-in bindings; native hosts get keys through the bridge. |
| Mixed canvas and tab layouts? | Not in v1, unanimously. |

**Main changes from the first draft:**

- Principles: tabs are views, the shell never closes a tab itself, hidden is
  not paused, no focus stealing, pure layout logic.
- `TabArea` and `Docks` as embeddable layers (section 2).
- Params name durable objects, may be URLs, and carry a version and
  migration (section 3).
- Docks are separate from the main tree, with invariants (section 4).
- Per-window store key, flush on quit, lazy and tolerant restore
  (section 5).
- App-supplied `reuseKey`, `besideTabWith`, `move`, and opening from outside
  the tree (section 6).
- `setActivity`, `setBadge`, `close`, `onClose`, glyph fallback, confirm
  before closing a busy tab (section 7).
- No unmounting in v1; sleeping in v2 skips busy tabs (section 8).
- Workspace-wide cycling, a platform-neutral command bridge with arguments
  and a WKWebView adapter, editable-target guard (section 9).
- Edge-drop splitting moved into v1; overflow menu, tab switcher, collision
  labels, focus-after-close rules (section 10).
- Docks as sheets on phone-width web; native iOS out of scope (section 12).
- Corrected the guest-link behaviour and expanded the Linea migration into an
  adapter, importer, compatibility suite and switch.
