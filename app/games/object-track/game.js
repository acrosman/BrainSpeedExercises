/**
 * game.js — Pure game logic for the Object Track game.
 *
 * All functions are pure (no DOM access). Module-level state is managed via
 * exported lifecycle functions (initGame, startGame, stopGame).
 *
 * @file Object Track core game logic.
 */

import { updateAdaptiveDifficultyState } from '../../components/adaptiveDifficultyService.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum level index (zero-based). */
export const MIN_LEVEL = 0;

/** Number of consecutive correct answers needed to advance a level. */
export const CORRECT_TO_ADVANCE = 3;

/** Number of consecutive wrong answers needed to drop a level. */
export const WRONG_TO_DROP = 3;

/** Number of levels dropped on failure streak. */
export const LEVELS_TO_DROP = 2;

/** Minimum tracking phase duration in milliseconds. */
export const MIN_TRACKING_DURATION_MS = 5000;

/** Maximum tracking phase duration in milliseconds. */
export const MAX_TRACKING_DURATION_MS = 10000;

/** Radius of each circle in pixels. */
export const CIRCLE_RADIUS = 30;

/** Minimum gap between circle edges when spawning. */
export const MIN_SPAWN_GAP = 10;

/** Maximum attempts to find a non-overlapping spawn position. */
export const MAX_SPAWN_ATTEMPTS = 200;

// ── Module-level state ────────────────────────────────────────────────────────

/** @type {boolean} Whether a game session is in progress. */
let running = false;

/** @type {number} Current difficulty level (zero-based). */
let level = 0;

/** @type {number} Cumulative score (correct rounds). */
let score = 0;

/** @type {number} Streak of consecutive correct rounds. */
let consecutiveCorrect = 0;

/** @type {number} Streak of consecutive wrong rounds. */
let consecutiveWrong = 0;

/** @type {number} Timestamp when the current session started. */
let startTimeMs = 0;

/** @type {number} Total rounds played this session. */
let roundsPlayed = 0;

/** @type {Array<object>} Current circle state array. */
let circles = [];

/**
 * Session history of speed values (px/sec) at the end of each round.
 * Used to render the in-game speed trend chart.
 * @type {number[]}
 */
let speedHistory = [];

// ── Level configuration ───────────────────────────────────────────────────────

/**
 * Return the configuration for a given difficulty level.
 *
 * @param {number} lvl - Zero-based level index.
 * @returns {{ numCircles: number, numTargets: number, speedPxPerSec: number,
 *   trackingDurationMs: number }} Level configuration.
 */
