/**
 * game.js — Pure game logic for Directional Processing.
 *
 * Implements the adaptive staircase used for the directional Gabor motion
 * discrimination task. Three consecutive correct responses advance one level;
 * three consecutive wrong responses drop two levels.
 *
 * No DOM access — all logic is pure and fully unit-testable.
 *
 * @file Directional Processing game logic module.
 */

/** All valid motion directions for trial generation. */
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

/** Consecutive correct responses needed to advance one level. */
export const CORRECT_STREAK_TO_ADVANCE = 3;

/** Consecutive wrong responses needed to trigger a level drop. */
export const WRONG_STREAK_TO_DROP = 3;

/** Number of levels to drop after a losing streak. */
export const LEVEL_DROP = 2;

/**
 * Level configurations ordered from easiest (index 0) to hardest (last index).
 *
 * Each level reduces display duration and/or contrast to increase difficulty.
 * Research basis: decreasing contrast forces the visual cortex to "overclock"
 * to detect the motion, matching the ACTIVE study Speed of Processing Training
 * methodology (Merzenich & Mahncke).
 *
 * @type {Array<{ displayDurationMs: number, contrast: number }>}
 */
export const LEVELS = [
  { displayDurationMs: 500, contrast: 1.00 },
  { displayDurationMs: 400, contrast: 1.00 },
  { displayDurationMs: 300, contrast: 1.00 },
  { displayDurationMs: 250, contrast: 0.90 },
  { displayDurationMs: 200, contrast: 0.80 },
  { displayDurationMs: 150, contrast: 0.70 },
  { displayDurationMs: 100, contrast: 0.60 },
  { displayDurationMs:  80, contrast: 0.50 },
  { displayDurationMs:  60, contrast: 0.40 },
  { displayDurationMs:  40, contrast: 0.30 },
];

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
 * Session history of display durations in ms, one entry per completed trial.
 * Used to render the in-game speed trend chart.
 * @type {number[]}
 */
let speedHistory = [];

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Initialize or reset all game state.
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
 * Pick a random direction for the next trial.
 *
 * @returns {string} One of 'up', 'down', 'left', 'right'.
 */
export function pickDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
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
    consecutiveCorrect += 1;
    consecutiveWrong = 0;

    if (consecutiveCorrect >= CORRECT_STREAK_TO_ADVANCE) {
      currentLevel = Math.min(currentLevel + 1, LEVELS.length - 1);
      consecutiveCorrect = 0;
    }
  } else {
    consecutiveWrong += 1;
    consecutiveCorrect = 0;

    if (consecutiveWrong >= WRONG_STREAK_TO_DROP) {
      currentLevel = Math.max(currentLevel - LEVEL_DROP, 0);
      consecutiveWrong = 0;
    }
  }

  speedHistory.push(LEVELS[currentLevel].displayDurationMs);

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
 * @returns {{ displayDurationMs: number, contrast: number }}
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
 * Get the session speed history as an array of display durations in ms.
 * One entry is appended per completed trial after any staircase adjustment.
 *
 * @returns {number[]}
 */
export function getSpeedHistory() {
  return [...speedHistory];
}
