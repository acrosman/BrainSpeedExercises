/**
 * tutorial.js — Fine Tuning tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice trials.
 *
 * index.js owns the trial cycle. It hands this module a {@link PracticeTrialControls} object
 * from init(), launches the tutorial through {@link tutorial}, and sends answers given during
 * practice to {@link finishPracticeTrial}. This module never imports index.js.
 *
 * @file Fine Tuning tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

/**
 * Ordered Fine Tuning tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Fine Tuning',
    contentPath: './games/fine-tuning/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/fine-tuning/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'What to Listen For',
    contentPath: './games/fine-tuning/tutorial/tutorial-step-what-to-listen-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/fine-tuning/tutorial/tutorial-step-how-to-respond.html',
  },
  {
    title: 'Levels and Scoring',
    contentPath: './games/fine-tuning/tutorial/tutorial-step-levels.html',
  },
];

/**
 * Coach instructions for the guided practice rounds that follow the slides.
 * Any text that describes a click also gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** While the sounds play. */
  listen: 'Listen to the target, then to the two sounds after it. One of them matches the '
    + 'target.',
  /**
   * After the sounds end, in a guided round (the correct button is ringed). The marker is not
   * announced, so the text names the answer and its key too.
   * @param {{ target: string, answer: string }} trial
   * @returns {string}
   */
  guidedAnswer: ({ target, answer }) => {
    // Keys 1–2 answer game.ANSWERS in order.
    const key = game.ANSWERS.indexOf(answer) + 1;
    return `The target was "${target}", and the ${answer} sound matched it, so the ringed `
      + `button, ${game.formatAnswer(answer)}, is the answer. Click it, or press ${key}.`;
  },
  /** After the sounds end, in an unguided round. */
  answer: 'Which sound matched the target? Click First or Second, or press 1 or 2. Replay '
    + 'plays all three sounds again.',
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
 * @property {(trial: import('../game.js').Trial, onPlaybackEnd: () => void) => void}
 *   playTrial - Play `trial` with the real sounds, Replay button, and response phase,
 *   calling `onPlaybackEnd` once responses open.
 * @property {() => void} stopTrial - Silence the trial, cancel its timers, and close
 *   responses.
 * @property {(answer: string) => HTMLElement} getAnswerButton - The button for an answer.
 * @property {(success: boolean) => void} showResult - Give the usual answer feedback: sound,
 *   and an announcement that names the target and where it was after a miss.
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
 * Whether a practice trial is playing its sounds or waiting for the answer.
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
 * Once the sounds end, tell the player what to answer. A guided trial also scrolls the
 * correct button into view and rings it.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @param {import('../game.js').Trial} trial - The trial played.
 */
function promptPracticeResponse(context, trial) {
  if (!context.guided) {
    context.setInstructions(PRACTICE_TEXT.answer);
    return;
  }
  const target = _controls.getAnswerButton(trial.answer);
  // The coach is sticky and pushes the game down, so on shorter windows the answer buttons can
  // sit below the fold. The marker follows the scroll.
  target.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: target, shape: 'box' });
  context.setInstructions(PRACTICE_TEXT.guidedAnswer(trial));
}

/**
 * Drop any practice trial and silence it. Runs when the tutorial's practice signal aborts,
 * which happens whenever the tutorial ends. The trial's promise is left pending: the tutorial
 * no longer waits on it.
 */
function endPractice() {
  _controls.stopTrial();
  _practice = null;
}

/**
 * Play one practice trial at the easiest level in the player's voice setting. It uses the
 * real sounds, Replay button, and answer buttons but never touches the score, level, speed
 * history, session timer, or saved progress. In a guided trial the correct button is marked
 * once the sounds end.
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
    context.setInstructions(PRACTICE_TEXT.listen);
    const trial = game.generatePracticeTrial();
    _controls.playTrial(trial, () => promptPracticeResponse(context, trial));
  });
}
