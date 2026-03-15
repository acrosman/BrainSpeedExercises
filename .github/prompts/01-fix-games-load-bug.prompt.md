Fix a bug in the `games:load` IPC channel so that the renderer receives the
game's HTML content as a string rather than a file path.

## Context

The project is an Electron desktop app (ES Modules, `"type": "module"`).
The renderer cannot access the filesystem directly — all file I/O must go
through the main process over IPC. The IPC security bridge is in
`app/preload.js`; the channel allowlist already includes `games:load`.

## The Bug

In `main.js`, the `games:load` IPC handler currently resolves a `{ manifest,
plugin }` object from the registry and then returns `{ manifest, htmlPath }`
to the renderer. However `app/interface.js` expects `result.html` (an HTML
string), not a file path. Because the renderer cannot read files itself, no
game can ever load.

## Files to update

### 1. `main.js` — `games:load` IPC handler

Locate the `ipcMain.handle('games:load', ...)` handler. After obtaining the
manifest from the registry:

1. Derive the path to the game's HTML fragment:
   `path.join(gamesPath, gameId, 'interface.html')`
2. Read the file using `fs.readFile` (or `fs.promises.readFile`) with `'utf8'`
   encoding.
3. Return `{ manifest, html }` — where `html` is the file's string content.
4. If the file cannot be read, reject with a descriptive error message.

Do not expose raw file-system paths in the returned object.

### 2. `app/interface.js` — game loader

Locate where `window.api.invoke('games:load', gameId)` is awaited. Ensure the
code uses `result.html` (the HTML string) when injecting content into the game
container. If the property name is already `result.html`, no change is needed;
otherwise update it to match the new return shape.

## Constraints

- Do not change any IPC channel names.
- Do not add new channels to `app/preload.js`; `games:load` is already
  allowlisted.
- Keep all error handling consistent with the existing style in `main.js`
  (reject Promises with `new Error(...)`).
- Do not alter any other IPC handlers.

## Verification

After the fix:

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (existing tests must not regress).
