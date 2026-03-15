You are adding a progress-persistence subsystem to an Electron app called
BrainSpeedExercises. The app uses ES Modules, ESLint (Airbnb-base), and Jest
with 100% function coverage. The renderer communicates with the main process
exclusively via the contextBridge IPC API defined in app/preload.js.

## Files to create or update

### 1. app/progress/progressManager.js — Main-process module (Node.js only)
- Import `fs/promises` and `path` from Node core; import `app` from `electron`.
- Export three async functions:
  - `loadProgress(playerId)` — reads `<userData>/<playerId>.json`; returns a
    default ProgressData object if the file does not exist.
  - `saveProgress(playerId, data)` — writes the JSON file atomically (write to
    a `.tmp` file, then rename).
  - `resetProgress(playerId)` — deletes the player's JSON file if it exists;
    resolves without error if it does not.
- ProgressData shape:
  ```json
  {
    "playerId": "string",
    "lastUpdated": "ISO-8601 timestamp",
    "games": {
      "<game-id>": {
        "highScore": 0,
        "sessionsPlayed": 0,
        "lastPlayed": "ISO-8601 timestamp"
      }
    }
  }
  ```
- Validate `playerId` — reject with a descriptive Error if it is empty,
  not a string, or contains path-traversal characters (`..`, `/`, `\`).

### 2. app/progress/progressManager.test.js — Jest tests
- Mock `fs/promises` and `electron` (use `__mocks__/electron.js`).
- Test `loadProgress`: returns default object when file missing (ENOENT),
  returns parsed data when file exists, rejects on corrupt JSON.
- Test `saveProgress`: calls `writeFile` on `.tmp` path then `rename`,
  sets `lastUpdated` to current ISO timestamp.
- Test `resetProgress`: calls `unlink`, resolves silently when file
  missing (ENOENT), rejects on other fs errors.
- Test input validation: rejects for empty string, non-string, and
  path-traversal values.
- Achieve 100% function coverage.

### 3. main.js (update) — Register IPC handlers
- Add `ipcMain.handle('progress:save', async (event, { playerId, data }) => ...)`
- Add `ipcMain.handle('progress:load', async (event, { playerId }) => ...)`
- Add `ipcMain.handle('progress:reset', async (event, { playerId }) => ...)`
- Import progressManager functions at the top of the file.

### 4. app/preload.js (update) — Add new channels to the allowlist
- Add `'progress:save'`, `'progress:load'`, `'progress:reset'` to the
  `invoke` channel allowlist (switch from `send`/`receive` to
  `ipcRenderer.invoke` for two-way communication).

## Constraints
- Never write files outside `app.getPath('userData')`.
- Do not expose the file-system path to the renderer.
- Use `const`/`let`, never `var`.
- Match Airbnb ESLint rules.
