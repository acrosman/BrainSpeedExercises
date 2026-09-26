/**
 * index.js — Card Rat game plugin entry point for BrainSpeedExercises.
 *
 * Handles all UI/event behavior for the Card Rat reaction game.
 *
 * @file Card Rat game plugin (UI/controller layer).
 */

import * as game from './game.js';
import * as timerService from '../../components/timerService.js';
import {
  playSuccessSound,
  playFailureSound,
  playCardFlickSound,
} from '../../components/audioService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { renderTrendChart } from '../../components/trendChartService.js';
import {
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} from '../../components/tutorialService.js';
import { getDeckBackImagePath, getJokerImagePath, getStandardCardSpriteStyle } from './cardSvg.js';
import { getTutorialSteps, PRACTICE_TEXT } from './tutorial/tutorial.js';

/** Human-readable plugin name. */
const name = 'Card Rat';

/** Game ID used for progress persistence. */
const GAME_ID = 'card-rat';

/** @type {HTMLElement|null} */
let _container = null;

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _gameAreaEl = null;

/** @type {HTMLElement|null} */
let _endPanelEl = null;

/** @type {HTMLButtonElement|null} */
let _startBtn = null;

/** @type {HTMLButtonElement|null} */
let _replayTutorialBtn = null;

/** @type {HTMLButtonElement|null} */
let _stopBtn = null;

/** @type {HTMLButtonElement|null} */
let _playAgainBtn = null;

/** @type {HTMLButtonElement|null} */
let _returnBtn = null;

/** @type {HTMLButtonElement|null} */
let _reactionZoneBtn = null;

/** @type {HTMLInputElement|null} */
let _cardSoundToggleEl = null;

/** @type {HTMLInputElement|null} */
let _hintToggleEl = null;

/** @type {HTMLElement|null} */
let _cardEl = null;

/** @type {HTMLElement|null} */
let _deckCardEl = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _hitsEl = null;

/** @type {HTMLElement|null} */
let _missesEl = null;

/** @type {HTMLElement|null} */
let _falseAlarmsEl = null;

/** @type {HTMLElement|null} */
let _displayTimeEl = null;

/** @type {HTMLElement|null} */
let _deckProgressEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;

/** @type {HTMLElement|null} */
let _trendEmptyEl = null;

/** @type {HTMLElement|null} */
let _trendLatestEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalHitsEl = null;

/** @type {HTMLElement|null} */
let _finalMissesEl = null;

/** @type {HTMLElement|null} */
let _finalFalseAlarmsEl = null;

/** @type {HTMLElement|null} */
let _finalSpeedEl = null;

/** @type {HTMLElement|null} */
let _finalDeckPassesEl = null;

/** @type {ReturnType<typeof setTimeout>|null} */
let _dealTimer = null;

/**
 * Whether the document-level Space key handler is currently attached.
 * @type {boolean}
 */
let _isGlobalKeyListenerAttached = false;

/**
 * Whether a tutorial launch call is currently in flight.
 * @type {boolean}
 */
let _isTutorialLaunchPending = false;

/**
 * The guided tutorial in progress, if any.
 * @type {import('../../components/tutorialService.js').GuidedTutorialRun|null}
 */
let _tutorialRun = null;

/**
 * The practice round in progress, if any: its scripted cards, the index of the card shown,
 * and why that card is one to slap (`null` when it is not).
 * @type {{ context: object, resolve: Function, cards: object[], index: number,
 *   slapReason: string|null }|null}
 */
let _practice = null;

/**
 * Apply a card image URL to a card element.
 *
 * @param {HTMLElement} element
 * @param {string} imagePath
 */
function applyCardImage(element, imagePath) {
  element.style.backgroundImage = `url('${imagePath}')`;
  element.style.backgroundSize = 'contain';
  element.style.backgroundPosition = 'center';
  element.style.backgroundRepeat = 'no-repeat';
}

/**
 * Return stable render dimensions for sprite-scaling calculations.
 *
 * @param {HTMLElement} element
 * @returns {{ width: number, height: number }}
 */
