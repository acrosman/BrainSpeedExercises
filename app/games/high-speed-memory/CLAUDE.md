# High Speed Memory (`high-speed-memory`)

A visual memory task. A grid of face-up cards is shown briefly, then all cards flip face-down.
The player must click the 3 cards that showed the Primary image (`images/Primary.jpg`). Every
other card shows a random distractor (`Distractor1..3.jpg`).

## Round flow (`index.js`)

1. `startRound()` generates the grid, shows it face-up, and hides it after
   `getDisplayDurationMs(level)`. Clicks are ignored until then (`_flipLock`).
2. A correct click keeps its card face-up as matched. When all 3 are found,
   `onRoundComplete()` runs, then a 1200 ms pause, then the next round.
3. A wrong click flips that card up, waits `WRONG_FLIP_DELAY_MS` (900), shows where the Primary
   cards were for `REVEAL_ANSWER_MS` (1200), and then **replays the round at the same level with
   a new grid**.

The level-up announcement assumes a level-up whenever `getConsecutiveCorrectRounds()` returns 0
after `completeRound()`. If you change the staircase in `game.js`, update that check too.

## Difficulty

- Grid is `(level + 3)²` cards, with no upper limit.
- Display time is `1500 − 25 × level` ms, with a floor of 20 ms.
- A level is gained after 3 clean rounds in a row (`ROUNDS_TO_LEVEL_UP`). Three wrong rounds in
  a row cost two levels.
- `score` goes up by 1 for each Primary card found, not for each round completed.

## Saved fields

`score`, `sessionDurationMs`, and `level`. `lowestDisplayTime` is the display time at the level
reached. There are no extra fields.

## Controls

Cards are focusable and respond to click, Enter, or Space.