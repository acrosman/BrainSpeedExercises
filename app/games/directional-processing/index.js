/**
 * index.js — Directional Processing game plugin entry point.
 *
 * Handles DOM wiring, the stimulus/mask/response trial cycle, arrow-key
 * interception, feedback, and plugin lifecycle (init / start / stop / reset).
 *
 * Rendering of Gabor patches and the visual mask is delegated to gabor.js.
 * Core game logic (staircase, scoring) lives in game.js.
 *
 * @file Directional Processing game plugin (UI/controller layer).
 */

import * as game from './game.js';
import {
  drawGabor, drawMask, getDirectionParams, pickColorFamily, PHASE_SPEED_RAD_PER_MS,
} from './gabor.js';
import { playFeedbackSound } from '../../components/audioService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { saveScore } from '../../components/scoreService.js';
import * as timerService from '../../components/timerService.js';
import { renderTrendChart } from '../../components/trendChartService.js';
import {
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} from '../../components/tutorialService.js';
import { getTutorialSteps, PRACTICE_TEXT } from './tutorial/tutorial.js';

/** Game identifier used for progress persistence (must match manifest.json id). */
const GAME_ID = 'directional-processing';

// ── Timing constants ──────────────────────────────────────────────────────────

/** Duration (ms) the visual mask is displayed between stimulus and response. */
const MASK_DURATION_MS = 150;

/** Duration (ms) the color-family background is held after a flash before the next trial. */
const POST_FLASH_PAUSE_MS = 100;

/** Duration (ms) of the green/red flash overlay on the canvas stage. */
const FEEDBACK_FLASH_MS = 250;

// ── DOM element references (populated by init) ────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLCanvasElement|null} */
let _canvasEl = null;
/** @type {HTMLElement|null} */
let _stageEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLElement|null} */
let _levelEl = null;
/** @type {HTMLElement|null} */
let _scoreEl = null;
/** @type {HTMLElement|null} */
let _trialsEl = null;
/** @type {HTMLElement|null} */
let _streakEl = null;
/** @type {HTMLElement|null} */
let _sessionTimerEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;
/** @type {HTMLElement|null} */
let _finalLevelEl = null;
/** @type {HTMLElement|null} */
let _finalScoreEl = null;
/** @type {HTMLElement|null} */
let _finalTrialsEl = null;
/** @type {HTMLButtonElement|null} */
let _upBtn = null;
/** @type {HTMLButtonElement|null} */
let _downBtn = null;
/** @type {HTMLButtonElement|null} */
let _leftBtn = null;
/** @type {HTMLButtonElement|null} */
let _rightBtn = null;
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

// ── Per-trial state ───────────────────────────────────────────────────────────

/** Direction chosen for the current trial. @type {string|null} */
let _currentDirection = null;

/** Whether the player can currently submit a direction response. */
let _responseEnabled = false;

/**
 * Active color family for Gabor patch rendering. Changes on each level change.
 * @type {object|null}
 */
let _colorFamily = null;

// ── Async handle references ───────────────────────────────────────────────────

/** rAF handle for the stimulus animation loop. @type {number|null} */
let _stimulusRafId = null;

/** rAF handle for the mask phase. @type {number|null} */
let _maskRafId = null;

/** setTimeout handle for the inter-trial pause. @type {number|null} */
let _nextTrialTimer = null;

/** setTimeout handle for clearing the flash feedback class. @type {number|null} */
let _flashTimer = null;

/** Whether a tutorial launch call is currently in flight. @type {boolean} */
let _isTutorialLaunchPending = false;

/**
 * The guided tutorial in progress, if any.
 * @type {import('../../components/tutorialService.js').GuidedTutorialRun|null}
 */
let _tutorialRun = null;

/**
 * The tutorial practice trial in progress, if any.
 * @type {{ context: object, resolve: Function }|null}
 */
let _practice = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enable or disable all four direction buttons.
 *
 * Buttons are disabled during the stimulus and mask phases so the player
 * cannot submit a response prematurely, and re-enabled once the response
 * phase begins. Using disabled (rather than hidden) keeps the controls
 * visible throughout the game so the layout never shifts.
 *
 * @param {boolean} enabled
 */
