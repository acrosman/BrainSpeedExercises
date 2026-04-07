/** @jest-environment jsdom */
/**
 * progress.test.js — Unit tests for Directional Processing progress persistence.
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

const { saveProgress, GAME_ID } = await import('../progress.js');

describe('GAME_ID', () => {
  test('matches the manifest id', () => {
    expect(GAME_ID).toBe('directional-processing');
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

    expect(() => saveProgress({ score: 5, level: 2, trialsCompleted: 10 }))
      .not.toThrow();

    globalThis.window = originalWindow;
  });

  test('does nothing when window.api is undefined', () => {
    expect(() => saveProgress({ score: 5, level: 2, trialsCompleted: 10 }))
      .not.toThrow();
  });

  test('calls progress:save with correct high-level fields', async () => {
    const existing = {
      playerId: 'default',
      games: { [GAME_ID]: { sessionsPlayed: 1 } },
    };
    const invoke = jest.fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(undefined);

    globalThis.window.api = { invoke };

    saveProgress({ score: 5, level: 2, trialsCompleted: 10 });

    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(invoke).toHaveBeenCalledWith(
      'progress:save',
      expect.objectContaining({ playerId: 'default' }),
    );

    const savedData = invoke.mock.calls[1][1].data;
    expect(savedData.games[GAME_ID].sessionsPlayed).toBe(2);
    expect(savedData.games[GAME_ID].highScore).toBe(5);
    expect(savedData.games[GAME_ID].highestLevel).toBe(2);
    expect(savedData.games[GAME_ID].lastTrialsCompleted).toBe(10);
  });

  test('persists sessionDurationMs in dailyTime', async () => {
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

    saveProgress({ score: 3, level: 1, trialsCompleted: 6 }, 60000);

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(savedPayloads[0].data.games[GAME_ID].dailyTime['2024-01-15']).toBe(60000);
  });

  test('falls back gracefully when progress:load rejects', async () => {
    const invoke = jest.fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(undefined);

    globalThis.window.api = { invoke };

    expect(() => saveProgress({ score: 3, level: 1, trialsCompleted: 6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(invoke).toHaveBeenCalledWith('progress:save', expect.anything());
  });

  test('falls back gracefully when progress:save rejects', async () => {
    const invoke = jest.fn()
      .mockResolvedValueOnce({ playerId: 'default', games: {} })
      .mockRejectedValueOnce(new Error('save failed'));

    globalThis.window.api = { invoke };

    expect(() => saveProgress({ score: 3, level: 1, trialsCompleted: 6 }))
      .not.toThrow();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
});
