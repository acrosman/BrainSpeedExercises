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

/** Fundamental frequency of the first tone in the failure chime (Hz). */
const FAILURE_FREQ_A_HZ = 440;

/** Frequency of the second (lower) tone in the failure chime (Hz).
 * A descending perfect fifth below FAILURE_FREQ_A_HZ creates a smooth,
 * resolute negative feeling without a harsh buzz. */
const FAILURE_FREQ_B_HZ = 294;

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
 * Play a failure sound — a smooth descending two-tone chime.
 *
 * Uses sine waves on both tones for a clean sound that descends in pitch
 * to convey a negative outcome without a harsh buzz.
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
    toneB.type = 'sine';
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

// ── Frequency sweep constants ─────────────────────────────────────────────────

/**
 * Low frequency boundary for frequency sweeps (Hz).
 * Used as the start of an upward sweep or the end of a downward sweep.
 */
export const SWEEP_LOW_FREQ_HZ = 300;

/**
 * High frequency boundary for frequency sweeps (Hz).
 * Used as the end of an upward sweep or the start of a downward sweep.
 */
export const SWEEP_HIGH_FREQ_HZ = 3000;

/** Peak gain for frequency sweep sounds. */
const SWEEP_PEAK_GAIN = 0.25;

/**
 * Attack duration (s) — time to ramp from silence to peak gain at sweep onset.
 * A short ramp prevents audible clicks at the start of the sweep.
 */
const SWEEP_ATTACK_S = 0.015;

/**
 * Release duration (s) — time to ramp from peak gain to silence at sweep end.
 * A short ramp prevents audible clicks at the end of the sweep.
 */
const SWEEP_RELEASE_S = 0.015;

/**
 * Schedule a single frequency sweep on the Web Audio graph.
 *
 * Internal helper used by {@link playSweepPair}. Uses `linearRampToValueAtTime`
 * for the frequency ramp so the perceived pitch changes at a constant rate.
 *
 * @param {AudioContext} ctx - The shared audio context.
 * @param {string} direction - 'up' (low→high) or 'down' (high→low).
 * @param {number} startTime - AudioContext time (seconds) at which the sweep starts.
 * @param {number} durationS - Duration of the sweep in seconds.
 */
function scheduleSweep(ctx, direction, startTime, durationS) {
  const fromFreq = direction === 'up' ? SWEEP_LOW_FREQ_HZ : SWEEP_HIGH_FREQ_HZ;
  const toFreq = direction === 'up' ? SWEEP_HIGH_FREQ_HZ : SWEEP_LOW_FREQ_HZ;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';

  osc.frequency.setValueAtTime(fromFreq, startTime);
  osc.frequency.linearRampToValueAtTime(toFreq, startTime + durationS);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(SWEEP_PEAK_GAIN, startTime + SWEEP_ATTACK_S);
  gain.gain.setValueAtTime(SWEEP_PEAK_GAIN, startTime + durationS - SWEEP_RELEASE_S);
  gain.gain.linearRampToValueAtTime(0, startTime + durationS);

  osc.start(startTime);
  osc.stop(startTime + durationS);
}

/**
 * Schedule a pair of frequency sweeps with an inter-stimulus interval.
 *
 * Both sweeps are scheduled immediately using the Web Audio API clock for
 * sample-accurate timing. The function does not block; audio plays asynchronously.
 *
 * Call from a plugin's trial loop. The caller is responsible for enabling
 * the response UI after the appropriate delay
 * (`sweepDurationMs * 2 + isiMs`).
 *
 * @param {string[]} sequence - Two-element array, e.g. `['up', 'down']`.
 * @param {object} options - Sweep configuration.
 * @param {number} options.sweepDurationMs - Duration of each sweep in milliseconds.
 * @param {number} options.isiMs - Silence between the two sweeps in milliseconds.
 */
export function playSweepPair(sequence, { sweepDurationMs, isiMs }) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }

    const sweepS = sweepDurationMs / 1000;
    const isiS = isiMs / 1000;
    const now = ctx.currentTime;

    scheduleSweep(ctx, sequence[0], now, sweepS);
    scheduleSweep(ctx, sequence[1], now + sweepS + isiS, sweepS);
  } catch {
    // Ignore audio errors in unsupported environments.
  }
}
