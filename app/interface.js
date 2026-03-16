/**
 * interface.js — Renderer process entry point for BrainSpeedExercises.
 *
 * Handles game selection UI, dynamic loading of game plugins, and accessibility announcer.
 *
 * @file Renderer UI logic for game selection and plugin loading.
 */

import { createGameCard } from './components/gameCard.js';

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

  // Fetch the list of available games and render game cards.
  const manifests = await window.api.invoke('games:list');
  manifests.forEach((manifest) => {
    gameSelector.appendChild(createGameCard(manifest));
  });

  /**
   * Handle game selection event, load the game plugin, and inject its UI.
   * @param {CustomEvent} event - The game:select event.
   */
  gameSelector.addEventListener('game:select', async (event) => {
    const { gameId } = event.detail;
    const result = await window.api.invoke('games:load', gameId);

    gameSelector.remove();
    gameContainer.innerHTML = result.html;

    announcer.textContent = `${result.manifest.name} loaded. Get ready to play!`;

    // Dynamically import the game plugin and initialise it so that the
    // instructions panel and start button become active.
    const mod = await import(`./games/${gameId}/${result.manifest.entryPoint}`);
    mod.default.init(gameContainer);
  });
  // Listen for custom event to return to main menu from any game
  window.addEventListener('bsx:return-to-main-menu', () => {
    // Remove any game UI
    gameContainer.innerHTML = '';
    // Restore the game selector
    if (!document.getElementById('game-selector')) {
      const selector = document.createElement('section');
      selector.id = 'game-selector';
      selector.setAttribute('aria-label', 'Available games');
      gameContainer.appendChild(selector);
      // Re-render game cards
      window.api.invoke('games:list').then((manifests) => {
        manifests.forEach((manifest) => {
          selector.appendChild(createGameCard(manifest));
        });
      });
      // Re-attach event listener for game selection
      selector.addEventListener('game:select', async (event) => {
        const { gameId } = event.detail;
        const result = await window.api.invoke('games:load', gameId);
        selector.remove();
        gameContainer.innerHTML = result.html;
        announcer.textContent = `${result.manifest.name} loaded. Get ready to play!`;
        const mod = await import(`./games/${gameId}/${result.manifest.entryPoint}`);
        mod.default.init(gameContainer);
      });
    }
    announcer.textContent = 'Main menu loaded. Select a game.';
  });
});
