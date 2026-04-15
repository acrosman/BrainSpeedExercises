/**
 * historyView.test.js — Unit tests for the history view component.
 *
 * @file Tests for historyView.js
 */
import {
  describe,
  it,
  expect,
} from '@jest/globals';

import {
  getAllDates,
  getGamesWithData,
  buildSummaryData,
  getGameName,
  createDataTable,
  createBarChart,
  createTotalPlayTimeChart,
  buildHistoryPanel,
  INITIAL_VISIBLE_DAYS,
} from '../historyView.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MANIFESTS = [
  { id: 'game-a', name: 'Game Alpha' },
  { id: 'game-b', name: 'Game Beta' },
];

const PROGRESS_WITH_DATA = {
  playerId: 'default',
  games: {
    'game-a': {
      highScore: 10,
      dailyTime: {
        '2024-01-01': 60000,
        '2024-01-02': 120000,
      },
    },
    'game-b': {
      highScore: 5,
      dailyTime: {
        '2024-01-01': 30000,
        '2024-01-03': 90000,
      },
    },
  },
};

/**
 * Progress fixture with more than INITIAL_VISIBLE_DAYS of data (8 days) to
 * verify the "show more" toggle in createBarChart.
 */
const PROGRESS_MANY_DAYS = {
  playerId: 'default',
  games: {
    'game-a': {
      highScore: 10,
      dailyTime: {
        '2024-01-01': 10000,
        '2024-01-02': 20000,
        '2024-01-03': 30000,
        '2024-01-04': 40000,
        '2024-01-05': 50000,
        '2024-01-06': 60000,
        '2024-01-07': 70000,
        '2024-01-08': 80000,
      },
    },
  },
};

const PROGRESS_EMPTY = {
  playerId: 'default',
  games: {},
};

const PROGRESS_NO_DAILY = {
  playerId: 'default',
  games: {
    'game-a': { highScore: 10 },
  },
};

// ── getAllDates ────────────────────────────────────────────────────────────────

describe('getAllDates()', () => {
  it('returns empty array when progress is null', () => {
    expect(getAllDates(null)).toEqual([]);
  });

  it('returns empty array when progress has no games', () => {
    expect(getAllDates(PROGRESS_EMPTY)).toEqual([]);
  });

  it('returns empty array when games have no dailyTime', () => {
    expect(getAllDates(PROGRESS_NO_DAILY)).toEqual([]);
  });

  it('returns all unique dates sorted ascending', () => {
    const dates = getAllDates(PROGRESS_WITH_DATA);
    expect(dates).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
  });

  it('deduplicates dates present in multiple games', () => {
    const dates = getAllDates(PROGRESS_WITH_DATA);
    // 2024-01-01 appears in both game-a and game-b — should appear once.
    expect(dates.filter((d) => d === '2024-01-01').length).toBe(1);
  });
});

// ── getGamesWithData ──────────────────────────────────────────────────────────

describe('getGamesWithData()', () => {
  it('returns empty array for null progress', () => {
    expect(getGamesWithData(null)).toEqual([]);
  });

  it('returns empty array when no games have dailyTime', () => {
    expect(getGamesWithData(PROGRESS_NO_DAILY)).toEqual([]);
  });

  it('returns IDs of games that have dailyTime data', () => {
    const ids = getGamesWithData(PROGRESS_WITH_DATA);
    expect(ids).toContain('game-a');
    expect(ids).toContain('game-b');
  });

  it('excludes games without dailyTime', () => {
    const progress = {
      games: {
        'game-a': { dailyTime: { '2024-01-01': 1000 } },
        'game-b': { highScore: 5 }, // no dailyTime
      },
    };
    const ids = getGamesWithData(progress);
    expect(ids).toContain('game-a');
    expect(ids).not.toContain('game-b');
  });
});

// ── buildSummaryData ──────────────────────────────────────────────────────────

describe('buildSummaryData()', () => {
  it('returns one entry per date', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
    const gameIds = ['game-a', 'game-b'];
    const summary = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);
    expect(summary.length).toBe(3);
  });

  it('each entry has the correct date field', () => {
    const dates = ['2024-01-01'];
    const summary = buildSummaryData(PROGRESS_WITH_DATA, dates, ['game-a']);
    expect(summary[0].date).toBe('2024-01-01');
  });

  it('sums per-game ms and computes total correctly', () => {
    const dates = ['2024-01-01'];
    const gameIds = ['game-a', 'game-b'];
    const summary = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);
    const day = summary[0];
    expect(day['game-a']).toBe(60000);
    expect(day['game-b']).toBe(30000);
    expect(day.total).toBe(90000);
  });

  it('uses 0 for missing dates', () => {
    const dates = ['2024-01-02'];
    const gameIds = ['game-a', 'game-b'];
    const summary = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);
    // game-b has no entry for 2024-01-02
    expect(summary[0]['game-b']).toBe(0);
    expect(summary[0]['game-a']).toBe(120000);
  });
});

