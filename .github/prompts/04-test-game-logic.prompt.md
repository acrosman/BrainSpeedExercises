Write the full Jest test suite for `app/games/fast-piggie/game.js`.

## Context

The project uses Jest with `jsdom`, ES Modules (no Babel transform), and
enforces **100% function coverage** across all files under `app/`. Tests live
in `app/games/fast-piggie/tests/game.test.js`.

`game.js` exports pure functions with no DOM dependencies, so no mocking of
browser APIs is needed. Use `jest.spyOn(Math, 'random')` to control
`outlierWedgeIndex` in `generateRound` tests.

## Replace the stub in `app/games/fast-piggie/tests/game.test.js`

The file currently contains a single stub test. Replace it entirely with the
suite described below.

---

## Test cases required

### `initGame()`

- After calling `initGame()`, `getScore()` returns `0`.
- After calling `initGame()`, `getRoundsPlayed()` returns `0`.
- After calling `initGame()`, `isRunning()` returns `false`.
- Calling `initGame()` after `startGame()` resets `isRunning()` to `false`.
- Calling `initGame()` after `addScore()` resets `getScore()` to `0`.

### `startGame()` / `stopGame()`

- `isRunning()` returns `false` before `startGame()`.
- `isRunning()` returns `true` after `startGame()`.
- `isRunning()` returns `false` after `stopGame()`.
- `stopGame()` returns an object with `score`, `roundsPlayed`, and `duration`
  keys.
- `stopGame().duration` is a non-negative number.
- Calling `startGame()` when already running throws an error.
- Calling `stopGame()` when not running throws an error.

### `addScore()` / `getScore()` / `getRoundsPlayed()`

- `getScore()` starts at `0` after `initGame()`.
- `addScore()` increments `getScore()` by 1.
- Calling `addScore()` three times produces `getScore() === 3`.
- `addScore()` increments `getRoundsPlayed()` by 1.
- `getRoundsPlayed()` starts at `0` after `initGame()`.

### `generateRound(roundNumber)`

For each case, mock `Math.random` to return `0` so `outlierWedgeIndex` is
deterministic, then restore it.

| roundNumber | expected wedgeCount | expected displayDurationMs |
| ----------- | ------------------- | -------------------------- |
| 0           | 6                   | 2000                       |
| 3           | 8                   | 1800                       |
| 6           | 10                  | 1600                       |
| 9           | 12                  | 1400                       |
| 12          | 14                  | 1200                       |
| 15          | 14                  | 1000                       |
| 30          | 14                  | 500                        |
| 100         | 14                  | 500                        |

- `generateRound` does not modify `score` or `roundsPlayed`.
- `outlierWedgeIndex` is always in `[0, wedgeCount)` (test with several
  `Math.random` return values, e.g. 0, 0.5, 0.9999).

### `checkAnswer(clickedWedge, outlierWedge)`

- Returns `true` when `clickedWedge === outlierWedge`.
- Returns `false` when `clickedWedge !== outlierWedge`.
- Returns `false` for wedge `0` vs wedge `1`.
- Returns `true` for wedge `5` vs wedge `5`.

### `calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount)`

Use `centerX = 100`, `centerY = 100`, `radius = 80`, `wedgeCount = 4` unless
otherwise noted.

- Click exactly at center returns a valid wedge index (not -1).
- Click outside the radius returns `-1`:
  - `(100, 5)` with radius 80 → `-1` (above circle, outside)
  - `(200, 200)` → `-1`
- Click at the top (`100, 25`) maps to wedge `0` (top wedge, angle ≈ 0 after
  normalization to [0, 2π) from −π/2).
- Click at the right (`175, 100`) maps to wedge `1`.
- Click at the bottom (`100, 175`) maps to wedge `2`.
- Click at the left (`25, 100`) maps to wedge `3`.
- With `wedgeCount = 6`, verify that a point clearly within each of the 6
  wedge sectors returns the correct index.

### `getCurrentDifficulty()`

- After `initGame()`, returns `{ wedgeCount: 6, displayDurationMs: 2000 }`.
- After 3 calls to `addScore()`, returns `{ wedgeCount: 8, displayDurationMs: 1800 }`.
- After 12 calls to `addScore()`, returns `{ wedgeCount: 14, displayDurationMs: 1200 }`.
- After 30 calls to `addScore()`, returns `{ wedgeCount: 14, displayDurationMs: 500 }`.

### `isRunning()`

Already covered in `startGame` / `stopGame` tests above; add a standalone
test confirming the initial value is `false` after module load / `initGame`.

---

## Constraints

- Import only from `'../game.js'` — no other imports except `describe`, `it`,
  `expect`, `beforeEach`, `afterEach` from `'@jest/globals'`.
- Call `initGame()` in a `beforeEach` to isolate state between tests.
- All tests must be synchronous (no `async`/`await` needed — `game.js` has
  no async functions).
- Do not use `jest.mock()` for `game.js` itself.

## Verification

- `npm test` must pass with **100% function coverage** on `game.js`.
- `npm run lint` must pass with 0 errors.
