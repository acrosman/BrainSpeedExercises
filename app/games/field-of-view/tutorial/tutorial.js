/**
 * tutorial.js — Field of View tutorial step definitions and practice-round text.
 *
 * @file Field of View tutorial content.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';

/**
 * Ordered Field of View tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Field of View',
    contentPath: './games/field-of-view/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/field-of-view/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'What to Look For',
    contentPath: './games/field-of-view/tutorial/tutorial-step-what-to-look-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/field-of-view/tutorial/tutorial-step-how-to-respond.html',
  },
  {
    title: 'Levels and Scoring',
    contentPath: './games/field-of-view/tutorial/tutorial-step-levels.html',
  },
];

/** Keyboard alternative appended to every instruction that describes a click. */
const KEYBOARD_HINT = 'or press Tab to move to it, then press Enter.';

/**
 * Text for the practice rounds that follow the slides. Any text that describes a click also
 * gives the keyboard alternative. Kitten names are lowercase labels such as 'sitting kitten'.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** Coach text while the kitten and toy are on screen. */
  watch: 'Keep your eyes on the center. Note which kitten is there and which edge square the '
    + 'toy is in before the field covers them.',
  /**
   * Coach text in a guided round, while the ringed kitten button is the next answer.
   * @param {string} kitten - The center kitten's name.
   * @returns {string}
   */
  guidedKitten: (kitten) => `The ${kitten} was in the center. Click the ringed kitten, `
    + KEYBOARD_HINT,
  /**
   * Coach text in a guided round, while the ringed location square is the next answer.
   * @param {number} row - One-based row of the toy.
   * @param {number} col - One-based column of the toy.
   * @returns {string}
   */
  guidedLocation: (row, col) => `The toy was in row ${row}, column ${col}. Click the ringed `
    + `square, ${KEYBOARD_HINT}`,
  /** Coach text once the field appears in an unguided round. */
  answer: 'Which kitten was in the center, and where was the toy? Click the kitten and the '
    + 'square, or press Tab to move to each one and Enter to choose it.',
  /**
   * Feedback after a practice answer. A miss names both correct answers; the coach banner
   * shows it, followed by "Try this round again.".
   * @param {{ success: boolean, kitten: string, row: number, col: number }} answer
   * @returns {string}
   */
  result: ({
    success, kitten, row, col,
  }) => (success
    ? 'Correct! You got both the kitten and the toy.'
    : `Not quite. The ${kitten} was in the center, and the toy was in row ${row}, `
      + `column ${col}.`),
});

/**
 * Build the tutorial steps shown to first-time players and on replay.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export function getTutorialSteps() {
  return loadTutorialSteps(TUTORIAL_STEP_DEFINITIONS);
}
