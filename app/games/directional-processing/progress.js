/**
 * progress.js — Progress persistence for the Directional Processing game.
 *
 * Saves session results via the centralized scoreService. This module must only
 * be imported in renderer-side code and never calls Electron APIs directly.
 *
 * @file Directional Processing progress persistence helpers.
 */

import { saveScore } from '../../components/scoreService.js';

/** Game identifier used for progress persistence (must match manifest.json id). */
export const GAME_ID = 'directional-processing';

/**
 * Save game progress asynchronously via the score service.
 *
 * Only call this when an actual session was played (trialsCompleted > 0).
 *
 * @param {{ score: number, level: number, trialsCompleted: number }} result
 * @param {number} [sessionDurationMs=0] - Total session duration in milliseconds.
 */
export function saveProgress(result, sessionDurationMs = 0) {
  saveScore(GAME_ID, {
    score: result.score,
    level: result.level,
    sessionDurationMs,
  }, {
    lastTrialsCompleted: result.trialsCompleted,
  });
}
