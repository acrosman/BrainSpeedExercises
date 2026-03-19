/**
 * interface.js — Renderer process entry point for BrainSpeedExercises.
 *
 * Handles game selection UI, dynamic loading of game plugins, and accessibility announcer.
 *
 * @file Renderer UI logic for game selection and plugin loading.
 */

import { createGameCard } from './components/gameCard.js';

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
 * Load a game into the game container and initialise its plugin.
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
  const manifests = await window.api.invoke('games:list');
  manifests.forEach((manifest) => {
    let gameProgress = undefined;
    if (progress && progress.games && progress.games[manifest.id]) {
      gameProgress = progress.games[manifest.id];
    }
    gameSelector.appendChild(createGameCard(manifest, gameProgress));
  });

  /**
   * Handle game selection event, load the game plugin, and inject its UI.
   * @param {CustomEvent} event - The game:select event.
   */
  gameSelector.addEventListener('game:select', async (event) => {
    const { gameId } = event.detail;
    gameSelector.remove();
    await loadAndInitGame(gameId, gameContainer, announcer);
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
      ]).then(([progress, manifests]) => {
        manifests.forEach((manifest) => {
          let gameProgress = undefined;
          if (progress && progress.games && progress.games[manifest.id]) {
            gameProgress = progress.games[manifest.id];
          }
          selector.appendChild(createGameCard(manifest, gameProgress));
        });
      });
      // Re-attach event listener for game selection
      selector.addEventListener('game:select', async (event) => {
        const { gameId } = event.detail;
        selector.remove();
        await loadAndInitGame(gameId, gameContainer, announcer);
      });
    }
    announcer.textContent = 'Main menu loaded. Select a game.';
  });
});
