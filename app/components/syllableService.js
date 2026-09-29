/**
 * syllableService.js - Synthesized consonant-vowel syllables for speech-sound games.
 *
 * Builds syllables such as /ba/, /da/, and /pi/ on the shared AudioContext with a parallel
 * formant synthesizer: a sawtooth voicing source and a noise source feed three band-pass
 * filters (F1, F2, F3) whose center frequencies glide from the consonant's onset values to the
 * vowel's steady values. The length of that glide (`transitionMs`) is the "stretching" dial:
 * long transitions are easier to hear, short ones are harder.
 *
 * - Place of articulation (/b/, /d/, /g/) is carried by the formant onsets and the burst.
 * - Voicing (/b/ vs /p/, /d/ vs /t/) is carried by voice onset time: voiceless stops play
 *   aspiration noise through F2 and F3 before voicing starts.
 * - Two voice profiles (`lower`, `higher`) change the pitch (F0) and scale every formant.
 *
 * A sequence can be played over brown background noise. The signal-to-noise ratio is
 * approximate: it is set from gain constants tuned by ear, not measured as RMS.
 *
 * @file Synthesized speech syllables.
 */

import { getAudioContext } from './audioService.js';

// ── Syllable timing (ms) ──────────────────────────────────────────────────────

/**
 * Time from the start of the burst to the start of the formant transition. Bursts longer than
 * this (velars) overlap the start of the transition, as they do in speech.
 */
const RELEASE_POINT_MS = 5;

/**
 * Voice onset time, measured from the start of the burst. Voiced stops start voicing almost at
 * once; voiceless stops are aspirated first.
 */
const VOT_MS = Object.freeze({ voiced: 10, voiceless: 50 });

/**
 * How long aspiration keeps fading after voicing starts. The overlap crossfades the two, so
 * there is no audible breath between the consonant and the vowel.
 */
const ASPIRATION_OVERLAP_MS = 10;

/** Length of the steady vowel after the formant transition ends. */
const STEADY_VOWEL_MS = 150;

/** Fade-out at the end of each syllable. */
const RELEASE_MS = 30;

/** Fade-in for voicing and aspiration, which prevents clicks. */
const ONSET_RAMP_MS = 5;

// ── Background noise timing (ms) ──────────────────────────────────────────────

/**
 * Silence (or noise) before the first syllable. It is always included, so a sequence's timing
 * does not depend on whether noise is on.
 */
const NOISE_LEAD_MS = 250;

/** Silence (or noise) after the last syllable. */
const NOISE_TAIL_MS = 150;

/**
 * Fade-in and fade-out of the background noise. The noise eases in during the lead-in and out
 * during the tail, so each round does not start with an abrupt burst of hiss. It must not be
 * longer than NOISE_LEAD_MS or NOISE_TAIL_MS, so the noise is at full level under every
 * syllable.
 */
const NOISE_FADE_MS = 150;

/** Length of the cached white-noise buffer used for bursts and aspiration. */
const WHITE_NOISE_BUFFER_S = 2;

/**
 * Length of the cached brown-noise buffer for the background. It loops if a sequence runs
 * longer.
 */
const BROWN_NOISE_BUFFER_S = 4;

/**
 * Step of the random walk that turns white noise into brown noise. Each sample adds this much
 * white noise to the last, then leaks back toward zero by the same fraction, so the walk never
 * drifts away. Smaller steps put more of the energy at low frequencies.
 */
const BROWN_NOISE_STEP = 0.02;

/**
 * RMS level the brown noise is scaled to. It matches the low-passed white noise the game used
 * before, so NOISE_GAIN_AT_0_DB keeps its calibration.
 */
const BROWN_NOISE_RMS = 0.18;

/**
 * Crossfade (s) between the end of the brown-noise buffer and its start, so it loops without a
 * click. Brown noise drifts, so its last sample and first sample would not otherwise meet.
 */
const BROWN_NOISE_LOOP_FADE_S = 0.05;

// ── Levels ────────────────────────────────────────────────────────────────────

/** Gain of the speech bus. Scales every syllable together. */
const SPEECH_LEVEL = 1.2;

/** Peak gain of the voicing source into the formant filters. */
const VOICE_LEVEL = 1;

