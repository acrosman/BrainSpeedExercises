/**
 * audio.js - Audio feedback for the Field of View game.
 *
 * Manages a shared AudioContext for the session and plays short tones on
 * each trial outcome. Creating a single context and reusing it avoids
 * per-trial instantiation overhead and browser auto-play limits.
 *
 * @file Field of View audio feedback helpers.
 */

/** @type {AudioContext|null} Shared audio context reused across trials. */
let _audioCtx = null;

/**
 * Return the shared AudioContext, creating it on first use.
 * Returns null when the Web Audio API is unavailable.
 *
 * @returns {AudioContext|null}
 */
export function getAudioContext() {
  if (_audioCtx && _audioCtx.state !== 'closed') {
    return _audioCtx;
  }
  const AudioCtx = (typeof AudioContext !== 'undefined' && AudioContext)
    || (typeof window !== 'undefined' && window.webkitAudioContext)
    || null;
  if (!AudioCtx) return null;
  try {
    _audioCtx = new AudioCtx();
  } catch {
    return null;
  }
  return _audioCtx;
}

/**
 * Play a short positive/negative sound cue for trial feedback.
 *
 * Reuses the shared AudioContext created by {@link getAudioContext}.
 * Call this after the first user-gesture to satisfy browser autoplay policy.
 *
 * @param {boolean} isSuccess
 */
export function playFeedbackSound(isSuccess) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }

    const now = ctx.currentTime;

    const toneA = ctx.createOscillator();
    const gainA = ctx.createGain();
    toneA.connect(gainA);
    gainA.connect(ctx.destination);

    toneA.type = 'sine';
    toneA.frequency.setValueAtTime(isSuccess ? 740 : 220, now);
    gainA.gain.setValueAtTime(0.0001, now);
    gainA.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gainA.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    toneA.start(now);
    toneA.stop(now + 0.2);

    const toneB = ctx.createOscillator();
    const gainB = ctx.createGain();
    toneB.connect(gainB);
    gainB.connect(ctx.destination);

    toneB.type = isSuccess ? 'triangle' : 'sawtooth';
    toneB.frequency.setValueAtTime(isSuccess ? 940 : 170, now + 0.12);
    gainB.gain.setValueAtTime(0.0001, now + 0.12);
    gainB.gain.exponentialRampToValueAtTime(0.12, now + 0.15);
    gainB.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    toneB.start(now + 0.12);
    toneB.stop(now + 0.32);
  } catch {
    // Ignore audio errors in unsupported environments.
  }
}
