/**
 * main.js — Electron entry point for the sound test harness.
 *
 * Opens one window with a button for each sound effect in
 * app/components/audioService.js, so a sound can be heard without playing a
 * game. Run it with `npm run sound-harness`. Forge does not package scripts/.
 *
 * @file Sound harness main process.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory holding this harness's files. */
const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Open the harness window.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 600,
    title: 'Sound Harness',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(path.join(HARNESS_DIR, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
