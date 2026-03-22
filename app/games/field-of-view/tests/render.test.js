/** @jest-environment jsdom */
/**
 * render.test.js - Unit tests for Field of View render utility module.
 */
import {
  describe,
  test,
  expect,
} from '@jest/globals';

import {
  IMAGES_BASE_PATH,
  percent,
  formatMs,
  labelForIcon,
  createStimulusImage,
  buildTrendPolylinePoints,
  announce,
  setStageMode,
  setMaskVisible,
  updateStats,
  renderThresholdTrend,
  updatePeripheralSelectionVisual,
} from '../render.js';

describe('percent', () => {
  test('converts 0 to 0%', () => expect(percent(0)).toBe('0%'));
  test('converts 1 to 100%', () => expect(percent(1)).toBe('100%'));
  test('converts 0.75 to 75%', () => expect(percent(0.75)).toBe('75%'));
});

describe('formatMs', () => {
  test('removes trailing .00', () => expect(formatMs(84)).toBe('84'));
  test('keeps significant decimals', () => expect(formatMs(84.5)).toBe('84.50'));
  test('rounds to 2 decimal places', () => expect(formatMs(84.567)).toBe('84.57'));
});

describe('labelForIcon', () => {
  test('returns Empty for null icon', () => expect(labelForIcon(null)).toBe('Empty'));
  test('returns Primary kitten', () => {
    expect(labelForIcon({ id: 'primary-kitten' })).toBe('Primary kitten');
  });
  test('returns Secondary kitten', () => {
    expect(labelForIcon({ id: 'secondary-kitten' })).toBe('Secondary kitten');
  });
  test('returns Toy 1', () => expect(labelForIcon({ id: 'toy-1' })).toBe('Toy 1'));
  test('returns Toy 2', () => expect(labelForIcon({ id: 'toy-2' })).toBe('Toy 2'));
  test('returns Stimulus for unknown id', () => {
    expect(labelForIcon({ id: 'unknown' })).toBe('Stimulus');
  });
});

describe('createStimulusImage', () => {
  test('returns an img element with correct src and alt', () => {
    const icon = { id: 'primary-kitten', file: 'primaryKitten.png' };
    const img = createStimulusImage(icon);
    expect(img.tagName).toBe('IMG');
    expect(img.src).toContain('primaryKitten.png');
    expect(img.alt).toBe('Primary kitten');
    expect(img.src).toContain(IMAGES_BASE_PATH);
  });
});

describe('buildTrendPolylinePoints', () => {
  test('returns empty string for empty history', () => {
    expect(buildTrendPolylinePoints([])).toBe('');
  });

  test('returns empty string for null history', () => {
    expect(buildTrendPolylinePoints(null)).toBe('');
  });

  test('returns a non-empty point string for valid history', () => {
    const history = [
      { thresholdMs: 200 },
      { thresholdMs: 150 },
      { thresholdMs: 100 },
    ];
    const result = buildTrendPolylinePoints(history);
    expect(result).not.toBe('');
    expect(result.split(' ').length).toBe(3);
  });

  test('handles single-entry history without division by zero', () => {
    const result = buildTrendPolylinePoints([{ thresholdMs: 300 }]);
    expect(result).not.toBe('');
  });
});

describe('announce', () => {
  test('sets textContent on feedbackEl', () => {
    const el = document.createElement('div');
    announce(el, 'Hello');
    expect(el.textContent).toBe('Hello');
  });

  test('does nothing when feedbackEl is null', () => {
    expect(() => announce(null, 'Hello')).not.toThrow();
  });
});

describe('setStageMode', () => {
  test('adds fov-stage--response class when mode is response', () => {
    const el = document.createElement('div');
    setStageMode(el, 'response');
    expect(el.classList.contains('fov-stage--response')).toBe(true);
  });

  test('removes fov-stage--response class when mode is stimulus', () => {
    const el = document.createElement('div');
    el.classList.add('fov-stage--response');
    setStageMode(el, 'stimulus');
    expect(el.classList.contains('fov-stage--response')).toBe(false);
  });

  test('does nothing when stageEl is null', () => {
    expect(() => setStageMode(null, 'response')).not.toThrow();
  });
});

