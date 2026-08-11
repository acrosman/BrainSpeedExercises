/**
 * tutorial.js — Directional Processing tutorial step definitions.
 *
 * @file Directional Processing tutorial content.
 */

import { logger } from '../../../components/logService.js';

/**
 * Ordered Directional Processing tutorial step definitions.
 * Each step stores metadata and an external HTML content file path.
 *
 * @type {Array<{title: string, contentPath: string}>}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Directional Processing',
    contentPath: './games/directional-processing/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'What to Look For',
    contentPath: './games/directional-processing/tutorial/tutorial-step-what-to-look-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/directional-processing/tutorial/tutorial-step-how-to-respond.html',
  },
];

/**
 * Fallback content shown if a tutorial step file cannot be loaded.
 *
 * @type {string}
 */
const FALLBACK_STEP_CONTENT = 'Tutorial content is temporarily unavailable.';

/**
 * Cached markup for tutorial step files.
 *
 * @type {Map<string, string>}
 */
const tutorialMarkupCache = new Map();

/**
 * Clear cached tutorial step markup.
 *
 * @returns {void}
 */
export function clearTutorialMarkupCache() {
  tutorialMarkupCache.clear();
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
    logger.warn(`Directional Processing tutorial markup failed to load: ${contentPath}`, error);
    tutorialMarkupCache.set(contentPath, FALLBACK_STEP_CONTENT);
  }

  return tutorialMarkupCache.get(contentPath);
}

/**
 * Build tutorial steps shown for first-time players and replay flow.
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
