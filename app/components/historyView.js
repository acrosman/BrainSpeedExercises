/**
 * historyView.js — History view component for BrainSpeedExercises.
 *
 * Builds an accessible history panel showing time played per game per day,
 * with a CSS bar chart and a data table. All rendering is pure DOM manipulation
 * so it can be unit-tested without a real browser environment.
 *
 * Bar colors are defined in `style.css` as CSS custom properties
 * (`--chart-color-0` through `--chart-color-9`) and applied via
 * `history-chart__bar--color-N` / `history-chart__legend-swatch--color-N` classes.
 *
 * @file Play history visualization component.
 */

import { formatDuration } from './timerService.js';

/**
 * Number of distinct color slots defined in `style.css`.
 * Bars for game indices >= COLOR_SLOT_COUNT cycle back to slot 0.
 *
 * @type {number}
 */
const COLOR_SLOT_COUNT = 10;

/**
 * Number of most-recent days shown in the per-game bar chart before the
 * "show older days" toggle button is displayed.
 *
 * @type {number}
 */
export const INITIAL_VISIBLE_DAYS = 6;

/**
 * Maximum number of x-axis date labels shown on the total play-time line chart.
 * When there are more data points than this, labels are thinned so they remain readable.
 *
 * @type {number}
 */
export const MAX_X_LABELS = 10;

/**
 * Extract all unique YYYY-MM-DD date keys present across all games' dailyTime maps.
 *
 * @param {object} progress - Player progress object.
 * @returns {string[]} Sorted array of date strings (ascending).
 */
export function getAllDates(progress) {
  const dateSet = new Set();
  if (progress && progress.games) {
    Object.values(progress.games).forEach((gameProgress) => {
      if (gameProgress && gameProgress.dailyTime) {
        Object.keys(gameProgress.dailyTime).forEach((date) => dateSet.add(date));
      }
    });
  }
  return [...dateSet].sort();
}

/**
 * Return the IDs of games that have at least one dailyTime entry.
 *
 * @param {object} progress - Player progress object.
 * @returns {string[]} Array of game IDs with play history.
 */
export function getGamesWithData(progress) {
  if (!progress || !progress.games) return [];
  return Object.entries(progress.games)
    .filter(([, gp]) => gp && gp.dailyTime && Object.keys(gp.dailyTime).length > 0)
    .map(([id]) => id);
}

/**
 * Build a per-day summary: for each date, record ms played per game and total.
 *
 * @param {object} progress - Player progress object.
 * @param {string[]} dates - Sorted array of date strings.
 * @param {string[]} gameIds - Game IDs to include.
 * @returns {Array<{date: string, total: number, [gameId: string]: number}>}
 */
export function buildSummaryData(progress, dates, gameIds) {
  return dates.map((date) => {
    const entry = { date, total: 0 };
    gameIds.forEach((id) => {
      const ms = (progress.games[id] && progress.games[id].dailyTime
        && progress.games[id].dailyTime[date]) || 0;
      entry[id] = ms;
      entry.total += ms;
    });
    return entry;
  });
}

/**
 * Look up a human-readable game name from the manifest list.
 *
 * @param {string} gameId - The game ID.
 * @param {Array<{id: string, name: string}>} [manifests] - Optional manifest array.
 * @returns {string} Game name or the ID if no manifest found.
 */
export function getGameName(gameId, manifests) {
  if (!Array.isArray(manifests)) return gameId;
  const m = manifests.find((manifest) => manifest.id === gameId);
  return m ? m.name : gameId;
}

/**
 * Create an accessible data table summarising time played per game per day.
 *
 * @param {Array<{date: string, total: number}>} summaryData - Row data.
 * @param {string[]} gameIds - Column game IDs.
 * @param {Array<{id: string, name: string}>} [manifests] - Manifest list for names.
 * @returns {HTMLTableElement}
 */
