/** @jest-environment jsdom */
/**
 * trendChartService.test.js — Unit tests for the centralized trend chart service.
 *
 * Exercises buildPolylinePoints and renderTrendChart against simple inputs,
 * edge cases, and null-element guards.
 *
 * @file Tests for app/components/trendChartService.js
 */

import { describe, test, expect } from '@jest/globals';
import { buildPolylinePoints, renderTrendChart } from '../trendChartService.js';

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

// ── renderTrendChart ──────────────────────────────────────────────────────────

describe('renderTrendChart', () => {
  test('updates lineEl points attribute for a non-empty values array', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const emptyEl = document.createElement('p');
    const latestEl = document.createElement('strong');

    renderTrendChart({ lineEl, emptyEl, latestEl }, [200, 150, 100], 500);

    expect(lineEl.getAttribute('points')).not.toBe('');
    expect(emptyEl.hidden).toBe(true);
    expect(latestEl.textContent).toBe('100');
  });

  test('clears the lineEl and shows emptyEl when values array is empty', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    lineEl.setAttribute('points', '10,10 20,20');
    const emptyEl = document.createElement('p');
    const latestEl = document.createElement('strong');

    renderTrendChart({ lineEl, emptyEl, latestEl }, [], 400);

    expect(lineEl.getAttribute('points')).toBe('');
    expect(emptyEl.hidden).toBe(false);
    expect(latestEl.textContent).toBe('400');
  });

  test('uses currentValue for latestEl when values array is empty', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart(
      { lineEl: null, emptyEl: null, latestEl },
      [],
      '350',
    );
    expect(latestEl.textContent).toBe('350');
  });

  test('uses the last value in the array as the latest value', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart(
      { lineEl: null, emptyEl: null, latestEl },
      [500, 450, 380],
      500,
    );
    expect(latestEl.textContent).toBe('380');
  });

  test('tolerates null lineEl without throwing', () => {
    expect(() => renderTrendChart(
      { lineEl: null, emptyEl: null, latestEl: null },
      [100, 200],
      300,
    )).not.toThrow();
  });

  test('tolerates null emptyEl without throwing', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    expect(() => renderTrendChart(
      { lineEl, emptyEl: null, latestEl: null },
      [100, 200],
      300,
    )).not.toThrow();
  });

  test('tolerates null latestEl without throwing', () => {
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    expect(() => renderTrendChart(
      { lineEl, emptyEl: null, latestEl: null },
      [],
      300,
    )).not.toThrow();
  });

  test('renders empty string for latestEl when currentValue is null and values is empty', () => {
    const latestEl = document.createElement('strong');
    renderTrendChart({ lineEl: null, emptyEl: null, latestEl }, [], null);
    expect(latestEl.textContent).toBe('');
  });
});
