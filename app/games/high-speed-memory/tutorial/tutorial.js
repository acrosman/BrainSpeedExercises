/**
 * tutorial.js — High Speed Memory tutorial: slide definitions, practice-round text, launching
 * the guided tutorial, and playing its practice rounds.
 *
 * index.js owns the round cycle. It hands this module a {@link PracticeRoundControls} object
 * when it launches the tutorial, and calls the practice hooks below from its card handlers.
 * This module never imports index.js.
 *
 * @file High Speed Memory tutorial content and controller.
 */

import {
  loadTutorialSteps,
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} from '../../../components/tutorialService.js';
import * as game from '../game.js';

/** Folder holding the slide fragments, relative to `app/index.html`. */
const STEP_PATH = './games/high-speed-memory/tutorial/';

/**
 * Ordered High Speed Memory tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  ['Welcome to High Speed Memory', 'tutorial-step-welcome.html'],
  ['Find the Main Play Area', 'tutorial-screenshot-step.html'],
  ['What to Look For', 'tutorial-step-what-to-look-for.html'],
  ['How to Respond', 'tutorial-step-how-to-respond.html'],
  ['Levels and Scoring', 'tutorial-step-levels.html'],
].map(([title, file]) => ({ title, contentPath: `${STEP_PATH}${file}` }));

/** Keyboard alternative appended to every instruction that describes a click. */
const KEYBOARD_HINT = 'or press Tab to move to it, then press Enter.';

/**
 * Text for the practice rounds that follow the slides. Any text that describes a click also
 * gives the keyboard alternative.
 */
export const PRACTICE_TEXT = Object.freeze({
  /** Coach text while the cards are face up. */
  watch: 'Watch the cards. Remember where the striped greyhound appears before the cards '
    + 'flip face down.',
  /**
   * Coach text in a guided round, while the ringed card is the next answer.
   * @param {number} found - How many greyhound cards are already found.
   * @returns {string}
   */
  guided: (found) => (found === 0
    ? 'A greyhound was under the ringed card. Click it, '
    : 'Now click the next ringed card, ') + KEYBOARD_HINT,
  /** Coach text once the cards flip face down in an unguided round. */
  answer: `Which cards showed the striped greyhound? Click all ${game.PRIMARY_COUNT}, or press `
    + 'Tab to move to each card and Enter to choose it.',
  /**
   * Feedback after a practice answer. A miss is shown in the coach banner, followed by
   * "Try this round again.".
   * @param {boolean} success - Whether every greyhound card was found without a wrong guess.
   * @returns {string}
   */
  result: (success) => (success
    ? `Correct! You found all ${game.PRIMARY_COUNT} greyhounds.`
    : 'Not quite. That card was not the striped greyhound. The greyhound cards are face up '
      + 'now.'),
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
 * @property {(grid: object[], displayMs: number) => void} playRound - Show `grid` face up for
 *   `displayMs`, then flip it face down and take card clicks. The controller marks found
 *   cards `matched` in `grid` itself.
 * @property {() => void} stopRound - Cancel the round's timers and ignore further card clicks.
 * @property {(id: number) => HTMLElement} getCard - The card button for a card ID.
 * @property {(message: string) => void} announce - Write to the game's feedback live region.
 */

/**
 * @typedef {object} TutorialLaunchOptions
 * @property {HTMLElement|null} container - Game container; nothing launches without one.
 * @property {PracticeRoundControls} controls - How to play practice rounds.
 * @property {Function} onComplete - Starts the real session once the tutorial ends.
 */

/** Whether a tutorial launch call is currently in flight. @type {boolean} */
let _isLaunchPending = false;
/**
 * The guided tutorial in progress, if any.
 * @type {import('../../../components/tutorialService.js').GuidedTutorialRun|null}
 */
let _run = null;
/** Controls from the launch in progress or last run. @type {PracticeRoundControls|null} */
let _controls = null;
/**
 * The practice round in progress, if any.
 * @type {{ context: object, grid: object[], resolve: Function }|null}
 */
let _practice = null;

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
 * any practice round.
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
      gameId: game.GAME_ID,
      container,
      introSteps,
      playPracticeRound,
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

// ── Practice rounds ───────────────────────────────────────────────────────────

/**
 * Whether a practice round is showing its cards or waiting for the player's answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * In a guided practice round, ring the next greyhound card still face down. Called when the
 * cards flip face down and after each greyhound is found. Does nothing in an unguided round.
 */
export function guidePracticeResponse() {
  if (!_practice || !_practice.context.guided) return;
  const { context, grid } = _practice;
  const primaries = grid.filter((card) => game.isPrimary(card.image));
  const next = primaries.find((card) => !card.matched);
  if (!next) return;

  const target = _controls.getCard(next.id);
  // On shorter windows the lower rows of the grid can sit below the fold. The coach is
  // sticky, so scrolling keeps it in view, and the marker follows the scroll.
  target.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: target, shape: 'box' });
  // The player may find a greyhound other than the ringed one, so count every match.
  const found = primaries.filter((card) => card.matched).length;
  context.setInstructions(PRACTICE_TEXT.guided(found));
}

/**
 * Once the cards flip face down in a practice round, tell the player what to answer.
 * A guided round also rings the first greyhound card.
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
 * End a practice round once the player finds every greyhound or guesses wrong, without
 * scoring it, and hand the result back to the tutorial. A correct round is announced in the
 * feedback region. A miss goes to the coach banner, which offers to replay the round.
 *
 * @param {boolean} success - Whether every greyhound was found without a wrong guess.
 */
export function finishPracticeRound(success) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  const feedback = PRACTICE_TEXT.result(success);
  if (success) _controls.announce(feedback);
  resolve({ correct: success, feedback });
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
 * Play one practice round at the starting difficulty. It uses the game's real grid, reveal
 * timing, and card controls but never touches the score, level, streaks, speed history,
 * session timer, or saved progress. In a guided round each greyhound card is ringed in turn
 * once the cards flip face down. A retry after a miss deals a new grid, as the real game does.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<import('../../../components/tutorialService.js').PracticeRoundResult>}
 *   Resolves once the player finds every greyhound or guesses wrong.
 */
function playPracticeRound(context) {
  _controls.showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  const { grid, displayMs } = game.createPracticeRound();
  return new Promise((resolve) => {
    _practice = { context, grid, resolve };
    context.setInstructions(PRACTICE_TEXT.watch);
    _controls.playRound(grid, displayMs);
  });
}