/**
 * Peak gain of the aspiration noise into F2 and F3, reached just after the burst. It then fades
 * to silence as voicing starts. White noise loses most of its energy in the narrow formant
 * bands, so this is above the voicing level.
 */
const ASPIRATION_LEVEL = 1.5;

/** Rise time (ms) of the aspiration after the burst. */
const ASPIRATION_ATTACK_MS = 2;

/**
 * Release burst for each place of articulation: its length (ms), the Q of its band-pass
 * filter, and its peak gain. The burst is a main cue for place:
 *
 * - Labial: short, weak, and diffuse.
 * - Alveolar: short, strong, and broad (it sits high, see `PLACE_CUES`).
 * - Velar: long, loud, and compact, which gives /g/ its hard onset.
 */
const PLACE_BURSTS = Object.freeze({
  labial: Object.freeze({ durationMs: 5, q: 1, level: 0.4 }),
  alveolar: Object.freeze({ durationMs: 6, q: 1.5, level: 0.8 }),
  velar: Object.freeze({ durationMs: 15, q: 5, level: 1 }),
});

/** Rise time (ms) of every burst. */
const BURST_ATTACK_MS = 1;

/** Voiceless stops are released with more pressure, so their bursts are this much louder. */
const VOICELESS_BURST_BOOST = 1.4;

/** Gain of each formant branch, F1 first. Lower formants carry more energy in speech. */
const FORMANT_LEVELS = Object.freeze([1, 0.8, 0.5]);

/** Bandwidth (Hz) of each formant filter, F1 first. Q is the steady frequency / bandwidth. */
const FORMANT_BANDWIDTHS_HZ = Object.freeze([90, 110, 170]);

/**
 * Background noise gain that sounds about as loud as the speech (0 dB SNR). The noise gain for
 * a trial is this × 10^(−snrDb / 20). Tuned by ear.
 */
const NOISE_GAIN_AT_0_DB = 0.7;

/**
 * Ceiling on the background noise gain, whatever the SNR. It keeps long sessions comfortable
 * and protects the player's ears.
 */
const MAX_NOISE_GAIN = 0.5;

/** Fade-out (s) when a sequence is stopped early. */
const STOP_RAMP_S = 0.02;

// ── Voices ────────────────────────────────────────────────────────────────────

/**
 * Voice profiles. F0 falls from `f0StartHz` to `f0EndHz` across each syllable, as it does at
 * the end of a spoken word. `formantScale` multiplies every formant and burst frequency:
 * shorter vocal tracts have higher formants.
 *
 * @type {Readonly<Record<string, { f0StartHz: number, f0EndHz: number,
 *   formantScale: number }>>}
 */
const VOICE_PROFILES = Object.freeze({
  lower: Object.freeze({ f0StartHz: 125, f0EndHz: 100, formantScale: 1 }),
  higher: Object.freeze({ f0StartHz: 220, f0EndHz: 185, formantScale: 1.17 }),
});

/** IDs of the available voices. */
export const VOICE_IDS = Object.freeze(Object.keys(VOICE_PROFILES));

// ── Phonetics ─────────────────────────────────────────────────────────────────

/** Steady-state formants (Hz) for each vowel, [F1, F2, F3], for the lower voice. */
const VOWEL_FORMANTS = Object.freeze({
  a: Object.freeze([700, 1220, 2600]),
  i: Object.freeze([270, 2300, 3000]),
});

/**
 * Consonant cues for each place of articulation before each vowel, for the lower voice:
 * the formant onsets [F1, F2, F3] (Hz) and the burst's center frequency (Hz).
 *
 * - Labial: F2 and F3 start below the vowel and rise; the burst is low and diffuse.
 * - Alveolar: F2 starts near 1700–2000 Hz and F3 high; the burst is high.
 * - Velar: F2 and F3 start close together (the "velar pinch"); the burst sits between them.
 *   Before /i/, F2 starts well above the vowel and falls, the opposite of /di/.
 */
const PLACE_CUES = Object.freeze({
  labial: Object.freeze({
    a: Object.freeze({ onsets: Object.freeze([200, 800, 2000]), burstHz: 600 }),
    i: Object.freeze({ onsets: Object.freeze([200, 1600, 2500]), burstHz: 700 }),
  }),
  alveolar: Object.freeze({
    a: Object.freeze({ onsets: Object.freeze([200, 1700, 2800]), burstHz: 3500 }),
    i: Object.freeze({ onsets: Object.freeze([200, 2000, 3100]), burstHz: 4000 }),
  }),
  velar: Object.freeze({
    a: Object.freeze({ onsets: Object.freeze([200, 1700, 2000]), burstHz: 1800 }),
    i: Object.freeze({ onsets: Object.freeze([200, 2800, 2900]), burstHz: 2900 }),
  }),
});

