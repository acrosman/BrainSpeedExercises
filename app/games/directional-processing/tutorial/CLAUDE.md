# Directional Processing tutorial (`directional-processing/tutorial/`)

Five slides, then up to two practice trials, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Directional Processing.

- `PRACTICE_TEXT`: the guided text names the direction and its arrow key, since the marker is
  not announced.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.dp-tutorial-highlight--*` boxes in `../style.css`. If the layout
  changes, retake the screenshot and move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeTrialControls`) lets the tutorial show the game area, play a
trial with the real `runStimulusPhase` → mask → response code (`playTrial`), stop it
(`stopTrial`), find the direction buttons, and give the usual answer feedback (`showResult`:
sound, announcement, flash, and the correct-button highlight after a miss).

While `isPracticing()`, `handleDirectionResponse` sends the answer to
`finishPracticeTrial(success)` in place of `recordTrial`, the stats, the trend chart, and the
next trial. `handleKeyDown` also blocks arrow-key scrolling while practicing.

## Practice rules

- Trials come from `game.generatePracticeTrial()`: a random direction at `LEVELS[0]`.
- In the guided first round, once the stimulus ends, the tutorial scrolls the correct direction
  button into view (the pad can sit below the fold, and the coach is sticky) and rings it
  (`shape: 'box'`).
- `endPractice` (on abort) stops the trial's animation frames and timers.
