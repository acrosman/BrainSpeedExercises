/**
 * tutorial.js — Otter Stop tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice rounds.
 *
 * index.js owns the trial loop: the stimulus display, the feedback, and Space and click
 * handling. It hands this module a {@link PracticeRoundControls} object from init() and
 * launches the tutorial through {@link tutorial}. A practice round is a scripted run of trials
 * played through that same loop, so index.js has no practice hooks to call. This module never
 * imports index.js.
 *
 * @file Otter Stop tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

/** Folder holding the slide fragments, relative to `app/index.html`. */
const STEP_PATH = './games/otter-stop/tutorial/';

/**
 * Ordered Otter Stop tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  ['Welcome to Otter Stop', 'tutorial-step-welcome.html'],
  ['Find the Main Play Area', 'tutorial-screenshot-step.html'],
  ['Otters and the Fish', 'tutorial-step-otters-and-fish.html'],
  ['How to Respond', 'tutorial-step-how-to-respond.html'],
  ['Levels and Scoring', 'tutorial-step-levels.html'],
].map(([title, file]) => ({ title, contentPath: `${STEP_PATH}${file}` }));

/**
 * Text for the practice rounds that follow the slides. Any text that describes a click also
 * gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** Coach text while an otter waits for a press in a guided round. */
  guidedGo: 'An otter! Press Space or click the otter. In this round, each otter waits for you.',
  /** Coach text while the fish is up in a guided round. */
  guidedNoGo: 'The fish! Don\'t press anything. Wait for it to go away.',
  /** Coach text for a round at game speed. */
  watch: 'Now at game speed. Press Space or click each otter before it disappears. When the '
    + 'fish appears, do nothing.',
  /**
   * What went wrong in a round, shown in the coach banner before "Try this round again.".
   * @param {number} misses - Otters that disappeared before a press.
   * @param {number} noGoHits - Presses while the fish was showing.
   * @returns {string}
   */
  mistakes: (misses, noGoHits) => [
    misses > 0 && `You missed ${misses === 1 ? 'an otter' : `${misses} otters`}. Press for `
      + 'every otter before it disappears.',
    noGoHits > 0 && 'You pressed while the fish was showing. When the fish appears, do nothing.',
  ].filter(Boolean).join(' '),
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
 * @property {(run: import('../index.js').TrialRun) => void} playTrials - Play a run of trials
 *   with the real stimulus display, feedback, and Space and click handling.
 * @property {() => void} stopTrials - Stop the run, and clear the stimulus and feedback.
 * @property {() => HTMLElement} getStimulusArea - The area that shows each image. Clicking it
 *   responds.
 */

/** Controls set by index.js in init(). @type {PracticeRoundControls|null} */
let _controls = null;

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
 * How long a practice stimulus stays up with no press. A guided round waits for each otter.
 * Every other stimulus, including the fish in a guided round, uses the game's easiest
 * interval.
 *
 * @param {boolean} guided
 * @param {boolean} isNoGo
 * @returns {number|null} Milliseconds, or `null` to wait for a press.
 */
function getPracticeDisplayMs(guided, isNoGo) {
  return guided && !isNoGo ? null : game.getIntervalMs(0);
}

/**
 * In a guided round, say what to do with the stimulus about to appear. An otter rings the
 * stimulus area; the fish removes the ring, since there is nothing to press.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @param {boolean} isNoGo - Whether the stimulus is the fish.
 */
function guideStimulus(context, isNoGo) {
  if (isNoGo) {
    context.hideMarker();
    context.setInstructions(PRACTICE_TEXT.guidedNoGo);
  } else {
    context.showMarker({ anchor: _controls.getStimulusArea(), shape: 'box' });
    context.setInstructions(PRACTICE_TEXT.guidedGo);
  }
}

/**
 * Build the run of trials for one practice round. It records nothing in the game: it only
 * counts the round's mistakes, and hands back the result after the last stimulus.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @param {(result: import('../../../components/tutorialService.js').PracticeRoundResult)
 *   => void} finish - Called with the round's result once its last trial is recorded.
 * @returns {import('../index.js').TrialRun}
 */
function createPracticeRun(context, finish) {
  const stimuli = game.createPracticeSequence(context.round);
  let index = -1;
  let misses = 0;
  let noGoHits = 0;

  return {
    next() {
      index += 1;
      const stimulus = stimuli[index];
      if (!stimulus) return null;
      if (context.guided) guideStimulus(context, stimulus.isNoGo);
      return { ...stimulus, displayMs: getPracticeDisplayMs(context.guided, stimulus.isNoGo) };
    },
    record(stimulus, pressed) {
      const correct = game.isCorrectResponse(stimulus.isNoGo, pressed);
      if (!correct && stimulus.isNoGo) noGoHits += 1;
      if (!correct && !stimulus.isNoGo) misses += 1;
      if (index === stimuli.length - 1) {
        finish(misses + noGoHits === 0
          ? { correct: true }
          : { correct: false, feedback: PRACTICE_TEXT.mistakes(misses, noGoHits) });
      }
      return correct ? 'correct' : 'wrong';
    },
  };
}

/**
 * Stop any practice run. Runs when the tutorial's practice signal aborts, which happens
 * whenever the tutorial ends. The round's promise is left pending: the tutorial no longer
 * waits on it.
 */
function endPractice() {
  _controls.stopTrials();
}

/**
 * Play one practice round: a short scripted run of otters that ends on the fish. It uses the
 * game's real display, feedback, and controls but never touches the score, level, streaks,
 * speed history, session timer, or saved progress. A round with a mistake is replayed after a
 * Try Again prompt.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<import('../../../components/tutorialService.js').PracticeRoundResult>}
 *   Resolves once the fish's trial is recorded.
 */
function playPracticeRound(context) {
  _controls.showGameArea();
  // The coach pushes the game down. Bring the picture area on screen before the first otter.
  _controls.getStimulusArea().scrollIntoView({ block: 'nearest' });
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });
  if (!context.guided) context.setInstructions(PRACTICE_TEXT.watch);

  return new Promise((resolve) => {
    _controls.playTrials(createPracticeRun(context, resolve));
  });
}