export function createDataTable(summaryData, gameIds, manifests) {
  const table = document.createElement('table');
  table.className = 'history-table';
  table.setAttribute('aria-label', 'Time played per day');

  // ── Header row ───────────────────────────────────────────────────────────────
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const dateHeader = document.createElement('th');
  dateHeader.scope = 'col';
  dateHeader.textContent = 'Date';
  headerRow.appendChild(dateHeader);

  gameIds.forEach((gameId) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = getGameName(gameId, manifests);
    headerRow.appendChild(th);
  });

  const totalTh = document.createElement('th');
  totalTh.scope = 'col';
  totalTh.textContent = 'Total';
  headerRow.appendChild(totalTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // ── Body rows ─────────────────────────────────────────────────────────────────
  const tbody = document.createElement('tbody');

  summaryData.forEach((dayData) => {
    const row = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = dayData.date;
    row.appendChild(dateTd);

    gameIds.forEach((gameId) => {
      const td = document.createElement('td');
      td.textContent = formatDuration(dayData[gameId] || 0);
      row.appendChild(td);
    });

    const totalTd = document.createElement('td');
    totalTd.textContent = formatDuration(dayData.total);
    row.appendChild(totalTd);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
}

/**
 * Create a total play-time line chart showing daily totals across all games.
 *
 * Renders an SVG line chart with one data point per day connected by a line,
 * giving a quick at-a-glance trend of overall activity. X-axis is labeled with
 * MM-DD dates, thinned to at most {@link MAX_X_LABELS} labels to avoid crowding.
 *
 * @param {Array<{date: string, total: number}>} summaryData - Per-day totals.
 * @returns {HTMLElement} A <div> element containing the total play-time line chart.
 */
export function createTotalPlayTimeChart(summaryData) {
  const wrapper = document.createElement('div');
  wrapper.className = 'history-total-chart';
  // Daily totals are also present in the accessible data table below,
  // so this visual-only chart is safely hidden from assistive technology.
  wrapper.setAttribute('aria-hidden', 'true');

  const title = document.createElement('p');
  title.className = 'history-total-chart__title';
  title.textContent = 'Total Play Time';
  wrapper.appendChild(title);

  if (summaryData.length === 0) {
    return wrapper;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgW = 600;
  const svgH = 120;
  const pad = {
    top: 10, right: 20, bottom: 28, left: 52,
  };
  const plotW = svgW - pad.left - pad.right;
  const plotH = svgH - pad.top - pad.bottom;
  const maxMs = Math.max(...summaryData.map((d) => d.total), 1);
  const n = summaryData.length;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('class', 'history-total-chart__svg');
  svg.setAttribute('role', 'img');

  // Y-axis gridlines and tick labels at 0%, 50%, and 100% of scale.
  [1, 0.5, 0].forEach((fraction) => {
    const yPos = pad.top + plotH - Math.round(fraction * plotH);
    const timeMs = Math.round(fraction * maxMs);

    const gridLine = document.createElementNS(SVG_NS, 'line');
    gridLine.setAttribute('x1', String(pad.left));
    gridLine.setAttribute('y1', String(yPos));
    gridLine.setAttribute('x2', String(svgW - pad.right));
    gridLine.setAttribute('y2', String(yPos));
    gridLine.setAttribute('class', 'history-total-chart__grid-line');
    svg.appendChild(gridLine);

    const yLabel = document.createElementNS(SVG_NS, 'text');
    yLabel.setAttribute('x', String(pad.left - 4));
    yLabel.setAttribute('y', String(yPos));
    yLabel.setAttribute('dominant-baseline', 'middle');
    yLabel.setAttribute('class', 'history-total-chart__y-label');
    yLabel.textContent = formatDuration(timeMs);
    svg.appendChild(yLabel);
  });

  // Calculate pixel coordinates for each data point.
  const points = summaryData.map((d, i) => {
    const x = pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = pad.top + plotH - Math.round((d.total / maxMs) * plotH);
    return {
      x, y, date: d.date, total: d.total,
    };
  });

  // Polyline connecting all data points.
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', points.map((p) => `${p.x},${p.y}`).join(' '));
  polyline.setAttribute('class', 'history-total-chart__line');
  svg.appendChild(polyline);

  // Dot and date label for each point.
  // Thin x-axis labels so they remain readable when there are many data points.
  const labelStep = Math.max(1, Math.ceil(n / MAX_X_LABELS));
  points.forEach((p, i) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '4');
    circle.setAttribute('class', 'history-total-chart__dot');

    const tooltipTitle = document.createElementNS(SVG_NS, 'title');
    tooltipTitle.textContent = `${p.date}: ${formatDuration(p.total)}`;
    circle.appendChild(tooltipTitle);
    svg.appendChild(circle);

    if (i % labelStep === 0) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', p.x);
      label.setAttribute('y', svgH - 4);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'history-total-chart__x-label');
      label.textContent = p.date.slice(5); // Display as MM-DD.
      svg.appendChild(label);
    }
  });

  wrapper.appendChild(svg);
  return wrapper;
}

