Create the HTML interface fragment for the Fast Piggie game at
`app/games/fast-piggie/interface.html`.

## Context

The project injects game HTML fragments directly into the `#game-container`
element of the main shell (`app/index.html`). Fragments must **not** include
`<html>`, `<head>`, or `<body>` tags. They are standalone sections of markup.

All UI must meet **WCAG 2.2 Level AA**. Key requirements:

- Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large / bold ≥ 18.66px).
- All interactive elements reachable and operable by keyboard.
- Logical focus order; visible focus indicator on every focusable element.
- Dynamic results and score updates use `aria-live` regions.
- Semantic HTML first; ARIA only where no semantic element suffices.

The game uses a `<canvas>` element as its play area. The canvas is not
inherently keyboard-accessible, so it must be given `tabindex="0"` and full
keyboard support (`role`, `aria-label`, keyboard event handling) to meet
WCAG 2.1.1.

## File to create: `app/games/fast-piggie/interface.html`

Produce the following structure. Class names must use the `fp-` prefix (short
for Fast Piggie) throughout to scope styles and avoid collisions with
app-level CSS.

```
<section class="fast-piggie" aria-labelledby="fp-title">

  <h2 id="fp-title">Fast Piggie</h2>

  <!-- Live stats bar: updates each round. polite = announced when idle -->
  <div class="fp-stats" aria-live="polite" aria-atomic="true">
    <span class="fp-stat">
      Round: <strong id="fp-round-count">0</strong>
    </span>
    <span class="fp-stat">
      Score: <strong id="fp-score">0</strong>
    </span>
  </div>

  <!-- Game canvas: keyboard-accessible wedge board -->
  <canvas
    id="fp-canvas"
    class="fp-canvas"
    width="500"
    height="500"
    tabindex="0"
    role="application"
    aria-label="Game board. Use arrow keys to cycle through wedges, Enter or Space to select."
  ></canvas>

  <!-- Screen-reader-only feedback region: assertive = interrupts immediately -->
  <div
    id="fp-feedback"
    role="status"
    aria-live="assertive"
    aria-atomic="true"
    class="fp-feedback sr-only"
  ></div>

  <!-- Visual flash overlay (toggled by JS via class names) -->
  <div id="fp-flash" class="fp-flash" aria-hidden="true"></div>

  <!-- Controls -->
  <div class="fp-controls">
    <button id="fp-continue-btn" class="fp-btn" hidden>
      Continue
    </button>
    <button id="fp-stop-btn" class="fp-btn fp-btn--secondary">
      End Game
    </button>
  </div>

</section>
```

### Notes on specific elements

**`<canvas>`**

- `width="500" height="500"` sets the drawing buffer. CSS can scale it for
  responsive layouts.
- `role="application"` is appropriate here because the canvas has custom
  keyboard interaction (arrow keys + Enter/Space to select a wedge).
- The `aria-label` must describe the keyboard controls.

**`#fp-feedback`**

- Uses the `.sr-only` utility class (already defined in `app/style.css`) so
  it is invisible but announced by screen readers.
- `aria-live="assertive"` ensures correct/wrong feedback interrupts any
  current screen-reader speech.

**`#fp-flash`**

- A full-section overlay `<div>` that the plugin toggles with CSS classes
  (`.fp-flash--correct`, `.fp-flash--wrong`) to produce the green/red
  full-screen flash. `aria-hidden="true"` because it is purely decorative.

**`#fp-continue-btn`**

- Created with the `hidden` attribute so it is invisible and removed from
  the tab order until the plugin explicitly shows it after each round.

**`.fp-btn--secondary`**

- Visual variant for the End Game button; same interactive behaviour.

## Constraints

- No `<script>` tags in the fragment.
- No inline styles.
- All `id` values must be unique and prefixed with `fp-`.
- Use double quotes for all HTML attribute values.
- The fragment must be valid HTML5.

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (no regressions).
