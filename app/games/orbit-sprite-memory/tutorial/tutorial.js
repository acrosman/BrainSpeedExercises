/**
 * tutorial.js — Orbit Sprite Memory tutorial: slide definitions, practice-round text,
 * launching the guided tutorial, and playing its practice rounds.
 *
 * index.js owns the round cycle. It hands this module a {@link PracticeRoundControls} object
 * from init(), launches the tutorial through {@link tutorial}, and calls the practice hooks
 * below from its playback and choice handlers. This module never imports index.js.
 *
 * @file Orbit Sprite Memory tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

/** Folder holding the slide fragments, relative to `app/index.html`. */
const STEP_PATH = './games/orbit-sprite-memory/tutorial/';

/**
 * Ordered Orbit Sprite Memory tutorial steps.
 * Each step's body is an HTML fragment in this folder.
 *
 * @type {import('../../../components/tutorialService.js').TutorialStepDefinition[]}
 */
const TUTORIAL_STEP_DEFINITIONS = [
  ['Welcome to Orbit Sprite Memory', 'tutorial-step-welcome.html'],
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
  /** Coach text while the rabbits appear around the circle. */
  watch: 'The rabbit beside "Target image" is your target. Watch the circle and remember the '
    + `${game.PRIMARY_SHOW_COUNT} spots where it appears.`,
  /**
   * Coach text in a guided round, while the ringed spot is the next answer. The spot's name
   * matches its accessible name, so keyboard and screen reader users can find it too.
   * @param {number} found - How many of the target's spots are already chosen.
   * @param {string} spotName - The ringed spot's accessible name, such as "Position 3".
   * @returns {string}
   */
  guided: (found, spotName) => (found === 0
    ? `The target appeared at the ringed spot, ${spotName}. Click it, `
    : `Now click the next ringed spot, ${spotName}, `) + KEYBOARD_HINT,
  /** Coach text once the playback ends in an unguided round. */
  answer: `Where did the target appear? Click all ${game.PRIMARY_SHOW_COUNT} spots, or press `
    + 'Tab to move to each spot and Enter to choose it.',
  /**
   * Feedback after a practice answer. A miss is shown in the coach banner, followed by
   * "Try this round again.".
   * @param {boolean} correct - Whether the chosen spots were exactly the target's spots.
   * @returns {string}
   */
  result: (correct) => (correct
    ? `Correct! You found all ${game.PRIMARY_SHOW_COUNT} spots where the target appeared.`
    : 'Not quite. Each rabbit is back in its spot. Compare them with the target image to '
      + 'see where it appeared.'),
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
 * @property {() => HTMLElement} getBoard - The circular board.
 * @property {(round: object) => void} playRound - Show the round's target, flash its rabbits
 *   around the circle, then take position choices.
 * @property {() => void} stopRound - Cancel the round's timers, ignore further choices, and
 *   clear the board.
 * @property {(positionIndex: number) => HTMLElement} getPositionButton - The choice button for
 *   a position.
 * @property {(message: string) => void} announce - Write to the game's feedback live region.
 */

/** Controls set by index.js in init(). @type {PracticeRoundControls|null} */
let _controls = null;
/**
 * The practice round in progress, if any.
 * @type {{ context: object, round: object, resolve: Function }|null}
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
 * Whether a practice round is playing its rabbits or waiting for the player's answer.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/**
 * In a guided practice round, ring the next spot where the target appeared that the player
 * has not chosen yet. Called when the playback ends and after each spot is chosen or cleared.
 * Does nothing in an unguided round.
 *
 * @param {Set<number>} selectedPositions - Positions chosen so far.
 */
export function guidePracticeResponse(selectedPositions) {
  if (!_practice || !_practice.context.guided) return;
  const { context, round } = _practice;
  const next = round.primaryPositions.find((position) => !selectedPositions.has(position));
  if (next === undefined) return;

  const spot = _controls.getPositionButton(next);
  // On shorter windows the bottom of the circle can sit below the fold. The coach is sticky,
  // so scrolling keeps it in view, and the marker follows the scroll.
  spot.scrollIntoView({ block: 'nearest' });
  context.showMarker({ anchor: spot });
  // The player may choose a target spot other than the ringed one, so count every target
  // spot chosen, not just the ringed ones.
  const found = round.primaryPositions.filter((pos) => selectedPositions.has(pos)).length;
  context.setInstructions(PRACTICE_TEXT.guided(found, spot.getAttribute('aria-label')));
}

/**
 * Once the playback ends in a practice round, tell the player what to answer. A guided round
 * also rings the first spot where the target appeared.
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
 * End a practice round once the player has chosen three spots, without scoring it, and hand
 * the result back to the tutorial. A correct round is announced in the feedback region. A miss
 * goes to the coach banner, which offers to replay the round.
 *
 * @param {boolean} correct - Whether the chosen spots were exactly the target's spots.
 */
export function finishPracticeRound(correct) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  const feedback = PRACTICE_TEXT.result(correct);
  if (correct) _controls.announce(feedback);
  resolve({ correct, feedback });
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
 * Play one practice round at the easiest level. It uses the game's real playback and choice
 * buttons but never touches the score, level, streaks, speed history, session timer, or saved
 * progress. In a guided round each spot where the target appeared is ringed in turn once the
 * playback ends. A retry after a miss plays a new round, as the real game does.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<import('../../../components/tutorialService.js').PracticeRoundResult>}
 *   Resolves once the player has chosen three spots.
 */
function playPracticeRound(context) {
  _controls.showGameArea();
  // The coach pushes the board down. Bring all of it on screen before the rabbits appear.
  _controls.getBoard().scrollIntoView({ block: 'nearest' });
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  const round = game.createPracticeRound();
  return new Promise((resolve) => {
    _practice = { context, round, resolve };
    context.setInstructions(PRACTICE_TEXT.watch);
    _controls.playRound(round);
  });
}
