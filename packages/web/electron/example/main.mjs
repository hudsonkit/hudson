// @hudsonkit/electron example: Hudson's tabs demo in an Electron window.
//
//   bun run --cwd packages/web/electron build
//   bun dev                                  # Hudson on :3500
//   bun run --cwd packages/web/electron example
//
// HUDSON_URL overrides the page. HUDSON_EXAMPLE_CHECK=/path/out.json runs a
// scripted check instead (bridge hello, a channel round trip, menu commands
// reaching the shell), writes the results and a screenshot next to them, and
// quits.
import { writeFileSync } from 'node:fs';
import { app } from 'electron';
import {
  createHudsonBridge,
  createHudsonWindow,
  installHudsonMenu,
  quitWhenWindowsClose,
} from '../dist/main.js';

const url = process.env.HUDSON_URL ?? 'http://localhost:3500/demo/tabs';
const check = process.env.HUDSON_EXAMPLE_CHECK;

app.setName('Hudson Tabs');

// The example serves one app channel. A real app's handlers would talk to its
// host process; Electron itself owns no long-running work.
const bridge = createHudsonBridge({
  channels: {
    'demo.echo': (body) => ({ echoed: body, from: 'electron-main' }),
  },
});

quitWhenWindowsClose();

app.whenReady().then(() => {
  installHudsonMenu({ bridge });
  const win = createHudsonWindow({ url, bridge, backgroundColor: '#0a0b0d' });
  if (check) runCheck(win).catch((error) => {
    console.error('[example] check failed', error);
    app.exit(1);
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCheck(win) {
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  await sleep(2500); // let the shell mount and restore its layout
  const page = (js) => win.webContents.executeJavaScript(js);
  const result = {
    url,
    preloadExposed: await page(`typeof window.__hudsonHost?.request === 'function'`),
    sandboxed: await page(`typeof require === 'undefined' && typeof process === 'undefined'`),
    hello: await page(`window.__hudsonHost.request({ op: 'hello', version: 1 })`),
    channel: await page(`window.__hudsonHost.request({ op: 'channel.request', channel: 'demo.echo', body: { ping: 1 } })`),
    unknownChannel: await page(
      `window.__hudsonHost.request({ op: 'channel.request', channel: 'nope' }).then(() => 'resolved', (e) => String(e.message))`,
    ),
    tabsBefore: await page(`[...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())`),
  };
  // Watch what reaches the page, alongside the shell's own subscription.
  await page(`window.__hudsonHost.subscribe((e) => (window.__exampleSeen ??= []).push(e)); true`);
  // Focus the main group (its first tab), then drive it from the menu side.
  // The main group holds two notes, so each step lands on a different tab.
  await page(`document.querySelector('[role="tab"]').click(); true`);
  await sleep(300);
  const focusedStrip = () =>
    page(`[...document.querySelector('[role="tab"]').closest('[role="tablist"]').querySelectorAll('[role="tab"]')].map((t) => (t.getAttribute('aria-selected') === 'true' ? '*' : '') + t.textContent.trim()).join(' , ')`);
  result.mainGroup = [{ command: '(click first tab)', strip: await focusedStrip() }];
  for (const command of ['tabs.select.2', 'tabs.select.1', 'tabs.next']) {
    bridge.send(command, undefined, win.webContents);
    await sleep(350);
    result.mainGroup.push({ command, strip: await focusedStrip() });
  }
  const dialogs = () => page(`document.querySelectorAll('[role="dialog"]').length`);
  result.dialogsBefore = await dialogs();
  bridge.send('palette.toggle', undefined, win.webContents);
  await sleep(400);
  result.paletteOpened = (await dialogs()) > result.dialogsBefore;
  bridge.send('palette.toggle', undefined, win.webContents);
  await sleep(300);
  result.pageSaw = await page(`(window.__exampleSeen ?? []).map((e) => e.command)`);
  // Which tab of the main group is selected after each step (titles change
  // as tabs mount, so compare positions): expect 1, 2, 1, 2.
  const selected = result.mainGroup.map((s) => s.strip.split(' , ').findIndex((t) => t.startsWith('*')) + 1);
  result.mainGroupSelected = selected;
  result.pass =
    result.preloadExposed === true &&
    result.sandboxed === true &&
    result.channel?.from === 'electron-main' &&
    result.unknownChannel.includes('No host channel') &&
    result.paletteOpened === true &&
    selected.join() === '1,2,1,2';

  const image = await win.webContents.capturePage();
  writeFileSync(check.replace(/\.json$/, '') + '.png', image.toPNG());
  writeFileSync(check, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}
