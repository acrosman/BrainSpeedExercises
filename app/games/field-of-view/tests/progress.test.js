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
  });

  test('does nothing when window is undefined', () => {
    const originalWindow = globalThis.window;
    delete globalThis.window;

    expect(() => saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 }))
      .not.toThrow();

    globalThis.window = originalWindow;
  });

  test('does nothing when window.api is undefined', () => {
    const savedApi = globalThis.window.api;
    delete globalThis.window.api;

    expect(() => saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 }))
      .not.toThrow();

    globalThis.window.api = savedApi;
  });

  test('calls progress:save with correct data', async () => {
    const existing = { playerId: 'default', games: { [GAME_ID]: { sessionsPlayed: 2 } } };
    const invoke = jest.fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(undefined);

    globalThis.window = globalThis.window || {};
    const savedApi = globalThis.window.api;
    globalThis.window.api = { invoke };

    saveProgress({ thresholdMs: 100, trialsCompleted: 3, recentAccuracy: 0.8 });

    // Wait for the async IIFE to run.
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

    globalThis.window.api = savedApi;
  });

  test('falls back gracefully when progress:load rejects', async () => {
    const invoke = jest.fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(undefined);

    const savedApi = globalThis.window.api;
    globalThis.window.api = { invoke };

    expect(() => saveProgress({ thresholdMs: 80, trialsCompleted: 2, recentAccuracy: 0.6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.anything(),
    );

    globalThis.window.api = savedApi;
  });

  test('falls back gracefully when progress:save rejects', async () => {
    const invoke = jest.fn()
      .mockResolvedValueOnce({ playerId: 'default', games: {} })
      .mockRejectedValueOnce(new Error('save failed'));

    const savedApi = globalThis.window.api;
    globalThis.window.api = { invoke };

    expect(() => saveProgress({ thresholdMs: 80, trialsCompleted: 2, recentAccuracy: 0.6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    globalThis.window.api = savedApi;
  });
});
