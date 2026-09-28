/**
 * tutorial.js — Object Track tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice rounds.
 *
 * index.js owns the round cycle. It hands this module a {@link PracticeRoundControls} object
 * from init(), launches the tutorial through {@link tutorial}, and calls the practice hooks
 * below from its response-phase handlers. This module never imports index.js.
 *
 * @file Object Track tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

/** Folder holding the slide fragments, relative to `app/index.html`. */
const STEP_PATH = './games/object-track/tutorial/';

/**
 * Ordered Object Track tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  ['Welcome to Object Track', 'tutorial-step-welcome.html'],
  ['Find the Main Play Area', 'tutorial-screenshot-step.html'],
  ['What to Look For', 'tutorial-step-what-to-look-for.html'],
  ['How to Respond', 'tutorial-step-how-to-respond.html'],
  ['Levels and Scoring', 'tutorial-step-levels.html'],
].map(([title, file]) => ({ title, contentPath: `${STEP_PATH}${file}` }));

/** Number of targets in a practice round (the easiest level's count). */
const PRACTICE_TARGET_COUNT = game.getLevelConfig(game.MIN_LEVEL).numTargets;

/** Keyboard alternative appended to every instruction that describes a click. */
const KEYBOARD_HINT = 'or press Tab to move to it, then press Enter.';

/**
 * Text for the practice rounds that follow the slides. Any text that describes a click also
 * gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** Coach text while the targets glow and the balls move. */
  watch: `Watch the ${PRACTICE_TARGET_COUNT} glowing balls. When the glow fades, keep your `
    + 'eyes on them while all the balls move.',
  /**
   * Coach text in a guided round, while the ringed ball is the next answer. The ball's name
   * matches its accessible name, so keyboard and screen reader users can find it too.
   * @param {number} found - How many targets are already chosen.
   * @param {string} ballName - The ringed ball's accessible name, such as "Circle 4".
   * @returns {string}
   */
  guided: (found, ballName) => (found === 0
    ? `The ringed ball, ${ballName}, is one of your targets. Click it, `
    : `Now click the next ringed ball, ${ballName}, `) + KEYBOARD_HINT,
  /** Coach text once the balls stop in an unguided round. */
  answer: `Which balls were your targets? Click all ${PRACTICE_TARGET_COUNT}, or press Tab `
    + 'to move to each ball and Enter to choose it.',
  /**
   * Feedback after a practice answer. A miss is shown in the coach banner, followed by
   * "Try this round again.".
   * @param {{ correct: boolean, correctCount: number, totalTargets: number }} evaluation -
   *   The result of `game.evaluateResponse`.
   * @returns {string}
   */
  result: ({ correct, correctCount, totalTargets }) => (correct
    ? `Correct! You tracked all ${totalTargets} targets.`
    : `Not quite. You found ${correctCount} of ${totalTargets} targets. Green rings show the `
      + 'targets you found, and red rings show the ones you missed.'),
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
 * @property {() => { width: number, height: number }} getArenaBounds - The arena's size, to
 *   place the practice circles in.
 * @property {(circles: object[], trackingDurationMs: number) => void} playRound - Highlight
 *   the targets in `circles`, move every circle for `trackingDurationMs`, then take circle
 *   clicks.
 * @property {() => void} stopRound - Cancel the round's timers and ignore further clicks.
 * @property {(id: number) => HTMLElement} getCircle - The circle button for a circle ID.
 * @property {(message: string) => void} announce - Write to the game's feedback live region.
 */

/** Controls set by index.js in init(). @type {PracticeRoundControls|null} */
let _controls = null;
/**
 * The practice round in progress, if any.
 * @type {{ context: object, circles: object[], resolve: Function }|null}
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
 * Whether a practice round is showing its circles or waiting for the player's answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * In a guided practice round, ring the next target the player has not chosen yet. Called
 * when the balls stop and after each circle is chosen or cleared. Does nothing in an
 * unguided round.
 *
 * @param {Set<number>} selectedIds - IDs of the circles chosen so far.
 */
export function guidePracticeResponse(selectedIds) {
  if (!_practice || !_practice.context.guided) return;
  const { context, circles } = _practice;
  const targets = circles.filter((circle) => circle.isTarget);
  const next = targets.find((circle) => !selectedIds.has(circle.id));
  if (!next) return;

  const ball = _controls.getCircle(next.id);
  // On shorter windows the bottom of the arena can sit below the fold. The coach is
  // sticky, so scrolling keeps it in view, and the marker follows the scroll.
  ball.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: ball });
  // The player may choose a target other than the ringed one, so count every chosen target.
  const found = targets.filter((circle) => selectedIds.has(circle.id)).length;
  context.setInstructions(PRACTICE_TEXT.guided(found, ball.getAttribute('aria-label')));
}

/**
 * Once the balls stop in a practice round, tell the player what to answer. A guided round
 * also rings the first target.
 */
export function promptPracticeResponse() {
  if (!_practice) return;
  if (_practice.context.guided) {
    guidePracticeResponse(new Set());
  } else {
    _practice.context.setInstructions(PRACTICE_TEXT.answer);
  }
}

/**
 * End a practice round once the player has chosen as many balls as there are targets,
 * without scoring it, and hand the result back to the tutorial. A correct round is announced
 * in the feedback region. A miss goes to the coach banner, which offers to replay the round.
 *
 * @param {{ correct: boolean, correctCount: number, totalTargets: number }} evaluation -
 *   The result of `game.evaluateResponse`.
 */
export function finishPracticeRound(evaluation) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  const feedback = PRACTICE_TEXT.result(evaluation);
  if (evaluation.correct) _controls.announce(feedback);
  resolve({ correct: evaluation.correct, feedback });
}

/**
 * Drop any practice round and stop its timers. Runs when the tutorial's practice signal
 * aborts, which happens whenever the tutorial ends. The round's promise is left pending:
 * the tutorial no longer waits on it.
 */
function endPractice() {
  _controls.stopRound();
  _practice = null;
}

/**
 * Play one practice round at the easiest level. It uses the game's real marking, tracking,
 * and response phases but never touches the score, level, streaks, speed history, session
 * timer, or saved progress. In a guided round each target is ringed in turn once the balls
 * stop. A retry after a miss plays new circles, as the real game does.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<import('../../../components/tutorialService.js').PracticeRoundResult>}
 *   Resolves once the player has chosen as many balls as there are targets.
 */
function playPracticeRound(context) {
  _controls.showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  // Measure after showGameArea, so the arena has its size.
  const { width, height } = _controls.getArenaBounds();
  const { circles, trackingDurationMs } = game.createPracticeRound(width, height);
  return new Promise((resolve) => {
    _practice = { context, circles, resolve };
    context.setInstructions(PRACTICE_TEXT.watch);
    _controls.playRound(circles, trackingDurationMs);
  });
}
