/**
 * scoreService.test.js — Unit tests for the centralized score service.
 *
 * Exercises saveScore, loadProgress, loadGameScore, and clearHistory against
 * a mocked window.api IPC bridge.
 *
 * @file Tests for app/components/scoreService.js
 */

import { jest } from '@jest/globals';

// ── Module-level mock setup ───────────────────────────────────────────────────

const mockGetTodayDateString = jest.fn(() => '2024-06-15');

jest.unstable_mockModule('../timerService.js', () => ({
  getTodayDateString: mockGetTodayDateString,
}));

const {
  saveScore,
  loadProgress,
  loadGameScore,
  clearHistory,
  DEFAULT_PLAYER_ID,
} = await import('../scoreService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal progress object with optional game data.
 * @param {object} [gameData]
 * @returns {object}
 */
function buildProgress(gameData = {}) {
  return {
    playerId: 'default',
    games: gameData,
  };
}

/**
 * Create a jest.fn() mock for window.api.invoke that returns preset data.
 * @param {object} [existingProgress] - Value returned by progress:load calls.
 * @returns {{ mock: jest.Mock, saved: object }}
 */
function buildApiMock(existingProgress = buildProgress()) {
  const saved = {};
  const mock = jest.fn((channel, payload) => {
    if (channel === 'progress:load') return Promise.resolve(existingProgress);
    if (channel === 'progress:save') {
      Object.assign(saved, payload.data);
      return Promise.resolve();
    }
    if (channel === 'progress:reset') return Promise.resolve();
    return Promise.resolve();
  });
  return { mock, saved };
}

// Ensure window.api is cleaned up between tests.
beforeEach(() => {
  delete globalThis.window.api;
  jest.clearAllMocks();
  mockGetTodayDateString.mockReturnValue('2024-06-15');
});

afterEach(() => {
  delete globalThis.window.api;
});

// ── DEFAULT_PLAYER_ID ─────────────────────────────────────────────────────────

describe('DEFAULT_PLAYER_ID', () => {
  test('is "default"', () => {
    expect(DEFAULT_PLAYER_ID).toBe('default');
  });
});

// ── saveScore ─────────────────────────────────────────────────────────────────

describe('saveScore', () => {
  test('returns null when window.api is unavailable', async () => {
    const result = await saveScore('test-game', { score: 10 });
    expect(result).toBeNull();
  });

  test('calls progress:load then progress:save', async () => {
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 5 });

    expect(mock).toHaveBeenCalledWith('progress:load', { playerId: 'default' });
    expect(mock).toHaveBeenCalledWith('progress:save', expect.objectContaining({
      playerId: 'default',
    }));
  });

  test('stores highScore as max of current and previous', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': { highScore: 10, sessionsPlayed: 1 },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 7 });
    expect(saved.games['test-game'].highScore).toBe(10); // previous was higher

    const { mock: mock2, saved: saved2 } = buildApiMock(buildProgress({
      'test-game': { highScore: 3, sessionsPlayed: 1 },
    }));
    globalThis.window.api = { invoke: mock2 };

    await saveScore('test-game', { score: 15 });
    expect(saved2.games['test-game'].highScore).toBe(15); // new is higher
  });

  test('increments sessionsPlayed by 1', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': { highScore: 0, sessionsPlayed: 5 },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 0 });
    expect(saved.games['test-game'].sessionsPlayed).toBe(6);
  });

  test('sets lastPlayed to a valid ISO timestamp', async () => {
    const before = new Date().toISOString();
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1 });

    const after = new Date().toISOString();
    expect(saved.games['test-game'].lastPlayed >= before).toBe(true);
    expect(saved.games['test-game'].lastPlayed <= after).toBe(true);
  });

  test('accumulates sessionDurationMs into dailyTime for today', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': {
        highScore: 0,
        sessionsPlayed: 0,
        dailyTime: { '2024-06-15': 30000 },
      },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1, sessionDurationMs: 15000 });

    expect(saved.games['test-game'].dailyTime['2024-06-15']).toBe(45000);
  });

  test('creates dailyTime entry when none exists', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1, sessionDurationMs: 5000 });

    expect(saved.games['test-game'].dailyTime['2024-06-15']).toBe(5000);
  });

  test('stores highestLevel as max of level and previous', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': { highestLevel: 3 },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1, level: 2 });
    expect(saved.games['test-game'].highestLevel).toBe(3); // previous higher

    const { mock: mock2, saved: saved2 } = buildApiMock(buildProgress({
      'test-game': { highestLevel: 1 },
    }));
    globalThis.window.api = { invoke: mock2 };

    await saveScore('test-game', { score: 1, level: 5 });
    expect(saved2.games['test-game'].highestLevel).toBe(5); // new higher
  });

  test('does not set highestLevel when level is not provided', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1 });
    expect(saved.games['test-game'].highestLevel).toBeUndefined();
  });

  test('tracks lowestDisplayTime as min of current and previous', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': { lowestDisplayTime: 500 },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1, lowestDisplayTime: 800 });
    expect(saved.games['test-game'].lowestDisplayTime).toBe(500); // previous lower

    const { mock: mock2, saved: saved2 } = buildApiMock(buildProgress({
      'test-game': { lowestDisplayTime: 1000 },
    }));
    globalThis.window.api = { invoke: mock2 };

    await saveScore('test-game', { score: 1, lowestDisplayTime: 200 });
    expect(saved2.games['test-game'].lowestDisplayTime).toBe(200); // new lower
  });

  test('sets lowestDisplayTime to current value when no previous exists', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1, lowestDisplayTime: 400 });
    expect(saved.games['test-game'].lowestDisplayTime).toBe(400);
  });

  test('does not set lowestDisplayTime when not provided', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1 });
    expect(saved.games['test-game'].lowestDisplayTime).toBeUndefined();
  });

  test('merges plain extraFields object directly into the game record', async () => {
    const { mock, saved } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 1 }, { customField: 'hello', anotherField: 42 });

    expect(saved.games['test-game'].customField).toBe('hello');
    expect(saved.games['test-game'].anotherField).toBe(42);
  });

  test('calls extraFields function with previous game record', async () => {
    const prevRecord = { highScore: 5, sessionsPlayed: 2, myBest: 100 };
    const { mock, saved } = buildApiMock(buildProgress({
      'test-game': prevRecord,
    }));
    globalThis.window.api = { invoke: mock };

    const extraFn = jest.fn((prev) => ({ myBest: Math.min(prev.myBest || Infinity, 80) }));
    await saveScore('test-game', { score: 1 }, extraFn);

    expect(extraFn).toHaveBeenCalledWith(expect.objectContaining({ myBest: 100 }));
    expect(saved.games['test-game'].myBest).toBe(80);
  });

  test('returns the updated game record on success', async () => {
    const { mock } = buildApiMock();
    globalThis.window.api = { invoke: mock };

    const record = await saveScore('test-game', { score: 42, level: 3 });
    expect(record).not.toBeNull();
    expect(record.highScore).toBe(42);
    expect(record.highestLevel).toBe(3);
  });

  test('returns null when IPC calls reject', async () => {
    globalThis.window.api = { invoke: jest.fn().mockRejectedValue(new Error('IPC error')) };

    const result = await saveScore('test-game', { score: 5 });
    expect(result).toBeNull();
  });

  test('uses empty fallback when progress:load rejects', async () => {
    const savedData = {};
    globalThis.window.api = {
      invoke: jest.fn((channel, payload) => {
        if (channel === 'progress:load') return Promise.reject(new Error('load failed'));
        if (channel === 'progress:save') {
          Object.assign(savedData, payload.data);
          return Promise.resolve();
        }
        return Promise.resolve();
      }),
    };

    await saveScore('test-game', { score: 7 });
    expect(savedData.games['test-game'].highScore).toBe(7);
    expect(savedData.games['test-game'].sessionsPlayed).toBe(1);
  });

  test('preserves existing games data from the progress record', async () => {
    const { mock, saved } = buildApiMock(buildProgress({
      'other-game': { highScore: 99 },
    }));
    globalThis.window.api = { invoke: mock };

    await saveScore('test-game', { score: 5 });

    expect(saved.games['other-game']).toEqual({ highScore: 99 });
  });
});

