
/**
 * game.js — Pure game logic for Otter Stop!
 *
 * Implements a go/no-go rapid-response task. A set of "go" images and one
 * "no-go" image cycle in rapid succession. The player must press Space for
 * every go image and withhold on the no-go image. Speed and accuracy drive
 * an adaptive staircase that raises or lowers the display interval.
 *
 * Go image filenames are loaded at runtime from the images/go/ directory and
 * supplied via setGoKeys(). Sensible defaults are used until then.
 *
 * No DOM access — all logic is pure and unit-testable.
 *
 * @file Otter Stop! game logic module.
 */

import { updateAdaptiveDifficultyState } from '../../components/adaptiveDifficultyService.js';

/** The key that identifies the no-go stimulus. */
export const NO_GO_KEY = 'no-go';

/**
 * Filenames (including extension) for go stimuli, loaded from images/go/.
 * Defaults are used until setGoKeys() is called by the controller.
 *
 * @type {string[]}
 */
export let GO_KEYS = ['go-1.png', 'go-2.png', 'go-3.png'];

/**
 * All stimulus keys: go filenames plus the no-go key.
 * Updated automatically by setGoKeys().
 *
 * @type {string[]}
 */
export let IMAGE_KEYS = [...GO_KEYS, NO_GO_KEY];

/**
 * Set the go image keys from the scanned images/go/ directory.
 * Updates both GO_KEYS and IMAGE_KEYS to reflect the new set.
 *
 * @param {string[]} keys - Filenames (with extension) for go images, e.g. ['go-1.png'].
 */
export function setGoKeys(keys) {
  const goKeysCopy = keys.slice();
  GO_KEYS = goKeysCopy;
  IMAGE_KEYS = [...goKeysCopy, NO_GO_KEY];
}

/** Display interval at level 0 (milliseconds). */
const BASE_INTERVAL_MS = 1500;

/**
 * Geometric decay factor applied to the display interval per level.
 * Each level multiplies the current interval by this rate, producing large
 * speed jumps at low levels that taper off as the game becomes faster.
 */
const INTERVAL_DECAY_RATE = 0.88;

/** Minimum allowed display interval (milliseconds). */
const MIN_INTERVAL_MS = 150;

/** Number of consecutive correct responses required to advance one level. */
const CORRECT_STREAK_TO_ADVANCE = 3;

/** Number of consecutive wrong responses required to drop two levels. */
const WRONG_STREAK_TO_DROP = 3;

/** How many levels to drop after a losing streak. */
const LEVEL_DROP = 2;

/** Maximum number of go images (otters) in a sequence at level 0. */
const BASE_MAX_SEQUENCE_LENGTH = 5;

/**
 * Minimum number of go images (otters) in a sequence at any level.
 * A value of 0 means the fish may appear immediately with no preceding otters.
 */
const MIN_SEQUENCE_LENGTH = 0;

// ── Module-level session-best trackers (persist across initGame calls) ────────

/** Highest score achieved this session. */
let sessionBestScore = 0;

// ── Per-game state (reset by initGame) ───────────────────────────────────────

/** Current player score (correct responses). */
let score = 0;

/** Number of no-go images the player accidentally responded to (false alarms). */
let noGoHits = 0;

/** Number of go images the player failed to respond to (misses). */
let misses = 0;

/** Total number of trials completed this game. */
let trialsCompleted = 0;

/** Whether the game is currently running. */
let running = false;

/** Timestamp (ms) when the game started, used to compute duration. */
let startTime = null;

/** Current difficulty level. */
let level = 0;

/** Consecutive correct-response streak (counts correct no-go inhibitions only). */
let consecutiveCorrect = 0;

/** Consecutive wrong-response streak. */
let consecutiveWrong = 0;

/**
 * Session history of interval values in ms, one entry per completed trial.
 * Used to render the in-game speed trend chart.
 * @type {number[]}
 */
let speedHistory = [];

/**
 * Whether the next trial must be a go image (forced after any wrong outcome).
 * Ensures the player gets a fair chance to respond correctly before facing
 * another no-go stimulus.
 */
let forceGoNext = false;

/** Current position within the go-image sequence (go images shown since last fish). */
let sequencePosition = 0;

/**
 * Total go images in the current sequence before the next no-go (fish).
 * Regenerated at the start of each new sequence; clamped down when the level drops.
 */
let currentSequenceLength = BASE_MAX_SEQUENCE_LENGTH;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Generate a random sequence length between MIN_SEQUENCE_LENGTH and
 * (BASE_MAX_SEQUENCE_LENGTH + level) inclusive.
 * A result of 0 means the fish appears as the very next stimulus.
 *
 * @returns {number} A random integer in the range
 *   [MIN_SEQUENCE_LENGTH, BASE_MAX_SEQUENCE_LENGTH + level].
 */
