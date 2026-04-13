/**
 * main.js — Electron main process entry point for BrainSpeedExercises.
 *
 * Responsibilities:
 * - Create and manage BrowserWindow instances.
 * - Register all IPC handlers (ipcMain.handle).
 * - Load the game plugin registry at startup.
 * - Proxy save/load requests from the renderer to the progress manager.
 *
 * @file Main process bootstrap and IPC wiring for BrainSpeedExercises.
 */
import { app, BrowserWindow, ipcMain, session, screen } from 'electron';
import debug from 'electron-debug';
import log from 'electron-log';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { loadProgress, saveProgress, resetProgress } from './app/progress/progressManager.js';
import { scanGamesDirectory, loadGame } from './app/games/registry.js';

debug();

// Developer mode flag.
const isDev = !app.isPackaged;

// Configure electron-log.
// In development, show all levels in the console; in production, only warnings+.
log.transports.file.level = 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';
log.initialize();

// Get rid of the deprecated default.
app.allowRendererProcessReuse = true;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

/**
 * Create the main application window.
 *
 * @function
 * @returns {void}
 */
function createWindow() {
  const display = screen.getPrimaryDisplay();
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: display.workArea.width,
    height: display.workArea.height,
    frame: true,
    webPreferences: {
      devTools: isDev,
      nodeIntegration: false, // Disable nodeIntegration for security.
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      disableBlinkFeatures: 'Auxclick', // See: https://github.com/doyensec/electronegativity/wiki/AUXCLICK_JS_CHECK
      contextIsolation: true, // Protect against prototype pollution.
      worldSafeExecuteJavaScript: true, // https://github.com/electron/electron/pull/24114
      enableRemoteModule: false, // Turn off remote to avoid temptation.
      preload: path.join(app.getAppPath(), 'app/preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${app.getAppPath()}/app/index.html`);

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

/**
 * App ready event handler. Initializes the main window.
 * @event
 */
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Extra security filters.
// See also: https://github.com/reZach/secure-electron-template
app.on('web-contents-created', (event, contents) => {
  // Block navigation.
  // https://electronjs.org/docs/tutorial/security#12-disable-or-limit-navigation
  contents.on('will-navigate', (navEvent) => {
    navEvent.preventDefault();
  });
  contents.on('will-redirect', (navEvent) => {
    navEvent.preventDefault();
  });

  // https://electronjs.org/docs/tutorial/security#11-verify-webview-options-before-creation
  contents.on('will-attach-webview', (webEvent, webPreferences) => {
    // Strip away preload scripts.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;

    // Disable Node.js integration.
    webPreferences.nodeIntegration = false;
  });

  // Block new windows from within the App
  // https://electronjs.org/docs/tutorial/security#13-disable-or-limit-creation-of-new-windows
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Lock down session permissions.
  // https://www.electronjs.org/docs/tutorial/security#4-handle-session-permission-requests-from-remote-content
  // https://github.com/doyensec/electronegativity/wiki/PERMISSION_REQUEST_HANDLER_GLOBAL_CHECK
  session
    .fromPartition('persist: secured-partition')
    .setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false);
    });
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('progress:load', async (event, { playerId }) => loadProgress(playerId));

ipcMain.handle('progress:save', async (event, { playerId, data }) => saveProgress(playerId, data));

ipcMain.handle('progress:reset', async (event, { playerId }) => resetProgress(playerId));

const gamesPath = path.join(app.getAppPath(), 'app', 'games');

ipcMain.handle('games:list', async () => scanGamesDirectory(gamesPath));

ipcMain.handle('games:load', async (event, gameId) => {
  const { manifest } = await loadGame(gamesPath, gameId);
  const htmlFilePath = path.join(gamesPath, gameId, 'interface.html');
  const html = await readFile(htmlFilePath, 'utf8').catch(() => {
    throw new Error(`Could not read interface HTML for game: ${gameId}`);
  });
  return { manifest, html };
});

/**
 * List image files (PNG and JPEG) in a given game's image subfolder.
 * Used by game plugins to dynamically discover available stimulus images.
 *
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {{ gameId: string, subfolder: string }} params
 * @returns {Promise<string[]>} Sorted array of filenames (with extension) in the subfolder.
 */
ipcMain.handle('games:listImages', async (event, { gameId, subfolder }) => {
  const dirPath = path.join(gamesPath, gameId, 'images', subfolder);
  try {
    const files = await readdir(dirPath);
    return files.filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  } catch {
    return [];
  }
});

/**
 * Receive a log message from a renderer process and write it through electron-log.
 *
 * The renderer sends `{ level, message }` via the `log:send` IPC channel.
 * Unrecognised levels fall back to `info`.
 *
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {{ level: string, message: string }} params
 */
ipcMain.handle('log:send', (event, { level, message }) => {
  const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];
  const fn = validLevels.includes(level) ? level : 'info';
  log[fn](`[renderer] ${message}`);
});
