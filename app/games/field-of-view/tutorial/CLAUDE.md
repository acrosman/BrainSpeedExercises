# Field of View tutorial (`field-of-view/tutorial/`)

Five slides, then up to two practice trials, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Field of View.

- `PRACTICE_TEXT` holds the coach and result text. Any text that describes a click also gives
  the Tab and Enter alternative.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.fov-tutorial-highlight--*` boxes in `../style.css`: `--stats` (blue,
  `--callout-1`), `--board` (green, `--callout-2`, the stage), and `--response` (orange,
  `--callout-3`, the kitten buttons and location grid), each with the shared
  `.tutorial-callout` halo. The screenshot follows the standard in
  [../../../components/CLAUDE.md](../../../components/CLAUDE.md), clipped to `#fov-game-area`
  during the second trial's stimulus, after one answered trial has drawn the location grid. If
  the layout changes, retake it and move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeTrialControls`) lets the tutorial show the game area, play a
layout with the real stimulus → mask → response code (`playTrial`), stop it (`stopTrial`),
find the kitten buttons and location squares, and write to the feedback region.

`index.js` calls into the tutorial at three points, each only while `isPracticing()`:

- `enterResponsePhase` → `promptPracticeResponse()`: in a guided trial, ring the correct kitten;
  otherwise show the answer prompt.
- `attemptAutoSubmit`, when only one answer is chosen → `guidePracticeResponse()`: once a kitten
  is chosen, move the marker to the correct square. The coach text changes only when the target
  does, so repeated picks are not announced again.
- `submitResponse` → `finishPracticeTrial(success)`, in place of `recordTrial`, the stats, the
  trend chart, and the next trial.

## Practice rules

- Trials come from `game.createPracticeTrial()`: a 3×3 grid at 500 ms.
- `finishPracticeTrial` resolves with `{ correct, feedback }`. A correct answer is announced in
  the feedback region. A miss is left to the coach banner, which names both correct answers and
  offers Try Again. The retry (`context.attempt > 1`) replays the same layout, kept in
  `_lastPracticeTrial`.
- `endPractice` (on abort) stops the trial and forgets the layout.
