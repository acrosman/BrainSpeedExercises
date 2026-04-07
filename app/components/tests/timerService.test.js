/**
 * timerService.test.js — Unit tests for the centralized timer service.
 *
 * @file Tests for timerService.js
 */
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

import {
  startTimer,
  stopTimer,
  resetTimer,
  getElapsedMs,
  isTimerRunning,
  formatDuration,
  getTodayDateString,
} from '../timerService.js';

beforeEach(() => {
  jest.useFakeTimers();
  // Ensure a clean state before each test.
  resetTimer();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── getTodayDateString ────────────────────────────────────────────────────────

describe('getTodayDateString()', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getTodayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the current local date', () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    expect(getTodayDateString()).toBe(`${y}-${m}-${d}`);
  });
});

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration()', () => {
  it('formats 0 ms as "00:00"', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats 1000 ms as "00:01"', () => {
    expect(formatDuration(1000)).toBe('00:01');
  });

  it('formats 59000 ms as "00:59"', () => {
    expect(formatDuration(59000)).toBe('00:59');
  });

  it('formats 60000 ms as "01:00"', () => {
    expect(formatDuration(60000)).toBe('01:00');
  });

  it('formats 90000 ms as "01:30"', () => {
    expect(formatDuration(90000)).toBe('01:30');
  });

  it('formats 600000 ms (10 min) as "10:00"', () => {
    expect(formatDuration(600000)).toBe('10:00');
  });

  it('handles sub-second values (rounds down to nearest second)', () => {
    expect(formatDuration(999)).toBe('00:00');
    expect(formatDuration(1500)).toBe('00:01');
  });

  it('handles negative values by treating them as 0', () => {
    expect(formatDuration(-500)).toBe('00:00');
  });
});

// ── isTimerRunning ────────────────────────────────────────────────────────────

describe('isTimerRunning()', () => {
  it('returns false before the timer is started', () => {
    expect(isTimerRunning()).toBe(false);
  });

  it('returns true after startTimer() is called', () => {
    startTimer();
    expect(isTimerRunning()).toBe(true);
  });

  it('returns false after stopTimer() is called', () => {
    startTimer();
    stopTimer();
    expect(isTimerRunning()).toBe(false);
  });

  it('returns false after resetTimer() is called', () => {
    startTimer();
    resetTimer();
    expect(isTimerRunning()).toBe(false);
  });
});

// ── getElapsedMs ──────────────────────────────────────────────────────────────

describe('getElapsedMs()', () => {
  it('returns 0 when the timer is not running', () => {
    expect(getElapsedMs()).toBe(0);
  });

  it('returns elapsed ms after time advances', () => {
    startTimer();
    jest.advanceTimersByTime(5000);
    expect(getElapsedMs()).toBe(5000);
  });

  it('does not stop the timer', () => {
    startTimer();
    jest.advanceTimersByTime(3000);
    getElapsedMs();
    expect(isTimerRunning()).toBe(true);
  });
});

// ── startTimer ────────────────────────────────────────────────────────────────

describe('startTimer()', () => {
  it('starts the timer (isTimerRunning becomes true)', () => {
    startTimer();
    expect(isTimerRunning()).toBe(true);
  });

  it('restarts when called while already running', () => {
    startTimer();
    jest.advanceTimersByTime(3000);
    startTimer(); // restart — resets start time
    jest.advanceTimersByTime(1000);
    expect(getElapsedMs()).toBe(1000);
  });

  it('invokes onTick callback with elapsed ms on each interval', () => {
    const onTick = jest.fn();
    startTimer(onTick, 1000);
    jest.advanceTimersByTime(3000);
    // Expect callback to have been called 3 times (at 1s, 2s, 3s).
    expect(onTick).toHaveBeenCalledTimes(3);
    // Each call receives elapsed ms (approximately 1000, 2000, 3000).
    expect(onTick.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
    expect(onTick.mock.calls[1][0]).toBeGreaterThanOrEqual(2000);
    expect(onTick.mock.calls[2][0]).toBeGreaterThanOrEqual(3000);
  });

  it('does not invoke onTick when null is passed', () => {
    startTimer(null, 1000);
    jest.advanceTimersByTime(5000);
    // No error thrown, no callbacks
    expect(isTimerRunning()).toBe(true);
  });

  it('clears the previous tick interval when restarted', () => {
    const firstTick = jest.fn();
    const secondTick = jest.fn();
    startTimer(firstTick, 1000);
    jest.advanceTimersByTime(1000); // firstTick called once
    startTimer(secondTick, 1000); // restart with new callback
    jest.advanceTimersByTime(2000); // only secondTick should fire now
    expect(firstTick).toHaveBeenCalledTimes(1);
    expect(secondTick).toHaveBeenCalledTimes(2);
  });
});

// ── stopTimer ─────────────────────────────────────────────────────────────────

describe('stopTimer()', () => {
  it('returns 0 when the timer was not running', () => {
    expect(stopTimer()).toBe(0);
  });

  it('returns the elapsed milliseconds since start', () => {
    startTimer();
    jest.advanceTimersByTime(4000);
    expect(stopTimer()).toBe(4000);
  });

  it('stops the timer (isTimerRunning becomes false)', () => {
    startTimer();
    stopTimer();
    expect(isTimerRunning()).toBe(false);
  });

  it('stops the tick interval', () => {
    const onTick = jest.fn();
    startTimer(onTick, 1000);
    jest.advanceTimersByTime(2000); // 2 ticks
    stopTimer();
    jest.advanceTimersByTime(3000); // should produce no more ticks
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('can be called multiple times without throwing', () => {
    startTimer();
    stopTimer();
    expect(() => stopTimer()).not.toThrow();
    expect(stopTimer()).toBe(0);
  });
});

// ── resetTimer ────────────────────────────────────────────────────────────────

describe('resetTimer()', () => {
  it('stops the timer without returning elapsed ms', () => {
    startTimer();
    jest.advanceTimersByTime(3000);
    resetTimer();
    expect(isTimerRunning()).toBe(false);
  });

  it('stops the tick interval', () => {
    const onTick = jest.fn();
    startTimer(onTick, 1000);
    jest.advanceTimersByTime(1000); // 1 tick
    resetTimer();
    jest.advanceTimersByTime(3000); // no more ticks
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the timer is not running', () => {
    expect(() => resetTimer()).not.toThrow();
  });

  it('getElapsedMs returns 0 after reset', () => {
    startTimer();
    jest.advanceTimersByTime(5000);
    resetTimer();
    expect(getElapsedMs()).toBe(0);
  });
});
