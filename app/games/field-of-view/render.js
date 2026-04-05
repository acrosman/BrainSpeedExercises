/**
 * render.js - Rendering utilities for the Field of View game.
 *
 * Contains pure formatting helpers and DOM rendering functions for stats,
 * the threshold chart, the stimulus board, and stage state transitions.
 * All DOM-touching functions accept element references as explicit parameters
 * to keep this module free of module-level side-effects.
 *
 * @file Field of View rendering helpers.
 */

/** Path to Field of View image assets from renderer root. */
export const IMAGES_BASE_PATH = 'games/field-of-view/images/';

/**
 * Convert a ratio [0..1] to display percent string.
 *
 * @param {number} value
 * @returns {string}
 */
export function percent(value) {
  return `${Math.round(value * 100)}%`;
}

/**
 * Normalize millisecond values to at most 2 decimals without trailing zeros.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatMs(value) {
  return String(Number(value).toFixed(2)).replace(/\.00$/, '');
}

/**
 * Return human-readable label text for a stimulus icon.
 *
 * @param {{ id: string }|null} icon
 * @returns {string}
 */
export function labelForIcon(icon) {
  if (!icon) return 'Empty';
  if (icon.id === 'primary-kitten') return 'Primary kitten';
  if (icon.id === 'secondary-kitten') return 'Secondary kitten';
  if (icon.id === 'toy-1') return 'Toy 1';
  if (icon.id === 'toy-2') return 'Toy 2';
  return 'Stimulus';
}

/**
 * Create an image element for a stimulus icon.
 *
 * @param {{ id: string, file: string }} icon
 * @returns {HTMLImageElement}
 */
export function createStimulusImage(icon) {
  const img = document.createElement('img');
  img.src = `${IMAGES_BASE_PATH}${icon.file}`;
  img.alt = labelForIcon(icon);
  img.decoding = 'async';
  img.loading = 'eager';
  return img;
}

/**
 * Build SVG point string for threshold history polyline.
 *
 * @param {Array<{ thresholdMs: number }>} history
 * @returns {string}
 */
