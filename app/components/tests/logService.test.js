/** @jest-environment node */
/**
 * logService.test.js — Unit tests for the renderer-side logging service.
 *
 * Exercises log(), logger.*, and the LOG_LEVELS export against a mocked
 * window.api IPC bridge.
 *
 * @file Tests for app/components/logService.js
 */

import { jest } from '@jest/globals';

// ── Module-level mock setup ───────────────────────────────────────────────────

const { log, logger, LOG_LEVELS } = await import('../logService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock window.api object that records invoke calls.
 * @returns {{ mock: jest.Mock }}
 */
function buildApiMock() {
  const mock = jest.fn(() => Promise.resolve());
  return { mock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LOG_LEVELS', () => {
  it('exports an array of valid log level strings', () => {
    expect(LOG_LEVELS).toEqual(
      expect.arrayContaining(['error', 'warn', 'info', 'verbose', 'debug', 'silly']),
    );
  });
});

describe('log()', () => {
  afterEach(() => {
    delete global.window;
  });

  it('does nothing when window is undefined', () => {
    // No global.window — should not throw.
    expect(() => log('info', 'test message')).not.toThrow();
  });

  it('does nothing when window.api is absent', () => {
    global.window = {};
    expect(() => log('info', 'test message')).not.toThrow();
  });

  it('calls window.api.invoke with log:send and the correct payload', () => {
    const { mock } = buildApiMock();
    global.window = { api: { invoke: mock } };

    log('error', 'something broke');

    expect(mock).toHaveBeenCalledWith('log:send', {
      level: 'error',
      message: 'something broke',
    });
  });

  it('joins multiple arguments into a single space-separated message string', () => {
    const { mock } = buildApiMock();
    global.window = { api: { invoke: mock } };

    log('warn', 'part1', 'part2', 'part3');

    expect(mock).toHaveBeenCalledWith('log:send', {
      level: 'warn',
      message: 'part1 part2 part3',
    });
  });

  it('serializes object arguments to JSON', () => {
    const { mock } = buildApiMock();
    global.window = { api: { invoke: mock } };

    log('debug', 'data:', { key: 'value' });

    expect(mock).toHaveBeenCalledWith('log:send', {
      level: 'debug',
      message: 'data: {"key":"value"}',
    });
  });

  it('passes the provided level through unchanged', () => {
    const { mock } = buildApiMock();
    global.window = { api: { invoke: mock } };

    log('verbose', 'verbose message');

    expect(mock).toHaveBeenCalledWith('log:send', {
      level: 'verbose',
      message: 'verbose message',
    });
  });
});

describe('logger', () => {
  let mock;

  beforeEach(() => {
    ({ mock } = buildApiMock());
    global.window = { api: { invoke: mock } };
  });

  afterEach(() => {
    delete global.window;
  });

  it.each(['error', 'warn', 'info', 'verbose', 'debug', 'silly'])(
    'logger.%s() sends level="%s" to the IPC channel',
    (level) => {
      logger[level]('test');
      expect(mock).toHaveBeenCalledWith('log:send', {
        level,
        message: 'test',
      });
    },
  );
});
