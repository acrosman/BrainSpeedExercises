Add Web Audio API sound-effect helpers to `app/games/fast-piggie/index.js`.

## Context

Fast Piggie plays a short synthesized tone after each round — ascending tones
for a correct answer, descending tones for a wrong answer. No audio files are
needed; all sounds are generated with the Web Audio API at runtime.

This prompt adds the **audio helpers only**. They are added as named exports
alongside the canvas helpers already in `index.js`. The full plugin lifecycle
wires them together in the next prompt.

Do not remove any existing code from `index.js`.

---

## Functions to add to `app/games/fast-piggie/index.js`

### `createAudioContext()` → `AudioContext`

Lazily create and cache a single `AudioContext` for the lifetime of the
plugin. Return the cached instance on subsequent calls.

```js
let _audioCtx = null;

export function createAudioContext() {
  if (!_audioCtx) {
    // eslint-disable-next-line no-undef
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}
```

> The `window.webkitAudioContext` fallback handles older Chromium builds
> (Electron may bundle an older engine on some platforms).

---

### `playTone(audioCtx, frequency, startTime, duration)`

Internal helper (not exported). Plays a single tone.

Parameters:

- `audioCtx` — `AudioContext` instance
- `frequency` — frequency in Hz
- `startTime` — `AudioContext` timestamp when the tone starts (seconds)
- `duration` — how long the tone plays (seconds)

Implementation:

```js
function playTone(audioCtx, frequency, startTime, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);

  // Gentle envelope: ramp up then down to avoid clicks
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration);
}
```

---

### `playSuccessSound(audioCtx)`

Play two ascending tones: 440 Hz then 660 Hz, each ~0.15 s, with a 0.01 s
gap between them.

```js
export function playSuccessSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 440, now, 0.15);
  playTone(audioCtx, 660, now + 0.16, 0.15);
}
```

---

### `playFailureSound(audioCtx)`

Play two descending tones: 330 Hz then 220 Hz, each ~0.15 s, with a 0.01 s
gap.

```js
export function playFailureSound(audioCtx) {
  const now = audioCtx.currentTime;
  playTone(audioCtx, 330, now, 0.15);
  playTone(audioCtx, 220, now + 0.16, 0.15);
}
```

---

## Constraints

- `playTone` is a module-private function — **do not export it**.
- `_audioCtx` is a module-private variable — **do not export it**.
- No audio files are loaded; all sound is synthesized.
- Do not call `createAudioContext()` at module load time; it must stay lazy
  (browsers and Electron require user interaction before creating an
  `AudioContext`).
- Keep all existing exports and the plugin-contract stub intact.

## Verification

- `npm run lint` must pass with 0 errors.
- `npm test` must pass (no regressions; audio helpers are tested via
  integration tests in a later prompt).
