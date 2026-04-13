/**
 * logService.js — Renderer-side logging service for BrainSpeedExercises.
 *
 * Forwards log messages from the renderer process to the main process via IPC,
 * where they are written through the application's electron-log instance.
 *
 * All renderer code (interface.js, game plugins, components) should import from
 * this module instead of calling console.* directly.
 *
 * Usage:
 *   import { logger } from '../../components/logService.js';
 *   logger.error('Something went wrong', err);
 *   logger.warn('Unexpected state', { gameId });
 *   logger.info('Game started', gameId);
 *
 * @file Renderer-side IPC logging wrapper.
 */

/**
 * Valid log level strings accepted by the main-process log handler.
 * @readonly
 * @enum {string}
 */
export const LOG_LEVELS = /** @type {const} */ (
  ['error', 'warn', 'info', 'verbose', 'debug']
);

/**
 * Safely serialize a single log argument to a string.
 *
 * - `Error` instances are serialized as `"<name>: <message>\n<stack>"` so
 *   that message and stack are never lost (plain `JSON.stringify` returns `{}`
 *   for Error objects).
 * - Other objects are serialized via `JSON.stringify`; if that throws (e.g.
 *   circular references) the value falls back to `String(a)`.
 * - Primitives are converted with `String()`.
 *
 * @param {*} a - The value to serialize.
 * @returns {string}
 */
function serializeArg(a) {
  if (a instanceof Error) {
    return a.stack ? `${a.name}: ${a.message}\n${a.stack}` : `${a.name}: ${a.message}`;
  }
  if (typeof a === 'object' && a !== null) {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }
  return String(a);
}

/**
 * Send a log message to the main process via the `log:send` IPC channel.
 *
 * Safe to call when `window.api` is unavailable (e.g., in a test environment
 * without a real DOM); the call is silently ignored in that case.
 *
 * @param {string} level - One of the {@link LOG_LEVELS} values.
 * @param {...*} args - Message parts; joined with a space before sending.
 * @returns {void}
 */
export function log(level, ...args) {
  if (typeof window === 'undefined' || !window.api) return;
  const message = args.map(serializeArg).join(' ');
  // Fire-and-forget: if the IPC channel is unavailable (e.g., main process restarting)
  // the logging call fails silently so it never disrupts the caller.
  window.api.invoke('log:send', { level, message }).catch(() => {});
}

/**
 * Structured logger object with one method per log level.
 *
 * Each method forwards its arguments to {@link log} with the matching level.
 *
 * @namespace logger
 */
export const logger = {
  /** Log an error-level message. @param {...*} args */
  error: (...args) => log('error', ...args),
  /** Log a warning-level message. @param {...*} args */
  warn: (...args) => log('warn', ...args),
  /** Log an info-level message. @param {...*} args */
  info: (...args) => log('info', ...args),
  /** Log a verbose-level message. @param {...*} args */
  verbose: (...args) => log('verbose', ...args),
  /** Log a debug-level message. @param {...*} args */
  debug: (...args) => log('debug', ...args),
};
