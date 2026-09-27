# Directional Processing tutorial (`directional-processing/tutorial/`)

The first-run guided tutorial: five slides, then up to two live practice trials. It runs on the
shared framework in `components/tutorialService.js` and `components/tutorialLauncher.js`; see
[../../../components/CLAUDE.md](../../../components/CLAUDE.md) for the framework itself.

## Files

- `tutorial-*.html`: one HTML fragment per slide, listed in order in `TUTORIAL_STEP_DEFINITIONS`.
- `tutorial.js`: everything else the tutorial does.
  - `getTutorialSteps()` loads the slides, and `PRACTICE_TEXT` holds the coach text. The guided
    text names the direction and its arrow key, since the marker is not announced.
  - `tutorial` is the game's shared launcher (`createTutorialLauncher`). `index.js` calls
    `tutorial.startIfNeeded(...)` from Start and `tutorial.replay(...)` from Replay Tutorial,
    passing `{ container, onComplete: beginGameSession }`, and `tutorial.isActive()` and
    `tutorial.cancel()` from `stop()` and `reset()`.
  - The practice trial code: `playPracticeTrial` plus the hooks below.

The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
percentage-positioned `.dp-tutorial-highlight--*` boxes in `../style.css`. Retake the
screenshot and update those boxes together if the game layout changes.

## How practice trials reach the game

`tutorial.js` never imports `index.js`. Instead, `index.js` hands `PRACTICE_CONTROLS` (a
`PracticeTrialControls` object) to `setPracticeControls()` in `init()`. Through it the tutorial
shows the game area, plays a trial with the real `runStimulusPhase` → mask → response code
(`playTrial`), stops it (`stopTrial`), finds the direction buttons, and gives the usual answer
feedback (`showResult`: sound, announcement, flash, and the correct-button highlight after a
miss).

`index.js` calls back into the tutorial at one point: while `isPracticing()`,
`handleDirectionResponse` sends the answer to `finishPracticeTrial(success)` in place of
`recordTrial`, the stats, the trend chart, and the next trial. `handleKeyDown` also blocks
arrow-key scrolling while practicing.

## Practice rules

- Trials come from `game.generatePracticeTrial()` (a random direction at `LEVELS[0]`) and
  never start the session, so `game.isRunning()` stays `false` and nothing is scored or saved.
- In the guided first round, once the stimulus ends, the tutorial scrolls the correct direction
  button into view (the pad can sit below the fold, and the coach is sticky) and rings it
  (`shape: 'box'`).
- The practice signal's `abort` runs `endPractice`, which stops the trial's animation frames
  and timers. End Game during practice (`stop()` with no session) cancels the tutorial and
  returns to the welcome panel without saving.

## Tests

`tests/tutorial.test.js` covers the slides, the text, and the controller against fake trial
controls. `tests/index.test.js` runs the real module wired to the game, with `tutorialService`
and `game.js` mocked.
