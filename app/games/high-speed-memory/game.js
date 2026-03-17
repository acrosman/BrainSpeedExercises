/**
 * game.js — Pure game logic for High Speed Memory.
 *
 * Contains all state and logic for the High Speed Memory game, with no DOM access.
 * All functions are easily unit-testable.
 *
 * @file High Speed Memory game logic module.
 */

/** Symbols used for card faces. Must have at least MAX_PAIRS entries. */
export const SYMBOLS = [
  '★', '♠', '♥', '♦', '♣', '☀', '☽', '✿', '♪', '✈', '⚽', '🎯', '🔔', '🌊', '🍀', '💎',
];

/**
 * Grid configurations by level: [rows, cols].
 * Each entry must produce an even number of cards (rows * cols must be even).
 */
export const GRID_CONFIGS = [
  [2, 2],
  [2, 3],
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 5],
  [4, 6],
];

/** Initial display duration in milliseconds for level 0. */
export const BASE_DISPLAY_MS = 3000;

/** Amount to reduce display duration each level (ms). */
export const DISPLAY_DECREMENT_MS = 200;

/** Minimum display duration regardless of level (ms). */
export const MIN_DISPLAY_MS = 800;

/** @type {number} */
let score = 0;

/** @type {number} */
let level = 0;

/** @type {number} */
let roundsCompleted = 0;

/** @type {boolean} */
let running = false;

/** @type {number|null} */
let startTime = null;

/**
 * Initialize (or reset) all game state.
 */
export function initGame() {
  score = 0;
  level = 0;
  roundsCompleted = 0;
  running = false;
  startTime = null;
}

/**
 * Start the game timer.
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
 * Stop the game and return final results.
 * @returns {{ score: number, level: number, roundsCompleted: number, duration: number }}
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
    level,
    roundsCompleted,
    duration,
  };
}

/**
 * Get the grid configuration (rows and columns) for a given level.
 * Clamps to the last config if the level exceeds the defined configs.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {{ rows: number, cols: number }}
 */
export function getGridSize(lvl) {
  const idx = Math.min(lvl, GRID_CONFIGS.length - 1);
  const [rows, cols] = GRID_CONFIGS[idx];
  return { rows, cols };
}

/**
 * Get the card-reveal display duration in milliseconds for a given level.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {number} Display duration in milliseconds.
 */
export function getDisplayDurationMs(lvl) {
  return Math.max(BASE_DISPLAY_MS - lvl * DISPLAY_DECREMENT_MS, MIN_DISPLAY_MS);
}

/**
 * Generate a shuffled grid of card objects for a given level.
 * Each card has a unique id, a symbol, and starts as unmatched.
 * Cards are generated as pairs so every symbol appears exactly twice.
 *
 * @param {number} lvl - The game level (0-based).
 * @returns {Array<{ id: number, symbol: string, matched: boolean }>}
 */
export function generateGrid(lvl) {
  const { rows, cols } = getGridSize(lvl);
  const totalCards = rows * cols;
  const pairCount = totalCards / 2;

  const selectedSymbols = SYMBOLS.slice(0, pairCount);
  const cards = [...selectedSymbols, ...selectedSymbols].map((symbol, i) => ({
    id: i,
    symbol,
    matched: false,
  }));

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  // Re-assign sequential ids after shuffle so id matches array position
  return cards.map((card, i) => ({ ...card, id: i }));
}

/**
 * Check whether two card symbols match.
 *
 * @param {string} symbolA - Symbol on the first card.
 * @param {string} symbolB - Symbol on the second card.
 * @returns {boolean} True if the symbols are equal.
 */
export function checkMatch(symbolA, symbolB) {
  return symbolA === symbolB;
}

/**
 * Record a correct pair match.
 * Increments the score by 1.
 */
export function addCorrectPair() {
  score += 1;
}

/**
 * Mark the current round as complete and advance to the next level.
 */
export function completeRound() {
  roundsCompleted += 1;
  level += 1;
}

/**
 * Get the current score.
 * @returns {number}
 */
export function getScore() {
  return score;
}

/**
 * Get the current level (0-based).
 * @returns {number}
 */
export function getLevel() {
  return level;
}

/**
 * Get the number of rounds completed.
 * @returns {number}
 */
export function getRoundsCompleted() {
  return roundsCompleted;
}

/**
 * Check whether the game is currently running.
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}
