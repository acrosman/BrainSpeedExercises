/**
 * tutorial.js — Field of View tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice trials.
 *
 * index.js owns the trial cycle. It hands this module a {@link PracticeTrialControls} object
 * when it launches the tutorial, and calls the practice hooks below from its response phase.
 * This module never imports index.js.
 *
 * @file Field of View tutorial content and controller.
 */

import {
  loadTutorialSteps,
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} from '../../../components/tutorialService.js';
import * as game from '../game.js';
import { cellPosition, labelForIcon } from '../render.js';
import { GAME_ID } from '../progress.js';

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

// ── Launching ─────────────────────────────────────────────────────────────────

/**
 * What the tutorial needs from the game controller to play practice trials.
 *
 * @typedef {object} PracticeTrialControls
 * @property {() => void} showGameArea - Show the game area in place of the other panels.
 * @property {(layout: object, soaMs: number) => void} playTrial - Show `layout` for `soaMs`,
 *   then the mask, then open the response phase.
 * @property {() => void} stopTrial - Cancel the trial's frames and timers and close responses.
 * @property {() => boolean} isKittenChosen - Whether a kitten is selected in this response phase.
 * @property {(id: string) => HTMLElement} getKittenButton - The button for a center kitten ID.
 * @property {(index: number) => HTMLElement} getLocationCell - The location square at an index.
 * @property {(message: string) => void} announce - Write to the game's feedback live region.
 */

/**
 * @typedef {object} TutorialLaunchOptions
 * @property {HTMLElement|null} container - Game container; nothing launches without one.
 * @property {PracticeTrialControls} controls - How to play practice trials.
 * @property {Function} onComplete - Starts the real session once the tutorial ends.
 */

/** Whether a tutorial launch call is currently in flight. @type {boolean} */
let _isLaunchPending = false;
/**
 * The guided tutorial in progress, if any.
 * @type {import('../../../components/tutorialService.js').GuidedTutorialRun|null}
 */
let _run = null;
/** Controls from the launch in progress or last run. @type {PracticeTrialControls|null} */
let _controls = null;
/**
 * The practice trial in progress, if any. `guideTarget` is the control the marker currently
 * rings in a guided trial.
 * @type {{ context: object, layout: object, resolve: Function,
 *   guideTarget: HTMLElement|null }|null}
 */
let _practice = null;
/**
 * The last practice trial shown, kept so a missed round replays the same layout.
 * @type {{ layout: object, soaMs: number }|null}
 */
let _lastPracticeTrial = null;

/**
 * Whether a guided tutorial is in progress.
 *
 * @returns {boolean}
 */
export function isTutorialActive() {
  return !!_run && _run.isActive();
}

/**
 * Cancel the guided tutorial, if one is running. Its practice signal aborts, which clears
 * any practice trial.
 */
export function cancelTutorial() {
  if (_run) _run.cancel();
  _run = null;
}

/**
 * Load the steps and hand them to a guided-tutorial launcher, guarding against overlapping
 * launches and a tutorial already in progress.
 *
 * @param {typeof runGuidedTutorial | typeof runGuidedTutorialIfNeeded} launch
 * @param {TutorialLaunchOptions} options
 * @returns {Promise<void>}
 */
async function launchTutorial(launch, { container, controls, onComplete }) {
  if (!container || _isLaunchPending || isTutorialActive()) return;

  _isLaunchPending = true;
  try {
    const introSteps = await getTutorialSteps();
    _controls = controls;
    // Null (after starting the session) when the tutorial was already seen.
    _run = await launch({
      gameId: GAME_ID,
      container,
      introSteps,
      playPracticeRound: playPracticeTrial,
      onComplete,
    });
  } finally {
    _isLaunchPending = false;
  }
}

/**
 * Show the tutorial if the player has not seen it, then start the session. If it was seen,
 * start the session at once.
 *
 * @param {TutorialLaunchOptions} options
 * @returns {Promise<void>}
 */
export function startTutorialIfNeeded(options) {
  return launchTutorial(runGuidedTutorialIfNeeded, options);
}