/**
 * Every syllable this service can play.
 *
 * @type {Readonly<Record<string, { place: string, voiced: boolean, vowel: string }>>}
 */
const SYLLABLE_SPECS = Object.freeze({
  ba: Object.freeze({ place: 'labial', voiced: true, vowel: 'a' }),
  da: Object.freeze({ place: 'alveolar', voiced: true, vowel: 'a' }),
  ga: Object.freeze({ place: 'velar', voiced: true, vowel: 'a' }),
  pa: Object.freeze({ place: 'labial', voiced: false, vowel: 'a' }),
  ta: Object.freeze({ place: 'alveolar', voiced: false, vowel: 'a' }),
  bi: Object.freeze({ place: 'labial', voiced: true, vowel: 'i' }),
  di: Object.freeze({ place: 'alveolar', voiced: true, vowel: 'i' }),
  gi: Object.freeze({ place: 'velar', voiced: true, vowel: 'i' }),
  pi: Object.freeze({ place: 'labial', voiced: false, vowel: 'i' }),
  ti: Object.freeze({ place: 'alveolar', voiced: false, vowel: 'i' }),
});

/** IDs of the available syllables. */
export const SYLLABLE_IDS = Object.freeze(Object.keys(SYLLABLE_SPECS));

// ── Cached noise ──────────────────────────────────────────────────────────────

/** @type {AudioBuffer|null} White noise shared by bursts and aspiration. */
let _whiteNoiseBuffer = null;

/** @type {AudioContext|null} The context `_whiteNoiseBuffer` was built for. */
let _whiteNoiseBufferCtx = null;

/** @type {AudioBuffer|null} Brown noise for the background. */
let _brownNoiseBuffer = null;

/** @type {AudioContext|null} The context `_brownNoiseBuffer` was built for. */
let _brownNoiseBufferCtx = null;

/**
 * Return a white-noise buffer for `ctx`, building it on first use.
 *
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
function getWhiteNoiseBuffer(ctx) {
  if (_whiteNoiseBuffer && _whiteNoiseBufferCtx === ctx) return _whiteNoiseBuffer;
  const length = Math.ceil(ctx.sampleRate * WHITE_NOISE_BUFFER_S);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  _whiteNoiseBuffer = buffer;
  _whiteNoiseBufferCtx = ctx;
  return buffer;
}

/**
 * Generate a leaky random walk: white noise integrated so its energy falls off with frequency
 * (brown noise).
 *
 * @param {number} length - Number of samples.
 * @returns {Float32Array}
 */
function generateBrownWalk(length) {
  const walk = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + BROWN_NOISE_STEP * (Math.random() * 2 - 1)) / (1 + BROWN_NOISE_STEP);
    walk[i] = last;
  }
  return walk;
}

/**
 * Scale samples in place so their RMS is `targetRms`. Silent input is left alone.
 *
 * @param {Float32Array} data
 * @param {number} targetRms
 */
function normalizeRms(data, targetRms) {
  let sumOfSquares = 0;
  for (let i = 0; i < data.length; i++) {
    sumOfSquares += data[i] * data[i];
  }
  const rms = Math.sqrt(sumOfSquares / data.length);
  if (rms === 0) return;
  const scale = targetRms / rms;
  for (let i = 0; i < data.length; i++) {
    data[i] *= scale;
  }
}

