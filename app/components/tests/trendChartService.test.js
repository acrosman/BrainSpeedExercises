/** @jest-environment jsdom */
/**
 * trendChartService.test.js — Unit tests for the centralized trend chart service.
 *
 * Exercises buildPolylinePoints, buildMaxLevelPath, and renderTrendChart against simple inputs,
 * edge cases, and null-element guards.
 *
 * @file Tests for app/components/trendChartService.js
 */

import { describe, test, expect } from '@jest/globals';
import {
  buildMaxLevelPath,
  buildPolylinePoints,
  renderTrendChart,
} from '../trendChartService.js';

// ── buildPolylinePoints ───────────────────────────────────────────────────────

describe('buildPolylinePoints', () => {
  test('returns empty string for an empty array', () => {
    expect(buildPolylinePoints([])).toBe('');
  });

  test('returns empty string for null input', () => {
    expect(buildPolylinePoints(null)).toBe('');
  });

  test('returns a single point string for a one-element array', () => {
    const result = buildPolylinePoints([300]);
    expect(result).not.toBe('');
    expect(result.split(' ').length).toBe(1);
  });

  test('returns three coordinate pairs for a three-element array', () => {
    const result = buildPolylinePoints([200, 150, 100]);
    expect(result.split(' ').length).toBe(3);
  });

  test('each coordinate pair contains an x and y value separated by a comma', () => {
    const result = buildPolylinePoints([100, 200]);
    result.split(' ').forEach((pair) => {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    });
  });

  test('uses the full chart width between first and last point', () => {
    const result = buildPolylinePoints([100, 200]);
    const pairs = result.split(' ').map((p) => p.split(',').map(Number));
    // With CHART_PAD=10 and CHART_WIDTH=300, first x should be ~10, last x ~290
    expect(pairs[0][0]).toBeCloseTo(10, 1);
    expect(pairs[1][0]).toBeCloseTo(290, 1);
  });

  test('places a single entry at leftmost x position', () => {
    const result = buildPolylinePoints([500]);
    const [x] = result.split(',').map(Number);
    expect(x).toBeCloseTo(10, 1);
  });

  test('handles all-identical values without division errors', () => {
    expect(() => buildPolylinePoints([100, 100, 100])).not.toThrow();
    const result = buildPolylinePoints([100, 100, 100]);
    expect(result.split(' ').length).toBe(3);
  });

  test('larger values produce higher y coordinates (lower on SVG = larger value)', () => {
    // With values [100, 200]: value 100 (min) → lower y, value 200 (max) → higher y
    const result = buildPolylinePoints([100, 200]);
    const pairs = result.split(' ').map((p) => p.split(',').map(Number));
    // value 100 is at min: y should be near bottom (large y number)
    // value 200 is at max: y should be near top (small y number)
    expect(pairs[0][1]).toBeGreaterThan(pairs[1][1]);
  });
});

// ── buildMaxLevelPath ─────────────────────────────────────────────────────────

/**
 * Build level points from levels and a matching list of at-max flags.
 *
 * @param {number[]} levels
 * @param {boolean[]} [atMax]
 * @returns {Array<{ level: number, atMax: boolean }>}
 */
function points(levels, atMax = []) {
  return levels.map((level, index) => ({ level, atMax: Boolean(atMax[index]) }));
}

describe('buildMaxLevelPath', () => {
  test('returns empty string for an empty or null history', () => {
    expect(buildMaxLevelPath([])).toBe('');
    expect(buildMaxLevelPath(null)).toBe('');
  });

  test('returns empty string when no point is at the maximum level', () => {
    expect(buildMaxLevelPath(points([1, 2, 3]))).toBe('');
  });

  test('leaves out a lone at-max point, which has no segment', () => {
    expect(buildMaxLevelPath(points([1, 5, 4], [false, true, false]))).toBe('');
  });

  test('traces a run of at-max points over the polyline coordinates', () => {
    const history = points([3, 5, 5, 5], [false, true, true, true]);
    const coords = buildPolylinePoints([3, 5, 5, 5]).split(' ');

    expect(buildMaxLevelPath(history)).toBe(`M ${coords[1]} L ${coords[2]} L ${coords[3]}`);
  });

  test('starts a new subpath for each separate run at the maximum level', () => {
    const history = points([5, 5, 4, 5, 5], [true, true, false, true, true]);
    const coords = buildPolylinePoints([5, 5, 4, 5, 5]).split(' ');

    expect(buildMaxLevelPath(history)).toBe(
      `M ${coords[0]} L ${coords[1]} M ${coords[3]} L ${coords[4]}`,
    );
  });
});

