/**
 * tutorial.js — Card Rat tutorial step definitions.
 *
 * @file Card Rat tutorial content.
 */

import { logger } from '../../components/logService.js';

/**
 * Card Rat tutorial screenshot markup file path.
 * Path is renderer-root relative so it resolves from app/index.html.
 *
 * @type {string}
 */
const SCREENSHOT_MARKUP_PATH = './games/card-rat/tutorial-screenshot-step.html';

/**
 * Cached markup for the screenshot step.
 *
 * @type {string|null}
 */
let screenshotStepMarkupCache = null;

/**
 * Fetch screenshot step markup from its dedicated HTML file.
 *
 * @returns {Promise<string>}
 */
async function loadScreenshotStepMarkup() {
  if (screenshotStepMarkupCache !== null) {
    return screenshotStepMarkupCache;
  }

  try {
    const response = await fetch(SCREENSHOT_MARKUP_PATH);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    screenshotStepMarkupCache = await response.text();
  } catch (error) {
    logger.warn('Card Rat tutorial screenshot markup failed to load', error);
    screenshotStepMarkupCache = '<p>Tutorial screenshot is temporarily unavailable.</p>';
  }

  return screenshotStepMarkupCache;
}

/**
 * Build Card Rat tutorial steps shown for first-time players and replay flow.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export async function getTutorialSteps() {
  const screenshotStepMarkup = await loadScreenshotStepMarkup();

  return [
    {
      title: 'Welcome to Card Rat',
      content: '<p>React quickly, but only slap when a valid target appears.</p>',
    },
    {
      title: 'Find the Main Play Area',
      content: screenshotStepMarkup,
    },
    {
      title: 'When to Slap',
      content: [
        '<ul>',
        '<li>Pair: two cards in a row match.</li>',
        '<li>Sandwich: one card between two matching ranks.</li>',
        '<li>Joker: slap immediately.</li>',
        '</ul>',
      ].join(''),
    },
    {
      title: 'How to Score',
      content: [
        '<p>Use <kbd>Space</kbd> or click the cards.</p>',
        '<p>',
        'Correct slaps build streaks and speed up the deck.',
        'False alarms and misses cost momentum.',
        '</p>',
      ].join(''),
    },
  ];
}
