# Object Track tutorial (`object-track/tutorial/`)

Five slides, then up to two practice rounds, built the standard way (see "Adding a tutorial to a
game" in [../../../components/CLAUDE.md](../../../components/CLAUDE.md)). This file covers only
what is specific to Object Track.

- `PRACTICE_TEXT` holds the coach and result text. Any text that describes a click also gives
  the Tab and Enter alternative. The guided text names the ringed ball by its accessible name
  ("Circle 4"), because the marker is `aria-hidden`.
- The screenshot slide highlights regions of `../images/tutorialScreenshot.png` with the
  percentage-positioned `.mot-tutorial-highlight--*` boxes in `../style.css`: `--stats` (blue,
  `--callout-1`), `--arena` (green, `--callout-2`), and `--trend` (orange, `--callout-3`, the
  trend chart and the End Game button), each with the shared `.tutorial-callout` halo, which
  keeps the arena box visible on dark backgrounds. The screenshot follows the standard in
  [../../../components/CLAUDE.md](../../../components/CLAUDE.md), clipped to `#mot-play-area`
  while three balls glow as targets. `.mot-tutorial-image` caps its height so the slide fits an
  880px window. If the layout changes, retake it and move the boxes together.
- The "What to Look For" slide draws a target and a plain ball with the game's own
  `.mot-circle` classes, so they change when the game's ball styles do.

## Practice controls and hooks

`PRACTICE_CONTROLS` (`PracticeRoundControls`) lets the tutorial show the game area, measure the
arena (`getArenaBounds`), play circles through the real marking → tracking → response phases
(`playRound`), stop them (`stopRound`), find circle buttons, and write to the feedback region.

`index.js` calls into the tutorial at three points, each only while `isPracticing()`:

- `enterResponsePhase` → `promptPracticeResponse()`: in a guided round, ring the first target;
  otherwise show the answer prompt.
- `handleCircleClick`, when fewer balls are chosen than there are targets →
  `guidePracticeResponse(selectedIds)`: ring the first target not yet chosen. A wrong choice
  does not move the ring, and clearing a target moves it back.
- `submitResponse` → `finishPracticeRound(evaluation)`, after the targets get their green and
  red rings, in place of `recordRoundResult`, the stats, the trend chart, and the next round.

## Practice rules

- Rounds come from `game.createPracticeRound(width, height)`: the level 0 round (8 balls, 3
  targets, 250 px/s, 5000 ms of tracking).
- The marker is shown only in the response phase. It does not follow a moving anchor, so it
  cannot ring a target while the balls move.
- `finishPracticeRound` resolves with `{ correct, feedback }`. A correct round is announced in
  the feedback region. A miss is left to the coach banner, which offers Try Again. The retry
  plays new circles, as the real game does.
- `endPractice` (on abort) stops the round.
