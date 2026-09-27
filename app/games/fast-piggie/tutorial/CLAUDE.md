# Fast Piggie tutorial (`fast-piggie/tutorial/`)

The first-run guided tutorial: five slides, then up to two live practice rounds. It runs on the
shared framework in `components/tutorialService.js` and `components/tutorialLauncher.js`; see
[../../../components/CLAUDE.md](../../../components/CLAUDE.md) for the framework itself.

## Files

- `tutorial-*.html`: one HTML fragment per slide, listed in order in `TUTORIAL_STEP_DEFINITIONS`.
- `tutorial.js`: everything else the tutorial does.
  - `getTutorialSteps()` loads the slides, and `PRACTICE_TEXT` holds the coach text. Any text
    that describes a click also gives the arrow-key and Enter alternative.
  - `tutorial` is the game's shared launcher (`createTutorialLauncher`). `index.js` calls
    `tutorial.startIfNeeded(...)` from Start and `tutorial.replay(...)` from Replay Tutorial,
    passing `{ container, onComplete: _beginGameSession }`, and `tutorial.isActive()` and
    `tutorial.cancel()` from `stop()` and `reset()`.
  - The practice round code: `playPracticeRound` plus the hooks below.

The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
percentage-positioned `.fp-tutorial-highlight--*` boxes in `../style.css`. Retake the
screenshot and update those boxes together if the game layout changes.

## How practice rounds reach the game

`tutorial.js` never imports `index.js`. Instead, `index.js` hands `PRACTICE_CONTROLS` (a
`PracticeRoundControls` object) to `setPracticeControls()` in `init()`. Through it the tutorial
shows the game area, plays a round with the real `_playRound` display code (`playRound`), stops
it (`stopRound`), finds the correct wedge and where to ring it (`getCorrectWedge`,
`getWedgeMarker`, which uses `wedgeMarkerRegion()`), redraws the wheel (`redrawBoard`), and
gives the usual answer feedback (`showAnswer`).

`index.js` calls back into the tutorial at two points:

- `_resolveRound`, while `isPracticing()` → `finishPracticeRound(wedge)`, in place of
  `addScore`/`addMiss`, the stats, and the auto-advance.
- `_clearBoard` → `getPracticeHintWedge()`: the wedge to keep shaded, so hover and keyboard
  highlights do not erase the hint. It is -1 outside a guided round.

## Practice rules

- Rounds come from `game.generatePracticeRound()` (3 images, 6 wedges, 800 ms) and never start
  the session, so `game.isRunning()` stays `false` and nothing is scored or saved.
- In the guided first round, once the piggies vanish, the correct wedge is shaded and ringed by
  the tutorial marker. `finishPracticeRound` clears the hint before the result colors are drawn.
- The practice signal's `abort` runs `endPractice`, which cancels the round timers. End Game
  during practice (`stop()` with no session) cancels the tutorial and returns to the welcome
  panel without saving.

## Tests

`tests/tutorial.test.js` covers the slides, the text, and the controller against fake round
controls. `tests/index.test.js` runs the real module wired to the game, with `tutorialService`
and `game.js` mocked.
