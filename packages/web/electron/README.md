# @hudsonkit/electron

This package sets up a HudsonKit app in Electron: the window, the preload script, the app menu, and the bridge relay. It
follows the rules in [HUD-015 §13](../../../docs/specs/hud-015-tabs.md):

- **Electron is a UI, never a host.** The main process only relays. Recording, transcription and agent work run in a
  separate host process (Swift, Rust or Bun). The bridge's providers talk to that process.
- **There is no background Electron.** When the last window closes, the app quits.

## Main process

```ts
import { app } from 'electron';
import { createHudsonBridge, createHudsonWindow, installHudsonMenu, quitWhenWindowsClose } from '@hudsonkit/electron/main';

const bridge = createHudsonBridge({
  // Relays the page's activity requests to the process that owns them.
  activities: { list: () => host.activities(), send: (ref, command, args) => host.send(ref, command, args) },
  // App channels: your own messages, under names you choose.
  channels: { settings: (body) => host.settings(body) },
});
host.onActivity((snapshot) => bridge.publish(snapshot));

quitWhenWindowsClose();
app.whenReady().then(() => {
  installHudsonMenu({ bridge, onQuitCompletely: () => host.stopAll() });
  createHudsonWindow({ url: process.env.DEV_URL, file: 'out/index.html', bridge });
});
```

`createHudsonWindow` turns on context isolation and the sandbox, and loads the ready-made preload (`HUDSON_PRELOAD`).
If your app has its own preload, call `exposeHudsonBridge()` from `@hudsonkit/electron/preload` in it, and pass it as
`preload`.

## Page

```tsx
import { createElectronAdapter, PlatformProvider } from 'hudsonkit';

<PlatformProvider adapter={createElectronAdapter()}>…</PlatformProvider>
```

The adapter finds the preload bridge, and wires up:

- **Commands:** menu keys such as ⌘W, ⌃⇥ and ⌘1–9 run the shell's tab commands.
- **Activities:** they show in the status-bar indicator.
- **Channels:** `adapter.channels.channel('settings').request(…)`. Use `has(name)` to hide a feature that the host
  doesn't serve.

The same page code runs under WKWebView, through `createWebKitAdapter()` and `HudWebBridge`, and on the plain web,
where these bridges don't exist.

## Example

```bash
bun run --cwd packages/web/electron build
```

```bash
bun dev
```

```bash
bun run --cwd packages/web/electron example
```

The example opens `/demo/tabs` in a window. Set `HUDSON_EXAMPLE_CHECK=/path/out.json` to run a scripted check instead.
The check covers the preload, the sandbox, a channel round trip, and menu commands reaching the shell. It writes the
results and a screenshot, then quits.

Bun doesn't run Electron's install script by default. Before the first run, fetch the binary:

```bash
node node_modules/electron/install.js
```
