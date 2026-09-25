# Card Rat (`card-rat`)

A go/no-go reaction task modeled on Egyptian Rat Screw. Cards are dealt one at a time on a timer.
The player "slaps" (Space or click) only on trigger cards:

- **Pair:** same rank as the previous card.
- **Sandwich:** same rank as the card two back, with a different card between them.
- **Joker:** any joker.

A joker never forms a pair or sandwich with a card next to it.

## Files

- `game.js`: builds a 55-card deck (52 + `joker1..3`), reshuffles after each full pass
  (`deckPasses`), and detects triggers. `dealNextCard()` first calls `finalizeCurrentCard()`, so
  **a miss is scored when the next card is dealt**, not when a timer fires.
  `respondToCurrentCard()` returns `'hit' | 'false-alarm' | 'ignored'`. A second slap on the
  same trigger returns `'ignored'`.
- `cardSvg.js`: despite the name, it has no SVG. It returns CSS background-position styles that
  cut cards out of `images/cards-sprite.png`, plus the paths for the joker and card-back PNGs.
  The sprite geometry constants must match that image exactly. Update them together if the
  sprite changes.
- `tutorial/`: the first-run tutorial. `tutorial.js` lists steps as
  `{ title, contentPath }` pointing to the `tutorial-step-*.html` fragments. It fetches and
  caches them, and falls back to plain text if a fetch fails (`clearTutorialMarkupCache()` for
  tests). `index.js` calls `showTutorialIfNeeded` before the first session, and
  `#cr-replay-tutorial-btn` calls `showTutorial`.

## Difficulty

Display time per card is `round(1400 × 0.85^level)`, with a floor of 120 ms and a maximum level
of 50. Hits count as correct. Misses and false alarms both count as wrong, so the standard
3-up / 3-down staircase applies to both.

## Saved fields

`score`, `sessionDurationMs`, and `lowestDisplayTime`, plus `bestTriggerHits` (max) through
`extraFields`. It does not save `level`.

## Controls

A `document`-level Space listener (`attachGlobalKeyListener` / `detachGlobalKeyListener`) makes
Space work wherever focus is. The reaction-zone button also slaps when clicked. A checkbox toggles
the hint text under the cards (`updateHintVisibility()`).
