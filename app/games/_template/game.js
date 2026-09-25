/**
 * game.js — Pure game logic for the template game.
 *
 * Holds session state, scoring, and the adaptive staircase. Three consecutive
 * correct responses advance one level; three consecutive wrong responses drop
 * two levels.
 *
 * No DOM access — all logic is pure and fully unit-testable.
 *
 * @file Template game logic module.
 */

import { updateAdaptiveDifficultyState } from '../../components/adaptiveDifficultyService.js';

/** Consecutive correct responses needed to advance one level. */
export const CORRECT_STREAK_TO_ADVANCE = 3;

/** Consecutive wrong responses needed to trigger a level drop. */
export const WRONG_STREAK_TO_DROP = 3;

/** Number of levels to drop after a losing streak. */
export const LEVEL_DROP = 2;

/**
 * Level configurations ordered from easiest (index 0) to hardest (last index).
 * Replace `displayTimeMs` with whatever your game's speed metric is.
 *
 * @type {Array<{ displayTimeMs: number }>}
 */
export const LEVELS = [
  { displayTimeMs: 500 },
  { displayTimeMs: 400 },
  { displayTimeMs: 300 },
  { displayTimeMs: 200 },
  { displayTimeMs: 100 },
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
 * Session history of the speed metric, one entry per completed trial.
 * Used to render the in-game trend chart.
 * @type {number[]}
 */
let speedHistory = [];

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Initialize or reset all game state.
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
 * Start a session.
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
 * Stop the session and return a summary result.
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
 * Record the outcome of one trial and apply the adaptive staircase rules.
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

  speedHistory.push(LEVELS[currentLevel].displayTimeMs);

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
 * @returns {{ displayTimeMs: number }}
 */
export function getCurrentLevelConfig() {
  return LEVELS[currentLevel];
}

/**
 * Get the current score (number of correct responses).
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
 * Get the current running state.
 *
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}

/**
 * Get a copy of the session speed history.
 *
 * @returns {number[]}
 */
export function getSpeedHistory() {
  return [...speedHistory];
}