// ── getGameName ───────────────────────────────────────────────────────────────

describe('getGameName()', () => {
  it('returns the game name from manifests', () => {
    expect(getGameName('game-a', MANIFESTS)).toBe('Game Alpha');
  });

  it('returns the game ID when no manifest matches', () => {
    expect(getGameName('unknown-game', MANIFESTS)).toBe('unknown-game');
  });

  it('returns the game ID when manifests is null', () => {
    expect(getGameName('game-a', null)).toBe('game-a');
  });

  it('returns the game ID when manifests is not an array', () => {
    expect(getGameName('game-a', 'not-an-array')).toBe('game-a');
  });
});

// ── createDataTable ───────────────────────────────────────────────────────────

describe('createDataTable()', () => {
  const dates = ['2024-01-01', '2024-01-02'];
  const gameIds = ['game-a', 'game-b'];
  const summaryData = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);

  it('returns a <table> element', () => {
    const table = createDataTable(summaryData, gameIds, MANIFESTS);
    expect(table.tagName).toBe('TABLE');
  });

  it('includes a header row with Date, game names, and Total columns', () => {
    const table = createDataTable(summaryData, gameIds, MANIFESTS);
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('Date');
    expect(headers).toContain('Game Alpha');
    expect(headers).toContain('Game Beta');
    expect(headers).toContain('Total');
  });

  it('has correct number of body rows', () => {
    const table = createDataTable(summaryData, gameIds, MANIFESTS);
    const rows = table.querySelectorAll('tbody tr');
    expect(rows.length).toBe(dates.length);
  });

  it('first cell of each body row is the date', () => {
    const table = createDataTable(summaryData, gameIds, MANIFESTS);
    const firstRow = table.querySelector('tbody tr');
    expect(firstRow.cells[0].textContent).toBe('2024-01-01');
  });

  it('formats time values as MM:SS in cells', () => {
    const table = createDataTable(summaryData, gameIds, MANIFESTS);
    const firstRow = table.querySelector('tbody tr');
    // game-a has 60000 ms on 2024-01-01 → "01:00"
    expect(firstRow.cells[1].textContent).toBe('01:00');
  });

  it('falls back to game ID when manifest is not provided', () => {
    const table = createDataTable(summaryData, gameIds, undefined);
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('game-a');
    expect(headers).toContain('game-b');
  });
});

// ── createBarChart ────────────────────────────────────────────────────────────

describe('createBarChart()', () => {
  const dates = ['2024-01-01', '2024-01-02'];
  const gameIds = ['game-a', 'game-b'];
  const summaryData = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);

  it('returns a div element with class history-chart', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    expect(chart.tagName).toBe('DIV');
    expect(chart.classList.contains('history-chart')).toBe(true);
  });

  it('creates one group per date', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const groups = chart.querySelectorAll('.history-chart__group');
    expect(groups.length).toBe(dates.length);
  });

  it('includes a legend', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const legend = chart.querySelector('.history-chart__legend');
    expect(legend).not.toBeNull();
  });

  it('legend contains an entry per game plus Total', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const items = chart.querySelectorAll('.history-chart__legend-item');
    // 2 games + 1 Total = 3 items
    expect(items.length).toBe(gameIds.length + 1);
  });

  it('bars have non-empty height style for non-zero data', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const bars = chart.querySelectorAll('.history-chart__bar');
    // At least one bar should have a height > 0%
    const hasNonZero = [...bars].some((b) => b.style.height !== '0%');
    expect(hasNonZero).toBe(true);
  });

  it('assigns color CSS class to each game bar', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const firstGroupBars = chart.querySelector('.history-chart__bars')
      .querySelectorAll('.history-chart__bar:not(.history-chart__bar--total)');
    // First game bar gets --color-0, second gets --color-1
    expect(firstGroupBars[0].classList.contains('history-chart__bar--color-0')).toBe(true);
    expect(firstGroupBars[1].classList.contains('history-chart__bar--color-1')).toBe(true);
  });

  it('assigns matching color CSS class to legend swatches', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const notTotalSel = '.history-chart__legend-swatch'
      + ':not(.history-chart__legend-swatch--total)';
    const swatches = chart.querySelectorAll(notTotalSel);
    expect(swatches[0].classList.contains('history-chart__legend-swatch--color-0')).toBe(true);
    expect(swatches[1].classList.contains('history-chart__legend-swatch--color-1')).toBe(true);
  });

  it('does not show a show-more button when days <= INITIAL_VISIBLE_DAYS', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const btn = chart.querySelector('.history-chart__show-more-btn');
    expect(btn).toBeNull();
  });
});

// ── createBarChart show-more ──────────────────────────────────────────────────