function getRenderDimensions(element) {
  const { width: rectWidth, height: rectHeight } = element.getBoundingClientRect();
  const computedStyles = window.getComputedStyle(element);
  const styleWidth = Number.parseFloat(computedStyles.width) || 0;
  const styleHeight = Number.parseFloat(computedStyles.height) || 0;

  return {
    width: rectWidth || styleWidth || 170,
    height: rectHeight || styleHeight || 255,
  };
}

/**
 * Return a short card label for fallback and accessibility.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }} card
 * @returns {string}
 */
function getCardLabel(card) {
  if (card.isJoker) return 'Joker';

  const symbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  return `${card.rank}${symbols[card.suit] || ''}`;
}

/**
 * Clear pending deal-loop timer.
 */
export function clearDealTimer() {
  if (_dealTimer !== null) {
    clearTimeout(_dealTimer);
    _dealTimer = null;
  }
}

/**
 * Update live stats in the game area.
 */
export function updateStats() {
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_hitsEl) _hitsEl.textContent = String(game.getTriggerHits());
  if (_missesEl) _missesEl.textContent = String(game.getMisses());
  if (_falseAlarmsEl) _falseAlarmsEl.textContent = String(game.getFalseAlarms());
  if (_displayTimeEl) _displayTimeEl.textContent = String(game.getDisplayDurationMs());
  if (_deckProgressEl) _deckProgressEl.textContent = `${game.getDeckIndex()} / ${game.getDeckSize()}`;
  updateTrendChart();
}

/**
 * Render the speed trend chart from shared trend chart service.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getDisplayDurationMs(),
  );
}

/**
 * Render the current card in the play area.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean, jokerVariant?: string }} card
 */
export function renderCard(card) {
  if (!_cardEl) return;

  const label = getCardLabel(card);
  _cardEl.setAttribute('aria-label', `Current card: ${label}`);

  if (card.isJoker) {
    applyCardImage(_cardEl, getJokerImagePath(card));
    return;
  }

  const { width: renderedCardWidth, height: renderedCardHeight } = getRenderDimensions(_cardEl);
  const spriteStyle = getStandardCardSpriteStyle(
    card,
    renderedCardWidth,
    renderedCardHeight,
    game.RANKS,
  );
  _cardEl.style.backgroundImage = `url('${spriteStyle.imagePath}')`;
  _cardEl.style.backgroundSize = spriteStyle.backgroundSize;
  _cardEl.style.backgroundPosition = spriteStyle.backgroundPosition;
  _cardEl.style.backgroundRepeat = 'no-repeat';
}

/**
 * Render the deck back image.
 */
export function renderDeckBack() {
  if (!_deckCardEl) return;
  _deckCardEl.setAttribute('aria-label', 'Deck back');
  applyCardImage(_deckCardEl, getDeckBackImagePath());
}

/**
 * Show or hide the hint text under the cards.
 */
export function updateHintVisibility() {
  if (!_feedbackEl) return;
  _feedbackEl.hidden = Boolean(_hintToggleEl && !_hintToggleEl.checked);
}

/**
 * Play the card flick sound, unless the player turned card sounds off.
 */
function playDealSound() {
  if (!_cardSoundToggleEl || _cardSoundToggleEl.checked) {
    playCardFlickSound();
  }
}

/**
 * Show the hint for the card just dealt.
 *
 * @param {boolean} mustReact - Whether the card is one to slap.
 */
function showDealHint(mustReact) {
  if (_feedbackEl) {
    _feedbackEl.textContent = mustReact
      ? 'SLAP now! (Space or click)'
      : 'Wait for a pair, sandwich, or joker.';
  }
}

/**
 * Start or continue the deal loop.
 */
