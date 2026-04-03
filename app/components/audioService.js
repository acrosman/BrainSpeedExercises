/**
 * audioService.js - Central audio service for BrainSpeedExercises.
 *
 * Manages a single shared AudioContext for the entire application and
 * exposes named sound-effect functions that every game plugin can call.
 * Centralising audio here eliminates per-game context creation overhead
 * and satisfies browser autoplay policies with a single shared context.
 *
 * @file Central audio service.
 */

/** @type {AudioContext|null} Shared audio context reused across all games. */
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
 * Play a success sound — an ascending two-tone chime.
 *
 * Uses the shared AudioContext from {@link getAudioContext}.
 * Call after the first user gesture to satisfy browser autoplay policy.
 */
export function playSuccessSound() {
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
    toneA.frequency.setValueAtTime(740, now);
    gainA.gain.setValueAtTime(0.0001, now);
    gainA.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gainA.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    toneA.start(now);
    toneA.stop(now + 0.2);

    const toneB = ctx.createOscillator();
    const gainB = ctx.createGain();
    toneB.connect(gainB);
    gainB.connect(ctx.destination);
    toneB.type = 'triangle';
    toneB.frequency.setValueAtTime(940, now + 0.12);
    gainB.gain.setValueAtTime(0.0001, now + 0.12);
    gainB.gain.exponentialRampToValueAtTime(0.12, now + 0.15);
    gainB.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    toneB.start(now + 0.12);
    toneB.stop(now + 0.32);
  } catch {
    // Ignore audio errors in unsupported environments.
  }
}

/**
 * Play a failure sound — a descending two-tone buzz.
 *
 * Uses the shared AudioContext from {@link getAudioContext}.
 * Call after the first user gesture to satisfy browser autoplay policy.
 */
export function playFailureSound() {
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
    toneA.frequency.setValueAtTime(220, now);
    gainA.gain.setValueAtTime(0.0001, now);
    gainA.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gainA.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    toneA.start(now);
    toneA.stop(now + 0.2);

    const toneB = ctx.createOscillator();
    const gainB = ctx.createGain();
    toneB.connect(gainB);
    gainB.connect(ctx.destination);
    toneB.type = 'sawtooth';
    toneB.frequency.setValueAtTime(170, now + 0.12);
    gainB.gain.setValueAtTime(0.0001, now + 0.12);
    gainB.gain.exponentialRampToValueAtTime(0.12, now + 0.15);
    gainB.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    toneB.start(now + 0.12);
    toneB.stop(now + 0.32);
  } catch {
    // Ignore audio errors in unsupported environments.
  }
}

/**
 * Play either a success or failure sound based on the outcome.
 *
 * Convenience wrapper around {@link playSuccessSound} and {@link playFailureSound}.
 *
 * @param {boolean} isSuccess - When true plays the success sound; otherwise the failure sound.
 */
export function playFeedbackSound(isSuccess) {
  if (isSuccess) {
    playSuccessSound();
  } else {
    playFailureSound();
  }
}
