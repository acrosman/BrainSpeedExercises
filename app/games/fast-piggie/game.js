
/**
 * game.js — Pure game logic for Fast Piggie.
 *
 * Contains all state and logic for the Fast Piggie game, with no DOM access.
 * All functions are pure and easily unit-testable.
 *
 * @file Fast Piggie game logic module.
 */

let score = 0;
let roundsPlayed = 0;
let running = false;
let startTime = null;
let level = 0;
let consecutiveCorrect = 0;

/**
 * Initialise (or reset) all game state.
 */
export function initGame() {
  score = 0;
  roundsPlayed = 0;
  running = false;
  startTime = null;
  level = 0;
  consecutiveCorrect = 0;
}

/**
 * Start the game and timer.
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
 * @returns {{ score: number, roundsPlayed: number, duration: number }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }
  running = false;
  const duration = startTime !== null ? Date.now() - startTime : 0;
  return {
    score,
    roundsPlayed,
    duration,
  };
}

/**
 * Generate a new round's parameters based on the current level.
 * @param {number} currentLevel
 * @returns {{ wedgeCount: number, imageCount: number,
 *  displayDurationMs: number, outlierWedgeIndex: number }}
 */
export function generateRound(currentLevel) {
  const imageCount = Math.min(3 + currentLevel, 14);
  const wedgeCount = Math.min(Math.max(6, imageCount), 14);
  const displayDurationMs = Math.max(1200 - currentLevel * 200, 50);
  const outlierWedgeIndex = Math.floor(Math.random() * imageCount);
  return {
    wedgeCount,
    imageCount,
    displayDurationMs,
    outlierWedgeIndex,
  };
}

/**
 * Check if the clicked wedge is the outlier.
 * @param {number} clickedWedge
 * @param {number} outlierWedge
 * @returns {boolean}
 */
export function checkAnswer(clickedWedge, outlierWedge) {
  return clickedWedge === outlierWedge;
}

/**
 * Calculate which wedge was clicked based on coordinates.
 * @param {number} clickX
 * @param {number} clickY
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} radius
 * @param {number} wedgeCount
 * @returns {number}
 */
export function calculateWedgeIndex(clickX, clickY, centerX, centerY, radius, wedgeCount) {
  const dx = clickX - centerX;
  const dy = clickY - centerY;
  if (Math.sqrt(dx * dx + dy * dy) > radius) {
    return -1;
  }
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  return Math.floor(angle / (2 * Math.PI / wedgeCount));
}

/**
 * Add a correct answer to the score and update level if needed.
 */
export function addScore() {
  score += 1;
  roundsPlayed += 1;
  consecutiveCorrect += 1;
  if (consecutiveCorrect >= 3) {
    level += 1;
    consecutiveCorrect = 0;
  }
}

/**
 * Record a missed answer and reset consecutive correct count.
 */
export function addMiss() {
  roundsPlayed += 1;
  consecutiveCorrect = 0;
}

/**
 * Get the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Get the number of rounds played.
 * @returns {number}
 */
export function getRoundsPlayed() {
  return roundsPlayed;
}

/**
 * Get the current level.
 * @returns {number}
 */
export function getLevel() {
  return level;
}

/**
 * Get the number of consecutive correct answers.
 * @returns {number}
 */
export function getConsecutiveCorrect() {
  return consecutiveCorrect;
}

/**
 * Get the current difficulty parameters.
 * @returns {{ wedgeCount: number, imageCount: number, displayDurationMs: number }}
 */
export function getCurrentDifficulty() {
  const imageCount = Math.min(3 + level, 14);
  const wedgeCount = Math.min(Math.max(6, imageCount), 14);
  const displayDurationMs = Math.max(1200 - level * 200, 50);
  return { wedgeCount, imageCount, displayDurationMs };
}

/**
 * Check if the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
