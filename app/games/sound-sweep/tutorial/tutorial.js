/**
 * tutorial.js — Sound Sweep tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice trials.
 *
 * index.js owns the trial cycle. It hands this module a {@link PracticeTrialControls} object
 * from init(), launches the tutorial through {@link tutorial}, and sends answers given during
 * practice to {@link finishPracticeTrial}. This module never imports index.js.
 *
 * @file Sound Sweep tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

/**
 * Ordered Sound Sweep tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  {
    title: 'Welcome to Sound Sweep',
    contentPath: './games/sound-sweep/tutorial/tutorial-step-welcome.html',
  },
  {
    title: 'Find the Main Play Area',
    contentPath: './games/sound-sweep/tutorial/tutorial-screenshot-step.html',
  },
  {
    title: 'What to Listen For',
    contentPath: './games/sound-sweep/tutorial/tutorial-step-what-to-listen-for.html',
  },
  {
    title: 'How to Respond',
    contentPath: './games/sound-sweep/tutorial/tutorial-step-how-to-respond.html',
  },
  {
    title: 'Levels and Scoring',
    contentPath: './games/sound-sweep/tutorial/tutorial-step-levels.html',
  },
];

/**
 * Coach instructions for the guided practice rounds that follow the slides.
 * Any text that describes a click also gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** While the sweeps play. */
  listen: 'Listen to both sweeps. Up rises from low to high, and down falls from high to low.',
  /**
   * After the sweeps end, in a guided round (the correct button is ringed). The marker is not
   * announced, so the text names the answer and its key too.
   * @param {string} sequence - One of game.SEQUENCES.
   * @returns {string}
   */
  guidedAnswer: (sequence) => {
    const [first, second] = sequence.split('-');
    // Keys 1–4 answer game.SEQUENCES in order.
    const key = game.SEQUENCES.indexOf(sequence) + 1;
    return `The first sweep went ${first} and the second went ${second}, so the ringed `
      + `button, ${game.formatSequence(sequence)}, is the answer. Click it, or press ${key}.`;
  },
  /** After the sweeps end, in an unguided round. */
  answer: 'Which sequence did you hear? Click its button, or press its number key, 1 to 4. '
    + 'Replay plays the sweeps again.',
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
 * @property {(trial: { sequence: string, sweepDurationMs: number, isiMs: number },
 *   onSweepsEnd: () => void) => void} playTrial - Play `trial` with the real sweeps, Replay
 *   button, and response phase, calling `onSweepsEnd` once responses open.
 * @property {() => void} stopTrial - Cancel the trial's timers and close responses.
 * @property {(sequence: string) => HTMLElement} getSequenceButton - The answer button for a
 *   sequence.
 * @property {(success: boolean) => void} showResult - Give the usual answer feedback: sound,
 *   and an announcement that names the sequence after a miss.
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
 * Whether a practice trial is playing its sweeps or waiting for the answer.
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
 * Once the sweeps end, tell the player what to answer. A guided trial also scrolls the
 * correct button into view and rings it.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @param {string} sequence - The trial's sequence.
 */
function promptPracticeResponse(context, sequence) {
  if (!context.guided) {
    context.setInstructions(PRACTICE_TEXT.answer);
    return;
  }
  const target = _controls.getSequenceButton(sequence);
  // The coach is sticky and pushes the game down, so on shorter windows the answer buttons can
  // sit below the fold. The marker follows the scroll.
  target.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: target, shape: 'box' });
  context.setInstructions(PRACTICE_TEXT.guidedAnswer(sequence));
}

/**
 * Drop any practice trial and stop its timers. Runs when the tutorial's practice signal
 * aborts, which happens whenever the tutorial ends. The trial's promise is left pending: the
 * tutorial no longer waits on it.
 */
function endPractice() {
  _controls.stopTrial();
  _practice = null;
}

/**
 * Play one practice trial at the easiest level. It uses the real sweeps, Replay button, and
 * answer buttons but never touches the score, level, speed history, session timer, or saved
 * progress. In a guided trial the correct button is marked once the sweeps end.
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
    _controls.playTrial(trial, () => promptPracticeResponse(context, trial.sequence));
  });
}