function setDirectionButtonsEnabled(enabled) {
  [_upBtn, _downBtn, _leftBtn, _rightBtn].forEach((btn) => {
    if (btn) btn.disabled = !enabled;
  });
}

/**
 * Get the response button for a direction.
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 * @returns {HTMLButtonElement|null}
 */
function getDirectionButton(direction) {
  const map = { up: _upBtn, down: _downBtn, left: _leftBtn, right: _rightBtn };
  return map[direction] || null;
}

/**
 * Highlight the button that represents the correct answer.
 * Called after a wrong response so the player can see what they missed.
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 */
function highlightCorrectButton(direction) {
  const btn = getDirectionButton(direction);
  if (btn) btn.classList.add('dp-dir-btn--correct');
}

/**
 * Remove the correct-answer highlight from all direction buttons.
 * Called at the start of each new trial.
 */
function clearDirectionHighlights() {
  [_upBtn, _downBtn, _leftBtn, _rightBtn].forEach((btn) => {
    if (btn) btn.classList.remove('dp-dir-btn--correct');
  });
}

/**
 * Get a high-precision timestamp, falling back to Date.now when unavailable.
 *
 * @returns {number}
 */
function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Post a status message to the live-feedback region.
 *
 * @param {string} message
 */
export function announce(message) {
  if (_feedbackEl) {
    _feedbackEl.textContent = message;
  }
}

/**
 * Refresh the stats bar with current game state values.
 */
export function updateStats() {
  const lvl = game.getCurrentLevel();
  const streak = game.getConsecutiveCorrect();

  if (_levelEl) _levelEl.textContent = String(lvl + 1);
  if (_scoreEl) _scoreEl.textContent = String(game.getScore());
  if (_trialsEl) _trialsEl.textContent = String(game.getTrialsCompleted());
  if (_streakEl) _streakEl.textContent = String(streak);
}

/**
 * Render the speed trend chart with the latest display-duration history.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getCurrentLevelConfig().displayDurationMs,
  );
}

/**
 * Remove the correct/incorrect flash from the stage.
 */
function clearStageFlash() {
  if (_stageEl) {
    _stageEl.classList.remove('dp-stage--flash-correct', 'dp-stage--flash-wrong');
  }
}

/**
 * Apply a brief colored flash to the stage to indicate correct/incorrect,
 * then invoke an optional callback once the flash has cleared.
 *
 * @param {boolean} isSuccess
 * @param {(() => void) | null} [onComplete] - Called after the flash clears.
 */
function flashStageFeedback(isSuccess, onComplete = null) {
  if (!_stageEl) {
    if (onComplete) onComplete();
    return;
  }

  clearStageFlash();
  _stageEl.classList.add(
    isSuccess ? 'dp-stage--flash-correct' : 'dp-stage--flash-wrong',
  );

  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
  }

  _flashTimer = setTimeout(() => {
    clearStageFlash();
    _flashTimer = null;
    if (onComplete) onComplete();
  }, FEEDBACK_FLASH_MS);
}

/**
 * Cancel and clear all outstanding RAF handles and timeouts. A flash cut short is removed,
 * so it cannot stay on the stage.
 */
function clearAsyncHandles() {
  if (_stimulusRafId !== null) {
    cancelAnimationFrame(_stimulusRafId);
    _stimulusRafId = null;
  }
  if (_maskRafId !== null) {
    cancelAnimationFrame(_maskRafId);
    _maskRafId = null;
  }
  if (_nextTrialTimer !== null) {
    clearTimeout(_nextTrialTimer);
    _nextTrialTimer = null;
  }
  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
    _flashTimer = null;
    clearStageFlash();
  }
}

/**
 * Enable the direction buttons and focus the first one so keyboard users
 * are ready to respond. The response panel is always visible; only the
 * interactive state of the buttons changes.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  setDirectionButtonsEnabled(true);
  // Move focus to the Up button so keyboard users are ready to respond.
  if (_upBtn) {
    _upBtn.focus();
  }
}

/**
 * Display the mask (uniform gray) for MASK_DURATION_MS using rAF timing,
 * then transition to the response phase.
 */