describe('createBarChart() show-more behaviour', () => {
  const dates = getAllDates(PROGRESS_MANY_DAYS);
  const gameIds = getGamesWithData(PROGRESS_MANY_DAYS);
  const summaryData = buildSummaryData(PROGRESS_MANY_DAYS, dates, gameIds);

  it('shows a show-more button when days exceed INITIAL_VISIBLE_DAYS', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const btn = chart.querySelector('.history-chart__show-more-btn');
    expect(btn).not.toBeNull();
  });

  it('older days grid is hidden by default', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const grids = chart.querySelectorAll('.history-chart__grid');
    // First grid (older days) must be hidden; second grid (recent days) must not.
    expect(grids[0].hidden).toBe(true);
    expect(grids[1].hidden).toBe(false);
  });

  it('show-more button reveals the older days grid when clicked', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const btn = chart.querySelector('.history-chart__show-more-btn');
    const olderGrid = chart.querySelector('.history-chart__grid');
    btn.click();
    expect(olderGrid.hidden).toBe(false);
  });

  it('show-more button label changes after click and reverts on second click', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const btn = chart.querySelector('.history-chart__show-more-btn');
    const originalLabel = btn.textContent;
    btn.click();
    expect(btn.textContent).toBe('Show fewer days');
    btn.click();
    expect(btn.textContent).toBe(originalLabel);
  });

  it('recent grid always contains at most INITIAL_VISIBLE_DAYS groups', () => {
    const chart = createBarChart(summaryData, gameIds, MANIFESTS);
    const grids = chart.querySelectorAll('.history-chart__grid');
    const recentGrid = grids[grids.length - 1];
    const groups = recentGrid.querySelectorAll('.history-chart__group');
    expect(groups.length).toBeLessThanOrEqual(INITIAL_VISIBLE_DAYS);
  });
});

// ── createTotalPlayTimeChart ──────────────────────────────────────────────────

describe('createTotalPlayTimeChart()', () => {
  const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
  const gameIds = ['game-a', 'game-b'];
  const summaryData = buildSummaryData(PROGRESS_WITH_DATA, dates, gameIds);

  it('returns a div with class history-total-chart', () => {
    const chart = createTotalPlayTimeChart(summaryData);
    expect(chart.tagName).toBe('DIV');
    expect(chart.classList.contains('history-total-chart')).toBe(true);
  });

  it('creates one group per date', () => {
    const chart = createTotalPlayTimeChart(summaryData);
    const groups = chart.querySelectorAll('.history-total-chart__group');
    expect(groups.length).toBe(dates.length);
  });

  it('each bar has a non-zero height for days with play time', () => {
    const chart = createTotalPlayTimeChart(summaryData);
    const bars = chart.querySelectorAll('.history-total-chart__bar');
    const hasNonZero = [...bars].some((b) => b.style.height !== '0%');
    expect(hasNonZero).toBe(true);
  });

  it('includes a title paragraph', () => {
    const chart = createTotalPlayTimeChart(summaryData);
    const title = chart.querySelector('.history-total-chart__title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBeTruthy();
  });

  it('labels use MM-DD format', () => {
    const chart = createTotalPlayTimeChart(summaryData);
    const labels = [...chart.querySelectorAll('.history-total-chart__label')];
    expect(labels[0].textContent).toBe('01-01');
  });
});

// ── buildHistoryPanel ─────────────────────────────────────────────────────────

describe('buildHistoryPanel()', () => {
  it('returns a <section> element', () => {
    const panel = buildHistoryPanel(PROGRESS_WITH_DATA, MANIFESTS);
    expect(panel.tagName).toBe('SECTION');
  });

  it('shows empty state message when there is no history', () => {
    const panel = buildHistoryPanel(PROGRESS_EMPTY, MANIFESTS);
    const msg = panel.querySelector('.history-panel__empty');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('No play history');
  });

  it('shows empty state message when progress is null', () => {
    const panel = buildHistoryPanel(null, MANIFESTS);
    const msg = panel.querySelector('.history-panel__empty');
    expect(msg).not.toBeNull();
  });

  it('shows empty state when games have no dailyTime', () => {
    const panel = buildHistoryPanel(PROGRESS_NO_DAILY, MANIFESTS);
    const msg = panel.querySelector('.history-panel__empty');
    expect(msg).not.toBeNull();
  });

  it('includes a total play-time chart when history exists', () => {
    const panel = buildHistoryPanel(PROGRESS_WITH_DATA, MANIFESTS);
    const totalChart = panel.querySelector('.history-total-chart');
    expect(totalChart).not.toBeNull();
  });

  it('includes a bar chart when history exists', () => {
    const panel = buildHistoryPanel(PROGRESS_WITH_DATA, MANIFESTS);
    const chart = panel.querySelector('.history-chart');
    expect(chart).not.toBeNull();
  });

  it('includes a data table when history exists', () => {
    const panel = buildHistoryPanel(PROGRESS_WITH_DATA, MANIFESTS);
    const table = panel.querySelector('.history-table');
    expect(table).not.toBeNull();
  });

  it('uses game IDs as column headers when no manifests provided', () => {
    const panel = buildHistoryPanel(PROGRESS_WITH_DATA);
    const table = panel.querySelector('.history-table');
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('game-a');
  });
});
