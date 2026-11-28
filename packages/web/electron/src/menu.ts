// ---------------------------------------------------------------------------
// The app menu, with HudsonKit's tab commands bound to their native keys
// (HUD-015 §9). Menu accelerators fire while a webview guest has focus,
// which page key handlers can't do, and the shell runs each command once.
// ---------------------------------------------------------------------------
import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { HudsonBridge } from './bridge';

export interface HudsonMenuCommand {
  label: string;
  /** Shell command id sent to the focused window, e.g. `tabs.close`. */
  command: string;
  args?: unknown;
  accelerator?: string;
}

/** The tab commands with native defaults (HUD-015 §9). */
export const TAB_MENU_COMMANDS: readonly HudsonMenuCommand[] = [
  { label: 'Close Tab', command: 'tabs.close', accelerator: 'CmdOrCtrl+W' },
  { label: 'Reopen Closed Tab', command: 'tabs.reopen', accelerator: 'CmdOrCtrl+Shift+T' },
  { label: 'Next Tab', command: 'tabs.next', accelerator: 'Ctrl+Tab' },
  { label: 'Previous Tab', command: 'tabs.previous', accelerator: 'Ctrl+Shift+Tab' },
  ...Array.from({ length: 9 }, (_, i) => ({
    label: `Select Tab ${i + 1}`,
    command: `tabs.select.${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
  })),
];

export interface HudsonMenuOptions {
  bridge: HudsonBridge;
  /** Commands for a Tabs menu. Default TAB_MENU_COMMANDS; pass [] for none. */
  tabCommands?: readonly HudsonMenuCommand[];
  /** Extra top-level menus, placed before Window. */
  menus?: MenuItemConstructorOptions[];
  /**
   * Adds "Quit Completely", which asks the host to stop its activities and
   * exit (HUD-015 §13). A normal quit only closes the UI.
   */
  onQuitCompletely?: () => void | Promise<void>;
}

export function hudsonMenuTemplate(options: HudsonMenuOptions): MenuItemConstructorOptions[] {
  const { bridge } = options;
  const toItem = (c: HudsonMenuCommand): MenuItemConstructorOptions => ({
    label: c.label,
    accelerator: c.accelerator,
    // Only the focused window's page gets the command.
    click: (_item, window) => {
      // A BaseWindow has no page; only a BrowserWindow does.
      const contents = (window as Partial<BrowserWindow> | undefined)?.webContents;
      if (contents) bridge.send(c.command, c.args, contents);
    },
  });
  const tabCommands = options.tabCommands ?? TAB_MENU_COMMANDS;
  const mac = process.platform === 'darwin';
  const quitCompletely: MenuItemConstructorOptions[] = options.onQuitCompletely
    ? [
        {
          label: 'Quit Completely',
          accelerator: 'CmdOrCtrl+Alt+Q',
          click: async () => {
            await options.onQuitCompletely?.();
            app.quit();
          },
        },
      ]
    : [];

  return [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
              ...quitCompletely,
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    { role: 'editMenu' },
    ...(tabCommands.length ? [{ label: 'Tabs', submenu: tabCommands.map(toItem) }] : []),
    ...(options.menus ?? []),
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    ...(!mac && quitCompletely.length ? [{ label: 'File', submenu: [...quitCompletely, { role: 'quit' as const }] }] : []),
  ];
}

export function installHudsonMenu(options: HudsonMenuOptions): Menu {
  const menu = Menu.buildFromTemplate(hudsonMenuTemplate(options));
  Menu.setApplicationMenu(menu);
  return menu;
}
