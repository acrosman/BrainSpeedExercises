/**
 * progress.js - Progress persistence for the Field of View game.
 *
 * Saves and retrieves session results via the renderer IPC bridge.
 * This module must only be imported in renderer-side code and never
 * calls Electron APIs directly.
 *
 * @file Field of View progress persistence helpers.
 */

import * as game from './game.js';

/** Game identifier used for progress persistence. */
export const GAME_ID = 'field-of-view';

/**
 * Save game progress asynchronously via IPC.
 *
 * Only call this when an actual session was played (trialsCompleted > 0).
 *
 * @param {{ thresholdMs: number, trialsCompleted: number, recentAccuracy: number }} result
 */
export function saveProgress(result) {
  (async () => {
    if (typeof window === 'undefined' || !window.api) return;

    try {
      const fallback = { playerId: 'default', games: {} };
      let existing = fallback;
      try {
        existing = await window.api.invoke('progress:load', { playerId: 'default' }) || fallback;
      } catch {
        existing = fallback;
      }

      const previous = (existing.games && existing.games[GAME_ID]) || {};
      const previousBest = Number(previous.bestThresholdMs || Number.POSITIVE_INFINITY);
      const nextBest = Math.min(previousBest, result.thresholdMs);

      const updated = {
        ...existing,
        games: {
          ...existing.games,
          [GAME_ID]: {
            highScore: Math.max(previous.highScore || 0, Math.round(1000 / result.thresholdMs)),
            sessionsPlayed: (previous.sessionsPlayed || 0) + 1,
            lastPlayed: new Date().toISOString(),
            bestThresholdMs: Number(nextBest.toFixed(2)),
            lowestDisplayTime: Number(nextBest.toFixed(2)),
            lastThresholdMs: Number(result.thresholdMs.toFixed(2)),
            lastRecentAccuracy: result.recentAccuracy,
            thresholdHistory: game.getThresholdHistory(),
            trialsCompleted: result.trialsCompleted,
          },
        },
      };

      await window.api.invoke('progress:save', { playerId: 'default', data: updated });
    } catch {
      // Swallow all progress save errors.
    }
  })();
}
