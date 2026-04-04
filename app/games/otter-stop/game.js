
/**
 * game.js — Pure game logic for Otter Stop!
 *
 * Implements a go/no-go rapid-response task. Three "go" images and one
 * "no-go" image cycle in rapid succession. The player must press Space for
 * every go image and withhold on the no-go image. Speed and accuracy drive
 * an adaptive staircase that raises or lowers the display interval.
 *
 * No DOM access — all logic is pure and unit-testable.
 *
 * @file Otter Stop! game logic module.
 */

/** Keys for each image asset (maps to files in the images/ directory). */
export const IMAGE_KEYS = ['go-1', 'go-2', 'go-3', 'no-go'];

/** The key that identifies the no-go stimulus. */
export const NO_GO_KEY = 'no-go';

/** Display interval at level 0 (milliseconds). */
const BASE_INTERVAL_MS = 700;

/** How much the interval shrinks per level (milliseconds). */
const INTERVAL_STEP_MS = 50;

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

/** Consecutive correct-response streak. */
let consecutiveCorrect = 0;

/** Consecutive wrong-response streak. */
let consecutiveWrong = 0;

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
 *             trialsCompleted: number, duration: number, bestScore: number }}
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
    duration,
    bestScore: sessionBestScore,
  };
}

// ── Trial helpers ─────────────────────────────────────────────────────────────

/**
 * Pick the next image at random from the four available stimuli.
 * The four images are equally weighted, giving a 25% no-go rate.
 *
 * @returns {{ imageKey: string, isNoGo: boolean }}
 */
export function pickNextImage() {
  const idx = Math.floor(Math.random() * IMAGE_KEYS.length);
  const imageKey = IMAGE_KEYS[idx];
  return { imageKey, isNoGo: imageKey === NO_GO_KEY };
}

/**
 * Record the outcome of a completed trial and apply the adaptive staircase.
 *
 * Correct responses:
 *   - Go image + Space pressed  → score +1, streak maintained
 *   - No-go image + no press   → score +1, streak maintained
 *
 * Wrong responses:
 *   - Go image + no press      → miss +1, streak broken
 *   - No-go image + Space pressed → noGoHit +1, streak broken
 *
 * Staircase rules:
 *   - 3 consecutive correct → level +1, streak reset
 *   - 3 consecutive wrong   → level −2 (min 0), streak reset
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
    consecutiveCorrect += 1;
    consecutiveWrong = 0;
  } else {
    if (isNoGo) {
      noGoHits += 1;
    } else {
      misses += 1;
    }
    consecutiveCorrect = 0;
    consecutiveWrong += 1;
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

  return correct ? 'correct' : 'wrong';
}

// ── Difficulty ────────────────────────────────────────────────────────────────

/**
 * Return the display interval in milliseconds for the current level.
 * Starts at 700 ms and decreases by 50 ms per level, with a floor of 150 ms.
 *
 * @returns {number} Display interval in milliseconds.
 */
export function getCurrentIntervalMs() {
  return Math.max(BASE_INTERVAL_MS - level * INTERVAL_STEP_MS, MIN_INTERVAL_MS);
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
 * Return whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
