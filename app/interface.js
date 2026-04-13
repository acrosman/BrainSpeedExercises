/**
 * interface.js — Renderer process entry point for BrainSpeedExercises.
 *
 * Handles game selection UI, dynamic loading of game plugins, and accessibility announcer.
 *
 * @file Renderer UI logic for game selection and plugin loading.
 */

import { createGameCard } from './components/gameCard.js';
import { buildHistoryPanel } from './components/historyView.js';
import { formatDuration, getTodayDateString } from './components/timerService.js';
import { clearHistory } from './components/scoreService.js';
import { logger } from './components/logService.js';

/**
 * Inject a game-specific stylesheet into the document <head>.
 * Replaces any previously injected game stylesheet so only one is active at a time.
 *
 * @param {string} gameId - The game ID; its style.css lives at games/{gameId}/style.css.
 */
function injectGameStylesheet(gameId) {
  const existing = document.getElementById('active-game-stylesheet');
  if (existing) existing.remove();
  const link = document.createElement('link');
  link.id = 'active-game-stylesheet';
  link.rel = 'stylesheet';
  link.href = `./games/${gameId}/style.css`;
  document.head.appendChild(link);
}

/**
 * Remove the active game stylesheet from the document <head>.
 * Called when returning to the main game-selection screen.
 */
function removeGameStylesheet() {
  const existing = document.getElementById('active-game-stylesheet');
  if (existing) existing.remove();
}

/**
 * Compute the total milliseconds played today across all games.
 *
 * @param {object} progress - Player progress object (may be null/undefined).
 * @returns {number} Total milliseconds played today.
 */
export function computeTotalTimeToday(progress) {
  const today = getTodayDateString();
  let totalMs = 0;
  if (progress && progress.games) {
    Object.values(progress.games).forEach((gameProgress) => {
      if (gameProgress && gameProgress.dailyTime
          && typeof gameProgress.dailyTime[today] === 'number') {
        totalMs += gameProgress.dailyTime[today];
      }
    });
  }
  return totalMs;
}

/**
 * Update the play-time summary bar with the latest total-time-today value.
 * Shows the bar when on the main selector screen.
 *
 * @param {object} progress - Player progress object.
 */
export function updatePlayTimeSummary(progress) {
  const bar = document.getElementById('play-time-bar');
  const totalEl = document.getElementById('total-time-today');
  if (!bar || !totalEl) return;
  const totalMs = computeTotalTimeToday(progress);
  totalEl.textContent = formatDuration(totalMs);
  bar.hidden = false;
}

/**
 * Hide the play-time summary bar (shown while a game is active).
 */
export function hidePlayTimeSummary() {
  const bar = document.getElementById('play-time-bar');
  if (bar) bar.hidden = true;
}

/**
 * Load a game into the game container and initialize its plugin.
 *
 * @param {string} gameId - The ID of the game to load.
 * @param {HTMLElement} gameContainer - The element that will receive the game HTML.
 * @param {HTMLElement} announcer - Aria-live element for accessibility announcements.
 */
async function loadAndInitGame(gameId, gameContainer, announcer) {
  const result = await window.api.invoke('games:load', gameId);
  gameContainer.innerHTML = result.html;
  injectGameStylesheet(gameId);
  announcer.textContent = `${result.manifest.name} loaded. Get ready to play!`;
  const mod = await import(`./games/${gameId}/${result.manifest.entryPoint}`);
  mod.default.init(gameContainer);
}

/**
 * Show an in-container error and restore the main-menu game selector.
 * Called by game:select listeners when loadAndInitGame rejects.
 *
 * @param {string} gameId - ID of the game that failed to load.
 * @param {HTMLElement} gameContainer - The main game container element.
 * @param {HTMLElement} announcer - Aria-live announcer element.
 * @param {Error} [err] - The error that caused the failure.
 */