function generateSequenceLength() {
  const max = BASE_MAX_SEQUENCE_LENGTH + level;
  return Math.floor(Math.random() * (max - MIN_SEQUENCE_LENGTH + 1)) + MIN_SEQUENCE_LENGTH;
}

/**
 * Initialize (or reset) all per-game state.
 * Session-best trackers are intentionally NOT reset here.
 */
export function initGame() {
  score = 0;
  noGoHits = 0;
  misses = 0;
  trialsCompleted = 0;
  running = false;
  startTime = null;
  level = 0;
  consecutiveCorrect = 0;
  consecutiveWrong = 0;
  forceGoNext = false;
  speedHistory = [];
  sequencePosition = 0;
  currentSequenceLength = generateSequenceLength();
}

/**
 * Start the game and begin tracking time.
 * @throws {Error} If the game is already running.
 */
export function startGame() {
  if (running) {
    throw new Error('Game is already running.');
  }
  running = true;
  startTime = Date.now();
}

/**
 * Stop the game and return the final results.
 * @returns {{ score: number, noGoHits: number, misses: number,
 *             trialsCompleted: number, level: number, maxSequenceLength: number,
 *             duration: number, bestScore: number }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTime !== null ? Date.now() - startTime : 0;

  if (score > sessionBestScore) {
    sessionBestScore = score;
  }

  return {
    score,
    noGoHits,
    misses,
    trialsCompleted,
    level,
    maxSequenceLength: BASE_MAX_SEQUENCE_LENGTH + level,
    duration,
    bestScore: sessionBestScore,
  };
}

// ── Trial helpers ─────────────────────────────────────────────────────────────

/**
 * Pick the next image to display.
 *
 * Images are presented as sequences: a run of go (otter) images followed by
 * exactly one no-go (fish) image. The length of each sequence is sampled
 * randomly from [MIN_SEQUENCE_LENGTH, BASE_MAX_SEQUENCE_LENGTH + level]; a
 * length of 0 means the fish appears immediately with no preceding otters.
 * When the level drops, `currentSequenceLength` is clamped to the new maximum
 * so the player is not exposed to sequences that are too long for the reduced
 * difficulty.
 *
 * If the previous trial ended with a wrong outcome (`forceGoNext` is true),
 * the next trial is guaranteed to be a go image so the player always gets a
 * fair chance to recover before facing another no-go stimulus. The forced go
 * advances the sequence position normally.
 *
 * @returns {{ imageKey: string, isNoGo: boolean }}
 */
export function pickNextImage() {
  if (forceGoNext) {
    forceGoNext = false;
    sequencePosition += 1;
    const idx = Math.floor(Math.random() * GO_KEYS.length);
    return { imageKey: GO_KEYS[idx], isNoGo: false };
  }
  if (sequencePosition >= currentSequenceLength) {
    sequencePosition = 0;
    currentSequenceLength = generateSequenceLength();
    return { imageKey: NO_GO_KEY, isNoGo: true };
  }
  sequencePosition += 1;
  const idx = Math.floor(Math.random() * GO_KEYS.length);
  return { imageKey: GO_KEYS[idx], isNoGo: false };
}

/**
 * Record the outcome of a completed trial and apply the adaptive staircase.
 *
 * Correct responses:
 *   - Go image + Space pressed  → score +1, wrong streak reset
 *   - No-go image + no press   → score +1, streak +1 (only no-go inhibitions
 *                                 count toward level advancement)
 *
 * Wrong responses:
 *   - Go image + no press      → miss +1, streak broken, forceGoNext set
 *   - No-go image + Space pressed → noGoHit +1, streak broken, forceGoNext set
 *
 * Staircase rules:
 *   - 3 consecutive correct no-go inhibitions → level +1, streak reset
 *   - 3 consecutive wrong responses   → level −2 (min 0), streak reset
 *
 * After any wrong outcome, `forceGoNext` is set so that `pickNextImage()` will
 * guarantee a go stimulus on the very next trial.
 *
 * @param {boolean} isNoGo - Whether the current stimulus was the no-go image.
 * @param {boolean} spacePressed - Whether the player pressed Space this trial.
 * @returns {'correct' | 'wrong'} The outcome of the trial.
 */
