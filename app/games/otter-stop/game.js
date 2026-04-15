
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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

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
 *             trialsCompleted: number, level: number, duration: number,
 *             bestScore: number }}
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
    duration,
    bestScore: sessionBestScore,
  };
}

// ── Trial helpers ─────────────────────────────────────────────────────────────

/**
 * Pick the next image to display.
 *
 * If the previous trial ended with a wrong outcome (`forceGoNext` is true),
 * the next trial is guaranteed to be a go image so the player always gets a
 * fair chance to recover before facing another no-go stimulus.
 *
 * Otherwise an image is chosen at random from all four stimuli, giving a 25%
 * no-go rate.
 *
 * @returns {{ imageKey: string, isNoGo: boolean }}
 */
export function pickNextImage() {
  if (forceGoNext) {
    forceGoNext = false;
    const idx = Math.floor(Math.random() * GO_KEYS.length);
    return { imageKey: GO_KEYS[idx], isNoGo: false };
  }
  const idx = Math.floor(Math.random() * IMAGE_KEYS.length);
  const imageKey = IMAGE_KEYS[idx];
  return { imageKey, isNoGo: imageKey === NO_GO_KEY };
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
 *   - 3 consecutive wrong   → level −2 (min 0), streak reset
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

  if (correct) {
    score += 1;
    consecutiveWrong = 0;
    // Only correct no-go inhibitions advance the level-up streak.
    if (isNoGo) {
      consecutiveCorrect += 1;
    }
  } else {
    if (isNoGo) {
      noGoHits += 1;
    } else {
      misses += 1;
    }
    consecutiveCorrect = 0;
    consecutiveWrong += 1;
    forceGoNext = true;
  }

  // Apply staircase adjustments.
  if (consecutiveCorrect >= CORRECT_STREAK_TO_ADVANCE) {
    level += 1;
    consecutiveCorrect = 0;
  }
  if (consecutiveWrong >= WRONG_STREAK_TO_DROP) {
    level = Math.max(0, level - LEVEL_DROP);
    consecutiveWrong = 0;
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
