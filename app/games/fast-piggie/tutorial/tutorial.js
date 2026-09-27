/**
 * tutorial.js — Fast Piggie tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice rounds.
 *
 * index.js owns the round display and wedge controls. It hands this module a
 * {@link PracticeRoundControls} object from init(), launches the tutorial through
 * {@link tutorial}, and sends answers given during practice to {@link finishPracticeRound}.
 * This module never imports index.js.
 *
 * @file Fast Piggie tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

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

// ── Launching ─────────────────────────────────────────────────────────────────

/**
 * What the tutorial needs from the game controller to play practice rounds.
 *
 * @typedef {object} PracticeRoundControls
 * @property {() => void} showGameArea - Show the game area in place of the other panels.
 * @property {(round: object, onImagesHidden: () => void) => void} playRound - Flash `round`'s
 *   piggies, hide them, open answers, then call `onImagesHidden`.
 * @property {() => void} stopRound - Cancel the round's timers and close answers.
 * @property {() => number} getCorrectWedge - The wedge the orange piggie was in.
 * @property {() => void} redrawBoard - Redraw the empty wheel, shading the practice hint wedge.
 * @property {(wedge: number) => import('../../../components/tutorialCoach.js').MarkerOptions}
 *   getWedgeMarker - Where to ring `wedge` on the canvas.
 * @property {(wedge: number) => void} showAnswer - Clear the hint and give the usual feedback for
 *   choosing `wedge`.
 */

/** Controls set by index.js in init(). @type {PracticeRoundControls|null} */
let _controls = null;
/**
 * The practice round in progress, if any. `hintWedge` is the correct wedge, kept shaded
 * during a guided round (-1 when there is no hint).
 * @type {{ context: object, resolve: Function, hintWedge: number }|null}
 */
let _practice = null;

/**
 * Hand the tutorial the controls it plays practice rounds through. index.js calls this from
 * init(), before any launch.
 *
 * @param {PracticeRoundControls} controls
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
  playPracticeRound,
});

// ── Practice rounds ───────────────────────────────────────────────────────────

/**
 * Whether a practice round is showing its piggies or waiting for the answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * The wedge to keep shaded as a hint, so hover and keyboard highlights do not erase it.
 *
 * @returns {number} The wedge index, or -1 when no guided practice round is showing a hint.
 */
export function getPracticeHintWedge() {
  return _practice ? _practice.hintWedge : -1;
}

/**
 * End a practice round once the player answers: show the result without scoring it, and hand
 * control back to the tutorial.
 *
 * @param {number} wedge - The wedge the player chose.
 */
export function finishPracticeRound(wedge) {
  const { context, resolve } = _practice;
  // Cleared first so the result colors are drawn on a wheel without the hint.
  _practice = null;
  context.hideMarker();
  _controls.showAnswer(wedge);
  resolve();
}

/**
 * Once the piggies vanish, tell the player what to answer. A guided round also shades and
 * rings the correct wedge.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 */
function promptPracticeResponse(context) {
  if (!context.guided) {
    context.setInstructions(PRACTICE_TEXT.answer);
    return;
  }
  _practice.hintWedge = _controls.getCorrectWedge();
  _controls.redrawBoard();
  context.showMarker(_controls.getWedgeMarker(_practice.hintWedge));
  context.setInstructions(PRACTICE_TEXT.guidedAnswer);
}

/**
 * Drop any practice round and cancel its timers. Runs when the tutorial's practice signal
 * aborts, which happens whenever the tutorial ends. The round's promise is left pending:
 * the tutorial no longer waits on it.
 */
function endPractice() {
  _controls.stopRound();
  _practice = null;
}

/**
 * Play one practice round at the easiest setting. It uses the real round display and
 * controls but never touches the score, levels, speed history, session timer, or saved
 * progress. In a guided round the correct wedge is shaded and ringed once the images vanish.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player answers.
 */
function playPracticeRound(context) {
  _controls.showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  return new Promise((resolve) => {
    _practice = { context, resolve, hintWedge: -1 };
    context.setInstructions(PRACTICE_TEXT.watch);
    _controls.playRound(game.generatePracticeRound(), () => promptPracticeResponse(context));
  });
}
