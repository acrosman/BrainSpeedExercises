/**
 * tutorial.js — Directional Processing tutorial: slide definitions, practice-round text,
 * launching the guided tutorial, and playing its practice trials.
 *
 * index.js owns the trial cycle. It hands this module a {@link PracticeTrialControls} object
 * from init(), launches the tutorial through {@link tutorial}, and sends answers given during
 * practice to {@link finishPracticeTrial}. This module never imports index.js.
 *
 * @file Directional Processing tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

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

// ── Launching ─────────────────────────────────────────────────────────────────

/**
 * What the tutorial needs from the game controller to play practice trials.
 *
 * @typedef {object} PracticeTrialControls
 * @property {() => void} showGameArea - Show the game area in place of the other panels.
 * @property {(trial: { direction: string, contrast: number, displayDurationMs: number },
 *   onStimulusEnd: () => void) => void} playTrial - Play `trial` with the real stimulus, mask,
 *   and response phase, calling `onStimulusEnd` when the stimulus gives way to the mask.
 * @property {() => void} stopTrial - Cancel the trial's frames and timers and close responses.
 * @property {(direction: string) => HTMLElement} getDirectionButton - The button for a
 *   direction.
 * @property {(success: boolean) => void} showResult - Give the usual answer feedback: sound,
 *   announcement, flash, and the correct button after a miss.
 */

/** Controls set by index.js in init(). @type {PracticeTrialControls|null} */
let _controls = null;
/**
 * The practice trial in progress, if any.
 * @type {{ context: object, resolve: Function }|null}
 */
let _practice = null;

/**
 * Hand the tutorial the controls it plays practice trials through. index.js calls this from
 * init(), before any launch.
 *
 * @param {PracticeTrialControls} controls
 */
export function setPracticeControls(controls) {
  _controls = controls;
}

/**
 * Launches the guided tutorial from Start (`startIfNeeded`) and Replay Tutorial (`replay`).
 * index.js calls `isActive()` and `cancel()` from stop() and reset().
 *
 * @type {import('../../../components/tutorialLauncher.js').TutorialLauncher}
 */
export const tutorial = createTutorialLauncher({
  gameId: game.GAME_ID,
  loadSteps: getTutorialSteps,
  playPracticeRound: playPracticeTrial,
});

// ── Practice trials ───────────────────────────────────────────────────────────

/**
 * Whether a practice trial is showing its pattern or waiting for the answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * End a practice trial once the player answers: show the result without scoring it, and hand
 * control back to the tutorial.
 *
 * @param {boolean} success - Whether the answer was correct.
 */
export function finishPracticeTrial(success) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  _controls.showResult(success);
  resolve();
}

/**
 * Once the pattern ends, tell the player what to answer. A guided trial also scrolls the
 * correct button into view and rings it.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @param {string} direction - The trial's direction.
 */
function promptPracticeResponse(context, direction) {
  if (!context.guided) {
    context.setInstructions(PRACTICE_TEXT.answer);
    return;
  }
  const target = _controls.getDirectionButton(direction);
  // On shorter windows the direction pad sits below the fold. The coach is sticky, so
  // scrolling keeps it in view, and the marker follows the scroll.
  target.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: target, shape: 'box' });
  context.setInstructions(PRACTICE_TEXT.guidedAnswer(direction));
}

/**
 * Drop any practice trial and stop its animation and timers. Runs when the tutorial's
 * practice signal aborts, which happens whenever the tutorial ends. The trial's promise is
 * left pending: the tutorial no longer waits on it.
 */
function endPractice() {
  _controls.stopTrial();
  _practice = null;
}

/**
 * Play one practice trial at the easiest level. It uses the real stimulus, mask, and
 * response buttons but never touches the score, level, speed history, session timer, or saved
 * progress. In a guided trial the correct button is marked once the stimulus ends.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player answers.
 */
function playPracticeTrial(context) {
  _controls.showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  return new Promise((resolve) => {
    _practice = { context, resolve };
    context.setInstructions(PRACTICE_TEXT.watch);
    const trial = game.generatePracticeTrial();
    _controls.playTrial(trial, () => promptPracticeResponse(context, trial.direction));
  });
}
