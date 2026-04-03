/**
 * audioService.js - Central audio service for BrainSpeedExercises.
 *
 * Manages a single shared AudioContext for the entire application and
 * exposes named sound-effect functions that every game plugin can call.
 * Centralizing audio here eliminates per-game context creation overhead
 * and satisfies browser autoplay policies with a single shared context.
 *
 * @file Central audio service.
 */

// ── Tone timing constants (seconds relative to AudioContext.currentTime) ──────

/**
 * Near-zero gain value used as a ramp start/end point.
 * The Web Audio API requires a positive non-zero value for exponential ramps,
 * and starting at effectively zero prevents audible clicks at note boundaries.
 */
const GAIN_NEAR_ZERO = 0.0001;

/** Gain level at the peak of the first tone's envelope. */
const TONE_A_PEAK_GAIN = 0.16;

/** Time (s) for the first tone to reach peak gain after it starts. */
const TONE_A_ATTACK_S = 0.02;

/** Time (s) at which the first tone's gain decay completes. */
const TONE_A_DECAY_END_S = 0.18;

/** Duration (s) of the first tone — also its scheduled stop time. */
const TONE_A_DURATION_S = 0.2;

/** Delay (s) before the second tone starts relative to AudioContext.currentTime. */
const TONE_B_DELAY_S = 0.12;

/** Gain level at the peak of the second tone's envelope. */
const TONE_B_PEAK_GAIN = 0.12;

/** Time (s) at which the second tone reaches peak gain after its own start. */
const TONE_B_ATTACK_END_S = 0.15;

/** Time (s) at which the second tone's gain decay completes. */
const TONE_B_DECAY_END_S = 0.3;

/** Duration (s) of the second tone — also its scheduled stop time. */
const TONE_B_DURATION_S = 0.32;

// ── Frequency constants (Hz) ──────────────────────────────────────────────────

/** Fundamental frequency of the first tone in the success chime (Hz). */
const SUCCESS_FREQ_A_HZ = 740;

/** Frequency of the second (higher) tone in the success chime (Hz). */
const SUCCESS_FREQ_B_HZ = 940;

/** Fundamental frequency of the first tone in the failure buzz (Hz). */
const FAILURE_FREQ_A_HZ = 220;

/** Frequency of the second (lower) tone in the failure buzz (Hz). */
const FAILURE_FREQ_B_HZ = 170;

// ── Shared audio context ──────────────────────────────────────────────────────

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
    toneA.frequency.setValueAtTime(SUCCESS_FREQ_A_HZ, now);
    gainA.gain.setValueAtTime(GAIN_NEAR_ZERO, now);
    gainA.gain.exponentialRampToValueAtTime(TONE_A_PEAK_GAIN, now + TONE_A_ATTACK_S);
    gainA.gain.exponentialRampToValueAtTime(GAIN_NEAR_ZERO, now + TONE_A_DECAY_END_S);
    toneA.start(now);
    toneA.stop(now + TONE_A_DURATION_S);

    const toneB = ctx.createOscillator();
    const gainB = ctx.createGain();
    toneB.connect(gainB);
    gainB.connect(ctx.destination);
    toneB.type = 'triangle';
    toneB.frequency.setValueAtTime(SUCCESS_FREQ_B_HZ, now + TONE_B_DELAY_S);
    gainB.gain.setValueAtTime(GAIN_NEAR_ZERO, now + TONE_B_DELAY_S);
    gainB.gain.exponentialRampToValueAtTime(TONE_B_PEAK_GAIN, now + TONE_B_ATTACK_END_S);
    gainB.gain.exponentialRampToValueAtTime(GAIN_NEAR_ZERO, now + TONE_B_DECAY_END_S);
    toneB.start(now + TONE_B_DELAY_S);
    toneB.stop(now + TONE_B_DURATION_S);
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
    toneA.frequency.setValueAtTime(FAILURE_FREQ_A_HZ, now);
    gainA.gain.setValueAtTime(GAIN_NEAR_ZERO, now);
    gainA.gain.exponentialRampToValueAtTime(TONE_A_PEAK_GAIN, now + TONE_A_ATTACK_S);
    gainA.gain.exponentialRampToValueAtTime(GAIN_NEAR_ZERO, now + TONE_A_DECAY_END_S);
    toneA.start(now);
    toneA.stop(now + TONE_A_DURATION_S);

    const toneB = ctx.createOscillator();
    const gainB = ctx.createGain();
    toneB.connect(gainB);
    gainB.connect(ctx.destination);
    toneB.type = 'sawtooth';
    toneB.frequency.setValueAtTime(FAILURE_FREQ_B_HZ, now + TONE_B_DELAY_S);
    gainB.gain.setValueAtTime(GAIN_NEAR_ZERO, now + TONE_B_DELAY_S);
    gainB.gain.exponentialRampToValueAtTime(TONE_B_PEAK_GAIN, now + TONE_B_ATTACK_END_S);
    gainB.gain.exponentialRampToValueAtTime(GAIN_NEAR_ZERO, now + TONE_B_DECAY_END_S);
    toneB.start(now + TONE_B_DELAY_S);
    toneB.stop(now + TONE_B_DURATION_S);
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
