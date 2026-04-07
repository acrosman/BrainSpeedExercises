/**
 * timerService.js — Centralized play-time tracking service for BrainSpeedExercises.
 *
 * Provides a single shared timer used by all game plugins to track session duration.
 * Supports an optional per-tick callback to drive a live timer display in the game UI.
 * Also exposes formatting and date helpers used across the application.
 *
 * @file Centralized timer service for game session tracking.
 */

/** @type {number|null} Timestamp (ms since epoch) when the current session started. */
let _startTime = null;

/** @type {ReturnType<typeof setInterval>|null} Handle for the live-display tick interval. */
let _intervalId = null;

/**
 * Return today's date as a YYYY-MM-DD string in local time.
 *
 * @returns {string} e.g. "2024-01-15"
 */
export function getTodayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a duration in milliseconds as a MM:SS string.
 *
 * @param {number} ms - Duration in milliseconds (non-negative).
 * @returns {string} Formatted time string, e.g. "05:30".
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Start the session timer.
 *
 * If the timer is already running it is restarted.
 * Optionally accepts a tick callback that is called every `tickIntervalMs` milliseconds
 * with the current elapsed time in milliseconds, allowing the caller to update a live
 * display without managing their own interval.
 *
 * @param {((elapsedMs: number) => void)|null} [onTick=null]
 *   Callback invoked on each tick. Receives elapsed milliseconds since start.
 * @param {number} [tickIntervalMs=1000] Tick interval in milliseconds.
 */
export function startTimer(onTick = null, tickIntervalMs = 1000) {
  // Clear any existing tick interval.
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }

  _startTime = Date.now();

  if (typeof onTick === 'function') {
    _intervalId = setInterval(() => {
      if (_startTime !== null) {
        onTick(Date.now() - _startTime);
      }
    }, tickIntervalMs);
  }
}

/**
 * Stop the session timer and return the elapsed milliseconds.
 *
 * Also clears any active tick interval.
 * Returns 0 without throwing if the timer was not running.
 *
 * @returns {number} Elapsed milliseconds since `startTimer` was called, or 0.
 */
export function stopTimer() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }

  if (_startTime === null) return 0;
  const elapsed = Date.now() - _startTime;
  _startTime = null;
  return elapsed;
}

/**
 * Reset the timer without returning the elapsed time.
 *
 * Also clears any active tick interval.
 * Safe to call even if the timer is not running.
 */
export function resetTimer() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _startTime = null;
}

/**
 * Return the elapsed milliseconds since `startTimer` was called, without stopping the timer.
 *
 * Returns 0 if the timer is not running.
 *
 * @returns {number}
 */
export function getElapsedMs() {
  if (_startTime === null) return 0;
  return Date.now() - _startTime;
}

/**
 * Return whether the session timer is currently running.
 *
 * @returns {boolean}
 */
export function isTimerRunning() {
  return _startTime !== null;
}
