/**
 * gameCard.js — UI component for rendering a game selection card.
 *
 * Exports a function to create a WCAG-compliant game card element for the selector screen.
 * Each card is a "specimen plate": framed thumbnail, name, description, a list of the
 * player's stats, and a Play button.
 *
 * @file Game card UI component for BrainSpeedExercises.
 */

import { formatDuration, getTodayDateString } from './timerService.js';

/**
 * Creates one stat for the card's stats list: a term (label) and its value.
 *
 * @param {string} term - Visible label, for example "Top score".
 * @param {string} value - Formatted value, for example "120 ms".
 * @returns {HTMLDivElement} A <div class="game-card__stat"> holding a <dt> and a <dd>.
 */
function createStat(term, value) {
  const stat = document.createElement('div');
  stat.className = 'game-card__stat';
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  stat.appendChild(dt);
  stat.appendChild(dd);
  return stat;
}

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
 *   displayed as level + 1). Standard field for all games that track levels.
 * @param {number} [progress.lowestDisplayTime] - The lowest display time achieved, in
 *   milliseconds. Standard field for all games that track image display speed.
 * @param {object} [progress.dailyTime] - Map of YYYY-MM-DD → milliseconds played.
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

  // Show per-game stats for cards that expose meaningful progress metrics, as a <dl> of
  // term/value pairs so screen readers announce each label with its value.
  let scoreElem = null;
  if (progress) {
    const stats = [];
    if (typeof progress.highScore === 'number') {
      stats.push(createStat('Top score', String(progress.highScore)));
    }
    if (typeof progress.highestLevel === 'number') {
      stats.push(createStat('Max level', String(progress.highestLevel + 1)));
    }
    if (typeof progress.lowestDisplayTime === 'number') {
      stats.push(createStat('Fastest', `${progress.lowestDisplayTime} ms`));
    }
    // Show time played today if available.
    const today = getTodayDateString();
    if (progress.dailyTime && typeof progress.dailyTime[today] === 'number'
      && progress.dailyTime[today] > 0) {
      stats.push(createStat('Today', formatDuration(progress.dailyTime[today])));
    }
    if (stats.length > 0) {
      scoreElem = document.createElement('dl');
      scoreElem.className = 'game-high-score game-card__stats';
      scoreElem.setAttribute('aria-label', `Stats for ${manifest.name}`);
      stats.forEach((stat) => scoreElem.appendChild(stat));
    }
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Play ';
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';
  button.appendChild(arrow);
  button.setAttribute('aria-label', `Play ${manifest.name}`);


  // Dispatches a game:select custom event when any part of the card is clicked.
  article.addEventListener('click', () => {
    const event = new CustomEvent('game:select', {
      bubbles: true,
      composed: true,
      detail: { gameId: manifest.id },
    });
    article.dispatchEvent(event);
  });

  // The frame clips the hover zoom and draws the plate's hairline border.
  const frame = document.createElement('div');
  frame.className = 'game-card__frame';
  frame.appendChild(img);

  article.appendChild(frame);
  article.appendChild(heading);
  article.appendChild(description);
  if (scoreElem) article.appendChild(scoreElem);
  article.appendChild(button);

  return article;
}