function runMaskPhase() {
  if (_canvasEl) drawMask(_canvasEl, _colorFamily);

  const start = nowMs();

  const tick = () => {
    const elapsed = nowMs() - start;
    if (elapsed >= MASK_DURATION_MS) {
      _maskRafId = null;
      enterResponsePhase();
      return;
    }
    _maskRafId = requestAnimationFrame(tick);
  };

  _maskRafId = requestAnimationFrame(tick);
}

/**
 * Animate the Gabor stimulus for the current level's display duration using
 * rAF timing, then transition to the mask phase.
 *
 * @param {string} direction - Motion direction ('up'|'down'|'left'|'right').
 * @param {number} contrast - Gabor contrast multiplier (0..1).
 * @param {number} displayDurationMs - Duration to show the stimulus.
 * @param {() => void} [onStimulusEnd] - Called when the stimulus ends and the mask begins.
 */
function runStimulusPhase(direction, contrast, displayDurationMs, onStimulusEnd = () => {}) {
  _responseEnabled = false;
  setDirectionButtonsEnabled(false);
  if (_feedbackEl) _feedbackEl.textContent = '';

  const { theta, phiDirection } = getDirectionParams(direction);
  const start = nowMs();

  const tick = () => {
    const elapsed = nowMs() - start;

    if (elapsed >= displayDurationMs) {
      _stimulusRafId = null;
      runMaskPhase();
      onStimulusEnd();
      return;
    }

    // Advance the grating phase to create the apparent motion effect.
    const phi = phiDirection * PHASE_SPEED_RAD_PER_MS * elapsed;
    if (_canvasEl) {
      drawGabor(_canvasEl, { theta, phi, contrast, colorFamily: _colorFamily });
    }

    _stimulusRafId = requestAnimationFrame(tick);
  };

  _stimulusRafId = requestAnimationFrame(tick);
}

/**
 * Begin a new trial: clear any previous answer highlight, pick a direction,
 * update stats, and start the stimulus animation.
 */
function startTrial() {
  if (!game.isRunning()) return;

  clearDirectionHighlights();
  _currentDirection = game.pickDirection();
  const { displayDurationMs, contrast } = game.getCurrentLevelConfig();

  updateStats();
  runStimulusPhase(_currentDirection, contrast, displayDurationMs);
}

/**
 * Play the feedback sound and announce the result. After a miss, highlight the correct
 * button so the player can see what they missed. Changes no game state.
 *
 * @param {boolean} success - Whether the response was correct.
 */
function showResponseFeedback(success) {
  playFeedbackSound(success);

  if (success) {
    announce('Correct!');
  } else {
    highlightCorrectButton(_currentDirection);
    announce(`Incorrect — direction was ${_currentDirection}.`);
  }
}

/**
 * End a practice trial once the player responds: show the result without scoring it, and
 * hand control back to the tutorial.
 *
 * @param {boolean} success - Whether the response was correct.
 */
function finishPracticeTrial(success) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  showResponseFeedback(success);
  flashStageFeedback(success);
  resolve();
}

/**
 * Handle a direction response (from button click or keyboard).
 *
 * @param {string} direction - One of 'up', 'down', 'left', 'right'.
 */
export function handleDirectionResponse(direction) {
  if (!_responseEnabled) return;

  _responseEnabled = false;
  setDirectionButtonsEnabled(false);

  const success = direction === _currentDirection;
  if (_practice) {
    finishPracticeTrial(success);
    return;
  }

  game.recordTrial({ success });

  updateStats();
  updateTrendChart();
  showResponseFeedback(success);

  // After the flash: switch to a new color family, show its background, then
  // wait POST_FLASH_PAUSE_MS before starting the next trial.
  flashStageFeedback(success, () => {
    _colorFamily = pickColorFamily();
    if (_canvasEl) drawMask(_canvasEl, _colorFamily);
    if (game.isRunning()) {
      _nextTrialTimer = setTimeout(() => {
        _nextTrialTimer = null;
        startTrial();
      }, POST_FLASH_PAUSE_MS);
    }
  });
}

