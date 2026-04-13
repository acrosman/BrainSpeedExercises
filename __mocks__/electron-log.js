/**
 * __mocks__/electron-log.js — Jest manual mock for the electron-log package.
 *
 * Provides stub implementations of every log-level method so that unit tests
 * can spy on logging calls without writing to the filesystem or stdout.
 *
 * @file Jest mock for electron-log.
 */

import { jest } from '@jest/globals';

const electronLog = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
  initialize: jest.fn(),
  transports: {
    file: {
      level: 'info',
      resolvePathFn: jest.fn(),
    },
    console: {
      level: 'warn',
    },
  },
};

export default electronLog;