export function beginDealLoop() {
  if (!game.isRunning()) return;

  const next = game.dealNextCard();
  playDealSound();
  if (next.missedTrigger) {
    playFailureSound();
  }
  renderCard(next.card);
  updateStats();
  showDealHint(next.mustReact);

  clearDealTimer();
  _dealTimer = setTimeout(() => {
    beginDealLoop();
  }, next.displayDurationMs);
}

/**
 * Show the feedback text and play the sound for a slap's outcome.
 *
 * @param {'hit' | 'false-alarm' | 'ignored'} outcome
 */
function showReactionFeedback(outcome) {
  if (_feedbackEl) {
    if (outcome === 'hit') {
      _feedbackEl.textContent = 'Nice slap!';
    } else if (outcome === 'false-alarm') {
      _feedbackEl.textContent = 'Too soon — only react to pairs, sandwiches, or jokers.';
    }
  }

  if (outcome === 'hit') {
    playSuccessSound();
  } else if (outcome === 'false-alarm') {
    playFailureSound();
  }
}

/**
 * End a practice round once the player slaps the right card: show the result without
 * scoring it, and hand control back to the tutorial.
 */
function finishPracticeRound() {
  const { context, resolve } = _practice;
  _practice = null;
  clearDealTimer();
  context.hideMarker();
  showReactionFeedback('hit');
  resolve();
}

/**
 * Handle a slap during a practice round. A slap on the card to slap ends the round; any other
 * slap gets the usual too-soon feedback and the cards keep coming. Nothing is scored.
 */
function handlePracticeReaction() {
  if (_practice.slapReason !== null) {
    finishPracticeRound();
  } else {
    showReactionFeedback('false-alarm');
  }
}

/**
 * Handle a reaction input from keyboard or click.
 */
export function handleReaction() {
  if (_practice) {
    handlePracticeReaction();
    return;
  }

  const outcome = game.respondToCurrentCard();
  showReactionFeedback(outcome);
  updateStats();
}

/**
 * Handle keyboard reactions.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Space') return;
  if (!game.isRunning() && !_practice) return;
  event.preventDefault();
  handleReaction();
}

/**
 * Attach the document-level Space key handler for reliable keyboard reactions.
 */
export function attachGlobalKeyListener() {
  if (_isGlobalKeyListenerAttached || typeof document === 'undefined') return;
  document.addEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = true;
}

/**
 * Detach the document-level Space key handler.
 */
export function detachGlobalKeyListener() {
  if (!_isGlobalKeyListenerAttached || typeof document === 'undefined') return;
  document.removeEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = false;
}

/**
 * Show the end panel with final values.
 *
 * @param {{
 *   score: number,
 *   triggerHits: number,
 *   misses: number,
 *   falseAlarms: number,
 *   deckPasses: number,
 *   lowestDisplayTime: number,
 * }} result
 */
export function showEndPanel(result) {
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;

  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalHitsEl) _finalHitsEl.textContent = String(result.triggerHits);
  if (_finalMissesEl) _finalMissesEl.textContent = String(result.misses);
  if (_finalFalseAlarmsEl) _finalFalseAlarmsEl.textContent = String(result.falseAlarms);
  if (_finalSpeedEl) _finalSpeedEl.textContent = `${result.lowestDisplayTime} ms`;
  if (_finalDeckPassesEl) _finalDeckPassesEl.textContent = String(result.deckPasses);
}

/**
 * Show the game area in place of the welcome and end panels.
 */
function showGameArea() {
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;
}

/**
 * Deal the next scripted practice card. Cards before the last are dealt at the easiest
 * pace. The last card, the one to slap, stays until the player slaps it; in a guided round
 * the cards are marked and the coach says why to slap.
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

  playDealSound();
  renderCard(card);
  showDealHint(practice.slapReason !== null);

  if (index < cards.length - 1) {
    _dealTimer = setTimeout(dealPracticeCard, game.calculateDisplayDuration(0));
    return;
  }
  if (context.guided) {
    context.showMarker({ anchor: _reactionZoneBtn, shape: 'box' });
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
  detachGlobalKeyListener();
  _practice = null;
}

/**
 * Play one tutorial practice round: a short scripted run of cards that ends on one to slap.
 * It uses the real card display and slap controls but never touches the score, speed, speed
 * history, session timer, or saved progress.
 *
 * @param {import('../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player slaps the card to slap.
 */