export function buildTrendPolylinePoints(history) {
  if (!history || history.length === 0) {
    return '';
  }

  const width = 300;
  const height = 120;
  const pad = 10;

  const values = history.map((entry) => entry.thresholdMs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const denominator = Math.max(history.length - 1, 1);

  return history.map((entry, index) => {
    const x = pad + ((width - pad * 2) * index) / denominator;
    const normalized = (entry.thresholdMs - min) / span;
    const y = height - pad - normalized * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

/**
 * Announce status text in the UI feedback region.
 *
 * @param {HTMLElement|null} feedbackEl
 * @param {string} message
 */
export function announce(feedbackEl, message) {
  if (feedbackEl) {
    feedbackEl.textContent = message;
  }
}

/**
 * Set current stage visual mode for stimulus, mask-only, or response overlay.
 *
 * @param {HTMLElement|null} stageEl
 * @param {'stimulus'|'mask'|'response'} mode
 */
export function setStageMode(stageEl, mode) {
  if (!stageEl) return;
  stageEl.classList.remove('fov-stage--response');
  if (mode === 'response') {
    stageEl.classList.add('fov-stage--response');
  }
}

/**
 * Toggle mask visibility with both hidden attribute and inline display fallback.
 *
 * @param {HTMLElement|null} maskEl
 * @param {boolean} visible
 */
export function setMaskVisible(maskEl, visible) {
  if (!maskEl) return;
  maskEl.hidden = !visible;
  maskEl.style.display = visible ? 'grid' : 'none';
}

/**
 * Update game stats in the status bar.
 *
 * @param {{
 *   soaEl: HTMLElement|null,
 *   thresholdEl: HTMLElement|null,
 *   accuracyEl: HTMLElement|null,
 *   trialsEl: HTMLElement|null,
 * }} els - Stat display elements.
 * @param {{
 *   soaMs: number,
 *   accuracy: number,
 *   trialsCompleted: number,
 * }} stats - Current game state values.
 */
export function updateStats(els, stats) {
  if (els.soaEl) els.soaEl.textContent = String(stats.soaMs);
  if (els.thresholdEl) els.thresholdEl.textContent = String(stats.soaMs);
  if (els.accuracyEl) els.accuracyEl.textContent = percent(stats.accuracy);
  if (els.trialsEl) els.trialsEl.textContent = String(stats.trialsCompleted);
}

/**
 * Render the threshold history chart and summary values.
 *
 * @param {{
 *   trendLineEl: SVGPolylineElement|null,
 *   trendEmptyEl: HTMLElement|null,
 *   trendLatestEl: HTMLElement|null,
 *   finalBestThresholdEl: HTMLElement|null,
 * }} els - Chart and summary display elements.
 * @param {Array<{ thresholdMs: number }>} history - Threshold history entries.
 * @param {number} currentSoaMs - Current SOA used when history is empty.
 */
export function renderThresholdTrend(els, history, currentSoaMs) {
  const latest = history.length > 0
    ? history[history.length - 1].thresholdMs
    : currentSoaMs;

  if (els.trendLatestEl) {
    els.trendLatestEl.textContent = formatMs(latest);
  }

  if (els.finalBestThresholdEl) {
    const best = history.length > 0
      ? Math.min(...history.map((entry) => entry.thresholdMs))
      : currentSoaMs;
    els.finalBestThresholdEl.textContent = formatMs(best);
  }

  if (!els.trendLineEl) return;

  const points = buildTrendPolylinePoints(history);
  els.trendLineEl.setAttribute('points', points);

  if (els.trendEmptyEl) {
    els.trendEmptyEl.hidden = points.length > 0;
  }
}

/**
 * Highlight selected peripheral cell in response phase.
 *
 * @param {HTMLElement|null} boardEl
 * @param {number|null} selectedIndex
 */
export function updatePeripheralSelectionVisual(boardEl, selectedIndex) {
  if (!boardEl) return;
  const cells = boardEl.querySelectorAll('.fov-cell');
  cells.forEach((el) => {
    const index = Number(el.getAttribute('data-index'));
    if (index === selectedIndex) {
      el.classList.add('fov-cell--selected');
    } else {
      el.classList.remove('fov-cell--selected');
    }
  });
}

/**
 * Render a location-selector grid for the player to pick the toy square.
 *
 * @param {HTMLElement|null} containerEl - Container element for the grid.
 * @param {number} gridSize - Number of rows/columns (e.g. 3 for a 3×3 grid).
 * @param {number} centerIndex - Index of the center cell (non-selectable).
 * @param {function(number): void} onCellClick - Callback invoked with the cell
 *   index when a non-center cell is clicked.
 */
export function renderLocationGrid(containerEl, gridSize, centerIndex, onCellClick) {
  if (!containerEl) return;

  containerEl.innerHTML = '';
  containerEl.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
  containerEl.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

  const totalCells = gridSize * gridSize;
  for (let i = 0; i < totalCells; i += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fov-loc-cell';
    btn.dataset.index = String(i);

    const row = Math.floor(i / gridSize) + 1;
    const col = (i % gridSize) + 1;
    btn.setAttribute('aria-label', `Row ${row}, column ${col}`);

    if (i === centerIndex) {
      btn.classList.add('fov-loc-cell--center');
      btn.disabled = true;
      btn.setAttribute('aria-label', 'Center (not selectable)');
    } else {
      btn.addEventListener('click', () => onCellClick(i));
    }

    containerEl.appendChild(btn);
  }
}

/**
 * Highlight the selected cell in the location selector grid.
 *
 * @param {HTMLElement|null} containerEl - The location selector container.
 * @param {number|null} selectedIndex - Index of the selected cell, or null to
 *   clear the selection.
 */
export function updateLocationSelectionVisual(containerEl, selectedIndex) {
  if (!containerEl) return;
  const cells = containerEl.querySelectorAll('.fov-loc-cell');
  cells.forEach((el) => {
    const index = Number(el.getAttribute('data-index'));
    if (index === selectedIndex) {
      el.classList.add('fov-loc-cell--selected');
    } else {
      el.classList.remove('fov-loc-cell--selected');
    }
  });
}
