Implement the pure game-logic module for Fast Piggie at
`app/games/fast-piggie/game.js`.

## Context

Fast Piggie shows N guinea pig images arranged in a circle of equal wedge
zones for a brief period. N-1 images are identical ("common"); one is
different ("outlier"). The player clicks the wedge where the outlier appeared.
Correct = green flash + tone; wrong = red flash + tone. Difficulty auto-scales.

`game.js` must contain **pure functions only** — no DOM access, no
`window`, no `document`. This keeps it fast, deterministic, and fully
testable in a Node environment.

## Difficulty formula

| Variable            | Start | Change                         | Cap / Floor |
| ------------------- | ----- | ------------------------------ | ----------- |
| `wedgeCount`        | 6     | +2 every 3 correct answers     | max 14      |
| `displayDurationMs` | 2000  | −200ms every 3 correct answers | min 500     |

"Every 3 correct answers" means at `score` values 3, 6, 9, … (use
`Math.floor(score / 3)` to compute the current tier).

## Functions to implement

Replace the stubs in `app/games/fast-piggie/game.js` with real
implementations. All functions must be named exports.

---

### State

Use module-level private variables (not exported):

```js
let score = 0;
let roundsPlayed = 0;
let running = false;
let startTime = null;
```

---

### `initGame()`

Reset all private state: `score = 0`, `roundsPlayed = 0`, `running = false`,
`startTime = null`.

---

### `startGame()`

Set `running = true` and record `startTime = Date.now()`. Throws if already
running.

---

### `stopGame()` → `{ score, roundsPlayed, duration }`

Set `running = false`. Return an object with the current `score`,
`roundsPlayed`, and `duration` in milliseconds (`Date.now() - startTime`).
`duration` should be `0` if `startTime` is null. Throws if not running.

---

### `generateRound(roundNumber)` → `{ wedgeCount, displayDurationMs, outlierWedgeIndex }`

Compute the difficulty tier from `roundNumber` (not from `score`, so the
function is pure and has no side-effects):

```
tier = Math.floor(roundNumber / 3)
wedgeCount = Math.min(6 + tier * 2, 14)
displayDurationMs = Math.max(2000 - tier * 200, 500)
```

Pick a random `outlierWedgeIndex` in `[0, wedgeCount)` using `Math.random()`.

Return `{ wedgeCount, displayDurationMs, outlierWedgeIndex }`.

---

### `checkAnswer(clickedWedge, outlierWedge)` → `boolean`

Return `true` if `clickedWedge === outlierWedge`, otherwise `false`.

---

### `calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount)` → `number`

1. Compute `dx = clickX - centerX`, `dy = clickY - centerY`.
2. If `Math.sqrt(dx*dx + dy*dy) > radius`, return `-1` (outside circle).
3. Compute the angle using `Math.atan2(dy, dx)`.
4. Normalize so that wedge 0 starts at the top (−π/2) and proceeds clockwise:
   `angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)`
5. Return `Math.floor(angle / (2 * Math.PI / wedgeCount))`.

---

### `addScore()`

Increment `score` by 1 and increment `roundsPlayed` by 1.

---

### `getScore()` → `number`

Return the current `score`.

---

### `getRoundsPlayed()` → `number`

Return the current `roundsPlayed`.

---

### `getCurrentDifficulty()` → `{ wedgeCount, displayDurationMs }`

Return the difficulty values for the current `score` (not a round number):

```
tier = Math.floor(score / 3)
wedgeCount = Math.min(6 + tier * 2, 14)
displayDurationMs = Math.max(2000 - tier * 200, 500)
```

Return `{ wedgeCount, displayDurationMs }`.

---

### `isRunning()` → `boolean`

Return the current `running` state.

---

## Constraints

- No `import` statements — no dependencies.
- No DOM, `window`, or `document` references.
- All functions must be named exports (not default).
- Keep each function focused; avoid shared mutable state beyond the four
  private variables listed above.

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (tests added in next prompt, but stub tests must still
  pass).
