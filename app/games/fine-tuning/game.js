/**
 * game.js — Pure game logic for Fine Tuning.
 *
 * Each trial plays a target syllable, then two syllables from a minimal pair (one matches the
 * target). The player says whether the first or the second matched. Difficulty follows an
 * adaptive staircase over LEVELS: the consonant transition shortens, the gap between the two
 * choices shrinks, background noise gets louder, and at the top levels in the Mixed voice
 * setting the choices are spoken in a different voice from the target.
 *
 * No DOM access — all logic is pure and fully unit-testable.
 *
 * @file Fine Tuning game logic module.
 */

import { updateAdaptiveDifficultyState } from '../../components/adaptiveDifficultyService.js';
import manifest from './manifest.json' with { type: 'json' };

/** Game ID, read from manifest.json, used for saved progress and the tutorial flag. */
export const GAME_ID = manifest.id;

/**
 * Minimal pairs the trials are drawn from: syllables that differ in one feature. The first
 * three of each vowel differ in place of articulation, the last two in voicing. Every ID is one
 * of `SYLLABLE_IDS` in `components/syllableService.js`.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const CONTRAST_PAIRS = Object.freeze([
  Object.freeze(['ba', 'da']),
  Object.freeze(['da', 'ga']),
  Object.freeze(['ba', 'ga']),
  Object.freeze(['ba', 'pa']),
  Object.freeze(['da', 'ta']),
  Object.freeze(['bi', 'di']),
  Object.freeze(['di', 'gi']),
  Object.freeze(['bi', 'gi']),
  Object.freeze(['bi', 'pi']),
  Object.freeze(['di', 'ti']),
]);

/**
 * The two answers: which choice matched the target. The order matches the answer buttons and
 * their number keys: `ANSWERS[0]` is key 1.
 *
 * @type {ReadonlyArray<string>}
 */
export const ANSWERS = Object.freeze(['first', 'second']);

/** Silence (ms) between the target and the first choice. */
export const TARGET_GAP_MS = 600;

/**
 * Voice settings the player can pick. `lower` and `higher` use one voice for every syllable;
 * `mixed` picks a voice for each trial and, at `crossVoice` levels, gives the choices the
 * other voice. `lower` and `higher` are the voice IDs in `components/syllableService.js`.
 *
 * @type {ReadonlyArray<string>}
 */
export const VOICE_SETTINGS = Object.freeze(['lower', 'higher', 'mixed']);

/** Voice setting for a new player: the most intelligible voice. */
export const DEFAULT_VOICE_SETTING = 'lower';

/** Consecutive correct responses needed to advance one level. */
export const CORRECT_STREAK_TO_ADVANCE = 3;

/** Consecutive wrong responses needed to trigger a level drop. */
export const WRONG_STREAK_TO_DROP = 3;

/** Number of levels to drop after a losing streak. */
export const LEVEL_DROP = 2;

/**
 * One difficulty level.
 *
 * @typedef {object} LevelConfig
 * @property {number} transitionMs - Length of the consonant's formant transition. Natural
 *   speech is about 40 ms; longer is "stretched" and easier.
 * @property {number} isiMs - Silence between the two choices.
 * @property {number|null} snrDb - Approximate speech-to-noise ratio of the background noise,
 *   or `null` for none. Lower is noisier.
 * @property {boolean} crossVoice - In the Mixed setting, speak the choices in the voice the
 *   target was not spoken in.
 */

/**
 * Levels from easiest (index 0) to hardest, in the three phases of the design: clean and
 * stretched, then natural speed, then noise, with compressed transitions and cross-voice
 * trials at the top.
 *
 * @type {ReadonlyArray<Readonly<LevelConfig>>}
 */
