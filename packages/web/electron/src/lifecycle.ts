import { app } from 'electron';

/**
 * Quit when the last window closes, on every platform. There is no
 * background Electron (HUD-015 §13): with no window, nothing should run, and
 * work that must continue lives in the host process. Returns a function that
 * removes the listener.
 */
export function quitWhenWindowsClose(): () => void {
  const quit = () => app.quit();
  app.on('window-all-closed', quit);
  return () => {
    app.removeListener('window-all-closed', quit);
  };
}