function playPracticeRound(context) {
  showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });
  attachGlobalKeyListener();
  updateHintVisibility();
  renderDeckBack();

  return new Promise((resolve) => {
    _practice = {
      context, resolve, cards: game.getPracticeSequence(context.round), index: -1, slapReason: null,
    };
    context.setInstructions(PRACTICE_TEXT.watch);
    dealPracticeCard();
  });
}

/**
 * Whether a guided tutorial is in progress.
 *
 * @returns {boolean}
 */
function isTutorialActive() {
  return !!_tutorialRun && _tutorialRun.isActive();
}

/**
 * Cancel the guided tutorial, if one is running. Its practice signal aborts, which clears
 * any practice round.
 */
function cancelTutorial() {
  if (_tutorialRun) _tutorialRun.cancel();
  _tutorialRun = null;
}

/**
 * Initialize plugin DOM references and event listeners.
 *
 * @param {HTMLElement|null} gameContainer
 */
function init(gameContainer) {
  _container = gameContainer;
  if (!_container) return;

  _instructionsEl = _container.querySelector('#cr-instructions');
  _gameAreaEl = _container.querySelector('#cr-game-area');
  _endPanelEl = _container.querySelector('#cr-end-panel');

  _startBtn = _container.querySelector('#cr-start-btn');
  _replayTutorialBtn = _container.querySelector('#cr-replay-tutorial-btn');
  _stopBtn = _container.querySelector('#cr-stop-btn');
  _playAgainBtn = _container.querySelector('#cr-play-again-btn');
  _returnBtn = _container.querySelector('#cr-return-btn');
  _reactionZoneBtn = _container.querySelector('#cr-reaction-zone');
  _cardSoundToggleEl = _container.querySelector('#cr-card-sound-toggle');
  _hintToggleEl = _container.querySelector('#cr-hint-toggle');

  _cardEl = _container.querySelector('#cr-card');
  _deckCardEl = _container.querySelector('#cr-deck-card');
  _feedbackEl = _container.querySelector('#cr-feedback');

  _scoreEl = _container.querySelector('#cr-score');
  _hitsEl = _container.querySelector('#cr-hits');
  _missesEl = _container.querySelector('#cr-misses');
  _falseAlarmsEl = _container.querySelector('#cr-false-alarms');
  _displayTimeEl = _container.querySelector('#cr-display-time');
  _deckProgressEl = _container.querySelector('#cr-deck-progress');
  _sessionTimerEl = _container.querySelector('#cr-session-timer');
  _trendLineEl = _container.querySelector('#cr-trend-line');
  _trendEmptyEl = _container.querySelector('#cr-trend-empty');
  _trendLatestEl = _container.querySelector('#cr-trend-latest');

  _finalScoreEl = _container.querySelector('#cr-final-score');
  _finalHitsEl = _container.querySelector('#cr-final-hits');
  _finalMissesEl = _container.querySelector('#cr-final-misses');
  _finalFalseAlarmsEl = _container.querySelector('#cr-final-false-alarms');
  _finalSpeedEl = _container.querySelector('#cr-final-speed');
  _finalDeckPassesEl = _container.querySelector('#cr-final-deck-passes');

  game.initGame();
  renderDeckBack();
  updateStats();

  if (_startBtn) _startBtn.addEventListener('click', start);
  // Replay always shows the tutorial, then starts a session.
  if (_replayTutorialBtn) {
    _replayTutorialBtn.addEventListener('click', () => {
      void launchTutorial(runGuidedTutorial);
    });
  }
  if (_stopBtn) _stopBtn.addEventListener('click', stop);
  if (_playAgainBtn) _playAgainBtn.addEventListener('click', start);
  if (_returnBtn) _returnBtn.addEventListener('click', returnToMainMenu);
  if (_reactionZoneBtn) {
    _reactionZoneBtn.addEventListener('click', handleReaction);
    _reactionZoneBtn.addEventListener('keydown', handleKeyDown);
  }
  if (_hintToggleEl) _hintToggleEl.addEventListener('change', updateHintVisibility);
  updateHintVisibility();
}

