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

/** How to slap, named in every coach line that asks for one. */
const HOW_TO_SLAP = 'press Space or click the ringed cards.';

/**
 * Coach instructions for the guided practice rounds that follow the slides.
 * Any text that describes a click also gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** While the cards are dealt. */
  watch: 'Watch the cards. Slap only on a pair, a sandwich, or a joker: press Space or click '
    + 'the cards.',
  /**
   * On the last card of a guided round (the cards are ringed), keyed by why it is a card to
   * slap. The marker is not announced, so the text says what to do without it.
   */
  guidedSlap: Object.freeze({
    pair: `Two cards of the same value in a row make a pair. Slap now: ${HOW_TO_SLAP}`,
    sandwich: 'Two cards of the same value with one card between them make a sandwich. '
      + `Slap now: ${HOW_TO_SLAP}`,
    joker: `A joker is always a card to slap. Slap now: ${HOW_TO_SLAP}`,
  }),
});

/**
 * Build the tutorial steps shown to first-time players and on replay.
 *
 * @returns {Promise<Array<{title: string, content: string}>>}
 */
export function getTutorialSteps() {
  return loadTutorialSteps(TUTORIAL_STEP_DEFINITIONS);
}