/**
 * Keyboard handler for arrow key input.
 *
 * Arrow key default behavior (page scrolling) is blocked while the game is
 * running, or a practice trial is in progress, so that keyboard responses do not
 * also move the scroll position.
 *
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  /** @type {Record<string, string>} */
  const directionMap = {
    ArrowUp:    'up',
    ArrowDown:  'down',
    ArrowLeft:  'left',
    ArrowRight: 'right',
  };

  const direction = directionMap[event.key];
  if (!direction) return;

  // Block default scrolling during game play and practice.
  if (game.isRunning() || _practice) {
    event.preventDefault();
  }

  if (_responseEnabled) {
    handleDirectionResponse(direction);
  }
}

/**
 * Populate the end panel with session results.
 *
 * @param {{ score: number, level: number, trialsCompleted: number }} result
 */
function showEndPanel(result) {
  if (_finalLevelEl) _finalLevelEl.textContent = String(result.level + 1);
  if (_finalScoreEl) _finalScoreEl.textContent = String(result.score);
  if (_finalTrialsEl) _finalTrialsEl.textContent = String(result.trialsCompleted);
  if (_endPanelEl) _endPanelEl.hidden = false;
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
 * Drop any practice trial and cancel its animation and timers. Runs when the tutorial's
 * practice signal aborts, which happens whenever the tutorial ends. The trial's promise is
 * left pending: the tutorial no longer waits on it.
 */
function endPractice() {
  clearAsyncHandles();
  _responseEnabled = false;
  setDirectionButtonsEnabled(false);
  _currentDirection = null;
  _practice = null;
}

/**
 * Play one tutorial practice trial at the easiest level. It uses the real stimulus, mask,
 * and response buttons but never touches the score, level, speed history, session timer,
 * or saved progress. In a guided trial the correct button is scrolled into view and marked
 * once the stimulus ends.
 *
 * @param {import('../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player responds.
 */
function playPracticeTrial(context) {
  showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  return new Promise((resolve) => {
    _practice = { context, resolve };
    context.setInstructions(PRACTICE_TEXT.watch);

    const { direction, contrast, displayDurationMs } = game.generatePracticeTrial();
    clearDirectionHighlights();
    _currentDirection = direction;
    _colorFamily = pickColorFamily();

    runStimulusPhase(direction, contrast, displayDurationMs, () => {
      if (!context.guided) {
        context.setInstructions(PRACTICE_TEXT.answer);
        return;
      }
      const target = getDirectionButton(direction);
      // On shorter windows the direction pad sits below the fold. The coach is sticky, so
      // scrolling keeps it in view, and the marker follows the scroll.
      target.scrollIntoView({ block: 'nearest' });
      context.showMarker({ anchor: target, shape: 'box' });
      context.setInstructions(PRACTICE_TEXT.guidedAnswer(direction));
    });
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
 * any practice trial.
 */
function cancelTutorial() {
  if (_tutorialRun) _tutorialRun.cancel();
  _tutorialRun = null;
}

/**
 * Start a gameplay session immediately without tutorial gating.
 */
function beginGameSession() {
  game.startGame();
  _colorFamily = pickColorFamily();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  showGameArea();
  if (_feedbackEl) _feedbackEl.textContent = '';

  clearDirectionHighlights();
  setDirectionButtonsEnabled(false);

  startTrial();
}

// ── Plugin contract ───────────────────────────────────────────────────────────

/** Human-readable plugin name. */
const name = 'Directional Processing';

/**
 * Initialize the plugin after interface.html has been injected.
 *
 * Queries all required DOM elements, attaches event listeners, and resets
 * game state. Does NOT start the game loop or timers.
 *
 * @param {HTMLElement|null} gameContainer - The element containing the game HTML.
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl = _container.querySelector('#dp-instructions');
  _gameAreaEl     = _container.querySelector('#dp-game-area');
  _endPanelEl     = _container.querySelector('#dp-end-panel');
  _canvasEl       = _container.querySelector('#dp-canvas');
  _stageEl        = _container.querySelector('#dp-stage');
  _feedbackEl     = _container.querySelector('#dp-feedback');
  _levelEl        = _container.querySelector('#dp-level');
  _scoreEl        = _container.querySelector('#dp-score');
  _trialsEl       = _container.querySelector('#dp-trials');
  _streakEl       = _container.querySelector('#dp-streak');
  _sessionTimerEl = _container.querySelector('#dp-session-timer');
  _trendLineEl    = _container.querySelector('#dp-trend-line');
  _trendEmptyEl   = _container.querySelector('#dp-trend-empty');
  _trendLatestEl  = _container.querySelector('#dp-trend-latest');
  _finalLevelEl   = _container.querySelector('#dp-final-level');
  _finalScoreEl   = _container.querySelector('#dp-final-score');
  _finalTrialsEl  = _container.querySelector('#dp-final-trials');
  _upBtn          = _container.querySelector('#dp-btn-up');
  _downBtn        = _container.querySelector('#dp-btn-down');
  _leftBtn        = _container.querySelector('#dp-btn-left');
  _rightBtn       = _container.querySelector('#dp-btn-right');
  _startBtn       = _container.querySelector('#dp-start-btn');
  _replayTutorialBtn = _container.querySelector('#dp-replay-tutorial-btn');
  _stopBtn        = _container.querySelector('#dp-stop-btn');
  _playAgainBtn   = _container.querySelector('#dp-play-again-btn');
  _returnBtn      = _container.querySelector('#dp-return-btn');

  if (_startBtn) _startBtn.addEventListener('click', () => { void start(); });
  // Replay always shows the tutorial, then starts a session.
  if (_replayTutorialBtn) {
    _replayTutorialBtn.addEventListener('click', () => {
      void launchTutorial(runGuidedTutorial);
    });
  }
  if (_stopBtn)  _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      void start();
    });
  }
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());

  if (_upBtn)    _upBtn.addEventListener('click', () => handleDirectionResponse('up'));
  if (_downBtn)  _downBtn.addEventListener('click', () => handleDirectionResponse('down'));
  if (_leftBtn)  _leftBtn.addEventListener('click', () => handleDirectionResponse('left'));
  if (_rightBtn) _rightBtn.addEventListener('click', () => handleDirectionResponse('right'));

  document.addEventListener('keydown', handleKeyDown);

  setDirectionButtonsEnabled(false);
  updateStats();
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
      playPracticeRound: playPracticeTrial,
      onComplete: beginGameSession,
    });
  } finally {
    _isTutorialLaunchPending = false;
  }
}

/**
 * Start a gameplay session, showing the tutorial first if the player has not seen it.
 *
 * @returns {Promise<void>}
 */
function start() {
  return launchTutorial(runGuidedTutorialIfNeeded);
}

/**
 * Stop the gameplay session, save progress, and show the end panel.
 *
 * With no session running (on the welcome screen, during the tutorial, or when the app
 * quits after a session ended) there is nothing to save and the screen is left alone,
 * except that leaving a tutorial this way cancels it and returns to the welcome screen.
 *
 * @returns {{ score: number, level: number, trialsCompleted: number, duration: number }}
 */
function stop() {
  clearAsyncHandles();
  _responseEnabled = false;
  setDirectionButtonsEnabled(false);
  clearDirectionHighlights();

  if (!game.isRunning()) {
    if (isTutorialActive()) reset();
    return {
      score: game.getScore(),
      level: game.getCurrentLevel(),
      trialsCompleted: game.getTrialsCompleted(),
      duration: 0,
    };
  }

  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  showEndPanel(result);

  if (result.trialsCompleted > 0) {
    saveScore(GAME_ID, {
      score: result.score,
      level: result.level,
      sessionDurationMs,
    }, {
      lastTrialsCompleted: result.trialsCompleted,
    });
  }

  return result;
}

/**
 * Reset to the pre-game instructions state without reloading interface.html.
 */
function reset() {
  cancelTutorial();
  clearAsyncHandles();
  game.initGame();
  timerService.resetTimer();

  _currentDirection = null;
  _responseEnabled = false;
  _colorFamily = null;

  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl)     _gameAreaEl.hidden = true;
  if (_endPanelEl)     _endPanelEl.hidden = true;

  clearDirectionHighlights();
  setDirectionButtonsEnabled(false);
  updateStats();
  updateTrendChart();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