/**
 * Start the Card Rat game session immediately (without tutorial gating).
 */
function beginGameSession() {
  clearDealTimer();
  detachGlobalKeyListener();

  game.initGame();
  game.startGame();
  attachGlobalKeyListener();
  showGameArea();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  if (_sessionTimerEl) {
    _sessionTimerEl.textContent = '00:00';
  }

  if (_feedbackEl) {
    _feedbackEl.textContent = 'Game started. Build 3-hit streaks on pairs, sandwiches, and jokers.';
  }
  updateHintVisibility();

  renderDeckBack();
  beginDealLoop();
}

/**
 * Load the tutorial steps and hand them to a guided-tutorial launcher, guarding against
 * overlapping launches and a tutorial already in progress. When the tutorial finishes or
 * is skipped, the real session begins.
 *
 * @param {typeof runGuidedTutorial | typeof runGuidedTutorialIfNeeded} launch - Which
 *   launcher to use.
 * @returns {Promise<void>}
 */
async function launchTutorial(launch) {
  if (!_container || _isTutorialLaunchPending || isTutorialActive()) return;

  _isTutorialLaunchPending = true;
  try {
    const introSteps = await getTutorialSteps();
    // Null (after starting the session) when the tutorial was already seen.
    _tutorialRun = await launch({
      gameId: GAME_ID,
      container: _container,
      introSteps,
      playPracticeRound,
      onComplete: beginGameSession,
    });
  } finally {
    _isTutorialLaunchPending = false;
  }
}

/**
 * Start the Card Rat game, showing the tutorial if needed.
 *
 * @returns {Promise<void>}
 */
function start() {
  return launchTutorial(runGuidedTutorialIfNeeded);
}

/**
 * Stop the game, persist score, and show summary.
 *
 * With no session running (on the welcome screen, during the tutorial, or when the app
 * quits after a session ended) there is nothing to save and the screen is left alone,
 * except that leaving a tutorial this way cancels it and returns to the welcome screen.
 *
 * @returns {{
 *   score: number,
 *   triggerHits: number,
 *   misses: number,
 *   falseAlarms: number,
 *   cardsShown: number,
 *   deckPasses: number,
 *   lowestDisplayTime: number,
 *   duration: number,
 * }}
 */
function stop() {
  clearDealTimer();
  detachGlobalKeyListener();

  if (!game.isRunning()) {
    if (isTutorialActive()) reset();
    return {
      score: game.getScore(),
      triggerHits: game.getTriggerHits(),
      misses: game.getMisses(),
      falseAlarms: game.getFalseAlarms(),
      cardsShown: game.getCardsShown(),
      deckPasses: game.getDeckPasses(),
      lowestDisplayTime: game.getLowestDisplayTimeMs(),
      duration: 0,
    };
  }

  const sessionDurationMs = timerService.stopTimer();
  const result = game.stopGame();

  void saveScore(
    GAME_ID,
    {
      score: result.score,
      sessionDurationMs,
      lowestDisplayTime: result.lowestDisplayTime,
    },
    (previousRecord) => ({
      bestTriggerHits: Math.max(previousRecord.bestTriggerHits || 0, result.triggerHits),
    }),
  );

  showEndPanel(result);
  return result;
}

/**
 * Reset game UI state to pre-start view.
 */
function reset() {
  cancelTutorial();
  clearDealTimer();
  detachGlobalKeyListener();
  timerService.resetTimer();
  game.initGame();

  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  if (_feedbackEl) {
    _feedbackEl.textContent = 'React to pairs, sandwiches, and jokers.';
  }
  updateHintVisibility();

  renderDeckBack();
  updateStats();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