/**
 * Return a seamlessly looping brown-noise buffer for `ctx`, building it on first use.
 *
 * The walk runs past the end of the buffer, and the start of the buffer is crossfaded from
 * those extra samples into its own. The sample after the last one is then the walk's own next
 * sample, so the loop point is as smooth as anywhere else in the noise.
 *
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
function getBrownNoiseBuffer(ctx) {
  if (_brownNoiseBuffer && _brownNoiseBufferCtx === ctx) return _brownNoiseBuffer;
  const length = Math.ceil(ctx.sampleRate * BROWN_NOISE_BUFFER_S);
  const fade = Math.ceil(ctx.sampleRate * BROWN_NOISE_LOOP_FADE_S);
  const walk = generateBrownWalk(length + fade);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  data.set(walk.subarray(0, length));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = walk[length + i] * (1 - t) + walk[i] * t;
  }
  normalizeRms(data, BROWN_NOISE_RMS);
  _brownNoiseBuffer = buffer;
  _brownNoiseBufferCtx = ctx;
  return buffer;
}

// ── Timing ────────────────────────────────────────────────────────────────────

/**
 * Length of one syllable. It does not depend on the syllable: voiceless stops trade voiced
 * vowel for aspiration, as they do in speech.
 *
 * @param {number} transitionMs - Length of the formant transition.
 * @returns {number} Milliseconds from the burst to the end of the release.
 */
function getSyllableDurationMs(transitionMs) {
  return RELEASE_POINT_MS + transitionMs + STEADY_VOWEL_MS + RELEASE_MS;
}

/**
 * Check the timing part of a sequence request.
 *
 * @param {{ syllables: unknown, gapsMs: unknown, transitionMs: unknown }} options
 * @returns {boolean}
 */
function isValidTiming({ syllables, gapsMs, transitionMs }) {
  return Array.isArray(syllables)
    && syllables.length > 0
    && syllables.every((id) => Object.hasOwn(SYLLABLE_SPECS, id))
    && Array.isArray(gapsMs)
    && gapsMs.length === syllables.length - 1
    && gapsMs.every((gap) => Number.isFinite(gap) && gap >= 0)
    && Number.isFinite(transitionMs)
    && transitionMs > 0;
}

/**
 * Check a whole play request: its timing, one known voice per syllable, and an SNR that is
 * `null` (no noise) or a finite number.
 *
 * @param {{ syllables: unknown, voices: unknown, gapsMs: unknown, transitionMs: unknown,
 *   snrDb: unknown }} options
 * @returns {boolean}
 */
function isValidRequest(options) {
  const { syllables, voices, snrDb } = options;
  return isValidTiming(options)
    && Array.isArray(voices)
    && voices.length === syllables.length
    && voices.every((id) => Object.hasOwn(VOICE_PROFILES, id))
    && (snrDb === null || Number.isFinite(snrDb));
}

/**
 * Start time of each syllable, in ms from the start of the sequence.
 *
 * @param {string[]} syllables
 * @param {number[]} gapsMs - Silence after each syllable but the last.
 * @param {number} transitionMs
 * @returns {number[]}
 */
function getSyllableOffsetsMs(syllables, gapsMs, transitionMs) {
  const syllableMs = getSyllableDurationMs(transitionMs);
  const offsets = [];
  let t = NOISE_LEAD_MS;
  syllables.forEach((_, i) => {
    offsets.push(t);
    t += syllableMs + (gapsMs[i] ?? 0);
  });
  return offsets;
}

/**
 * Total length of a syllable sequence, including the lead-in and tail around the syllables.
 * Callers use it to know when the audio has ended. The voice and noise do not change it.
 *
 * @param {object} options
 * @param {string[]} options.syllables - Syllable IDs, in order.
 * @param {number[]} options.gapsMs - Silence after each syllable but the last.
 * @param {number} options.transitionMs - Formant transition length.
 * @returns {number} Milliseconds, or 0 when the options are invalid.
 */