function handleGameLoadError(gameId, gameContainer, announcer, err) {
  logger.error(`Failed to load game "${gameId}".`, err);
  announcer.textContent = 'Failed to load game. Returning to menu.';
  // Return to the game-selection screen so the player is not left on a blank page.
  window.dispatchEvent(new Event('bsx:return-to-main-menu'));
}

/**
 * Open the history panel modal and populate it with the latest progress data.
 *
 * Traps keyboard focus inside the panel while it is open: Tab cycles within
 * the focusable children and Escape closes the panel. The rest of the page is
 * made inert so background elements are not reachable via assistive technology.
 *
 * @param {object} progress - Player progress object.
 * @param {Array<{id: string, name: string}>} manifests - Game manifests.
 */
export function openHistoryPanel(progress, manifests) {
  const panel = document.getElementById('history-panel');
  const body = document.getElementById('history-panel-body');
  if (!panel || !body) return;

  body.innerHTML = '';
  body.appendChild(buildHistoryPanel(progress, manifests));

  // Ensure the inline confirm zone is hidden when the panel opens.
  const confirmZone = document.getElementById('clear-history-confirm');
  if (confirmZone) confirmZone.hidden = true;

  panel.hidden = false;

  // Make the rest of the page inert so assistive technology stays in the modal.
  document.querySelectorAll('body > *:not(#history-panel)').forEach((el) => {
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
  });

  // Move focus to close button for accessibility.
  const closeBtn = document.getElementById('history-close-btn');
  if (closeBtn) closeBtn.focus();
}

/**
 * Close the history panel modal and restore page interactivity.
 */
export function closeHistoryPanel() {
  const panel = document.getElementById('history-panel');
  if (panel) panel.hidden = true;

  // Restore all elements that were made inert when the panel opened.
  document.querySelectorAll('[inert]').forEach((el) => {
    el.removeAttribute('inert');
    el.removeAttribute('aria-hidden');
  });

  // Return focus to the button that opened the panel.
  const openBtn = document.getElementById('view-history-btn');
  if (openBtn) openBtn.focus();
}

/**
 * DOMContentLoaded event handler. Sets up the game selection UI and plugin loader.
 * @returns {Promise<void>}
 */
