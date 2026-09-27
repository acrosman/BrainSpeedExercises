/**
 * index.js - Field of View plugin entry point.
 *
 * Handles DOM wiring, high-precision timing flow, and plugin lifecycle.
 * Rendering utilities are in render.js, audio feedback comes from the shared
 * components/audioService.js, and progress persistence is in progress.js.
 *
 * @file Field of View game plugin (UI/controller layer).
 */

import * as game from './game.js';
import * as render from './render.js';
import { playFeedbackSound } from '../../components/audioService.js';
import { GAME_ID, saveProgress } from './progress.js';
import * as timerService from '../../components/timerService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import {
  runGuidedTutorial,
  runGuidedTutorialIfNeeded,
} from '../../components/tutorialService.js';
import { getTutorialSteps, PRACTICE_TEXT } from './tutorial/tutorial.js';

/** Mask display duration in ms. */
const MASK_DURATION_MS = 120;

/** Inter-trial delay in ms. */
const INTER_TRIAL_DELAY_MS = 350;

/** Flash overlay duration for correct/incorrect feedback. */
const FEEDBACK_FLASH_MS = 220;

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _instructionsEl = null;
/** @type {HTMLElement|null} */
let _gameAreaEl = null;
/** @type {HTMLElement|null} */
let _endPanelEl = null;
/** @type {HTMLElement|null} */
let _stageEl = null;
/** @type {HTMLElement|null} */
let _boardEl = null;
/** @type {HTMLElement|null} */
let _maskEl = null;
/** @type {HTMLElement|null} */
let _responseEl = null;
/** @type {HTMLElement|null} */
let _feedbackEl = null;
/** @type {HTMLElement|null} */
let _soaEl = null;
/** @type {HTMLElement|null} */
let _thresholdEl = null;
/** @type {HTMLElement|null} */
let _accuracyEl = null;
/** @type {HTMLElement|null} */
let _trialsEl = null;
/** @type {HTMLElement|null} */
let _finalThresholdEl = null;
/** @type {HTMLElement|null} */
let _finalAccuracyEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;
/** @type {HTMLElement|null} */
let _finalBestThresholdEl = null;
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
let _centerPrimaryBtn = null;
/** @type {HTMLButtonElement|null} */
let _centerSecondaryBtn = null;
/** @type {HTMLElement|null} */
let _locationSelectorEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;

/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _stimulusRafId = null;
/** @type {ReturnType<typeof requestAnimationFrame>|null} */
let _maskRafId = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _nextTrialTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _flashTimer = null;

/**
 * @type {{
 *   gridSize: number,
 *   centerIndex: number,
 *   centerIcon: { id: string, file: string, width: number, height: number },
 *   peripheralIndex: number,
 *   peripheralIcon: { id: string, file: string, width: number, height: number },
 *   cells: Array<{
 *     index: number,
 *     role: string,
 *     icon: { id: string, file: string, width: number, height: number }|null
 *   }>,
 * }|null}
 */
let _currentTrial = null;

/** @type {string|null} */
let _selectedCenterId = null;
/** @type {number|null} */
let _selectedPeripheralIndex = null;
/** @type {boolean} */
let _responseEnabled = false;
/** @type {number} */
let _responseStartMs = 0;

/** Whether a tutorial launch call is currently in flight. @type {boolean} */
let _isTutorialLaunchPending = false;
/**
 * The guided tutorial in progress, if any.
 * @type {import('../../components/tutorialService.js').GuidedTutorialRun|null}
 */
let _tutorialRun = null;
/**
 * The tutorial practice trial in progress, if any. `guideTarget` is the control the marker
 * currently rings in a guided trial.
 * @type {{ context: object, resolve: Function, guideTarget: HTMLElement|null }|null}
 */
let _practice = null;

/**
 * Get a high-precision current timestamp.
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
 * Announce status text in the UI feedback region.
 *
 * @param {string} message
 */
function announce(message) {
  render.announce(_feedbackEl, message);
}

/**
 * Update game stats in the status bar.
 */