export function getSyllableSequenceDurationMs({ syllables, gapsMs, transitionMs }) {
  if (!isValidTiming({ syllables, gapsMs, transitionMs })) return 0;
  const offsets = getSyllableOffsetsMs(syllables, gapsMs, transitionMs);
  return offsets[offsets.length - 1] + getSyllableDurationMs(transitionMs) + NOISE_TAIL_MS;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/**
 * Schedule a gain envelope that fades in at `start`, holds `level`, and fades out to zero at
 * `end`.
 *
 * @param {AudioParam} param - The gain parameter.
 * @param {number} level - Peak gain.
 * @param {number} start - Context time (s) the fade-in starts.
 * @param {number} end - Context time (s) the fade-out ends.
 * @param {number} fadeOutS - Fade-out length (s).
 * @param {number} [fadeInS] - Fade-in length (s). Defaults to the short click-free onset.
 */
function scheduleEnvelope(param, level, start, end, fadeOutS, fadeInS = ONSET_RAMP_MS / 1000) {
  const attackEnd = Math.min(start + fadeInS, end);
  const releaseStart = Math.max(end - fadeOutS, attackEnd);
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(level, attackEnd);
  param.setValueAtTime(level, releaseStart);
  param.linearRampToValueAtTime(0, end);
}

/**
 * Schedule one syllable on the audio graph.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} output - The speech bus.
 * @param {object} syllable
 * @param {string} syllable.id - One of SYLLABLE_IDS.
 * @param {string} syllable.voice - One of VOICE_IDS.
 * @param {number} syllable.startTime - Context time (s) of the burst.
 * @param {number} syllable.transitionMs - Formant transition length.
 * @returns {AudioScheduledSourceNode[]} The sources, so the sequence can stop them early.
 */
function scheduleSyllable(ctx, output, { id, voice, startTime, transitionMs }) {
  const { place, voiced, vowel } = SYLLABLE_SPECS[id];
  const { f0StartHz, f0EndHz, formantScale } = VOICE_PROFILES[voice];
  const { onsets, burstHz } = PLACE_CUES[place][vowel];
  const steady = VOWEL_FORMANTS[vowel];

  const burst = PLACE_BURSTS[place];
  const releasePoint = startTime + RELEASE_POINT_MS / 1000;
  const burstEnd = startTime + burst.durationMs / 1000;
  const transitionEnd = releasePoint + transitionMs / 1000;
  const voiceOnset = startTime + (voiced ? VOT_MS.voiced : VOT_MS.voiceless) / 1000;
  const end = startTime + getSyllableDurationMs(transitionMs) / 1000;

  // Formant filters: each glides from the consonant onset to the vowel.
  const formants = steady.map((steadyHz, i) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(steadyHz / FORMANT_BANDWIDTHS_HZ[i], startTime);
    filter.frequency.setValueAtTime(onsets[i] * formantScale, startTime);
    filter.frequency.setValueAtTime(onsets[i] * formantScale, releasePoint);
    filter.frequency.linearRampToValueAtTime(steadyHz * formantScale, transitionEnd);
    const level = ctx.createGain();
    level.gain.setValueAtTime(FORMANT_LEVELS[i], startTime);
    filter.connect(level);
    level.connect(output);
    return filter;
  });

  // Voicing: a sawtooth with a falling pitch, into every formant.
  const glottis = ctx.createOscillator();
  glottis.type = 'sawtooth';
  glottis.frequency.setValueAtTime(f0StartHz, voiceOnset);
  glottis.frequency.linearRampToValueAtTime(f0EndHz, end);
  const voiceGain = ctx.createGain();
  scheduleEnvelope(voiceGain.gain, VOICE_LEVEL, voiceOnset, end, RELEASE_MS / 1000);
  glottis.connect(voiceGain);
  formants.forEach((filter) => voiceGain.connect(filter));

  // Noise: the release burst, and for voiceless stops the aspiration before voicing.
  const noise = ctx.createBufferSource();
  noise.buffer = getWhiteNoiseBuffer(ctx);
  const burstFilter = ctx.createBiquadFilter();
  burstFilter.type = 'bandpass';
  burstFilter.frequency.setValueAtTime(burstHz * formantScale, startTime);
  burstFilter.Q.setValueAtTime(burst.q, startTime);
  const burstGain = ctx.createGain();
  const burstLevel = burst.level * (voiced ? 1 : VOICELESS_BURST_BOOST);
  burstGain.gain.setValueAtTime(0, startTime);
  burstGain.gain.linearRampToValueAtTime(burstLevel, startTime + BURST_ATTACK_MS / 1000);
  burstGain.gain.linearRampToValueAtTime(0, burstEnd);
  noise.connect(burstFilter);
  burstFilter.connect(burstGain);
  burstGain.connect(output);

  let noiseEnd = burstEnd;
  if (!voiced) {
    // Aspiration peaks just after the release and fades out as voicing fades in. It skips F1
    // ("F1 cutback"), a main cue for voicelessness.
    const aspirationEnd = voiceOnset + ASPIRATION_OVERLAP_MS / 1000;
    noiseEnd = Math.max(burstEnd, aspirationEnd);
    const aspiration = ctx.createGain();
    aspiration.gain.setValueAtTime(0, releasePoint);
    aspiration.gain.linearRampToValueAtTime(
      ASPIRATION_LEVEL,
      releasePoint + ASPIRATION_ATTACK_MS / 1000,
    );
    aspiration.gain.linearRampToValueAtTime(0, aspirationEnd);
    noise.connect(aspiration);
    aspiration.connect(formants[1]);
    aspiration.connect(formants[2]);
  }

  glottis.start(voiceOnset);
  glottis.stop(end);
  noise.start(startTime);
  noise.stop(noiseEnd);
  return [glottis, noise];
}

