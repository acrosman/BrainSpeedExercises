## Plan: High-Speed Memory Game Plugin

Create a new game plugin for BrainSpeedExercises: a high-speed memory game where players identify 3 matching images in a grid that grows in size and speed as they progress. The game will use a grid-based UI, timed image display, and mouse/keyboard accessibility, and will persist progress (level, total correct) via the progress system.

### Game overview:

- Each round, the player sees a grid of images for a brief time (starting at 500ms). The grid contains 3 identical "target" images, 3 different distractor images, and the rest are blank.
- After the images disappear, the player must click on the 3 cells that contained the target image. If they find all 3, they get a point. After 3 points in a row, they advance to the next level, which has a larger grid and shorter display time. The game continues until the player fails to find all 3 targets 3 times in a row.
- The game should make a generic clicking sound on selection, and a distinct sound for correct/incorrect answers.

**Steps**

### Phase 1: Game Design & Data

1. Define game rules, progression, and win/loss logic in a design doc (for reference).
2. Select or create a set of image assets (minimum 4 distinct images, scalable for future expansion). Define locations and naming conventions – images will be provided later.
3. Specify the grid logic:
   - Level 1: 3x3 grid (9 cells): 3 matching images, 3 other images, 3 blank.
   - Each level: grid size increases by 1 per side, add 1 mis-matched image, rest blank.
   - Display time: starts at 500ms, decreases per level, minimum 20ms.

### Phase 2: Plugin Structure

4. Scaffold new game folder `app/games/high-speed-memory/` with files copied from `app/games/_template/`:
   - `manifest.json` (metadata)
   - `index.js` (plugin API: `init`, `start`, `stop`, `reset`)
   - `game.js` (pure game logic: grid generation, answer checking, progression)
   - `interface.html` (WCAG-AA-compliant UI fragment)
   - `style.css` (scoped styles)
   - `images/` (game-specific assets)
   - `tests/` (unit/integration tests)

### Phase 3: Game Logic Implementation

1. Implement `game.js`:
   - Grid generation logic (dynamic size, image/blank placement)
   - Timed reveal/hide logic
   - Selection and answer checking (track selected cells, validate 3 matches)
   - Level progression and scoring (3 correct in a row to advance)
   - Data structure for progress (level, total correct)

2. Implement `index.js`:
   - Expose plugin API (`init`, `start`, `stop`, `reset`)
   - Integrate with progress system (load/save/reset progress via IPC)
   - Manage game state transitions (start round, end round, advance level)

### Phase 4: UI & Accessibility

1. Build `interface.html`:
   - Render grid as accessible HTML (semantic elements, ARIA roles)
   - Ensure keyboard navigation and visible focus indicators
   - Use `aria-live` for status updates (score, level, feedback)
   - Mouse hover highlights cell; click to select/deselect

2. Style with `style.css`:
   - High-contrast, WCAG-AA-compliant colors
   - Responsive grid layout
   - Clear visual feedback for selection, correct/incorrect answers

### Phase 5: Testing

1. Write unit tests for `game.js` (grid logic, answer checking, progression).
2. Write integration tests for `index.js` (plugin lifecycle, progress persistence).
3. Test UI rendering and accessibility (manual + automated if possible).

### Phase 6: Integration & Verification

1. Verify game appears in selector and loads correctly.
2. Validate progress is saved/loaded as specified.
3. Run full test suite and linting.

**Relevant files**

- `app/games/high-speed-memory/manifest.json` — game metadata
- `app/games/high-speed-memory/index.js` — plugin API, state, progress
- `app/games/high-speed-memory/game.js` — core logic (grid, scoring, progression)
- `app/games/high-speed-memory/interface.html` — UI fragment
- `app/games/high-speed-memory/style.css` — styles
- `app/games/high-speed-memory/images/` — image assets
- `app/games/high-speed-memory/tests/` — unit/integration tests
- `app/games/registry.js` — plugin registry (ensure new game is discoverable)
- `app/progress/progressManager.js` — progress API (reuse, no changes expected)

**Verification**

1. Game appears in selector and loads without errors.
2. Grid displays correct number of cells/images/blank per level.
3. Timed reveal/hide works as specified (500ms to 10ms).
4. Selection, answer checking, and scoring function as described.
5. Level progression and speed increase after 3 consecutive correct rounds.
6. Progress file records level and total correct.
7. All UI meets WCAG 2.2 AA (manual keyboard, screen reader, contrast checks).
8. 100% function coverage in tests; all tests pass.
9. Linting passes with no errors.

**Decisions**

- Game will use only local image assets for speed and accessibility.
- Progress file will store: `{ level, totalCorrect }` for this game.
- UI will prioritize keyboard and screen reader accessibility.
- Minimum display time is 10ms; no further speed increase after that.