function updateStats() {
  const history = game.getThresholdHistory();
  const thresholdMs = history.length > 0
    ? Math.min(...history.map((entry) => entry.thresholdMs))
    : game.getCurrentSoaMs();

  render.updateStats(
    {
      soaEl: _soaEl,
      thresholdEl: _thresholdEl,
      accuracyEl: _accuracyEl,
      trialsEl: _trialsEl,
    },
    {
      soaMs: game.getCurrentSoaMs(),
      thresholdMs,
      accuracy: game.getRecentAccuracy(),
      trialsCompleted: game.getTrialsCompleted(),
    },
  );
}

/**
 * Render the threshold history chart and summary values.
 */
function updateThresholdTrend() {
  render.renderThresholdTrend(
    {
      trendLineEl: _trendLineEl,
      trendEmptyEl: _trendEmptyEl,
      trendLatestEl: _trendLatestEl,
      finalBestThresholdEl: _finalBestThresholdEl,
    },
    game.getThresholdHistory(),
    game.getCurrentSoaMs(),
  );
}

/**
 * Cancel and clear any pending async handles.
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
 * Remove the green/red feedback tint from the stage.
 */
function clearStageFlash() {
  if (_stageEl) _stageEl.classList.remove('fov-stage--flash-correct', 'fov-stage--flash-wrong');
}

/**
 * Flash green/red tint over stage for trial feedback.
 *
 * @param {boolean} isSuccess
 */
function flashStageFeedback(isSuccess) {
  if (!_stageEl) return;

  clearStageFlash();
  _stageEl.classList.add(isSuccess ? 'fov-stage--flash-correct' : 'fov-stage--flash-wrong');

  if (_flashTimer !== null) {
    clearTimeout(_flashTimer);
  }

  _flashTimer = setTimeout(() => {
    clearStageFlash();
    _flashTimer = null;
  }, FEEDBACK_FLASH_MS);
}

/**
 * Render the current trial board.
 *
 * @param {boolean} revealStimulus
 */
function renderBoard(revealStimulus) {
  if (!_boardEl || !_currentTrial) return;

  _boardEl.innerHTML = '';
  _boardEl.style.gridTemplateColumns = `repeat(${_currentTrial.gridSize}, 1fr)`;
  _boardEl.style.gridTemplateRows = `repeat(${_currentTrial.gridSize}, 1fr)`;

  _currentTrial.cells.forEach((cell) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fov-cell';
    btn.dataset.index = String(cell.index);

    const { row, col } = render.cellPosition(cell.index, _currentTrial.gridSize);
    btn.setAttribute('aria-label', `Row ${row}, column ${col}`);

    if (cell.role === 'center') {
      btn.classList.add('fov-cell--center');
      btn.disabled = true;
    }

    if (!revealStimulus) {
      btn.classList.add('fov-cell--hidden');
      btn.textContent = ' '; // keeps the cell geometry stable
    } else if (cell.icon) {
      btn.appendChild(render.createStimulusImage(cell.icon));
    } else {
      btn.textContent = ' ';
    }

    _boardEl.appendChild(btn);
  });
}

/**
 * Set selected center icon response.
 *
 * The peripheral cell click handler in renderBoard carries an equivalent
 * _responseEnabled guard. Both ignore input outside the response phase.
 *
 * @param {'primary-kitten'|'secondary-kitten'} id
 */
function chooseCenter(id) {
  if (!_responseEnabled) return;
  _selectedCenterId = id;

  if (_centerPrimaryBtn) {
    _centerPrimaryBtn.setAttribute('aria-pressed', String(id === 'primary-kitten'));
  }
  if (_centerSecondaryBtn) {
    _centerSecondaryBtn.setAttribute('aria-pressed', String(id === 'secondary-kitten'));
  }

  attemptAutoSubmit();
}

/**
 * Auto-submit once both responses are selected.
 */
function attemptAutoSubmit() {
  const canSubmit = _responseEnabled
    && _selectedCenterId !== null
    && _selectedPeripheralIndex !== null;
  if (canSubmit) {
    submitResponse();
  } else if (_practice && _practice.context.guided) {
    guidePracticeResponse();
  }
}

/**
 * Reset response controls before each trial.
 */