document.addEventListener('DOMContentLoaded', async () => {
  const gameSelector = document.getElementById('game-selector');
  const gameContainer = document.getElementById('game-container');

  /**
   * Create an aria-live announcer for accessibility status messages.
   */
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  document.body.appendChild(announcer);

  // Load player progress (default player)
  let progress = {};
  try {
    progress = await window.api.invoke('progress:load', { playerId: 'default' });
  } catch {
    // If progress fails to load, fallback to empty
    progress = {};
  }

  // Fetch the list of available games and render game cards.
  let manifests = [];
  try {
    manifests = await window.api.invoke('games:list');
  } catch (err) {
    logger.error('Failed to load game list:', err);
    gameSelector.textContent = 'Unable to load games. Please restart the app.';
  }
  manifests.forEach((manifest) => {
    let gameProgress = undefined;
    if (progress && progress.games && progress.games[manifest.id]) {
      gameProgress = progress.games[manifest.id];
    }
    gameSelector.appendChild(createGameCard(manifest, gameProgress));
  });

  // Show today's total play time.
  updatePlayTimeSummary(progress);

  // ── History panel wiring ──────────────────────────────────────────────────

  /**
   * Click handler for the View History button.
   * Stored in a variable so it can be removed and re-registered after menu refresh.
   * @type {Function}
   */
  let historyBtnHandler = () => openHistoryPanel(progress, manifests);

  const viewHistoryBtn = document.getElementById('view-history-btn');
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', historyBtnHandler);
  }

  const closeHistoryBtn = document.getElementById('history-close-btn');
  if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => {
      closeHistoryPanel();
    });
  }

  // Clear History button: show inline confirm zone.
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const clearHistoryConfirm = document.getElementById('clear-history-confirm');
  const clearHistoryCancelBtn = document.getElementById('clear-history-cancel-btn');
  const clearHistoryOkBtn = document.getElementById('clear-history-ok-btn');

  if (clearHistoryBtn && clearHistoryConfirm) {
    clearHistoryBtn.addEventListener('click', () => {
      clearHistoryConfirm.hidden = false;
    });
  }

  if (clearHistoryCancelBtn && clearHistoryConfirm) {
    clearHistoryCancelBtn.addEventListener('click', () => {
      clearHistoryConfirm.hidden = true;
    });
  }

  if (clearHistoryOkBtn && clearHistoryConfirm) {
    clearHistoryOkBtn.addEventListener('click', async () => {
      clearHistoryConfirm.hidden = true;
      await clearHistory();
      closeHistoryPanel();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
    });
  }

  // Close panel when clicking the backdrop.
  const historyPanel = document.getElementById('history-panel');
  if (historyPanel) {
    historyPanel.addEventListener('click', (event) => {
      if (event.target === historyPanel) {
        closeHistoryPanel();
      }
    });
  }

  // Close panel on Escape key.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && historyPanel && !historyPanel.hidden) {
      closeHistoryPanel();
    }
  });

  /**
   * Handle game selection event, load the game plugin, and inject its UI.
   * @param {CustomEvent} event - The game:select event.
   */
  gameSelector.addEventListener('game:select', async (event) => {
    const { gameId } = event.detail;
    gameSelector.remove();
    hidePlayTimeSummary();
    try {
      await loadAndInitGame(gameId, gameContainer, announcer);
    } catch (err) {
      handleGameLoadError(gameId, gameContainer, announcer, err);
    }
  });
  // Listen for custom event to return to main menu from any game
  window.addEventListener('bsx:return-to-main-menu', () => {
    // Remove any game UI and its stylesheet
    gameContainer.innerHTML = '';
    removeGameStylesheet();
    // Restore the game selector
    if (!document.getElementById('game-selector')) {
      const selector = document.createElement('section');
      selector.id = 'game-selector';
      selector.setAttribute('aria-label', 'Available games');
      gameContainer.appendChild(selector);
      // Reload progress and game cards
      Promise.all([
        window.api.invoke('progress:load', { playerId: 'default' }),
        window.api.invoke('games:list'),
      ]).then(([updatedProgress, updatedManifests]) => {
        updatedManifests.forEach((manifest) => {
          let gameProgress = undefined;
          if (updatedProgress && updatedProgress.games && updatedProgress.games[manifest.id]) {
            gameProgress = updatedProgress.games[manifest.id];
          }
          selector.appendChild(createGameCard(manifest, gameProgress));
        });
        // Refresh total time and history data.
        updatePlayTimeSummary(updatedProgress);
        // Keep manifests up-to-date for history panel.
        manifests = updatedManifests;
        progress = updatedProgress;
        // Re-register history button handler with fresh data.
        if (viewHistoryBtn) {
          viewHistoryBtn.removeEventListener('click', historyBtnHandler);
          historyBtnHandler = () => openHistoryPanel(progress, manifests);
          viewHistoryBtn.addEventListener('click', historyBtnHandler);
        }
      }).catch((err) => {
        logger.error('Failed to reload progress or game list after returning to menu.', err);
        updatePlayTimeSummary({});
      });
      // Re-attach event listener for game selection
      selector.addEventListener('game:select', async (event) => {
        const { gameId } = event.detail;
        selector.remove();
        hidePlayTimeSummary();
        try {
          await loadAndInitGame(gameId, gameContainer, announcer);
        } catch (err) {
          handleGameLoadError(gameId, gameContainer, announcer, err);
        }
      });
    } else {
      updatePlayTimeSummary(progress);
    }
    announcer.textContent = 'Main menu loaded. Select a game.';
  });
});