export const LEVELS = Object.freeze([
  { transitionMs: 100, isiMs: 500, snrDb: null, crossVoice: false },
  { transitionMs: 90, isiMs: 450, snrDb: null, crossVoice: false },
  { transitionMs: 80, isiMs: 400, snrDb: null, crossVoice: false },
  { transitionMs: 70, isiMs: 350, snrDb: null, crossVoice: false },
  { transitionMs: 60, isiMs: 300, snrDb: null, crossVoice: false },
  { transitionMs: 50, isiMs: 250, snrDb: null, crossVoice: false },
  { transitionMs: 40, isiMs: 200, snrDb: null, crossVoice: false },
  { transitionMs: 40, isiMs: 150, snrDb: 20, crossVoice: false },
  { transitionMs: 40, isiMs: 120, snrDb: 15, crossVoice: false },
  { transitionMs: 40, isiMs: 100, snrDb: 10, crossVoice: false },
  { transitionMs: 40, isiMs: 80, snrDb: 5, crossVoice: false },
  { transitionMs: 35, isiMs: 60, snrDb: 0, crossVoice: true },
  { transitionMs: 30, isiMs: 55, snrDb: -3, crossVoice: true },
  { transitionMs: 25, isiMs: 50, snrDb: -5, crossVoice: true },
].map((level) => Object.freeze(level)));

/**
 * One trial: the target, the two choices in playing order, the voice of each of the three
 * syllables, which choice matched, and the level timing and noise to play it with.
 *
 * @typedef {object} Trial
 * @property {string} target - Syllable ID of the target.
 * @property {string[]} choices - The two choice syllables, in playing order.
 * @property {string[]} voices - Voice IDs for the target, the first choice, and the second.
 * @property {string} answer - One of ANSWERS: which choice matched the target.
 * @property {number} transitionMs
 * @property {number} isiMs
 * @property {number|null} snrDb
 */

// ── Module-level state (reset by initGame) ────────────────────────────────────

/** @type {boolean} */
let running = false;

/** @type {number|null} */
let startTimeMs = null;

/** @type {number} Zero-based index into LEVELS. */
let currentLevel = 0;

/** @type {number} */
let score = 0;

/** @type {number} */
let trialsCompleted = 0;

/** @type {number} */
let consecutiveCorrect = 0;

/** @type {number} */
let consecutiveWrong = 0;

/**
 * Session history of transition lengths in ms, one entry per completed trial.
 * Used to render the in-game speed trend chart.
 * @type {number[]}
 */
let speedHistory = [];

/**
 * The player's voice setting. A preference, so initGame() leaves it alone.
 * @type {string}
 */
let voiceSetting = DEFAULT_VOICE_SETTING;

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Initialize or reset all session state. The voice setting is kept.
 * Must be called before startGame().
 */
export function initGame() {
  running = false;
  startTimeMs = null;
  currentLevel = 0;
  score = 0;
  trialsCompleted = 0;
  consecutiveCorrect = 0;
  consecutiveWrong = 0;
  speedHistory = [];
}

/**
 * Start the game timer.
 *
 * @throws {Error} If the game is already running.
 */
export function startGame() {
  if (running) {
    throw new Error('Game is already running.');
  }
  running = true;
  startTimeMs = Date.now();
}

/**
 * Stop the game and return a summary result.
 *
 * @returns {{ score: number, level: number, trialsCompleted: number, duration: number }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTimeMs === null ? 0 : Date.now() - startTimeMs;
  return {
    score,
    level: currentLevel,
    trialsCompleted,
    duration,
  };
}

/**
 * Pick one item of `items` at random.
 *
 * @template T
 * @param {ReadonlyArray<T>} items
 * @returns {T}
 */
function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Choose the voices for a trial's target, first choice, and second choice.
 *
 * @param {string} setting - One of VOICE_SETTINGS.
 * @param {boolean} crossVoice - Whether the level asks for cross-voice trials.
 * @returns {string[]} Three voice IDs.
 */
function pickVoices(setting, crossVoice) {
  if (setting !== 'mixed') return [setting, setting, setting];
  const targetVoice = pickRandom(['lower', 'higher']);
  if (!crossVoice) return [targetVoice, targetVoice, targetVoice];
  const choiceVoice = targetVoice === 'lower' ? 'higher' : 'lower';
  return [targetVoice, choiceVoice, choiceVoice];
}

/**
 * Build a trial at a level: a random minimal pair, a random target from it, and the match in
 * a random position. Changes no game state.
 *
 * @param {LevelConfig} levelConfig
 * @param {string} setting - One of VOICE_SETTINGS.
 * @returns {Trial}
 */
