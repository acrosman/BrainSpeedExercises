/**
 * scoreService.js — Centralized score saving service for BrainSpeedExercises.
 *
 * Provides a consistent interface for all game plugins to save session results,
 * load scores, and clear player history. Eliminates the repetitive load → merge
 * → save pattern from every game's stop() implementation.
 *
 * All methods are renderer-side only and communicate via the window.api IPC bridge.
 * Never import Electron APIs directly in this module.
 *
 * @file Centralized score service for game result persistence.
 */

import { getTodayDateString } from './timerService.js';

/** Default player ID used throughout the application. */
export const DEFAULT_PLAYER_ID = 'default';

/**
 * Save game results for the given game, merging with existing progress.
 *
 * Handles the full load → merge → save cycle. The following standard fields
 * are computed and stored automatically from the `result` object:
 *
 * - `highScore`       — maximum of `result.score` and any previously stored value.
 * - `sessionsPlayed`  — incremented by 1.
 * - `lastPlayed`      — set to the current ISO-8601 timestamp.
 * - `dailyTime`       — `result.sessionDurationMs` added to today's total.
 * - `highestLevel`    — maximum of `result.level` and previous (when provided).
 * - `lowestDisplayTime` — minimum of `result.lowestDisplayTime` and previous
 *                         (when provided).
 *
 * Any game-specific fields that need merging logic based on the previous saved
 * record can be supplied via the `extraFields` callback. When provided as a
 * function it receives the previous game record and must return an object of
 * additional fields to merge into the saved record. When provided as a plain
 * object it is merged directly (without access to the previous record).
 *
 * @param {string} gameId - The game ID (must match the game's manifest.json `id`).
 * @param {object} result - Standard result fields for the completed session.
 * @param {number} result.score - The session score.
 * @param {number} [result.sessionDurationMs=0] - Session duration in milliseconds.
 * @param {number} [result.level] - Highest level reached (tracked as `highestLevel`).
 * @param {number} [result.lowestDisplayTime] - Minimum display time to track.
 * @param {((prevRecord: object) => object) | object} [extraFields={}]
 *   Additional game-specific fields. Pass a function to receive the previous
 *   game record (useful for max/min logic on game-specific fields); pass a
 *   plain object to merge fields directly.
 * @returns {Promise<object|null>} The updated game record, or `null` on error or
 *   when `window.api` is unavailable.
 */
export async function saveScore(gameId, result, extraFields = {}) {
  if (typeof window === 'undefined' || !window.api) return null;

  const {
    score,
    sessionDurationMs = 0,
    level,
    lowestDisplayTime,
  } = result;

  const today = getTodayDateString();
  const fallback = { playerId: DEFAULT_PLAYER_ID, games: {} };

  try {
    let existing = fallback;
    try {
      existing = await window.api.invoke(
        'progress:load',
        { playerId: DEFAULT_PLAYER_ID },
      ) || fallback;
    } catch {
      existing = fallback;
    }

    const prev = (existing.games && existing.games[gameId]) || {};
    const prevDailyTime = (prev.dailyTime && typeof prev.dailyTime[today] === 'number')
      ? prev.dailyTime[today] : 0;

    // Build the updated record starting with all standard fields.
    const gameRecord = {
      ...prev,
      highScore: Math.max(score, prev.highScore || 0),
      sessionsPlayed: (prev.sessionsPlayed || 0) + 1,
      lastPlayed: new Date().toISOString(),
      dailyTime: {
        ...(prev.dailyTime || {}),
        [today]: prevDailyTime + sessionDurationMs,
      },
    };

    // Optional standard fields with their respective tracking semantics.
    if (typeof level === 'number') {
      gameRecord.highestLevel = Math.max(level, prev.highestLevel || 0);
    }

    if (typeof lowestDisplayTime === 'number') {
      gameRecord.lowestDisplayTime = typeof prev.lowestDisplayTime === 'number'
        ? Math.min(lowestDisplayTime, prev.lowestDisplayTime)
        : lowestDisplayTime;
    }

    // Merge extra game-specific fields.
    const extra = typeof extraFields === 'function' ? extraFields(prev) : extraFields;
    Object.assign(gameRecord, extra);

    const updated = {
      ...existing,
      games: {
        ...existing.games,
        [gameId]: gameRecord,
      },
    };

    await window.api.invoke('progress:save', { playerId: DEFAULT_PLAYER_ID, data: updated });
    return gameRecord;
  } catch {
    // Swallow all progress load/save errors — never interrupt gameplay.
    return null;
  }
}

/**
 * Load the full progress record for the default player.
 *
 * @returns {Promise<object>} Player progress data, or a default empty structure on error.
 */
export async function loadProgress() {
  const fallback = { playerId: DEFAULT_PLAYER_ID, games: {} };
  if (typeof window === 'undefined' || !window.api) return fallback;
  try {
    return await window.api.invoke(
      'progress:load',
      { playerId: DEFAULT_PLAYER_ID },
    ) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Load the saved record for a specific game.
 *
 * @param {string} gameId - The game ID.
 * @returns {Promise<object>} The game's saved data, or an empty object if none exists.
 */
export async function loadGameScore(gameId) {
  const progress = await loadProgress();
  return (progress.games && progress.games[gameId]) || {};
}

/**
 * Clear all player history by resetting progress for the default player.
 *
 * @returns {Promise<void>}
 */
export async function clearHistory() {
  if (typeof window === 'undefined' || !window.api) return;
  await window.api.invoke('progress:reset', { playerId: DEFAULT_PLAYER_ID });
}