export function recordResponse(isNoGo, spacePressed) {
  trialsCompleted += 1;

  const correct = isNoGo ? !spacePressed : spacePressed;

  let staircaseState;

  if (correct) {
    score += 1;
    if (isNoGo) {
      staircaseState = updateAdaptiveDifficultyState({
        value: level,
        wasCorrect: true,
        consecutiveCorrect,
        consecutiveWrong,
        increaseAfter: CORRECT_STREAK_TO_ADVANCE,
        decreaseAfter: WRONG_STREAK_TO_DROP,
        harderStep: 1,
        easierStep: -LEVEL_DROP,
        minValue: 0,
        maxValue: Number.POSITIVE_INFINITY,
      });
    } else {
      staircaseState = {
        value: level,
        consecutiveCorrect,
        consecutiveWrong,
      };
    }
  } else {
    if (isNoGo) {
      noGoHits += 1;
    } else {
      misses += 1;
    }
    forceGoNext = true;
    staircaseState = updateAdaptiveDifficultyState({
      value: level,
      wasCorrect: false,
      consecutiveCorrect,
      consecutiveWrong,
      increaseAfter: CORRECT_STREAK_TO_ADVANCE,
      decreaseAfter: WRONG_STREAK_TO_DROP,
      harderStep: 1,
      easierStep: -LEVEL_DROP,
      minValue: 0,
      maxValue: Number.POSITIVE_INFINITY,
    });
  }

  level = staircaseState.value;
  consecutiveCorrect = staircaseState.consecutiveCorrect;
  consecutiveWrong = staircaseState.consecutiveWrong;

  // If the level dropped, cap the in-flight sequence length to the new maximum
  // so the player is not exposed to sequences that are too long for their level.
  const newMax = BASE_MAX_SEQUENCE_LENGTH + level;
  if (currentSequenceLength > newMax) {
    currentSequenceLength = newMax;
  }

  speedHistory.push(getCurrentIntervalMs());

  return correct ? 'correct' : 'wrong';
}

// ── Difficulty ────────────────────────────────────────────────────────────────

/**
 * Return the display interval in milliseconds for the current level.
 * Uses geometric decay: each level multiplies the base interval by
 * INTERVAL_DECAY_RATE, producing large speed jumps early and increasingly
 * smaller increments as the game gets faster. Floored at MIN_INTERVAL_MS.
 *
 * @returns {number} Display interval in milliseconds.
 */
export function getCurrentIntervalMs() {
  return Math.max(Math.round(BASE_INTERVAL_MS * (INTERVAL_DECAY_RATE ** level)), MIN_INTERVAL_MS);
}

// ── Getters ───────────────────────────────────────────────────────────────────

/**
 * Return the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Return the number of false alarms (no-go images incorrectly responded to).
 * @returns {number}
 */
export function getNoGoHits() {
  return noGoHits;
}

/**
 * Return the number of misses (go images not responded to in time).
 * @returns {number}
 */
export function getMisses() {
  return misses;
}

/**
 * Return the total number of trials completed.
 * @returns {number}
 */
export function getTrialsCompleted() {
  return trialsCompleted;
}

/**
 * Return the current difficulty level.
 * @returns {number}
 */
export function getLevel() {
  return level;
}

/**
 * Return the current consecutive-correct streak.
 * @returns {number}
 */
export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

/**
 * Return the current consecutive-wrong streak.
 * @returns {number}
 */
export function getConsecutiveWrong() {
  return consecutiveWrong;
}

/**
 * Return the best score achieved this session.
 * @returns {number}
 */
export function getSessionBestScore() {
  return sessionBestScore;
}

/**
 * Return whether the next trial is forced to be a go image.
 * @returns {boolean}
 */
export function getForceGoNext() {
  return forceGoNext;
}

/**
 * Return the maximum sequence length (go images before fish) for the current level.
 * At level 0 this equals BASE_MAX_SEQUENCE_LENGTH (5); it increases by 1 per level.
 *
 * @returns {number}
 */
export function getMaxSequenceLength() {
  return BASE_MAX_SEQUENCE_LENGTH + level;
}

/**
 * Return the number of go images in the current sequence before the next fish appears.
 * This value is sampled randomly at the start of each sequence (in the range
 * [MIN_SEQUENCE_LENGTH, BASE_MAX_SEQUENCE_LENGTH + level]) and is clamped down
 * immediately whenever the level drops.
 *
 * @returns {number}
 */
export function getCurrentSequenceLength() {
  return currentSequenceLength;
}

/**
 * Return whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}

/**
 * Get the session speed history as an array of interval values in ms.
 * One entry is appended per completed trial after any staircase adjustment.
 * @returns {number[]}
 */
export function getSpeedHistory() {
  return [...speedHistory];
}