function resetResponseSelection() {
  _selectedCenterId = null;
  _selectedPeripheralIndex = null;

  if (_centerPrimaryBtn) _centerPrimaryBtn.setAttribute('aria-pressed', 'false');
  if (_centerSecondaryBtn) _centerSecondaryBtn.setAttribute('aria-pressed', 'false');

  render.updateLocationSelectionVisual(_locationSelectorEl, null);
}

/**
 * Enter response phase after stimulus and mask complete.
 */
function enterResponsePhase() {
  _responseEnabled = true;
  _responseStartMs = nowMs();

  render.setStageMode(_stageEl, 'response');

  render.setMaskVisible(_maskEl, true);
  if (_boardEl) _boardEl.hidden = false;

  renderBoard(false);

  if (_locationSelectorEl && _currentTrial) {
    _locationSelectorEl.hidden = false;
    render.renderLocationGrid(
      _locationSelectorEl,
      _currentTrial.gridSize,
      _currentTrial.centerIndex,
      (index) => {
        if (!_responseEnabled) return;
        _selectedPeripheralIndex = index;
        render.updateLocationSelectionVisual(_locationSelectorEl, index);
        attemptAutoSubmit();
      },
    );
  }

  resetResponseSelection();
  if (_practice) promptPracticeResponse();
}

/**
 * Start mask phase for a fixed duration using requestAnimationFrame timing.
 */
function runMaskPhase() {
  render.setStageMode(_stageEl, 'mask');

  render.setMaskVisible(_maskEl, true);
  if (_boardEl) _boardEl.hidden = true;

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
 * Show stimulus board for SOA duration using requestAnimationFrame timing.
 *
 * @param {number} targetSoa - How long to show the stimulus, in ms.
 */
function runStimulusPhase(targetSoa) {
  _responseEnabled = false;

  render.setStageMode(_stageEl, 'stimulus');

  if (_boardEl) _boardEl.hidden = false;
  render.setMaskVisible(_maskEl, false);

  renderBoard(true);

  const start = nowMs();

  const tick = () => {
    const elapsed = nowMs() - start;
    if (elapsed >= targetSoa) {
      _stimulusRafId = null;
      runMaskPhase();
      return;
    }
    _stimulusRafId = requestAnimationFrame(tick);
  };

  _stimulusRafId = requestAnimationFrame(tick);
}

/**
 * Start one trial, including layout generation and timed phases.
 */
function startTrial() {
  if (!game.isRunning()) return;
  _currentTrial = game.createTrialLayout();
  updateStats();
  runStimulusPhase(game.getCurrentSoaMs());
}

/**
 * Process trial response and apply adaptive staircase update.
 */
function submitResponse() {
  if (!_responseEnabled || !_currentTrial) return;

  const centerCorrect = _selectedCenterId === _currentTrial.centerIcon.id;
  const peripheralCorrect = _selectedPeripheralIndex === _currentTrial.peripheralIndex;
  const success = centerCorrect && peripheralCorrect;

  _responseEnabled = false;
  playFeedbackSound(success);
  flashStageFeedback(success);

  if (_practice) {
    finishPracticeTrial(success);
    return;
  }

  const reactionTimeMs = nowMs() - _responseStartMs;
  const trialUpdate = game.recordTrial({ success, reactionTimeMs });

  updateStats();
  updateThresholdTrend();

  if (success) {
    announce('Correct. SOA may decrease after the success streak target is met.');
  } else {
    announce('Incorrect. Three mistakes in a row will make the timing easier.');
  }

  if (_feedbackEl) {
    _feedbackEl.textContent = `${_feedbackEl.textContent} `
      + `(accuracy ${render.percent(trialUpdate.recentAccuracy)})`;
  }

  if (game.isRunning()) {
    _nextTrialTimer = setTimeout(() => {
      _nextTrialTimer = null;
      startTrial();
    }, INTER_TRIAL_DELAY_MS);
  }
}

/**
 * Show the game area, with no leftover feedback, in place of the welcome and end panels.
 */
function showGameArea() {
  if (_instructionsEl) _instructionsEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_gameAreaEl) _gameAreaEl.hidden = false;
  if (_responseEl) _responseEl.hidden = false;
  announce('');
}

/**
 * The current trial's answers, in the words the practice text uses.
 *
 * @returns {{ kitten: string, row: number, col: number }}
 */
