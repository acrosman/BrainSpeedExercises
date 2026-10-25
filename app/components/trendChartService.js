/**
 * trendChartService.js — Centralized trend chart service for BrainSpeedExercises.
 *
 * Provides shared SVG chart generation and rendering utilities used by all game
 * plugins to display the player's level during gameplay. Each game tracks its own
 * level history and passes it here for rendering. Stretches of the history spent at
 * the game's maximum level are drawn as a separate highlighted path.
 *
 * @file Centralized trend chart rendering service.
 */

/**
 * One point on the level trend chart.
 *
 * @typedef {{ level: number, atMax: boolean }} LevelPoint
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
 * Map an array of numeric values onto `"x,y"` coordinates within the padded SVG viewBox.
 *
 * The x axis represents progression over time (left = first, right = last);
 * the y axis is scaled so the minimum value sits near the bottom and the
 * maximum near the top.
 *
 * @param {number[]} values - Ordered array of numeric values to plot.
 * @returns {string[]} One `"x,y"` string per value.
 */
function toChartCoordinates(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const denominator = Math.max(values.length - 1, 1);

  return values.map((value, index) => {
    const x = CHART_PAD + ((CHART_WIDTH - CHART_PAD * 2) * index) / denominator;
    const normalized = (value - min) / span;
    const y = CHART_HEIGHT - CHART_PAD - normalized * (CHART_HEIGHT - CHART_PAD * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
}

/**
 * Build an SVG polyline `points` attribute string from an array of numeric values.
 *
 * Lower values appear lower on the chart and higher values higher.
 *
 * @param {number[]} values - Ordered array of numeric values to plot.
 * @returns {string} Space-separated `"x,y"` coordinate pairs, or `""` when
 *   the array is empty or falsy.
 */
export function buildPolylinePoints(values) {
  if (!values || values.length === 0) {
    return '';
  }
  return toChartCoordinates(values).join(' ');
}

/**
 * Build an SVG path `d` attribute that traces every stretch of the history spent at
 * the maximum level.
 *
 * Each run of two or more consecutive `atMax` points becomes one `M … L …` subpath
 * over the same coordinates as the main polyline, so the path sits on top of it.
 * A lone `atMax` point has no segment and is left out.
 *
 * @param {LevelPoint[]} history - Ordered level history.
 * @returns {string} Path data, or `""` when no segment is at the maximum level.
 */
export function buildMaxLevelPath(history) {
  if (!history || history.length === 0) {
    return '';
  }

  const coords = toChartCoordinates(history.map((point) => point.level));
  const subpaths = [];
  let run = [];

  const closeRun = () => {
    if (run.length >= 2) {
      subpaths.push(`M ${run.join(' L ')}`);
    }
    run = [];
  };

  history.forEach((point, index) => {
    if (point.atMax) {
      run.push(coords[index]);
    } else {
      closeRun();
    }
  });
  closeRun();

  return subpaths.join(' ');
}

/**
 * Render (or update) a level trend chart with the supplied history.
 *
 * Accepts a plain object of nullable element references so callers can pass
 * whatever subset of the chart elements they have wired up without crashing.
 *
 * @param {{
 *   lineEl: SVGPolylineElement|null,
 *   maxLineEl?: SVGPathElement|null,
 *   emptyEl: HTMLElement|null,
 *   latestEl: HTMLElement|null,
 * }} els - References to the chart's key DOM nodes.
 * @param {LevelPoint[]} history - Ordered level history, one point per trial or round.
 * @param {number|string|null} currentLevel - The level to display when `history` is
 *   empty (typically the starting level).
 */
export function renderTrendChart(els, history, currentLevel) {
  if (els.latestEl) {
    const latest = history.length > 0 ? history[history.length - 1] : null;
    if (latest) {
      els.latestEl.textContent = latest.atMax ? `${latest.level} (max)` : String(latest.level);
    } else {
      els.latestEl.textContent = currentLevel != null ? String(currentLevel) : '';
    }
  }

  if (els.maxLineEl) {
    els.maxLineEl.setAttribute('d', buildMaxLevelPath(history));
  }

  if (!els.lineEl) return;

  const points = buildPolylinePoints(history.map((point) => point.level));
  els.lineEl.setAttribute('points', points);

  if (els.emptyEl) {
    els.emptyEl.hidden = points.length > 0;
  }
}