// ── loadProgress ──────────────────────────────────────────────────────────────

describe('loadProgress', () => {
  test('returns fallback when window.api is unavailable', async () => {
    const result = await loadProgress();
    expect(result).toEqual({ playerId: 'default', games: {} });
  });

  test('returns data from progress:load IPC call', async () => {
    const progressData = buildProgress({ 'some-game': { highScore: 10 } });
    globalThis.window.api = {
      invoke: jest.fn().mockResolvedValue(progressData),
    };

    const result = await loadProgress();
    expect(result).toEqual(progressData);
  });

  test('returns fallback when IPC call rejects', async () => {
    globalThis.window.api = {
      invoke: jest.fn().mockRejectedValue(new Error('IPC error')),
    };

    const result = await loadProgress();
    expect(result).toEqual({ playerId: 'default', games: {} });
  });

  test('returns fallback when IPC call returns null', async () => {
    globalThis.window.api = {
      invoke: jest.fn().mockResolvedValue(null),
    };

    const result = await loadProgress();
    expect(result).toEqual({ playerId: 'default', games: {} });
  });
});

// ── loadGameScore ─────────────────────────────────────────────────────────────

describe('loadGameScore', () => {
  test('returns the game-specific record from progress', async () => {
    const gameData = { highScore: 20, sessionsPlayed: 3 };
    globalThis.window.api = {
      invoke: jest.fn().mockResolvedValue(buildProgress({ 'my-game': gameData })),
    };

    const result = await loadGameScore('my-game');
    expect(result).toEqual(gameData);
  });

  test('returns empty object when game has no saved data', async () => {
    globalThis.window.api = {
      invoke: jest.fn().mockResolvedValue(buildProgress()),
    };

    const result = await loadGameScore('unknown-game');
    expect(result).toEqual({});
  });

  test('returns empty object when window.api is unavailable', async () => {
    const result = await loadGameScore('my-game');
    expect(result).toEqual({});
  });
});

// ── clearHistory ──────────────────────────────────────────────────────────────

describe('clearHistory', () => {
  test('does nothing when window.api is unavailable', async () => {
    // Should resolve without throwing.
    await expect(clearHistory()).resolves.toBeUndefined();
  });

  test('calls progress:reset with the default player ID', async () => {
    const invokeMock = jest.fn().mockResolvedValue(undefined);
    globalThis.window.api = { invoke: invokeMock };

    await clearHistory();

    expect(invokeMock).toHaveBeenCalledWith('progress:reset', { playerId: 'default' });
  });
});