function describeCorrectAnswer() {
  const { centerIcon, peripheralIndex, gridSize } = _currentTrial;
  return {
    kitten: render.labelForIcon(centerIcon).toLowerCase(),
    ...render.cellPosition(peripheralIndex, gridSize),
  };
}

/**
 * In a guided practice trial, ring the next control to use: the correct kitten until one is
 * chosen, then the correct location square. The coach text only changes with the target, so
 * repeated picks do not repeat the announcement.
 */
function guidePracticeResponse() {
  const kittenPending = _selectedCenterId === null;
  const { centerIcon, peripheralIndex } = _currentTrial;
  const target = kittenPending
    ? (centerIcon.id === 'primary-kitten' ? _centerPrimaryBtn : _centerSecondaryBtn)
    : _locationSelectorEl.querySelector(`[data-index="${peripheralIndex}"]`);
  if (target === _practice.guideTarget) return;
  _practice.guideTarget = target;

  const { context } = _practice;
  const { kitten, row, col } = describeCorrectAnswer();
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
function promptPracticeResponse() {
  if (_practice.context.guided) {
    guidePracticeResponse();
  } else {
    _practice.context.setInstructions(PRACTICE_TEXT.answer);
  }
}

/**
 * End a practice trial once the player answers: say whether it was right without scoring
 * it, and hand control back to the tutorial.
 *
 * @param {boolean} success - Whether both answers were right.
 */
function finishPracticeTrial(success) {
  const { context, resolve } = _practice;
  _practice = null;
  context.hideMarker();
  announce(PRACTICE_TEXT.result({ success, ...describeCorrectAnswer() }));
  resolve();
}

/**
 * Drop any practice trial and cancel its animation frames and timers. Runs when the
 * tutorial's practice signal aborts, which happens whenever the tutorial ends. The trial's
 * promise is left pending: the tutorial no longer waits on it.
 */
function endPractice() {
  clearAsyncHandles();
  _responseEnabled = false;
  _currentTrial = null;
  _practice = null;
}

/**
 * Play one tutorial practice trial at the starting difficulty. It uses the real stimulus,
 * mask, and response controls but never touches the SOA, accuracy, threshold history,
 * session timer, or saved progress. In a guided trial the correct kitten, then the correct
 * square, is marked once the field appears.
 *
 * @param {import('../../components/tutorialService.js').PracticeRoundContext} context
 * @returns {Promise<void>} Resolves once the player answers.
 */
function playPracticeTrial(context) {
  showGameArea();
  // Adding the same listener again in round 2 is a no-op, so this never stacks up.
  context.signal.addEventListener('abort', endPractice, { once: true });

  return new Promise((resolve) => {
    _practice = { context, resolve, guideTarget: null };
    context.setInstructions(PRACTICE_TEXT.watch);

    const { layout, soaMs } = game.createPracticeTrial();
    _currentTrial = layout;
    runStimulusPhase(soaMs);
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

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  showGameArea();
  startTrial();
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
 * Build an idle result object when stop is requested out of sequence.
 *
 * @returns {{
 *   score: number,
 *   thresholdMs: number,
 *   trialsCompleted: number,
 *   recentAccuracy: number,
 *   duration: number,
 * }}
 */
function buildIdleResult() {
  return {
    score: game.getCurrentSoaMs(),
    thresholdMs: game.getCurrentSoaMs(),
    trialsCompleted: game.getTrialsCompleted(),
    recentAccuracy: game.getRecentAccuracy(),
    duration: 0,
  };
}

/** Human-readable plugin name. */
const name = 'Field of View';

/**
 * Initialize plugin with injected game container.
 *
 * @param {HTMLElement|null} gameContainer
 */
function init(gameContainer) {
  _container = gameContainer;
  game.initGame();

  if (!_container) return;

  _instructionsEl = _container.querySelector('#fov-instructions');
  _gameAreaEl = _container.querySelector('#fov-game-area');
  _endPanelEl = _container.querySelector('#fov-end-panel');
  _stageEl = _container.querySelector('#fov-stage');
  _boardEl = _container.querySelector('#fov-board');
  _maskEl = _container.querySelector('#fov-mask');
  _responseEl = _container.querySelector('#fov-response');
  _feedbackEl = _container.querySelector('#fov-feedback');
  _soaEl = _container.querySelector('#fov-soa');
  _thresholdEl = _container.querySelector('#fov-threshold');
  _accuracyEl = _container.querySelector('#fov-accuracy');
  _trialsEl = _container.querySelector('#fov-trials');
  _finalThresholdEl = _container.querySelector('#fov-final-threshold');
  _finalAccuracyEl = _container.querySelector('#fov-final-accuracy');
  _trendLineEl = _container.querySelector('#fov-trend-line');
  _trendEmptyEl = _container.querySelector('#fov-trend-empty');
  _trendLatestEl = _container.querySelector('#fov-trend-latest');
  _finalBestThresholdEl = _container.querySelector('#fov-final-best-threshold');
  _startBtn = _container.querySelector('#fov-start-btn');
  _replayTutorialBtn = _container.querySelector('#fov-replay-tutorial-btn');
  _stopBtn = _container.querySelector('#fov-stop-btn');
  _playAgainBtn = _container.querySelector('#fov-play-again-btn');
  _returnBtn = _container.querySelector('#fov-return-btn');
  _centerPrimaryBtn = _container.querySelector('#fov-center-primary');
  _centerSecondaryBtn = _container.querySelector('#fov-center-secondary');
  _locationSelectorEl = _container.querySelector('#fov-location-selector');
  _sessionTimerEl = _container.querySelector('#fov-session-timer');

  if (_startBtn) _startBtn.addEventListener('click', () => { void start(); });
  // Replay always shows the tutorial, then starts a session.
  if (_replayTutorialBtn) {
    _replayTutorialBtn.addEventListener('click', () => {
      void launchTutorial(runGuidedTutorial);
    });
  }
  if (_stopBtn) _stopBtn.addEventListener('click', () => stop());
  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
      void start();
    });
  }
  if (_returnBtn) _returnBtn.addEventListener('click', () => returnToMainMenu());
  if (_centerPrimaryBtn) {
    _centerPrimaryBtn.addEventListener('click', () => chooseCenter('primary-kitten'));
  }
  if (_centerSecondaryBtn) {
    _centerSecondaryBtn.addEventListener('click', () => chooseCenter('secondary-kitten'));
  }

  updateStats();
  updateThresholdTrend();
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
 * Stop gameplay, save progress, and show the end panel.
 *
 * With no session running (on the welcome screen, during the tutorial, or when the app
 * quits after a session ended) there is nothing to save and the screen is left alone,
 * except that leaving a tutorial this way cancels it and returns to the welcome screen.
 *
 * @returns {{
 *   score: number,
 *   thresholdMs: number,
 *   trialsCompleted: number,
 *   recentAccuracy: number,
 *   duration: number,
 * }}
 */
function stop() {
  clearAsyncHandles();

  if (!game.isRunning()) {
    if (isTutorialActive()) reset();
    return buildIdleResult();
  }

  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = false;

  if (_finalThresholdEl) _finalThresholdEl.textContent = String(result.thresholdMs);
  if (_finalAccuracyEl) _finalAccuracyEl.textContent = render.percent(result.recentAccuracy);

  updateThresholdTrend();

  if (result.trialsCompleted > 0) {
    saveProgress(result, sessionDurationMs);
  }

  return result;
}

/**
 * Reset to pre-game state without leaving the game plugin.
 */
function reset() {
  cancelTutorial();
  clearAsyncHandles();
  game.initGame();

  timerService.resetTimer();
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  _currentTrial = null;
  _responseEnabled = false;
  _selectedCenterId = null;
  _selectedPeripheralIndex = null;

  if (_boardEl) _boardEl.innerHTML = '';
  render.setStageMode(_stageEl, 'stimulus');
  render.setMaskVisible(_maskEl, false);
  if (_locationSelectorEl) {
    _locationSelectorEl.hidden = true;
    _locationSelectorEl.innerHTML = '';
  }
  if (_responseEl) _responseEl.hidden = true;
  if (_feedbackEl) _feedbackEl.textContent = '';
  if (_instructionsEl) _instructionsEl.hidden = false;
  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;

  updateStats();
  updateThresholdTrend();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
