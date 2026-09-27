/**
 * tutorial.js — Card Rat tutorial: slide definitions, practice-round text, launching the
 * guided tutorial, and playing its practice rounds.
 *
 * index.js owns the card display and slap controls. It hands this module a
 * {@link PracticeRoundControls} object from init(), launches the tutorial through
 * {@link tutorial}, and sends slaps made during practice to {@link handlePracticeSlap}.
 * This module never imports index.js.
 *
 * @file Card Rat tutorial content and controller.
 */

import { loadTutorialSteps } from '../../../components/tutorialService.js';
import { createTutorialLauncher } from '../../../components/tutorialLauncher.js';
import * as game from '../game.js';

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

// ── Launching ─────────────────────────────────────────────────────────────────

/**
 * What the tutorial needs from the game controller to play practice rounds.
 *
 * @typedef {object} PracticeRoundControls
 * @property {() => void} startRound - Show the game area and the deck, apply the hint setting,
 *   and start listening for Space to slap.
 * @property {(card: object, mustReact: boolean) => void} dealCard - Play the deal sound, show
 *   `card`, and hint whether it is one to slap.
 * @property {() => void} stopRound - Stop listening for Space.
 * @property {() => HTMLElement} getSlapZone - The reaction zone the player clicks to slap.
 * @property {(outcome: 'hit'|'false-alarm') => void} showSlapResult - Show the feedback text
 *   and play the sound for a slap.
 */

/** Controls set by index.js in init(). @type {PracticeRoundControls|null} */
let _controls = null;
/**
 * The practice round in progress, if any: its scripted cards, the index of the card shown,
 * and why that card is one to slap (`null` when it is not).
 * @type {{ context: object, resolve: Function, cards: object[], index: number,
 *   slapReason: string|null }|null}
 */
let _practice = null;
/** Timer that deals the next practice card. @type {ReturnType<typeof setTimeout>|null} */
let _dealTimer = null;

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
 * Whether a practice round is dealing cards or waiting for the slap.
 *
 * @returns {boolean}
 */
export function isPracticing() {
  return _practice !== null;
}

/** Cancel the timer for the next practice card, if one is pending. */
function clearDealTimer() {
  if (_dealTimer !== null) {
    clearTimeout(_dealTimer);
    _dealTimer = null;
  }
}

/**
 * Handle a slap during a practice round. A slap on the card to slap ends the round without
 * scoring it and hands control back to the tutorial. Any other slap gets the usual too-soon
 * feedback, and the cards keep coming.
 */
export function handlePracticeSlap() {
  if (_practice.slapReason === null) {
    _controls.showSlapResult('false-alarm');
    return;
  }
  const { context, resolve } = _practice;
  _practice = null;
  clearDealTimer();
  context.hideMarker();
  _controls.showSlapResult('hit');
  resolve();
}

/**
 * Deal the next scripted practice card. Cards before the last are dealt at the easiest
 * pace. The last card, the one to slap, stays until the player slaps it; in a guided round
 * the slap control is marked and the coach says why to slap.
 */
function dealPracticeCard() {
  const practice = _practice;
  practice.index += 1;
  const { cards, index, context } = practice;
  const card = cards[index];
  practice.slapReason = game.getSlapReason(
    cards[index - 2] || null,
    cards[index - 1] || null,
    card,
  );
  _controls.dealCard(card, practice.slapReason !== null);

  if (index < cards.length - 1) {
    _dealTimer = setTimeout(dealPracticeCard, game.calculateDisplayDuration(0));
    return;
  }
  if (context.guided) {
    context.showMarker({ anchor: _controls.getSlapZone(), shape: 'box' });
    context.setInstructions(PRACTICE_TEXT.guidedSlap[practice.slapReason]);
  }
}

/**
 * Drop any practice round and stop its cards. Runs when the tutorial's practice signal
 * aborts, which happens whenever the tutorial ends. The round's promise is left pending:
 * the tutorial no longer waits on it.
 */
function endPractice() {
  clearDealTimer();
  _controls.stopRound();
  _practice = null;
}

/**
 * Play one practice round: a short scripted run of cards that ends on one to slap. It uses
 * the real card display and slap controls but never touches the score, speed, speed history,
 * session timer, or saved progress.
 *
 * @param {import('../../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player slaps the card to slap.
 */
function playPracticeRound(context) {
  _controls.startRound();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  return new Promise((resolve) => {
    _practice = {
      context, resolve, cards: game.getPracticeSequence(context.round), index: -1, slapReason: null,
    };
    context.setInstructions(PRACTICE_TEXT.watch);
    dealPracticeCard();
  });
}