export function buildTrial({ transitionMs, isiMs, snrDb, crossVoice }, setting) {
  const pair = pickRandom(CONTRAST_PAIRS);
  const target = pickRandom(pair);
  const foil = target === pair[0] ? pair[1] : pair[0];
  const answer = pickRandom(ANSWERS);
  return {
    target,
    choices: answer === 'first' ? [target, foil] : [foil, target],
    voices: pickVoices(setting, crossVoice),
    answer,
    transitionMs,
    isiMs,
    snrDb,
  };
}

/**
 * Build the next session trial at the current level and voice setting.
 *
 * @returns {Trial}
 */
export function pickTrial() {
  return buildTrial(LEVELS[currentLevel], voiceSetting);
}

/**
 * Build a tutorial practice trial: the player's voice setting at the easiest level. It ignores
 * the current level and changes no game state.
 *
 * @returns {Trial}
 */
export function generatePracticeTrial() {
  return buildTrial(LEVELS[0], voiceSetting);
}

/**
 * Convert an answer to the label the player sees, e.g. 'first' → 'First'.
 *
 * @param {string} answer - One of ANSWERS.
 * @returns {string}
 */
export function formatAnswer(answer) {
  return answer.charAt(0).toUpperCase() + answer.slice(1);
}

/**
 * Set the voice setting. Unknown values are ignored.
 *
 * @param {string} setting - One of VOICE_SETTINGS.
 * @returns {boolean} Whether the setting was applied.
 */
export function setVoiceSetting(setting) {
  if (!VOICE_SETTINGS.includes(setting)) return false;
  voiceSetting = setting;
  return true;
}

/**
 * Get the voice setting.
 *
 * @returns {string} One of VOICE_SETTINGS.
 */
export function getVoiceSetting() {
  return voiceSetting;
}

/**
 * Record the outcome of one trial and apply the adaptive staircase rules.
 *
 * - 3 consecutive correct → advance 1 level, reset both streaks.
 * - 3 consecutive wrong   → drop 2 levels, reset both streaks.
 *
 * @param {{ success: boolean }} outcome
 * @returns {{ level: number, consecutiveCorrect: number, consecutiveWrong: number }}
 */
export function recordTrial({ success }) {
  trialsCompleted += 1;

  if (success) {
    score += 1;
  }

  const staircaseState = updateAdaptiveDifficultyState({
    value: currentLevel,
    wasCorrect: Boolean(success),
    consecutiveCorrect,
    consecutiveWrong,
    increaseAfter: CORRECT_STREAK_TO_ADVANCE,
    decreaseAfter: WRONG_STREAK_TO_DROP,
    harderStep: 1,
    easierStep: -LEVEL_DROP,
    minValue: 0,
    maxValue: LEVELS.length - 1,
  });

  currentLevel = staircaseState.value;
  consecutiveCorrect = staircaseState.consecutiveCorrect;
  consecutiveWrong = staircaseState.consecutiveWrong;

  speedHistory.push(LEVELS[currentLevel].transitionMs);

  return { level: currentLevel, consecutiveCorrect, consecutiveWrong };
}

/**
 * Get the current difficulty level index (zero-based).
 *
 * @returns {number}
 */
export function getCurrentLevel() {
  return currentLevel;
}

/**
 * Get the configuration object for the current difficulty level.
 *
 * @returns {Readonly<LevelConfig>}
 */
export function getCurrentLevelConfig() {
  return LEVELS[currentLevel];
}

/**
 * Get the current player score (number of correct responses).
 *
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Get the total number of completed trials.
 *
 * @returns {number}
 */
export function getTrialsCompleted() {
  return trialsCompleted;
}

/**
 * Get the current consecutive correct streak.
 *
 * @returns {number}
 */
export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

/**
 * Get the current consecutive wrong streak.
 *
 * @returns {number}
 */
export function getConsecutiveWrong() {
  return consecutiveWrong;
}

/**
 * Get the current running state.
 *
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}

/**
 * Get the session speed history as an array of transition lengths in ms.
 * One entry is appended per completed trial after any staircase adjustment.
 *
 * @returns {number[]}
 */
export function getSpeedHistory() {
  return [...speedHistory];
}
