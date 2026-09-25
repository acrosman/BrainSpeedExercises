/**
 * tutorial.js — Card Rat tutorial step definitions.
 *
 * @file Card Rat tutorial content.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';

/**
 * Ordered Card Rat tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Card Rat',
    contentPath: './games/card-rat/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/card-rat/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'How to Score',
    contentPath: './games/card-rat/tutorial/tutorial-step-how-to-score.html',
  },
  {
    title: 'When to Slap',
    contentPath: './games/card-rat/tutorial/tutorial-step-when-to-slap.html',
  },
  {
    title: 'Game Controls',
    contentPath: './games/card-rat/tutorial/tutorial-step-game-controls.html',
  },
];

/**
 * Build the tutorial steps shown to first-time players and on replay.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export function getTutorialSteps() {
  return loadTutorialSteps(TUTORIAL_STEP_DEFINITIONS);
}
