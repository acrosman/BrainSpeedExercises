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
 * @param {object} [progress] - Optional progress data for the game.
 * @param {number} [progress.highScore] - The player's high score for this game.
 * @param {number} [progress.highestLevel] - The highest level reached (0-indexed;
 *   displayed as level + 1).
 * @param {number} [progress.maxLevel] - The maximum level number reached.
 * @param {number} [progress.maxPiggies] - The maximum number of piggies collected.
 * @param {number} [progress.lowestDisplayTime] - The lowest display time achieved, in milliseconds.
 * @returns {HTMLElement} An <article> element representing the game card.
 */
export function createGameCard(manifest, progress) {
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

  // Show per-game stats for cards that expose meaningful progress metrics.
  let scoreElem = null;
  if (progress) {
    scoreElem = document.createElement('p');
    scoreElem.className = 'game-high-score';
    const details = [];
    if (typeof progress.highScore === 'number') details.push(`Top Score: ${progress.highScore}`);
    if (typeof progress.highestLevel === 'number') details.push(`Max Level: ${progress.highestLevel + 1}`);
    if (typeof progress.maxLevel === 'number') details.push(`Max Level: ${progress.maxLevel}`);
    if (typeof progress.maxPiggies === 'number') details.push(`Max Piggies: ${progress.maxPiggies}`);
    if (typeof progress.lowestDisplayTime === 'number') details.push(`Lowest Display Time: ${progress.lowestDisplayTime}ms`);
    scoreElem.textContent = details.join(' | ');
    scoreElem.setAttribute('aria-label', `Stats for ${manifest.name}: ${scoreElem.textContent}`);
  }

  if (manifest.id === 'field-of-view' && progress) {
    scoreElem = document.createElement('p');
    scoreElem.className = 'game-high-score';

    if (typeof progress.bestThresholdMs === 'number') {
      scoreElem.textContent = `All-time Best Threshold: ${progress.bestThresholdMs}ms`;
    } else {
      scoreElem.textContent = 'All-time Best Threshold: No data yet';
    }

    scoreElem.setAttribute('aria-label', `Stats for ${manifest.name}: ${scoreElem.textContent}`);
  }

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
  if (scoreElem) article.appendChild(scoreElem);
  article.appendChild(button);

  return article;
}
