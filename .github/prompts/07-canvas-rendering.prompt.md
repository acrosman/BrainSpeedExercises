Add canvas-rendering helper functions to `app/games/fast-piggie/index.js`.

## Context

Fast Piggie draws a circular game board onto a `<canvas>` element. The board
is divided into N equal wedge sectors (pie slices). Each wedge holds one
guinea pig image. After the brief display period the images are hidden —
only the wedge outlines remain — and the player clicks a wedge.

This prompt adds the **rendering helpers only**. The full plugin lifecycle
(`init`, `start`, `stop`, `reset`) is wired up in a later prompt. Add these
as named exports so they are individually testable and can be imported by the
plugin's integration tests.

`index.js` currently contains only the plugin-contract stub. Add the helpers
below to the file; do not remove the existing stub.

---

## Functions to add to `app/games/fast-piggie/index.js`

### `loadImages(commonSrc, outlierSrc)` → `Promise<[HTMLImageElement, HTMLImageElement]>`

Load two image files and resolve when both are ready.

```js
export function loadImages(commonSrc, outlierSrc) {
  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
  return Promise.all([load(commonSrc), load(outlierSrc)]);
}
```

---

### `drawBoard(ctx, width, height, wedgeCount, images, outlierIndex, showImages)`

Draw N equal wedge sectors on the canvas. Wedge 0 starts at the top (−π/2)
and sectors proceed clockwise.

Parameters:

- `ctx` — `CanvasRenderingContext2D`
- `width`, `height` — canvas dimensions in pixels
- `wedgeCount` — number of wedge sectors to draw
- `images` — array `[commonImage, outlierImage]` (both `HTMLImageElement`)
- `outlierIndex` — which wedge index should show the outlier image
- `showImages` — boolean; if `false`, draw wedge outlines only (no images)

Algorithm:

1. Clear the entire canvas: `ctx.clearRect(0, 0, width, height)`.
2. Compute `cx = width / 2`, `cy = height / 2`,
   `radius = Math.min(width, height) / 2 - 10` (10px margin).
3. Compute `angleStep = (2 * Math.PI) / wedgeCount`.
4. For each wedge index `i` from `0` to `wedgeCount - 1`:
   a. Compute `startAngle = -Math.PI / 2 + i * angleStep`.
   b. Compute `endAngle = startAngle + angleStep`.
   c. Draw the wedge sector:
   - `ctx.beginPath()`
   - `ctx.moveTo(cx, cy)`
   - `ctx.arc(cx, cy, radius, startAngle, endAngle)`
   - `ctx.closePath()`
   - Fill with `#ffffff`, stroke with `#343a40` (2px).
     d. If `showImages` is `true`:
   - Select `img = i === outlierIndex ? images[1] : images[0]`.
   - Compute the wedge's midpoint angle:
     `midAngle = startAngle + angleStep / 2`
   - Compute image center:
     `imgCx = cx + Math.cos(midAngle) * radius * 0.6`
     `imgCy = cy + Math.sin(midAngle) * radius * 0.6`
   - Choose `imgSize = radius * 0.35` (fits inside wedge without
     overlapping lines at low wedge counts).
   - Draw: `ctx.drawImage(img, imgCx - imgSize/2, imgCy - imgSize/2, imgSize, imgSize)`

---

### `clearImages(ctx, width, height, wedgeCount)`

Redraw the board outline without any images. Equivalent to calling
`drawBoard(ctx, width, height, wedgeCount, [null, null], -1, false)`.

Implement it by delegating to `drawBoard` with `showImages = false` and
dummy image values (the `showImages` guard means they are never accessed):

```js
export function clearImages(ctx, width, height, wedgeCount) {
  drawBoard(ctx, width, height, wedgeCount, [null, null], -1, false);
}
```

---

### `highlightWedge(ctx, width, height, wedgeIndex, wedgeCount, color)`

Fill the specified wedge with a semi-transparent color to indicate
selection or reveal the correct answer.

Parameters:

- `color` — a CSS color string, e.g. `'rgba(40,167,69,0.45)'` for correct
  (green), `'rgba(220,53,69,0.45)'` for wrong (red),
  `'rgba(255,193,7,0.45)'` for reveal (yellow).

Algorithm:

1. Compute geometry: `cx`, `cy`, `radius`, `angleStep` exactly as in
   `drawBoard`.
2. Compute `startAngle = -Math.PI / 2 + wedgeIndex * angleStep`.
3. Compute `endAngle = startAngle + angleStep`.
4. Draw the wedge path (same as in `drawBoard` step 4c).
5. Fill with `color`: `ctx.fillStyle = color; ctx.fill()`.
6. Do **not** stroke — keep the existing outline intact.

---

## Constraints

- All four functions must be named exports.
- No DOM manipulation other than canvas context calls — no
  `document.querySelector`, no element creation.
- Do not import from `game.js` in this file (rendering helpers are
  independent of game state).
- Keep the existing plugin-contract stub (`export default { ... }`) intact.

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (no regressions; rendering helpers will be tested
  indirectly via integration tests added later).
