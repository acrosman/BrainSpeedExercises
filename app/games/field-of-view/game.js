/**
 * game.js - Pure game logic for Field of View.
 *
 * Contains timing, adaptive staircase, and trial layout generation logic.
 * This module does not access the DOM and is easy to unit test.
 *
 * @file Field of View game logic module.
 */

/** Start value for stimulus onset asynchrony in ms. */
export const START_SOA_MS = 500;

/** Minimum practical display duration at 60 Hz. */
export const MIN_SOA_MS = 16.67;

/** Maximum SOA clamp in ms to keep pacing reasonable. */
export const MAX_SOA_MS = 1000;

/**
 * Step increase on failure for 1-up staircase behavior.
 * Uses one 60 Hz frame equivalent.
 */
export const DEFAULT_STEP_UP_MS = 16.67;

/**
 * Step decrease once success streak target is met.
 * Uses one 60 Hz frame equivalent.
 */
export const DEFAULT_STEP_DOWN_MS = 16.67;

/** Number of recent trials retained for local accuracy view. */
export const DEFAULT_ACCURACY_BUFFER_SIZE = 5;

/** Successes required before stepping down SOA in 1-up/N-down. */
export const DEFAULT_DOWN_AFTER_SUCCESSES = 2;

/** Grid sizes used by the game. */
export const GRID_SIZES = [3, 5];

/** Central stimulus set (kitten variants). */
export const CENTRAL_TARGET_SET = [
  { id: 'primary-kitten', file: 'primaryKitten.png', width: 220, height: 220 },
  { id: 'secondary-kitten', file: 'secondaryKitten.png', width: 220, height: 220 },
];

/** Peripheral target set (cat toys). */
export const PERIPHERAL_TARGET_SET = [
  { id: 'toy-1', file: 'toy1.png', width: 160, height: 160 },
  { id: 'toy-2', file: 'toy2.png', width: 160, height: 160 },
];

/**
 * High-contrast visual mask specification for visual buffer reset.
 * The mask image will be provided later in the game images folder.
 */
export const MASK_SPEC = {
  file: 'Field.png',
  width: 1024,
  height: 1024,
  palette: 'natural field texture',
  pattern: 'full-field scene mask',
};

/** @type {boolean} */
let running = false;

/** @type {number} */
let currentSoaMs = START_SOA_MS;

/** @type {number} */
let stepUpMs = DEFAULT_STEP_UP_MS;

/** @type {number} */
let stepDownMs = DEFAULT_STEP_DOWN_MS;

/** @type {number} */
let downAfterSuccesses = DEFAULT_DOWN_AFTER_SUCCESSES;

/** @type {number} */
let successCounter = 0;

/** @type {Array<boolean>} */
let accuracyBuffer = [];

/** @type {number} */
let accuracyBufferSize = DEFAULT_ACCURACY_BUFFER_SIZE;

/** @type {number} */
let trialsCompleted = 0;

/** @type {number} */
let successes = 0;

/** @type {number|null} */
let startTimeMs = null;

/**
 * Threshold trace used for session-level progress logging.
 * @type {Array<{ trial: number, thresholdMs: number, success: boolean }>}
 */
let thresholdHistory = [];

/**
 * Clamp a numeric value to [min, max].
 *
 * @param {number} value - Input numeric value.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Initialize or reset game state.
 *
 * @param {{
 *   downAfterSuccesses?: number,
 *   stepUpMs?: number,
 *   stepDownMs?: number,
 *   accuracyBufferSize?: number,
 * }} [options]
 */
