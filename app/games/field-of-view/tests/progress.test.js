/** @jest-environment jsdom */
/**
 * progress.test.js - Unit tests for Field of View progress persistence module.
 */
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
} from '@jest/globals';

jest.unstable_mockModule('../../../components/timerService.js', () => ({
  startTimer: jest.fn(),
  stopTimer: jest.fn(() => 0),
  resetTimer: jest.fn(),
  getElapsedMs: jest.fn(() => 0),
  isTimerRunning: jest.fn(() => false),
  formatDuration: jest.fn(() => '00:00'),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));

jest.unstable_mockModule('../game.js', () => ({
  getThresholdHistory: jest.fn(() => []),
}));

const { saveProgress, GAME_ID } = await import('../progress.js');

describe('GAME_ID', () => {
  test('is field-of-view', () => {
    expect(GAME_ID).toBe('field-of-view');
  });
});

describe('saveProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete globalThis.window.api;
  });

  test('does nothing when window is undefined', () => {
    const originalWindow = globalThis.window;
    delete globalThis.window;

    expect(() => saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 }))
      .not.toThrow();

    globalThis.window = originalWindow;
  });

  test('does nothing when window.api is undefined', () => {
    expect(() => saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 }))
      .not.toThrow();
  });

  test('calls progress:save with correct data', async () => {
    const existing = { playerId: 'default', games: { [GAME_ID]: { sessionsPlayed: 2 } } };
    const invoke = jest.fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(undefined);

    globalThis.window.api = { invoke };

    saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 });

    // Wait for the async operations to complete.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.objectContaining({ playerId: 'default' }),
    );

    const savedData = invoke.mock.calls[1][1].data;
    expect(savedData.games[GAME_ID].sessionsPlayed).toBe(3);
    expect(savedData.games[GAME_ID].lastThresholdMs).toBe(100);
    expect(typeof savedData.games[GAME_ID].lowestDisplayTime).toBe('number');
  });

  test('falls back gracefully when progress:load rejects', async () => {
    const invoke = jest.fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(undefined);

    globalThis.window.api = { invoke };

    expect(() => saveProgress({ thresholdMs: 80, trialsCompleted: 2, recentAccuracy: 0.6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.anything(),
    );
  });

  test('falls back gracefully when progress:save rejects', async () => {
    const invoke = jest.fn()
      .mockResolvedValueOnce({ playerId: 'default', games: {} })
      .mockRejectedValueOnce(new Error('save failed'));

    globalThis.window.api = { invoke };

    expect(() => saveProgress({ thresholdMs: 80, trialsCompleted: 2, recentAccuracy: 0.6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });

  test('writes dailyTime[today] into saved progress when sessionDurationMs > 0', async () => {
    const timerMod = await import('../../../components/timerService.js');
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const existing = { playerId: 'default', games: {} };
    const savedPayloads = [];
    const invoke = jest.fn()
      .mockResolvedValueOnce(existing)
      .mockImplementation((channel, payload) => {
        if (channel === 'progress:save') savedPayloads.push(payload);
        return Promise.resolve();
      });

    globalThis.window.api = { invoke };

    saveProgress(
      { thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 },
      90000,
    );

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(savedPayloads[0].data.games[GAME_ID].dailyTime['2024-01-15']).toBe(90000);
  });

  test('accumulates dailyTime on top of an existing entry for the same day', async () => {
    const timerMod = await import('../../../components/timerService.js');
    timerMod.getTodayDateString.mockReturnValue('2024-01-15');

    const existing = {
      playerId: 'default',
      games: {
        [GAME_ID]: {
          sessionsPlayed: 1,
          dailyTime: { '2024-01-15': 30000 },
        },
      },
    };
    const savedPayloads = [];
    const invoke = jest.fn()
      .mockResolvedValueOnce(existing)
      .mockImplementation((channel, payload) => {
        if (channel === 'progress:save') savedPayloads.push(payload);
        return Promise.resolve();
      });

    globalThis.window.api = { invoke };

    saveProgress(
      { thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 },
      60000,
    );

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    // 30000 (existing) + 60000 (new) = 90000
    expect(savedPayloads[0].data.games[GAME_ID].dailyTime['2024-01-15']).toBe(90000);
  });
});