export function getLevelConfig(lvl) {
  return {
    numCircles: Math.min(8 + Math.floor(lvl / 3), 14),
    numTargets: Math.min(3 + Math.floor(lvl / 5), 6),
    speedPxPerSec: 150 + lvl * 15,
    trackingDurationMs: Math.min(5000 + Math.floor(lvl / 2) * 500, 10000),
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Determine whether two circles overlap.
 *
 * @param {{ x: number, y: number }} a - First circle center.
 * @param {{ x: number, y: number }} b - Second circle center.
 * @param {number} radius - Shared radius for both circles.
 * @param {number} [gap=0] - Extra clearance added to the overlap threshold.
 * @returns {boolean} True when the circles overlap (including the gap).
 */
export function circlesOverlap(a, b, radius, gap = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < 2 * radius + gap;
}

// ── Circle factory ────────────────────────────────────────────────────────────

/**
 * Create an array of circle objects placed randomly within the arena.
 *
 * Each circle is assigned a random non-overlapping position (up to
 * MAX_SPAWN_ATTEMPTS) and a random velocity derived from speedPxPerSec.
 *
 * @param {number} numCircles - Total number of circles to create.
 * @param {number} areaWidth - Width of the arena in pixels.
 * @param {number} areaHeight - Height of the arena in pixels.
 * @param {number} radius - Circle radius in pixels.
 * @param {number} speedPxPerSec - Circle speed in pixels per second.
 * @returns {Array<{ id: number, x: number, y: number, vx: number, vy: number,
 *   radius: number, isTarget: boolean }>} Array of newly created circle objects.
 */
export function createCircles(numCircles, areaWidth, areaHeight, radius, speedPxPerSec) {
  const result = [];
  for (let i = 0; i < numCircles; i++) {
    const minX = radius;
    const maxX = Math.max(radius, areaWidth - radius);
    const minY = radius;
    const maxY = Math.max(radius, areaHeight - radius);
    let px = minX + Math.random() * (maxX - minX);
    let py = minY + Math.random() * (maxY - minY);
    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const overlaps = result.some(
        (c) => circlesOverlap(c, { x: px, y: py }, radius, MIN_SPAWN_GAP),
      );
      if (!overlaps) break;
      px = minX + Math.random() * (maxX - minX);
      py = minY + Math.random() * (maxY - minY);
    }
    const angle = Math.random() * 2 * Math.PI;
    const spd = speedPxPerSec / 1000;
    result.push({
      id: i,
      x: px,
      y: py,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      radius,
      isTarget: false,
    });
  }
  return result;
}

// ── Target selection ──────────────────────────────────────────────────────────

/**
 * Mark a random subset of circles as targets using a Fisher-Yates shuffle.
 *
 * @param {Array<object>} inputCircles - Array of circle objects (not mutated).
 * @param {number} numTargets - Number of targets to designate.
 * @returns {Array<object>} New array with numTargets circles having isTarget=true.
 */
export function selectTargets(inputCircles, numTargets) {
  const copy = inputCircles.map((c) => ({ ...c }));
  const indices = copy.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (let t = 0; t < numTargets; t++) {
    copy[indices[t]].isTarget = true;
  }
  return copy;
}

// ── Physics ───────────────────────────────────────────────────────────────────

/**
 * Advance circle positions by deltaMs and reflect off arena boundaries.
 *
 * @param {Array<object>} inputCircles - Current circle array (not mutated).
 * @param {number} deltaMs - Elapsed time in milliseconds since last tick.
 * @param {{ width: number, height: number }} bounds - Arena dimensions.
 * @returns {Array<object>} New array with updated positions and velocities.
 */
export function updateCirclePositions(inputCircles, deltaMs, bounds) {
  return inputCircles.map((c) => {
    let { x, y, vx, vy } = c;
    const r = c.radius;
    x += vx * deltaMs;
    y += vy * deltaMs;

    if (x - r < 0) { x = r; vx = Math.abs(vx); }
    if (x + r > bounds.width) { x = bounds.width - r; vx = -Math.abs(vx); }
    if (y - r < 0) { y = r; vy = Math.abs(vy); }
    if (y + r > bounds.height) { y = bounds.height - r; vy = -Math.abs(vy); }

    return { ...c, x, y, vx, vy };
  });
}

/**
 * Resolve elastic collisions between overlapping circle pairs.
 *
 * Applies an impulse along the collision normal and a positional correction
 * to prevent sustained overlap.
 *
 * @param {Array<object>} inputCircles - Current circle array (not mutated).
 * @returns {Array<object>} New array with post-collision velocities and positions.
 */
export function resolveCircleCollisions(inputCircles) {
  const result = inputCircles.map((c) => ({ ...c }));
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];
      const r = a.radius;
      const minDist = 2 * r;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      let nx;
      let ny;
      if (dist === 0) {
        nx = 1; ny = 0;
      } else {
        nx = dx / dist; ny = dy / dist;
      }

      const dvx = a.vx - b.vx;
      const dvy = a.vy - b.vy;
      const dvn = dvx * nx + dvy * ny;

      if (dvn > 0) {
        result[i].vx -= dvn * nx;
        result[i].vy -= dvn * ny;
        result[j].vx += dvn * nx;
        result[j].vy += dvn * ny;
      }

      const actualDist = dist === 0 ? 0.01 : dist;
      const overlap = minDist - actualDist;
      const correction = overlap / 2;
      result[i].x -= correction * nx;
      result[i].y -= correction * ny;
      result[j].x += correction * nx;
      result[j].y += correction * ny;
    }
  }
  return result;
}

// ── Response evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate a player's selection against the current targets.
 *
 * @param {Array<object>} inputCircles - Circle array with isTarget flags.
 * @param {Set<number>} selectedIds - Set of circle IDs chosen by the player.
 * @returns {{ correct: boolean, correctCount: number, totalTargets: number }}
 */
export function evaluateResponse(inputCircles, selectedIds) {
  const targetIds = new Set(inputCircles.filter((c) => c.isTarget).map((c) => c.id));
  const totalTargets = targetIds.size;
  let correctCount = 0;
  selectedIds.forEach((id) => { if (targetIds.has(id)) correctCount++; });
  const correct = selectedIds.size === totalTargets && correctCount === totalTargets;
  return { correct, correctCount, totalTargets };
}

// ── Round result recording ────────────────────────────────────────────────────

