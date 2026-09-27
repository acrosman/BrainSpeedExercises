# Field of View tutorial (`field-of-view/tutorial/`)

The first-run guided tutorial: five slides, then up to two live practice trials. It runs on the
shared framework in `components/tutorialService.js` and `components/tutorialLauncher.js`; see
[../../../components/CLAUDE.md](../../../components/CLAUDE.md) for the framework itself.

## Files

- `tutorial-*.html`: one HTML fragment per slide, listed in order in `TUTORIAL_STEP_DEFINITIONS`.
- `tutorial.js`: everything else the tutorial does.
  - `getTutorialSteps()` loads the slides, and `PRACTICE_TEXT` holds the coach and result text.
    Any text that describes a click also gives the Tab and Enter alternative.
  - `tutorial` is the game's shared launcher (`createTutorialLauncher`). `index.js` calls
    `tutorial.startIfNeeded(...)` from Start and `tutorial.replay(...)` from Replay Tutorial,
    passing `{ container, onComplete: beginGameSession }`, and `tutorial.isActive()` and
    `tutorial.cancel()` from `stop()` and `reset()`.
  - The practice trial code: `playPracticeTrial` plus the hooks below.

The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
percentage-positioned `.fov-tutorial-highlight--*` boxes in `../style.css`. Retake the
screenshot and update those boxes together if the game layout changes.

## How practice trials reach the game

`tutorial.js` never imports `index.js`. Instead, `index.js` hands `PRACTICE_CONTROLS` (a
`PracticeTrialControls` object) to `setPracticeControls()` in `init()`. Through it the tutorial
shows the game area, plays a layout with the real stimulus → mask → response code
(`playTrial`), stops it (`stopTrial`), finds the kitten buttons and location squares, and
writes to the feedback region.

`index.js` calls back into the tutorial at three points, each only while `isPracticing()`:

- `enterResponsePhase` → `promptPracticeResponse()`: in a guided trial, ring the correct kitten;
  otherwise show the answer prompt.
- `attemptAutoSubmit`, when only one answer is chosen → `guidePracticeResponse()`: once a kitten
  is chosen, move the marker to the correct square. The coach text changes only when the target
  does, so repeated picks are not announced again.
- `submitResponse` → `finishPracticeTrial(success)`, in place of `recordTrial`, the stats, the
  trend chart, and the next trial.

## Practice rules

- Trials come from `game.createPracticeTrial()` (3×3 grid, 500 ms) and never start the session,
  so `game.isRunning()` stays `false` and nothing is scored or saved.
- `finishPracticeTrial` resolves the round with `{ correct, feedback }`. A correct answer is
  announced in the feedback region. A miss is left to the coach banner, which names both correct
  answers and offers Try Again. The retry (`context.attempt > 1`) replays the same layout, kept
  in `_lastPracticeTrial`.
- The practice signal's `abort` runs `endPractice`, which stops the trial and forgets the
  layout. End Game during practice (`stop()` with no session) cancels the tutorial and returns
  to the welcome panel without saving.

## Tests

`tests/tutorial.test.js` covers the slides, the text, and the controller against fake trial
controls. `tests/index.test.js` runs the real module wired to the game, with only
`tutorialService` mocked.
