/**
 * gameCard.js — UI component for rendering a game selection card.
 *
 * Exports a function to create a WCAG-compliant game card element for the selector screen.
 *
 * @file Game card UI component for BrainSpeedExercises.
 */

/**
 * Creates a game card element for the game-selection screen.
 *
 * @param {object} manifest - Game manifest from the plugin registry.
 * @param {string} manifest.id - Unique game identifier.
 * @param {string} manifest.name - Human-readable game name.
 * @param {string} [manifest.description] - Short description of the game.
 * @param {string} [manifest.thumbnail] - Path to the thumbnail image.
 * @returns {HTMLElement} An <article> element representing the game card.
 */
export function createGameCard(manifest) {
  if (!manifest || !manifest.id || !manifest.name) {
    throw new Error('manifest must include id and name');
  }

  const article = document.createElement('article');
  article.className = 'game-card';

  const img = document.createElement('img');
  img.src = manifest.thumbnail || '';
  img.alt = `${manifest.name} thumbnail`;

  const heading = document.createElement('h2');
  heading.textContent = manifest.name;

  const description = document.createElement('p');
  description.textContent = manifest.description || '';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `Play ${manifest.name}`;
  button.setAttribute('aria-label', `Play ${manifest.name}`);

  /**
   * Dispatches a custom event when the game card button is clicked.
   * @fires CustomEvent#game:select
   */
  button.addEventListener('click', () => {
    const event = new CustomEvent('game:select', {
      bubbles: true,
      composed: true,
      detail: { gameId: manifest.id },
    });
    button.dispatchEvent(event);
  });

  article.appendChild(img);
  article.appendChild(heading);
  article.appendChild(description);
  article.appendChild(button);

  return article;
}