/**
 * Record the result of a completed round and update difficulty state.
 *
 * @param {boolean} correct - Whether the player identified all targets correctly.
 * @returns {{ levelDelta: number, newLevel: number }} Change in level and new level.
 */
export function recordRoundResult(correct) {
  if (correct) {
    score++;
  }

  const staircaseState = updateAdaptiveDifficultyState({
    value: level,
    wasCorrect: Boolean(correct),
    consecutiveCorrect,
    consecutiveWrong,
    increaseAfter: CORRECT_TO_ADVANCE,
    decreaseAfter: WRONG_TO_DROP,
    harderStep: 1,
    easierStep: -LEVELS_TO_DROP,
    minValue: MIN_LEVEL,
    maxValue: Number.POSITIVE_INFINITY,
  });

  level = staircaseState.value;
  consecutiveCorrect = staircaseState.consecutiveCorrect;
  consecutiveWrong = staircaseState.consecutiveWrong;
  const levelDelta = staircaseState.valueDelta;

  roundsPlayed++;
  speedHistory.push(getLevelConfig(level).speedPxPerSec);
  return { levelDelta, newLevel: level };
}

// ── Round initialization ──────────────────────────────────────────────────────

/**
 * Initialize a new round by creating and configuring circles for the current level.
 *
 * @param {number} areaWidth - Arena width in pixels.
 * @param {number} areaHeight - Arena height in pixels.
 * @returns {Array<object>} Shallow copy of the initialized circles array.
 */
export function initRound(areaWidth, areaHeight) {
  const config = getLevelConfig(level);
  const created = createCircles(
    config.numCircles,
    areaWidth,
    areaHeight,
    CIRCLE_RADIUS,
    config.speedPxPerSec,
  );
  circles = selectTargets(created, config.numTargets);
  return [...circles];
}

// ── Physics tick ──────────────────────────────────────────────────────────────

/**
 * Advance physics by one frame and store the result in module state.
 *
 * @param {number} deltaMs - Elapsed time in milliseconds since the last tick.
 * @param {{ width: number, height: number }} bounds - Arena dimensions.
 * @returns {Array<object>} Shallow copy of the updated circles array.
 */
export function tickPhysics(deltaMs, bounds) {
  let updated = updateCirclePositions(circles, deltaMs, bounds);
  updated = resolveCircleCollisions(updated);
  circles = updated;
  return [...circles];
}

// ── State accessors ───────────────────────────────────────────────────────────

/**
 * Return a shallow copy of the current circles array.
 *
 * @returns {Array<object>} Copy of the circles array.
 */
export function getCurrentCircles() {
  return [...circles];
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

/**
 * Reset all module-level state to initial values.
 *
 * @returns {void}
 */
export function initGame() {
  running = false;
  level = 0;
  score = 0;
  consecutiveCorrect = 0;
  consecutiveWrong = 0;
  startTimeMs = 0;
  roundsPlayed = 0;
  circles = [];
  speedHistory = [];
}

/**
 * Mark the game session as started.
 *
 * @throws {Error} If the game is already running.
 * @returns {void}
 */
export function startGame() {
  if (running) throw new Error('Game is already running');
  running = true;
  startTimeMs = Date.now();
}

/**
 * Mark the game session as stopped and return a summary.
 *
 * @throws {Error} If the game is not running.
 * @returns {{ score: number, level: number, roundsPlayed: number, duration: number }}
 */
export function stopGame() {
  if (!running) throw new Error('Game is not running');
  running = false;
  return { score, level, roundsPlayed, duration: Date.now() - startTimeMs };
}

// ── Getters ───────────────────────────────────────────────────────────────────

/** @returns {boolean} Whether a game session is currently active. */
export function isRunning() { return running; }

/** @returns {number} Current difficulty level (zero-based). */
export function getLevel() { return level; }

/** @returns {number} Cumulative score. */
export function getScore() { return score; }

/** @returns {number} Current streak of consecutive correct answers. */
export function getConsecutiveCorrect() { return consecutiveCorrect; }

/** @returns {number} Current streak of consecutive wrong answers. */
export function getConsecutiveWrong() { return consecutiveWrong; }

/** @returns {number} Total rounds played this session. */
export function getRoundsPlayed() { return roundsPlayed; }

/**
 * Get the session speed history as an array of circle speed values (px/sec).
 * One entry is appended per completed round after any staircase adjustment.
 * @returns {number[]}
 */
export function getSpeedHistory() { return [...speedHistory]; }
