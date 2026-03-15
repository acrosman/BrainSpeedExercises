Create the scoped stylesheet for the Fast Piggie game at
`app/games/fast-piggie/style.css`.

## Context

The app-level stylesheet (`app/style.css`) provides global reset, typography,
and the `.sr-only` utility class. Game-level styles must be scoped under the
`.fast-piggie` class to avoid collisions. All class names use the `fp-`
prefix defined in `interface.html`.

All visual design must meet **WCAG 2.2 Level AA**:

- Normal-text contrast ≥ 4.5:1 against its background.
- Large/bold text (≥ 18.66px or ≥ 14px bold) contrast ≥ 3:1.
- Every focusable element must have a visible `:focus-visible` outline.
- The `hidden` HTML attribute must not be overridden by CSS.

## File to populate: `app/games/fast-piggie/style.css`

Replace the stub comment with the rules below.

---

### Layout

```css
/* Section wrapper */
.fast-piggie {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background-color: #f8f9fa; /* matches app body background */
  color: #212529; /* ~14.5:1 contrast on #f8f9fa */
}

.fast-piggie h2 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0;
}
```

---

### Stats bar

```css
.fp-stats {
  display: flex;
  gap: 2rem;
  font-size: 1rem;
  font-weight: 500;
}

.fp-stat strong {
  font-size: 1.25rem;
}
```

---

### Canvas

```css
.fp-canvas {
  display: block;
  max-width: 100%;
  /* Intrinsic size is 500×500; CSS keeps it responsive */
  width: clamp(280px, 60vmin, 500px);
  height: clamp(280px, 60vmin, 500px);
  border: 2px solid #343a40;
  border-radius: 50%; /* visual hint that it's a circle game */
  background-color: #ffffff;
  cursor: crosshair;
}

.fp-canvas:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 4px;
}
```

---

### Flash overlay

The `#fp-flash` div sits absolutely within `.fast-piggie`. JS adds
`.fp-flash--correct` or `.fp-flash--wrong` to trigger a brief color animation,
then removes the class.

```css
.fp-flash {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

.fp-flash--correct {
  animation: fp-flash-green 0.5s ease-out forwards;
}

.fp-flash--wrong {
  animation: fp-flash-red 0.5s ease-out forwards;
}

@keyframes fp-flash-green {
  0% {
    background-color: #28a745;
    opacity: 0.55;
  }
  100% {
    background-color: #28a745;
    opacity: 0;
  }
}

@keyframes fp-flash-red {
  0% {
    background-color: #dc3545;
    opacity: 0.55;
  }
  100% {
    background-color: #dc3545;
    opacity: 0;
  }
}
```

> The overlay uses `position: fixed; inset: 0` so it covers the whole
> viewport, giving a clear full-screen flash. `pointer-events: none` prevents
> it from blocking canvas clicks during animation.

---

### Controls

```css
.fp-controls {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.fp-btn {
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #005fcc; /* primary blue */
  color: #ffffff; /* 7.3:1 contrast on #005fcc */
  transition: background-color 0.15s ease;
}

.fp-btn:hover {
  background-color: #004aa3;
}

.fp-btn:active {
  background-color: #003d88;
}

.fp-btn:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 3px;
  background-color: #004aa3;
}

.fp-btn--secondary {
  background-color: #6c757d; /* muted grey; 4.6:1 contrast on white */
  color: #ffffff;
}

.fp-btn--secondary:hover {
  background-color: #545b62;
}

.fp-btn--secondary:active {
  background-color: #3d4349;
}

.fp-btn--secondary:focus-visible {
  outline-color: #6c757d;
}

/* Respect the hidden attribute — never override it */
[hidden] {
  display: none !important;
}
```

---

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (no regressions).
- Spot-check contrast ratios:
  - `#212529` on `#f8f9fa` ≈ 14.5:1 ✓
  - `#ffffff` on `#005fcc` ≈ 7.3:1 ✓
  - `#ffffff` on `#6c757d` ≈ 4.6:1 ✓
  - `#28a745` flash overlay is purely decorative (no text), so contrast
    rules do not apply to the overlay itself ✓
