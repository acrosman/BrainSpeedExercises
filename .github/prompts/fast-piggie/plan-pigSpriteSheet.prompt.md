# Plan: Sprite-Sheet Pig Images via Canvas Source Clipping

## Context

`PiggiesSource.jpg` (768×512 px) is a single sprite sheet — left half (384×512) is the common pig, right half (384×512) is the uncommon/outlier pig. The game renders pigs onto a `<canvas>` using `ctx.drawImage()` in `drawBoard()` inside `index.js`. There are no DOM `<img>` elements to apply CSS masks to; the canvas API's **9-argument `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`** is the direct equivalent of a CSS mask/clip, and is the approach to use.

---

## Plan: Sprite-Sheet Pig Images via Canvas Source Clipping

**What:** Replace two separate pig PNGs with one sprite sheet (`PiggiesSource.jpg`). Use the 9-arg `drawImage` to clip to left or right half. Preserve aspect ratio (3:4) when scaling pigs into the wedges.

**Why:** Simpler asset management, single network load, cleaner source of truth for pig appearance.

**How:** Change `loadImages()` to return structured wrapper objects containing the image + source rect; update `drawBoard()` to use 9-arg `drawImage`; update `init()` to load the single sprite; update tests.

---

## Steps

### Phase 1 — `index.js`: Update `loadImages()`

1. Change signature from `loadImages(commonSrc, outlierSrc)` to `loadImages(src)` (single path)
2. Load one `HTMLImageElement` from `src`
3. Return `Promise` resolving to a 2-element array of wrapper objects:
   - `[{ image: img, sx: 0, sw: img.naturalWidth / 2, sh: img.naturalHeight }, { image: img, sx: img.naturalWidth / 2, sw: img.naturalWidth / 2, sh: img.naturalHeight }]`
   - Index 0 = left half = common pig; index 1 = right half = outlier pig

### Phase 2 — `index.js`: Update `drawBoard()`

4. Change the `if (showImages)` drawing block:
   - Replace `const img = ...` + 5-arg drawImage with wrapper lookup:
     `const entry = i === outlierIndex ? images[1] : images[0];`
   - Compute aspect-ratio-preserving destination size:
     `const drawH = radius * 0.35;`
     `const drawW = drawH * (entry.sw / entry.sh);` ← = drawH × (384/512) ≈ drawH × 0.75
   - Draw using 9-arg form:
     `ctx.drawImage(entry.image, entry.sx, 0, entry.sw, entry.sh, imgCx - drawW / 2, imgCy - drawH / 2, drawW, drawH);`
5. Guard: if `entry` or `entry.image` is nullish, skip (matches existing `if (showImages)` guard on images array)

### Phase 3 — `index.js`: Update `init()`

6. Change the `loadImages(...)` call inside `init()` from loading two PNGs to:
   ```
   loadImages(`${base}PiggiesSource.jpg`)
   ```

### Phase 4 — `tests/index.test.js`: Update tests

7. Update `globalThis.Image` mock class to attach `naturalWidth: 768` and `naturalHeight: 512` so wrapper objects compute correct `sw`/`sh`
8. Update `loadImages` tests:
   - Call with single arg: `loadImages('a.png')`
   - Assert length is still 2
   - Assert each element has shape `{ image, sx, sw, sh }` (add shape tests)
9. Update `drawBoard` "showImages" test:
   - Replace `const fakeImg = {}` with wrapper-shaped objects:
     `const fakeImgEl = { naturalWidth: 768, naturalHeight: 512 };`
     `const fakeWrappers = [{ image: fakeImgEl, sx: 0, sw: 384, sh: 512 }, { image: fakeImgEl, sx: 384, sw: 384, sh: 512 }];`
   - Pass `fakeWrappers` instead of `[fakeImg, fakeImg]`
10. Add a new test verifying 9-arg `drawImage` is called (confirms sprite clipping actually happens):
    ```
    expect(ctx2d.drawImage).toHaveBeenCalledWith(
      expect.any(Object), expect.any(Number), 0,
      384, 512,
      expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)
    );
    ```

### Phase 5 — Asset cleanup

11. Delete `app/games/fast-piggie/images/guinea-pig-common.png`
12. Delete `app/games/fast-piggie/images/guinea-pig-outlier.png`

---

## Relevant Files

- `app/games/fast-piggie/index.js` — `loadImages()`, `drawBoard()`, `init()` all change
- `app/games/fast-piggie/tests/index.test.js` — Image mock, loadImages tests, drawBoard test
- `app/games/fast-piggie/images/PiggiesSource.jpg` — new sprite sheet (already exists, read-only)
- `app/games/fast-piggie/images/guinea-pig-common.png` — to be deleted
- `app/games/fast-piggie/images/guinea-pig-outlier.png` — to be deleted
- `app/games/fast-piggie/game.js` — no changes
- `app/games/fast-piggie/interface.html` — no changes
- `app/games/fast-piggie/style.css` — no changes

---

## Verification

1. `npm test` — all tests pass with ≥100% function coverage, ≥80% branch/line/statement
2. Manually confirm in running app (`npm start`) that:
   - Common pig wedges show the left half of the sprite sheet
   - Outlier pig wedge shows the right half
   - Pigs are correctly sized (~63px wide × 84px tall) and don't bleed across wedge borders
3. Confirm old PNG files are gone from `images/` directory

---

## Decisions

- **CSS mask vs canvas drawImage**: The game renders pigs onto a `<canvas>`; CSS mask properties only apply to DOM elements. The 9-arg form of `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` is the canvas-native equivalent and is used here.
- **Aspect ratio**: Source halves are 384×512 (portrait, 3:4). Pigs will be drawn preserving this ratio (`drawH = radius × 0.35`, `drawW = drawH × 0.75`) rather than stretching into a square.
- **Wrapper object shape**: `{ image, sx, sw, sh }` — `sy` always 0 so not stored (simplification).
- **Old PNGs**: Removed as part of this change.
- **`game.js`**: No changes — pure logic with no image references.
