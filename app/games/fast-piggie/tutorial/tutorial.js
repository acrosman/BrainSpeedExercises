/**
 * tutorial.js — Fast Piggie tutorial step definitions.
 *
 * @file Fast Piggie tutorial content.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';

/**
 * Ordered Fast Piggie tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Fast Piggie',
    contentPath: './games/fast-piggie/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/fast-piggie/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'What to Look For',
    contentPath: './games/fast-piggie/tutorial/tutorial-step-what-to-look-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/fast-piggie/tutorial/tutorial-step-how-to-respond.html',
  },
  {
    title: 'Levels and Scoring',
    contentPath: './games/fast-piggie/tutorial/tutorial-step-levels.html',
  },
];

/**
 * Coach instructions for the guided practice rounds that follow the slides.
 * Any text that describes a click also gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** While the piggies are on screen. */
  watch: 'Watch the circle. The piggies vanish quickly, so spot the orange one fast.',
  /** After they vanish, in a guided round (the correct spot is ringed and shaded). */
  guidedAnswer: 'The orange piggie was in the ringed spot. Click it, or press the arrow keys '
    + 'until that slice is shaded, then press Enter.',
  /** After they vanish, in an unguided round. */
  answer: 'Where was the orange piggie? Click that spot, or use the arrow keys to shade it '
    + 'and press Enter.',
});

/**
 * Build the tutorial steps shown to first-time players and on replay.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export function getTutorialSteps() {
  return loadTutorialSteps(TUTORIAL_STEP_DEFINITIONS);
}