describe('setMaskVisible', () => {
  test('unhides the mask element', () => {
    const el = document.createElement('div');
    el.hidden = true;
    setMaskVisible(el, true);
    expect(el.hidden).toBe(false);
    expect(el.style.display).toBe('grid');
  });

  test('hides the mask element', () => {
    const el = document.createElement('div');
    setMaskVisible(el, false);
    expect(el.hidden).toBe(true);
    expect(el.style.display).toBe('none');
  });

  test('does nothing when maskEl is null', () => {
    expect(() => setMaskVisible(null, true)).not.toThrow();
  });
});

describe('updateStats', () => {
  test('populates stat elements', () => {
    const soaEl = document.createElement('strong');
    const thresholdEl = document.createElement('strong');
    const accuracyEl = document.createElement('strong');
    const trialsEl = document.createElement('strong');

    updateStats(
      { soaEl, thresholdEl, accuracyEl, trialsEl },
      { soaMs: 150, accuracy: 0.8, trialsCompleted: 5 },
    );

    expect(soaEl.textContent).toBe('150');
    expect(thresholdEl.textContent).toBe('150');
    expect(accuracyEl.textContent).toBe('80%');
    expect(trialsEl.textContent).toBe('5');
  });

  test('tolerates null elements', () => {
    expect(() => updateStats(
      { soaEl: null, thresholdEl: null, accuracyEl: null, trialsEl: null },
      { soaMs: 100, accuracy: 0.5, trialsCompleted: 3 },
    )).not.toThrow();
  });
});

describe('renderThresholdTrend', () => {
  test('populates trend elements with history data', () => {
    const trendLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const trendEmptyEl = document.createElement('p');
    const trendLatestEl = document.createElement('strong');
    const finalBestThresholdEl = document.createElement('strong');

    const history = [
      { thresholdMs: 300, trial: 1, success: true },
      { thresholdMs: 250, trial: 2, success: true },
    ];

    renderThresholdTrend(
      { trendLineEl, trendEmptyEl, trendLatestEl, finalBestThresholdEl },
      history,
      500,
    );

    expect(trendLatestEl.textContent).toBe('250');
    expect(finalBestThresholdEl.textContent).toBe('250');
    expect(trendLineEl.getAttribute('points')).not.toBe('');
    expect(trendEmptyEl.hidden).toBe(true);
  });

  test('uses currentSoaMs when history is empty', () => {
    const trendLatestEl = document.createElement('strong');
    const finalBestThresholdEl = document.createElement('strong');
    const trendEmptyEl = document.createElement('p');
    const trendLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');

    renderThresholdTrend(
      { trendLineEl, trendEmptyEl, trendLatestEl, finalBestThresholdEl },
      [],
      400,
    );

    expect(trendLatestEl.textContent).toBe('400');
    expect(trendEmptyEl.hidden).toBe(false);
  });

  test('tolerates null trend line element', () => {
    expect(() => renderThresholdTrend(
      {
        trendLineEl: null,
        trendEmptyEl: null,
        trendLatestEl: null,
        finalBestThresholdEl: null,
      },
      [],
      500,
    )).not.toThrow();
  });
});

describe('updatePeripheralSelectionVisual', () => {
  test('adds selected class to matching cell', () => {
    const board = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'fov-cell';
    btn.setAttribute('data-index', '2');
    board.appendChild(btn);

    updatePeripheralSelectionVisual(board, 2);
    expect(btn.classList.contains('fov-cell--selected')).toBe(true);
  });

  test('removes selected class from non-matching cells', () => {
    const board = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'fov-cell fov-cell--selected';
    btn.setAttribute('data-index', '3');
    board.appendChild(btn);

    updatePeripheralSelectionVisual(board, 2);
    expect(btn.classList.contains('fov-cell--selected')).toBe(false);
  });

  test('tolerates null boardEl', () => {
    expect(() => updatePeripheralSelectionVisual(null, 1)).not.toThrow();
  });
});
