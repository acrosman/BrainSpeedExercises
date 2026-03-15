import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

function validatePlayerId(playerId) {
  if (typeof playerId !== 'string' || playerId.trim() === '') {
    throw new Error('playerId must be a non-empty string.');
  }
  if (playerId.includes('..') || playerId.includes('/') || playerId.includes('\\')) {
    throw new Error('playerId contains invalid path-traversal characters.');
  }
}

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

export async function saveProgress(playerId, data) {
  validatePlayerId(playerId);
  const filePath = path.join(app.getPath('userData'), `${playerId}.json`);
  const toSave = { ...data, lastUpdated: new Date().toISOString() };
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(toSave, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

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