/**
 * Always show the tutorial, then start the session.
 *
 * @param {TutorialLaunchOptions} options
 * @returns {Promise<void>}
 */
export function replayTutorial(options) {
  return launchTutorial(runGuidedTutorial, options);
}

// ── Practice trials ───────────────────────────────────────────────────────────

/**
 * Whether a practice trial is waiting for, or showing, its stimulus and answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * The practice trial's answers, in the words the practice text uses.
 *
 * @param {object} layout - The trial layout from game.js.
 * @returns {{ kitten: string, row: number, col: number }}
 */
function describeCorrectAnswer({ centerIcon, peripheralIndex, gridSize }) {
  return {
    kitten: labelForIcon(centerIcon).toLowerCase(),
    ...cellPosition(peripheralIndex, gridSize),
  };
}

/**
 * In a guided practice trial, ring the next control to use: the correct kitten until one is
 * chosen, then the correct location square. The coach text only changes with the target, so
 * repeated picks do not repeat the announcement. Does nothing in an unguided trial.
 */
export function guidePracticeResponse() {
  if (!_practice || !_practice.context.guided) return;
  const { context, layout } = _practice;
  const kittenPending = !_controls.isKittenChosen();
  const target = kittenPending
    ? _controls.getKittenButton(layout.centerIcon.id)
    : _controls.getLocationCell(layout.peripheralIndex);
  if (target === _practice.guideTarget) return;
  _practice.guideTarget = target;

  const { kitten, row, col } = describeCorrectAnswer(layout);
  // On shorter windows the response panel can sit partly below the fold. The coach is
  // sticky, so scrolling keeps it in view, and the marker follows the scroll.
  target.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: target, shape: 'box' });
  context.setInstructions(kittenPending
    ? PRACTICE_TEXT.guidedKitten(kitten)
    : PRACTICE_TEXT.guidedLocation(row, col));
}

/**
 * Once the field covers the board in a practice trial, tell the player what to answer.
 * A guided trial also marks the control to use.
 */
export function promptPracticeResponse() {
  if (!_practice) return;
  if (_practice.context.guided) {
    guidePracticeResponse();
  } else {
    _practice.context.setInstructions(PRACTICE_TEXT.answer);
  }
}

/**
 * End a practice trial once the player answers, without scoring it, and hand the result back
 * to the tutorial. A correct answer is announced in the feedback region. A miss goes to the
 * coach banner, which names the right answers and offers to replay the round.
 *
 * @param {boolean} success - Whether both answers were right.
 */
export function finishPracticeTrial(success) {
  const { context, layout, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  const feedback = PRACTICE_TEXT.result({ success, ...describeCorrectAnswer(layout) });
  if (success) _controls.announce(feedback);
  resolve({ correct: success, feedback });
}

/**
 * Drop any practice trial and stop its animation frames and timers. Runs when the tutorial's
 * practice signal aborts, which happens whenever the tutorial ends. The trial's promise is
 * left pending: the tutorial no longer waits on it.
 */
function endPractice() {
  _controls.stopTrial();
  _practice = null;
  _lastPracticeTrial = null;
}

/**
 * Play one practice trial at the starting difficulty. It uses the game's real stimulus,
 * mask, and response controls but never touches the SOA, accuracy, threshold history,
 * session timer, or saved progress. In a guided trial the correct kitten, then the correct
 * square, is marked once the field appears. A retry after a miss shows the same layout again.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<import('../../../components/tutorialService.js').PracticeRoundResult>}
 *   Resolves once the player answers.
 */
function playPracticeTrial(context) {
  _controls.showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  if (context.attempt === 1 || !_lastPracticeTrial) {
    _lastPracticeTrial = game.createPracticeTrial();
  }
  const { layout, soaMs } = _lastPracticeTrial;

  return new Promise((resolve) => {
    _practice = {
      context, layout, resolve, guideTarget: null,
    };
    context.setInstructions(PRACTICE_TEXT.watch);
    _controls.playTrial(layout, soaMs);
  });
}