// ── renderTrendChart ──────────────────────────────────────────────────────────

describe('renderTrendChart', () => {
  test('plots the levels and hides emptyEl for a non-empty history', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const emptyEl = document.createElement('p');
    const latestEl = document.createElement('strong');

    renderTrendChart({ lineEl, emptyEl, latestEl }, points([1, 2, 3]), 1);

    expect(lineEl.getAttribute('points')).toBe(buildPolylinePoints([1, 2, 3]));
    expect(emptyEl.hidden).toBe(true);
    expect(latestEl.textContent).toBe('3');
  });

  test('clears the lineEl and shows emptyEl when the history is empty', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    lineEl.setAttribute('points', '10,10 20,20');
    const emptyEl = document.createElement('p');
    const latestEl = document.createElement('strong');

    renderTrendChart({ lineEl, emptyEl, latestEl }, [], 1);

    expect(lineEl.getAttribute('points')).toBe('');
    expect(emptyEl.hidden).toBe(false);
    expect(latestEl.textContent).toBe('1');
  });

  test('uses currentLevel for latestEl when the history is empty', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart({ lineEl: null, emptyEl: null, latestEl }, [], '4');
    expect(latestEl.textContent).toBe('4');
  });

  test('uses the last point in the history as the latest level', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart({ lineEl: null, emptyEl: null, latestEl }, points([1, 2, 2]), 1);
    expect(latestEl.textContent).toBe('2');
  });

  test('marks the latest level as the maximum when the last point is at max', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart(
      { lineEl: null, emptyEl: null, latestEl },
      points([9, 10], [false, true]),
      1,
    );
    expect(latestEl.textContent).toBe('10 (max)');
  });

  test('writes the at-max path to maxLineEl', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const maxLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const history = points([4, 5, 5], [false, true, true]);

    renderTrendChart({ lineEl, maxLineEl, emptyEl: null, latestEl: null }, history, 1);

    expect(maxLineEl.getAttribute('d')).toBe(buildMaxLevelPath(history));
    expect(maxLineEl.getAttribute('d')).not.toBe('');
  });

  test('clears maxLineEl when the history has no at-max segment', () => {
    const maxLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    maxLineEl.setAttribute('d', 'M 1,1 L 2,2');

    renderTrendChart(
      { lineEl: null, maxLineEl, emptyEl: null, latestEl: null },
      points([1, 2]),
      1,
    );

    expect(maxLineEl.getAttribute('d')).toBe('');
  });

  test('tolerates null lineEl without throwing', () => {
    expect(() => renderTrendChart(
      { lineEl: null, emptyEl: null, latestEl: null },
      points([1, 2]),
      1,
    )).not.toThrow();
  });

  test('tolerates null emptyEl without throwing', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    expect(() => renderTrendChart(
      { lineEl, emptyEl: null, latestEl: null },
      points([1, 2]),
      1,
    )).not.toThrow();
  });

  test('tolerates null latestEl without throwing', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    expect(() => renderTrendChart(
      { lineEl, emptyEl: null, latestEl: null },
      [],
      1,
    )).not.toThrow();
  });

  test('renders empty string for latestEl when currentLevel is null and history is empty', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart({ lineEl: null, emptyEl: null, latestEl }, [], null);
    expect(latestEl.textContent).toBe('');
  });
});
