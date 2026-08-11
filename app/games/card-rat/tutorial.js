/**
 * tutorial.js — Card Rat tutorial step definitions.
 *
 * @file Card Rat tutorial content.
 */

import { logger } from '../../components/logService.js';

/**
 * Ordered Card Rat tutorial step definitions.
 * Each step stores only metadata and an external HTML content file path.
 *
 * @type {Array<{title: string, contentPath: string}>}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Card Rat',
    contentPath: './games/card-rat/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/card-rat/tutorial-screenshot-step.html',
  },
  {
    title: 'When to Slap',
    contentPath: './games/card-rat/tutorial-step-when-to-slap.html',
  },
  {
    title: 'How to Score',
    contentPath: './games/card-rat/tutorial-step-how-to-score.html',
  },
];

/**
 * Fallback content shown if a tutorial step file cannot be loaded.
 * This intentionally uses plain text only (no HTML markup).
 *
 * @type {string}
 */
const FALLBACK_STEP_CONTENT = 'Tutorial content is temporarily unavailable.';

/**
 * Cached markup for tutorial step files.
 *
 * @type {Map<string, string>}
 */
let tutorialMarkupCache = new Map();

/**
 * Clear cached tutorial step markup.
 *
 * @returns {void}
 */
export function clearTutorialMarkupCache() {
  tutorialMarkupCache = new Map();
}

/**
 * Fetch tutorial step markup from a dedicated HTML file.
 *
 * @param {string} contentPath
 * @returns {Promise<string>}
 */
async function loadStepMarkup(contentPath) {
  if (tutorialMarkupCache.has(contentPath)) {
    return tutorialMarkupCache.get(contentPath);
  }

  try {
    const response = await fetch(contentPath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    tutorialMarkupCache.set(contentPath, await response.text());
  } catch (error) {
    logger.warn(`Card Rat tutorial markup failed to load: ${contentPath}`, error);
    tutorialMarkupCache.set(contentPath, FALLBACK_STEP_CONTENT);
  }

  return tutorialMarkupCache.get(contentPath);
}

/**
 * Build Card Rat tutorial steps shown for first-time players and replay flow.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export async function getTutorialSteps() {
  const steps = await Promise.all(
    TUTORIAL_STEP_DEFINITIONS.map(async ({ title, contentPath }) => ({
      title,
      content: await loadStepMarkup(contentPath),
    })),
  );
  return steps;
}
