# Fine Tuning tutorial (`fine-tuning/tutorial/`)

Five slides, then up to two practice trials, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Fine Tuning.

- `PRACTICE_TEXT`: the guided text names the target, which sound matched it, the answer, and its
  number key, since the marker is not announced. `guidedAnswer` takes the whole trial; the key
  comes from the answer's place in `game.ANSWERS`.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.ft-tutorial-highlight--*` boxes in `../style.css`: `--stats` (blue,
  `--callout-1`), `--prompt` (green, `--callout-2`, the status line and Replay), `--buttons`
  (orange, `--callout-3`, the First and Second keys), `--trend` (purple, `--callout-4`), and
  `--voice` (teal, `--callout-5`), each with the shared `.tutorial-callout` halo. The screenshot
  follows the standard in [../../../components/CLAUDE.md](../../../components/CLAUDE.md),
  clipped to `#ft-game-area` after five rounds, once the next trial has played and the answer
  keys are enabled. If the layout changes, retake it and move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeTrialControls`) lets the tutorial show the game area, play a
trial with the real sounds, Replay button, and response phase (`playTrial`), stop it
(`stopTrial`, which also silences the audio), find the answer buttons (`getAnswerButton`), and
give the usual answer feedback (`showResult`: sound, and the announcement that names the target
and where it was after a miss).

While `isPracticing()`, `handleResponse` sends the answer to `finishPracticeTrial(success)` in
place of `recordTrial`, the stats, the trend chart, and the next trial.

## Practice rules

- Trials come from `game.generatePracticeTrial()`: a random pair at `LEVELS[0]` (100 ms
  transitions, 500 ms between the choices, no noise) in the player's voice setting. Level 1 has
  no cross-voice trials, so all three sounds share one voice even in Mixed. Replay repeats the
  trial exactly.
- In the guided first round, once the sounds end, the tutorial scrolls the correct answer
  button into view (the coach is sticky and pushes the game down) and rings it
  (`shape: 'box'`).
- `endPractice` (on abort) calls `stopTrial`, which fades out any sound still playing and
  cancels the trial's timers.