/**
 * Create a y-axis element for the bar chart showing time-scale labels.
 *
 * Renders tick labels at the top (maximum value), middle (half of maximum),
 * and bottom (zero) of the bar area so readers can interpret bar heights.
 *
 * @private
 * @param {number} maxMs - Maximum milliseconds shown at the top of the scale.
 * @returns {HTMLElement} A div element serving as the y-axis scale indicator.
 */
function createBarChartYAxis(maxMs) {
  const yAxis = document.createElement('div');
  yAxis.className = 'history-chart__y-axis';

  [maxMs, Math.round(maxMs / 2), 0].forEach((ms) => {
    const tick = document.createElement('span');
    tick.className = 'history-chart__y-tick';
    tick.textContent = formatDuration(ms);
    yAxis.appendChild(tick);
  });

  return yAxis;
}

/**
 * Build the DOM for a single day-column in the per-game bar chart.
 *
 * Each day group scales its bars and y-axis to its own total play time, so
 * the y-axis labels are meaningful for the specific day being displayed.
 *
 * @param {object} dayData - Summary entry for one day.
 * @param {string[]} gameIds - Game IDs to render bars for.
 * @param {Array<{id: string, name: string}>} [manifests] - Manifest list for names.
 * @returns {HTMLElement} A `.history-chart__group` element.
 */
function createDayGroup(dayData, gameIds, manifests) {
  // Scale this group to its own total so bars fill the available height and
  // the y-axis tick labels reflect this day's actual values.
  const dayMaxMs = Math.max(dayData.total, 1);

  const group = document.createElement('div');
  group.className = 'history-chart__group';

  // Body: y-axis on the left, bars on the right.
  const groupBody = document.createElement('div');
  groupBody.className = 'history-chart__group-body';
  groupBody.appendChild(createBarChartYAxis(dayMaxMs));

  const barsWrap = document.createElement('div');
  barsWrap.className = 'history-chart__bars';

  gameIds.forEach((gameId, colIndex) => {
    const ms = dayData[gameId] || 0;
    const heightPct = Math.round((ms / dayMaxMs) * 100);
    const bar = document.createElement('div');
    const colorIndex = colIndex % COLOR_SLOT_COUNT;
    bar.className = `history-chart__bar history-chart__bar--color-${colorIndex}`;
    bar.style.height = `${heightPct}%`;
    bar.title = `${getGameName(gameId, manifests)}: ${formatDuration(ms)}`;
    barsWrap.appendChild(bar);
  });

  // Total bar (grey) — always 100% height since dayMaxMs === dayData.total.
  const totalBar = document.createElement('div');
  totalBar.className = 'history-chart__bar history-chart__bar--total';
  totalBar.style.height = '100%';
  totalBar.title = `Total: ${formatDuration(dayData.total)}`;
  barsWrap.appendChild(totalBar);

  groupBody.appendChild(barsWrap);

  const dateLabel = document.createElement('span');
  dateLabel.className = 'history-chart__label';
  dateLabel.textContent = dayData.date.slice(5); // Display as MM-DD.

  group.appendChild(groupBody);
  group.appendChild(dateLabel);
  return group;
}

/**
 * Create a visual CSS bar-chart section for the history data arranged in a grid.
 *
 * The most recent {@link INITIAL_VISIBLE_DAYS} days are shown in a 2-column
 * grid. If there are more days, a toggle button reveals the older entries.
 *
 * @param {Array<{date: string, total: number}>} summaryData - Per-day totals (ascending).
 * @param {string[]} gameIds - Game IDs to chart.
 * @param {Array<{id: string, name: string}>} [manifests] - Manifest list for names.
 * @returns {HTMLElement}
 */
