/**
 * tutorial.js — Directional Processing tutorial step definitions.
 *
 * @file Directional Processing tutorial content.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';

/**
 * Ordered Directional Processing tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Directional Processing',
    contentPath: './games/directional-processing/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/directional-processing/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'What to Look For',
    contentPath: './games/directional-processing/tutorial/tutorial-step-what-to-look-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/directional-processing/tutorial/tutorial-step-how-to-respond.html',
  },
  {
    title: 'Levels and Scoring',
    contentPath: './games/directional-processing/tutorial/tutorial-step-levels.html',
  },
];

/** Arrow key named in the coach text for each direction. */
const ARROW_KEY_NAMES = Object.freeze({
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
});

/**
 * Coach instructions for the guided practice rounds that follow the slides.
 * Any text that describes a click also gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** While the pattern is on screen. */
  watch: 'Watch the pattern. It moves for only a moment, so notice which way the stripes drift.',
  /**
   * After the pattern ends, in a guided round (the correct button is ringed). The marker is
   * not announced, so the text names the direction too.
   * @param {string} direction - One of 'up', 'down', 'left', 'right'.
   * @returns {string}
   */
  guidedAnswer: (direction) => `The pattern moved ${direction}, so the ringed button is the `
    + `answer. Click it, or press the ${ARROW_KEY_NAMES[direction]} arrow key.`,
  /** After the pattern ends, in an unguided round. */
  answer: 'Which way did the pattern move? Click that button, or press the matching arrow key.',
});

/**
 * Build the tutorial steps shown to first-time players and on replay.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export function getTutorialSteps() {
  return loadTutorialSteps(TUTORIAL_STEP_DEFINITIONS);
}