/**
 * Schedule looping brown background noise from `startTime` to `endTime`. Brown noise puts
 * most of its energy at low frequencies, so it sounds like a soft rumble rather than a hiss.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} output - The master bus.
 * @param {number} snrDb - Approximate speech-to-noise ratio in dB. Lower is noisier.
 * @param {number} startTime - Context time (s).
 * @param {number} endTime - Context time (s).
 * @returns {AudioScheduledSourceNode}
 */
function scheduleNoiseBed(ctx, output, snrDb, startTime, endTime) {
  const level = Math.min(NOISE_GAIN_AT_0_DB * 10 ** (-snrDb / 20), MAX_NOISE_GAIN);
  const source = ctx.createBufferSource();
  source.buffer = getBrownNoiseBuffer(ctx);
  source.loop = true;
  const gain = ctx.createGain();
  scheduleEnvelope(gain.gain, level, startTime, endTime, NOISE_FADE_MS / 1000,
    NOISE_FADE_MS / 1000);
  source.connect(gain);
  gain.connect(output);
  source.start(startTime);
  source.stop(endTime);
  return source;
}

/**
 * Build the function that stops a sequence early: it fades the master bus out and stops every
 * source. Calling it again does nothing.
 *
 * @param {AudioContext} ctx
 * @param {GainNode} master
 * @param {AudioScheduledSourceNode[]} sources
 * @returns {() => void}
 */
function createStopper(ctx, master, sources) {
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + STOP_RAMP_S);
      sources.forEach((source) => source.stop(now + STOP_RAMP_S));
    } catch {
      // Ignore audio errors in unsupported environments.
    }
  };
}

/** Stop function returned when nothing was scheduled. */
function noop() {}

/**
 * Play a sequence of syllables, optionally over background noise.
 *
 * Everything is scheduled on the audio clock and the function returns at once. Use
 * {@link getSyllableSequenceDurationMs} to know when the audio ends. Invalid options, or no
 * Web Audio, schedule nothing.
 *
 * @param {object} options
 * @param {string[]} options.syllables - Syllable IDs, in order.
 * @param {string[]} options.voices - One voice ID per syllable.
 * @param {number[]} options.gapsMs - Silence after each syllable but the last.
 * @param {number} options.transitionMs - Formant transition length (> 0).
 * @param {number|null} [options.snrDb=null] - Approximate speech-to-noise ratio in dB, or
 *   `null` for no background noise.
 * @returns {() => void} Stops the sequence early. Safe to call more than once or after the
 *   sequence has ended.
 */
export function playSyllableSequence({ syllables, voices, gapsMs, transitionMs, snrDb = null }) {
  if (!isValidRequest({ syllables, voices, gapsMs, transitionMs, snrDb })) return noop;

  const ctx = getAudioContext();
  if (!ctx) return noop;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(1, now);
    master.connect(ctx.destination);
    const speech = ctx.createGain();
    speech.gain.setValueAtTime(SPEECH_LEVEL, now);
    speech.connect(master);

    const offsets = getSyllableOffsetsMs(syllables, gapsMs, transitionMs);
    const sources = syllables.flatMap((id, i) => scheduleSyllable(ctx, speech, {
      id,
      voice: voices[i],
      startTime: now + offsets[i] / 1000,
      transitionMs,
    }));

    if (snrDb !== null) {
      const totalMs = getSyllableSequenceDurationMs({ syllables, gapsMs, transitionMs });
      sources.push(scheduleNoiseBed(ctx, master, snrDb, now, now + totalMs / 1000));
    }

    return createStopper(ctx, master, sources);
  } catch {
    // Ignore audio errors in unsupported environments.
    return noop;
  }
}
