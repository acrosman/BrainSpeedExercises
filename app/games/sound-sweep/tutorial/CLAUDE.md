# Sound Sweep tutorial (`sound-sweep/tutorial/`)

Five slides, then up to two practice trials, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Sound Sweep.

- `PRACTICE_TEXT`: the guided text names both sweeps, the answer, and its number key, since the
  marker is not announced. The key comes from the answer's place in `game.SEQUENCES`.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.ss-tutorial-highlight--*` boxes in `../style.css`: `--stats` (blue,
  `--callout-1`), `--prompt` (green, `--callout-2`, the status line and Replay), `--buttons`
  (orange, `--callout-3`, the four sequence keys), and `--trend` (purple, `--callout-4`), each
  with the shared `.tutorial-callout` halo. The screenshot follows the standard in
  [../../../components/CLAUDE.md](../../../components/CLAUDE.md), clipped to `#ss-game-area`
  after five rounds, once the next sweeps have played and the sequence keys are enabled. If the
  layout changes, retake it and move the boxes together.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeTrialControls`) lets the tutorial show the game area, play a
trial with the real sweeps, Replay button, and response phase (`playTrial`), stop it
(`stopTrial`), find the answer buttons (`getSequenceButton`), and give the usual answer
feedback (`showResult`: sound, and the announcement that names the sequence after a miss).

While `isPracticing()`, `handleSequenceResponse` sends the answer to
`finishPracticeTrial(success)` in place of `recordTrial`, the stats, the trend chart, and the
next trial.

## Practice rules

- Trials come from `game.generatePracticeTrial()`: a random sequence at `LEVELS[0]` (600 ms
  sweeps, 600 ms apart). Replay repeats it at that timing.
- In the guided first round, once the sweeps end, the tutorial scrolls the correct answer
  button into view (the coach is sticky and pushes the game down) and rings it
  (`shape: 'box'`).
- `endPractice` (on abort) cancels the trial's timers. Sweeps already scheduled on the audio
  clock finish playing.
