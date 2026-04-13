/**
 * progressManager.js — Player progress persistence for BrainSpeedExercises.
 *
 * Handles saving, loading, and resetting player progress as JSON files in the user data directory.
 * All access is via IPC from the main process; never called directly from the renderer.
 *
 * @file Player progress persistence subsystem.
 */

import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';

function validatePlayerId(playerId) {
  if (typeof playerId !== 'string' || playerId.trim() === '') {
    throw new Error('playerId must be a non-empty string.');
  }
  if (playerId.includes('..') || playerId.includes('/') || playerId.includes('\\')) {
    throw new Error('playerId contains invalid path-traversal characters.');
  }
}

/**
 * Loads player progress from disk, or returns a default structure if not found.
 * @param {string} playerId
 * @returns {Promise<Object>} Player progress data
 * @throws {Error} If playerId is invalid or file is corrupt
 */
export async function loadProgress(playerId) {
  validatePlayerId(playerId);
  const filePath = path.join(app.getPath('userData'), `${playerId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        playerId,
        lastUpdated: new Date().toISOString(),
        games: {},
      };
    }
    throw err;
  }
}

/**
 * Saves player progress to disk, using a temporary file for atomicity.
 * @param {string} playerId
 * @param {Object} data
 * @returns {Promise<void>}
 * @throws {Error} If playerId is invalid or write fails
 */
export async function saveProgress(playerId, data) {
  validatePlayerId(playerId);
  const filePath = path.join(app.getPath('userData'), `${playerId}.json`);
  const toSave = { ...data, lastUpdated: new Date().toISOString() };
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(toSave, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
  log.info(`Progress saved for player "${playerId}": ${filePath}`);
}

/**
 * Deletes the player's progress file from disk.
 * @param {string} playerId
 * @returns {Promise<void>}
 * @throws {Error} If playerId is invalid or unlink fails
 */
export async function resetProgress(playerId) {
  validatePlayerId(playerId);
  const filePath = path.join(app.getPath('userData'), `${playerId}.json`);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}