export function initGame(options = {}) {
  running = false;
  currentSoaMs = START_SOA_MS;
  successCounter = 0;
  trialsCompleted = 0;
  successes = 0;
  startTimeMs = null;
  thresholdHistory = [];

  // Configure staircase success threshold: use a validated integer, defaulting when invalid.
  if (Number.isFinite(options.downAfterSuccesses)) {
    downAfterSuccesses = Math.max(1, Math.round(options.downAfterSuccesses));
  } else {
    downAfterSuccesses = DEFAULT_DOWN_AFTER_SUCCESSES;
  }

  // Configure step sizes with numeric validation and clamping to keep pacing reasonable.
  const rawStepUp = Number.isFinite(options.stepUpMs) ? options.stepUpMs : DEFAULT_STEP_UP_MS;
  stepUpMs = clamp(rawStepUp, MIN_SOA_MS, MAX_SOA_MS);

  const rawStepDown = Number.isFinite(options.stepDownMs)
    ? options.stepDownMs
    : DEFAULT_STEP_DOWN_MS;
  stepDownMs = clamp(rawStepDown, MIN_SOA_MS, MAX_SOA_MS);

  const desiredBuffer = Number(options.accuracyBufferSize || DEFAULT_ACCURACY_BUFFER_SIZE);
  accuracyBufferSize = clamp(Math.round(desiredBuffer), 3, 5);
  accuracyBuffer = [];
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
 * Stop the game and return a threshold-oriented result object.
 *
 * @returns {{
 *   score: number,
 *   thresholdMs: number,
 *   trialsCompleted: number,
 *   recentAccuracy: number,
 *   duration: number,
 * }}
 * @throws {Error} If the game is not running.
 */
export function stopGame() {
  if (!running) {
    throw new Error('Game is not running.');
  }

  running = false;
  const duration = startTimeMs === null ? 0 : Date.now() - startTimeMs;

  return {
    score: Number(currentSoaMs.toFixed(2)),
    thresholdMs: Number(currentSoaMs.toFixed(2)),
    trialsCompleted,
    recentAccuracy: getRecentAccuracy(),
    duration,
  };
}

/**
 * Get a trial grid size from the current SOA.
 * Starts in a 3x3 grid and moves to 5x5 once SOA drops to 300ms,
 * which is reachable during normal gameplay.
 *
 * @returns {number}
 */
export function getGridSizeForCurrentSoa() {
  return currentSoaMs <= 300 ? GRID_SIZES[1] : GRID_SIZES[0];
}

/**
 * Build a randomized trial layout with one central kitten and one toy target
 * on the outer edge of the grid.
 *
 * @returns {{
 *   gridSize: number,
 *   centerIndex: number,
 *   centerIcon: { id: string, file: string, width: number, height: number },
 *   peripheralIndex: number,
 *   peripheralIcon: { id: string, file: string, width: number, height: number },
 *   cells: Array<{
 *     index: number,
 *     role: string,
 *     icon: { id: string, file: string, width: number, height: number }|null
 *   }>,
 * }}
 */
export function createTrialLayout() {
  const gridSize = getGridSizeForCurrentSoa();
  const totalCells = gridSize * gridSize;
  const centerIndex = Math.floor(totalCells / 2);
  const centerIcon = CENTRAL_TARGET_SET[Math.floor(Math.random() * CENTRAL_TARGET_SET.length)];
  const peripheralIcon = PERIPHERAL_TARGET_SET[
    Math.floor(Math.random() * PERIPHERAL_TARGET_SET.length)
  ];

  const candidateIndices = Array.from({ length: totalCells }, (_, i) => i).filter((i) => {
    if (i === centerIndex) return false;
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    return row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1;
  });

  const peripheralIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];

  const cells = Array.from({ length: totalCells }, (_, index) => {
    if (index === centerIndex) {
      return { index, role: 'center', icon: centerIcon };
    }

    if (index === peripheralIndex) {
      return { index, role: 'peripheral-target', icon: peripheralIcon };
    }

    return { index, role: 'empty', icon: null };
  });

  return {
    gridSize,
    centerIndex,
    centerIcon,
    peripheralIndex,
    peripheralIcon,
    cells,
  };
}

/**
 * Record the outcome of one trial and apply adaptive staircase updates.
 *
 * @param {{ success: boolean }} outcome
 * @returns {{ thresholdMs: number, recentAccuracy: number, successCounter: number }}
 */
export function recordTrial(outcome) {
  const wasSuccess = Boolean(outcome && outcome.success);

  trialsCompleted += 1;
  if (wasSuccess) {
    successes += 1;
    successCounter += 1;

    if (successCounter >= downAfterSuccesses) {
      currentSoaMs = clamp(currentSoaMs - stepDownMs, MIN_SOA_MS, MAX_SOA_MS);
      successCounter = 0;
    }
  } else {
    currentSoaMs = clamp(currentSoaMs + stepUpMs, MIN_SOA_MS, MAX_SOA_MS);
    successCounter = 0;
  }

  accuracyBuffer.push(wasSuccess);
  if (accuracyBuffer.length > accuracyBufferSize) {
    accuracyBuffer = accuracyBuffer.slice(-accuracyBufferSize);
  }

  thresholdHistory.push({
    trial: trialsCompleted,
    thresholdMs: Number(currentSoaMs.toFixed(2)),
    success: wasSuccess,
  });

  return {
    thresholdMs: Number(currentSoaMs.toFixed(2)),
    recentAccuracy: getRecentAccuracy(),
    successCounter,
  };
}

/**
 * Get current SOA/threshold in milliseconds.
 *
 * @returns {number}
 */
export function getCurrentSoaMs() {
  return Number(currentSoaMs.toFixed(2));
}

/**
 * Return recent accuracy from accuracyBuffer as a ratio in [0, 1].
 *
 * @returns {number}
 */
export function getRecentAccuracy() {
  if (accuracyBuffer.length === 0) {
    return 0;
  }
  const correct = accuracyBuffer.filter(Boolean).length;
  return Number((correct / accuracyBuffer.length).toFixed(3));
}

/**
 * Get an immutable copy of the current accuracy buffer.
 *
 * @returns {boolean[]}
 */
export function getAccuracyBuffer() {
  return [...accuracyBuffer];
}

/**
 * Get session threshold history.
 *
 * @returns {Array<{ trial: number, thresholdMs: number, success: boolean }>}
 */
export function getThresholdHistory() {
  return [...thresholdHistory];
}

/**
 * Get the current staircase setting (1-up/N-down where N is this return value).
 *
 * @returns {number}
 */
export function getDownAfterSuccesses() {
  return downAfterSuccesses;
}

/**
 * Get current run state.
 *
 * @returns {boolean}
 */
export function isRunning() {
  return running;
}

/**
 * Get total completed trials.
 *
 * @returns {number}
 */
export function getTrialsCompleted() {
  return trialsCompleted;
}

/**
 * Get total successful trials.
 *
 * @returns {number}
 */
export function getSuccessCount() {
  return successes;
}
