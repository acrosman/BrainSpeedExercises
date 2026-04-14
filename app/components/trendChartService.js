/**
 * trendChartService.js — Centralized trend chart service for BrainSpeedExercises.
 *
 * Provides shared SVG polyline chart generation and rendering utilities used by
 * all game plugins to display a speed/difficulty metric history during gameplay.
 * Each game tracks its own history array and passes it here for rendering.
 *
 * @file Centralized trend chart rendering service.
 */

// ── Chart geometry constants ───────────────────────────────────────────────────

/** SVG viewBox width in user units. */
const CHART_WIDTH = 300;

/** SVG viewBox height in user units. */
const CHART_HEIGHT = 120;

/** Padding from each edge of the SVG in user units. */
const CHART_PAD = 10;

// ── Core chart helpers ────────────────────────────────────────────────────────

/**
 * Build an SVG polyline `points` attribute string from an array of numeric values.
 *
 * Maps each value onto an (x, y) coordinate within the padded SVG viewBox.
 * The x axis represents progression over time (left = first, right = last);
 * the y axis is scaled so the minimum value sits near the bottom and the
 * maximum near the top (lower values appear lower on the chart).
 *
 * @param {number[]} values - Ordered array of numeric metric values to plot.
 * @returns {string} Space-separated `"x,y"` coordinate pairs, or `""` when
 *   the array is empty or falsy.
 */
export function buildPolylinePoints(values) {
  if (!values || values.length === 0) {
    return '';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const denominator = Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const x = CHART_PAD + ((CHART_WIDTH - CHART_PAD * 2) * index) / denominator;
    const normalized = (value - min) / span;
    const y = CHART_HEIGHT - CHART_PAD - normalized * (CHART_HEIGHT - CHART_PAD * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

/**
 * Render (or update) a speed/difficulty trend chart with the supplied history.
 *
 * Accepts a plain object of nullable element references so callers can pass
 * whatever subset of the chart elements they have wired up without crashing.
 *
 * @param {{
 *   lineEl: SVGPolylineElement|null,
 *   emptyEl: HTMLElement|null,
 *   latestEl: HTMLElement|null,
 * }} els - References to the chart's key DOM nodes.
 * @param {number[]} values - Ordered array of numeric metric values to plot.
 * @param {number|string} currentValue - The value to display when `values` is
 *   empty (typically the metric's starting/default value).
 */
export function renderTrendChart(els, values, currentValue) {
  const latest = values.length > 0 ? values[values.length - 1] : currentValue;

  if (els.latestEl) {
    els.latestEl.textContent = latest != null ? String(latest) : '';
  }

  if (!els.lineEl) return;

  const points = buildPolylinePoints(values);
  els.lineEl.setAttribute('points', points);

  if (els.emptyEl) {
    els.emptyEl.hidden = points.length > 0;
  }
}