export function createBarChart(summaryData, gameIds, manifests) {
  const chartEl = document.createElement('div');
  chartEl.className = 'history-chart';
  chartEl.setAttribute('aria-hidden', 'true'); // Table is the accessible version.

  // Split: the most-recent INITIAL_VISIBLE_DAYS are visible; older days are hidden.
  // Both slices are reversed so newest entries appear first (left-to-right).
  const hasMore = summaryData.length > INITIAL_VISIBLE_DAYS;
  const olderData = hasMore ? summaryData.slice(0, -INITIAL_VISIBLE_DAYS).reverse() : [];
  const recentData = hasMore
    ? summaryData.slice(-INITIAL_VISIBLE_DAYS).reverse()
    : [...summaryData].reverse();

  // Grid for the most-recent days (always visible, newest first).
  const recentGrid = document.createElement('div');
  recentGrid.className = 'history-chart__grid';
  recentData.forEach((dayData) => {
    recentGrid.appendChild(createDayGroup(dayData, gameIds, manifests));
  });
  chartEl.appendChild(recentGrid);

  // Grid for older (initially hidden) days, followed by the toggle button.
  if (hasMore) {
    const olderGrid = document.createElement('div');
    olderGrid.className = 'history-chart__grid';
    olderGrid.hidden = true;
    olderData.forEach((dayData) => {
      olderGrid.appendChild(createDayGroup(dayData, gameIds, manifests));
    });
    chartEl.appendChild(olderGrid);

    const olderCount = olderData.length;
    const showMoreBtn = document.createElement('button');
    showMoreBtn.className = 'history-chart__show-more-btn';
    showMoreBtn.textContent = `Show ${olderCount} older day${olderCount !== 1 ? 's' : ''}`;
    showMoreBtn.addEventListener('click', () => {
      const isHidden = olderGrid.hidden;
      olderGrid.hidden = !isHidden;
      showMoreBtn.textContent = isHidden
        ? 'Show fewer days'
        : `Show ${olderCount} older day${olderCount !== 1 ? 's' : ''}`;
    });
    chartEl.appendChild(showMoreBtn);
  }

  // Legend.
  const legend = document.createElement('div');
  legend.className = 'history-chart__legend';

  gameIds.forEach((gameId, colIndex) => {
    const item = document.createElement('span');
    item.className = 'history-chart__legend-item';
    const swatch = document.createElement('span');
    const colorIndex = colIndex % COLOR_SLOT_COUNT;
    swatch.className = `history-chart__legend-swatch history-chart__legend-swatch--color-${colorIndex}`;
    swatch.setAttribute('aria-hidden', 'true');
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(getGameName(gameId, manifests)));
    legend.appendChild(item);
  });

  // Total legend entry.
  const totalItem = document.createElement('span');
  totalItem.className = 'history-chart__legend-item';
  const totalSwatch = document.createElement('span');
  totalSwatch.className = 'history-chart__legend-swatch history-chart__legend-swatch--total';
  totalSwatch.setAttribute('aria-hidden', 'true');
  totalItem.appendChild(totalSwatch);
  totalItem.appendChild(document.createTextNode('Total'));
  legend.appendChild(totalItem);

  chartEl.appendChild(legend);
  return chartEl;
}

/**
 * Build the complete history panel DOM element for the given progress data.
 *
 * Returns a `<section>` containing either:
 *  - An "empty state" message (no history recorded yet), or
 *  - A total play-time chart, a per-game bar chart, and an accessible data table.
 *
 * @param {object} progress - Player progress object (may be null/undefined).
 * @param {Array<{id: string, name: string}>} [manifests] - Game manifests for display names.
 * @returns {HTMLElement} A `<section>` element ready to be injected into the page.
 */
export function buildHistoryPanel(progress, manifests) {
  const section = document.createElement('section');
  section.className = 'history-panel__content';
  section.setAttribute('aria-label', 'Play history details');

  const dates = getAllDates(progress);
  const gameIds = getGamesWithData(progress);

  if (dates.length === 0 || gameIds.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-panel__empty';
    empty.textContent = 'No play history recorded yet. Start playing to track your progress!';
    section.appendChild(empty);
    return section;
  }

  const summaryData = buildSummaryData(progress, dates, gameIds);
  const totalChart = createTotalPlayTimeChart(summaryData);
  const chart = createBarChart(summaryData, gameIds, manifests);
  const table = createDataTable(summaryData, gameIds, manifests);

  section.appendChild(totalChart);
  section.appendChild(chart);
  section.appendChild(table);
  return section;
}
