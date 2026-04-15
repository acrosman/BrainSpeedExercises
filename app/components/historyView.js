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
 * Create a total play-time bar chart showing daily totals across all games.
 *
 * Renders one bar per day proportional to the maximum daily total, giving
 * a quick at-a-glance overview of overall activity. Labeled with MM-DD dates.
 *
 * @param {Array<{date: string, total: number}>} summaryData - Per-day totals.
 * @returns {HTMLElement} A <div> element containing the total play-time chart.
 */
export function createTotalPlayTimeChart(summaryData) {
  const maxMs = Math.max(...summaryData.map((d) => d.total), 1);

  const wrapper = document.createElement('div');
  wrapper.className = 'history-total-chart';
  wrapper.setAttribute('aria-hidden', 'true'); // Accessible data is in the table below.

  const title = document.createElement('p');
  title.className = 'history-total-chart__title';
  title.textContent = 'Total Play Time';
  wrapper.appendChild(title);

  const barsEl = document.createElement('div');
  barsEl.className = 'history-total-chart__bars';

  summaryData.forEach((dayData) => {
    const group = document.createElement('div');
    group.className = 'history-total-chart__group';

    const bar = document.createElement('div');
    bar.className = 'history-total-chart__bar';
    const heightPct = Math.round((dayData.total / maxMs) * 100);
    bar.style.height = `${heightPct}%`;
    bar.title = `${dayData.date}: ${formatDuration(dayData.total)}`;

    const label = document.createElement('span');
    label.className = 'history-total-chart__label';
    label.textContent = dayData.date.slice(5); // Display as MM-DD for compactness.

    group.appendChild(bar);
    group.appendChild(label);
    barsEl.appendChild(group);
  });

  wrapper.appendChild(barsEl);
  return wrapper;
}

/**
 * Build the DOM for a single day-column in the per-game bar chart.
 *
 * @param {object} dayData - Summary entry for one day.
 * @param {number} dayIndex - Index within summaryData (used for label).
 * @param {string[]} gameIds - Game IDs to render bars for.
 * @param {number} maxMs - Maximum total ms across all days (for scaling).
 * @param {Array<{date: string, total: number}>} summaryData - Full summary array.
 * @param {Array<{id: string, name: string}>} [manifests] - Manifest list for names.
 * @returns {HTMLElement} A `.history-chart__group` element.
 */
function createDayGroup(dayData, dayIndex, gameIds, maxMs, summaryData, manifests) {
  const group = document.createElement('div');
  group.className = 'history-chart__group';

  const barsWrap = document.createElement('div');
  barsWrap.className = 'history-chart__bars';

  gameIds.forEach((gameId, colIndex) => {
    const ms = dayData[gameId] || 0;
    const heightPct = Math.round((ms / maxMs) * 100);
    const bar = document.createElement('div');
    const colorIndex = colIndex % COLOR_SLOT_COUNT;
    bar.className = `history-chart__bar history-chart__bar--color-${colorIndex}`;
    bar.style.height = `${heightPct}%`;
    bar.title = `${getGameName(gameId, manifests)}: ${formatDuration(ms)}`;
    barsWrap.appendChild(bar);
  });

  // Total bar (grey).
  const totalMs = dayData.total;
  const totalPct = Math.round((totalMs / maxMs) * 100);
  const totalBar = document.createElement('div');
  totalBar.className = 'history-chart__bar history-chart__bar--total';
  totalBar.style.height = `${totalPct}%`;
  totalBar.title = `Total: ${formatDuration(totalMs)}`;
  barsWrap.appendChild(totalBar);

  const dateLabel = document.createElement('span');
  dateLabel.className = 'history-chart__label';
  dateLabel.textContent = summaryData[dayIndex].date.slice(5); // Display as MM-DD.

  group.appendChild(barsWrap);
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
  const maxMs = Math.max(...summaryData.map((d) => d.total), 1);

  const chartEl = document.createElement('div');
  chartEl.className = 'history-chart';
  chartEl.setAttribute('aria-hidden', 'true'); // Table is the accessible version.

  // Split: the most-recent INITIAL_VISIBLE_DAYS are visible; older days are hidden.
  const hasMore = summaryData.length > INITIAL_VISIBLE_DAYS;
  const olderData = hasMore ? summaryData.slice(0, -INITIAL_VISIBLE_DAYS) : [];
  const recentData = hasMore ? summaryData.slice(-INITIAL_VISIBLE_DAYS) : summaryData;

  // Grid for older (initially hidden) days.
  if (hasMore) {
    const olderGrid = document.createElement('div');
    olderGrid.className = 'history-chart__grid';
    olderGrid.hidden = true;
    olderData.forEach((dayData, idx) => {
      olderGrid.appendChild(createDayGroup(dayData, idx, gameIds, maxMs, olderData, manifests));
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

  // Grid for the most-recent days (always visible).
  const recentGrid = document.createElement('div');
  recentGrid.className = 'history-chart__grid';
  recentData.forEach((dayData, idx) => {
    recentGrid.appendChild(createDayGroup(dayData, idx, gameIds, maxMs, recentData, manifests));
  });
  chartEl.appendChild(recentGrid);

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
