
/**
 * index.js — Otter Stop! game plugin entry point for BrainSpeedExercises.
 *
 * Handles all DOM manipulation, timing, and keyboard events for the
 * Otter Stop! go/no-go reaction game.
 *
 * @file Otter Stop! game plugin (UI/controller layer).
 */

import * as game from './game.js';
import { playSuccessSound, playFailureSound } from '../../components/audioService.js';
import * as timerService from '../../components/timerService.js';
import { saveScore } from '../../components/scoreService.js';
import { returnToMainMenu } from '../../components/gameUtils.js';
import { renderTrendChart } from '../../components/trendChartService.js';
import { setPracticeControls, tutorial } from './tutorial/tutorial.js';

/** Human-readable name returned as part of the plugin contract. */
const name = 'Otter Stop!';

/** Duration (ms) the feedback image/text is shown after a no-go trial. */
const FEEDBACK_DURATION_MS = 800;

/** Brief blank gap (ms) between the end of one trial and the start of the next. */
const ISI_MS = 120;

/** Base path for image assets relative to the game folder (used by the renderer). */
const IMAGE_BASE = './games/otter-stop/images/';

/** Path to the go-stimulus image subfolder. */
const IMAGE_BASE_GO = `${IMAGE_BASE}go/`;

// ── DOM references — populated by init() ─────────────────────────────────────

/** @type {HTMLElement|null} */
let _container = null;

/** @type {HTMLElement|null} */
let _instructionsEl = null;

/** @type {HTMLElement|null} */
let _gameAreaEl = null;

/** @type {HTMLElement|null} */
let _stimulusEl = null;

/** @type {HTMLImageElement|null} */
let _stimulusImg = null;

/** @type {HTMLElement|null} */
let _feedbackEl = null;

/** @type {HTMLImageElement|null} */
let _feedbackImg = null;

/** @type {HTMLElement|null} */
let _feedbackText = null;

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

/** @type {HTMLElement|null} */
let _levelEl = null;

/** @type {HTMLElement|null} */
let _scoreEl = null;

/** @type {HTMLElement|null} */
let _nogoHitsEl = null;

/** @type {HTMLElement|null} */
let _intervalEl = null;

/** @type {HTMLElement|null} */
let _sessionTimerEl = null;
/** @type {SVGPolylineElement|null} */
let _trendLineEl = null;
/** @type {HTMLElement|null} */
let _trendEmptyEl = null;
/** @type {HTMLElement|null} */
let _trendLatestEl = null;

/** @type {HTMLElement|null} */
let _avgResponseEl = null;

/** @type {HTMLElement|null} */
let _finalScoreEl = null;

/** @type {HTMLElement|null} */
let _finalBestEl = null;

/** @type {HTMLElement|null} */
let _finalNogoEl = null;

/** @type {HTMLElement|null} */
let _finalMissesEl = null;

/** @type {HTMLElement|null} */
let _finalTrialsEl = null;

// ── Trial state ───────────────────────────────────────────────────────────────

/**
 * One stimulus to show.
 *
 * @typedef {object} Stimulus
 * @property {string} imageKey - A go filename (e.g. 'go-1.png') or the no-go key.
 * @property {boolean} isNoGo - Whether this is the no-go image.
 * @property {number|null} displayMs - How long it stays up with no press. `null` waits for
 *   a press.
 */

/**
 * A run of trials: where its stimuli come from and how each response is scored. A session
 * plays {@link SESSION_TRIALS}.
 *
 * @typedef {object} TrialRun
 * @property {() => (Stimulus|null)} next - The next stimulus, or `null` to end the run.
 * @property {(stimulus: Stimulus, pressed: boolean, responseMs: number) => ('correct'|'wrong')}
 *   record - Score a finished trial. `responseMs` is the time from the stimulus appearing to
 *   the end of the trial.
 */

/** The run being played, or null when none is. @type {TrialRun|null} */
let _run = null;

/** The stimulus on screen, or null between trials. @type {Stimulus|null} */
let _stimulus = null;

/** When the current stimulus appeared (`Date.now()`). */
let _stimulusShownAt = 0;

/**
 * The one pending timeout: the stimulus display window, the feedback period, or the gap
 * before the next trial. They run one after another, never together.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let _timer = null;

/** Whether handleKeyDown is currently attached to document. */
let _isGlobalKeyListenerAttached = false;

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch the list of go image filenames from the main process via IPC.
 * Calls {@link game.setGoKeys} with the discovered filenames so that
 * `pickNextImage()` uses the actual contents of images/go/ rather than
 * hardcoded defaults.
 *
 * Falls back silently to the built-in defaults when `window.api` is not
 * available (e.g. in a test environment) or when the IPC call rejects.
 *
 * @returns {Promise<void>}
 */
export async function loadGoImages() {
  if (typeof window === 'undefined' || !window.api) return;
  try {
    const files = await window.api.invoke('games:listImages', {
      gameId: game.GAME_ID,
      subfolder: 'go',
    });
    if (files && files.length > 0) {
      game.setGoKeys(files);
    }
  } catch {
    // Silently fall back to default GO_KEYS already set in game.js.
  }
}

/**
 * Update the live stats bar with the latest values from the game module.
 */
export function updateStats() {
  if (_levelEl) _levelEl.textContent = game.getLevel() + 1;
  if (_scoreEl) _scoreEl.textContent = game.getScore();
  if (_nogoHitsEl) _nogoHitsEl.textContent = game.getNoGoHits();
  if (_intervalEl) _intervalEl.textContent = game.getCurrentIntervalMs();
}

/**
 * Render the speed trend chart with the latest interval history.
 */
export function updateTrendChart() {
  renderTrendChart(
    { lineEl: _trendLineEl, emptyEl: _trendEmptyEl, latestEl: _trendLatestEl },
    game.getSpeedHistory(),
    game.getCurrentIntervalMs(),
  );
}

/**
 * Show the image for a given image key in the stimulus area.
 *
 * Go image keys are filenames (with extension) inside `images/go/`; the
 * no-go key `'no-go'` maps to `images/no-go.png` at the top level.
 *
 * @param {string} imageKey - A go filename (e.g. 'go-1.png') or 'no-go'.
 */
export function showImage(imageKey) {
  if (!_stimulusImg) return;
  const isNoGo = imageKey === game.NO_GO_KEY;
  _stimulusImg.src = isNoGo
    ? `${IMAGE_BASE}no-go.png`
    : `${IMAGE_BASE_GO}${imageKey}`;
  _stimulusImg.alt = isNoGo ? 'No-go fish' : 'Go otter';
  _stimulusImg.classList.remove('os-hidden');
}

/**
 * Hide the current image (blank inter-stimulus interval).
 */
export function hideImage() {
  if (!_stimulusImg) return;
  _stimulusImg.classList.add('os-hidden');
}

/**
 * Display the feedback panel after a trial that requires feedback.
 * Feedback is shown for all no-go trials and for go images the player missed.
 *
 * @param {'correct' | 'wrong'} outcome - Whether the response was correct.
 * @param {boolean} wasNoGo - Whether the stimulus was the no-go image.
 */
export function showFeedback(outcome, wasNoGo) {
  if (!_feedbackEl) return;

  const isCorrect = outcome === 'correct';
  const imgKey = isCorrect ? 'success' : 'failure';

  let label;
  if (isCorrect) {
    label = 'Great stop!';
  } else if (wasNoGo) {
    label = 'Oops — too fast!';
  } else {
    label = 'Too slow!';
  }

  const cssClass = isCorrect ? 'os-feedback__text--correct' : 'os-feedback__text--wrong';

  if (_feedbackImg) {
    _feedbackImg.src = `${IMAGE_BASE}${imgKey}.png`;
    _feedbackImg.alt = label;
  }
  if (_feedbackText) {
    _feedbackText.textContent = label;
    _feedbackText.className = `os-feedback__text ${cssClass}`;
  }

  _feedbackEl.hidden = false;

  if (isCorrect) {
    playSuccessSound();
  } else {
    playFailureSound();
  }
}

/**
 * Hide the feedback panel.
 */
export function hideFeedback() {
  if (_feedbackEl) _feedbackEl.hidden = true;
}

/**
 * Populate and display the end-of-game results panel.
 * @param {{ score: number, noGoHits: number, misses: number,
 *           trialsCompleted: number, bestScore: number }} result
 */
export function showEndPanel(result) {
  if (_finalScoreEl) _finalScoreEl.textContent = result.score;
  if (_finalBestEl) _finalBestEl.textContent = result.bestScore;
  if (_finalNogoEl) _finalNogoEl.textContent = result.noGoHits;
  if (_finalMissesEl) _finalMissesEl.textContent = result.misses;
  if (_finalTrialsEl) _finalTrialsEl.textContent = result.trialsCompleted;
  if (_endPanelEl) _endPanelEl.hidden = false;
}

/**
 * Show the average go response time. It is refreshed only after a no-go trial, so it
 * reflects the whole run of otters before the fish.
 */
function updateAverageResponse() {
  if (!_avgResponseEl) return;
  const avgMs = game.getAverageResponseMs();
  _avgResponseEl.textContent = avgMs !== null ? avgMs : '--';
}

// ── Trial loop ────────────────────────────────────────────────────────────────

/**
 * The run a session plays: the game picks each stimulus and scores each response.
 *
 * @type {TrialRun}
 */
const SESSION_TRIALS = Object.freeze({
  next: () => ({ ...game.pickNextImage(), displayMs: game.getCurrentIntervalMs() }),
  record(stimulus, pressed, responseMs) {
    if (pressed && !stimulus.isNoGo) game.recordGoResponseTime(responseMs);
    const outcome = game.recordResponse(stimulus.isNoGo, pressed);
    updateStats();
    updateTrendChart();
    if (stimulus.isNoGo) updateAverageResponse();
    return outcome;
  },
});

/** Cancel the pending timeout, if any. */
function clearTimer() {
  clearTimeout(_timer);
  _timer = null;
}

/**
 * Stop the run in progress, if any: cancel its timer, stop listening for Space, and clear the
 * stimulus and feedback.
 */
export function stopTrials() {
  clearTimer();
  detachGlobalKeyListener();
  hideImage();
  hideFeedback();
  _run = null;
  _stimulus = null;
}

/**
 * Play a run of trials, replacing any run in progress. Each trial shows a stimulus until the
 * player presses or its display time ends; feedback follows a no-go trial or a missed go.
 *
 * @param {TrialRun} run
 */
export function playTrials(run) {
  stopTrials();
  _run = run;
  attachGlobalKeyListener();
  scheduleNextTrial();
}

/** Begin the next trial after the inter-stimulus interval. */
function scheduleNextTrial() {
  _timer = setTimeout(beginTrial, ISI_MS);
}

/**
 * Begin a new trial: show the run's next stimulus and start its display window. Ends the run
 * when it has no more stimuli.
 */
export function beginTrial() {
  const stimulus = _run.next();
  if (!stimulus) {
    stopTrials();
    return;
  }
  _stimulus = stimulus;
  _stimulusShownAt = Date.now();
  showImage(stimulus.imageKey);
  if (stimulus.displayMs !== null) {
    _timer = setTimeout(endTrial, stimulus.displayMs);
  }
}

/**
 * End the current trial: record the response, then show feedback for a no-go trial or a
 * missed go, or go straight on to the next trial to keep the pace fast.
 *
 * @param {boolean} [pressed=false] - Whether the player pressed during the trial.
 */
export function endTrial(pressed = false) {
  clearTimer();
  const stimulus = _stimulus;
  _stimulus = null;
  hideImage();

  const outcome = _run.record(stimulus, pressed, Date.now() - _stimulusShownAt);
  if (stimulus.isNoGo || outcome === 'wrong') {
    showFeedback(outcome, stimulus.isNoGo);
    _timer = setTimeout(() => {
      hideFeedback();
      scheduleNextTrial();
    }, FEEDBACK_DURATION_MS);
  } else {
    scheduleNextTrial();
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

/**
 * Respond to the stimulus on screen (Space or a click on the stimulus area), ending its
 * trial early. Presses between trials are ignored.
 */
export function respond() {
  if (_stimulus) endTrial(true);
}

/**
 * Handle a keydown event. Only Space is used, and only while a run is playing.
 * @param {KeyboardEvent} event
 */
export function handleKeyDown(event) {
  if (event.code !== 'Space' || !_run) return;

  // Prevent Space from scrolling the page or activating a focused button
  // while a run is playing, even between trials.
  event.preventDefault();
  respond();
}

/**
 * Attach the document-level Space key handler for the run being played.
 */
export function attachGlobalKeyListener() {
  if (_isGlobalKeyListenerAttached) return;
  document.addEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = true;
}

/**
 * Detach the document-level Space key handler so Space works normally elsewhere.
 */
export function detachGlobalKeyListener() {
  if (!_isGlobalKeyListenerAttached) return;
  document.removeEventListener('keydown', handleKeyDown);
  _isGlobalKeyListenerAttached = false;
}

// ── Plugin lifecycle ──────────────────────────────────────────────────────────

/**
 * Initialise the plugin after interface.html has been injected.
 * Queries all required DOM elements and attaches event listeners.
 * Does NOT start the game loop.
 *
 * @param {HTMLElement} container - The element into which the HTML fragment was injected.
 */
function init(container) {
  _container = container;
  setPracticeControls(PRACTICE_CONTROLS);
  if (!container) return;

  _instructionsEl = container.querySelector('#os-instructions');
  _gameAreaEl = container.querySelector('#os-game-area');
  _stimulusEl = container.querySelector('#os-stimulus');
  _stimulusImg = container.querySelector('#os-stimulus-img');
  _feedbackEl = container.querySelector('#os-feedback');
  _feedbackImg = container.querySelector('#os-feedback-img');
  _feedbackText = container.querySelector('#os-feedback-text');
  _endPanelEl = container.querySelector('#os-end-panel');
  _startBtn = container.querySelector('#os-start-btn');
  _replayTutorialBtn = container.querySelector('#os-replay-tutorial-btn');
  _stopBtn = container.querySelector('#os-stop-btn');
  _playAgainBtn = container.querySelector('#os-play-again-btn');
  _returnBtn = container.querySelector('#os-return-btn');
  _levelEl = container.querySelector('#os-level');
  _scoreEl = container.querySelector('#os-score');
  _nogoHitsEl = container.querySelector('#os-nogo-hits');
  _intervalEl = container.querySelector('#os-interval');
  _sessionTimerEl = container.querySelector('#os-session-timer');
  _trendLineEl = container.querySelector('#os-trend-line');
  _trendEmptyEl = container.querySelector('#os-trend-empty');
  _trendLatestEl = container.querySelector('#os-trend-latest');
  _avgResponseEl = container.querySelector('#os-avg-response');
  _finalScoreEl = container.querySelector('#os-final-score');
  _finalBestEl = container.querySelector('#os-final-best');
  _finalNogoEl = container.querySelector('#os-final-nogo');
  _finalMissesEl = container.querySelector('#os-final-misses');
  _finalTrialsEl = container.querySelector('#os-final-trials');

  game.initGame();

  // Asynchronously populate GO_KEYS from the images/go/ directory.
  // Resolves well before the player clicks "Start Game".
  // loadGoImages() silently handles all errors internally, so no .catch() is needed here.
  loadGoImages();

  if (_startBtn) {
    _startBtn.addEventListener('click', () => {
      void start();
    });
  }

  // Replay always shows the tutorial, then starts a session.
  if (_replayTutorialBtn) {
    _replayTutorialBtn.addEventListener('click', () => {
      void tutorial.replay(tutorialOptions());
    });
  }

  if (_stopBtn) {
    _stopBtn.addEventListener('click', () => {
      stop();
    });
  }

  if (_playAgainBtn) {
    _playAgainBtn.addEventListener('click', () => {
      reset();
    });
  }

  if (_returnBtn) {
    _returnBtn.addEventListener('click', () => returnToMainMenu());
  }

  stopTrials();
  if (_stimulusEl) {
    _stimulusEl.addEventListener('click', respond);
  }
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
 * Start a session and its trial loop, without the tutorial check.
 */
function beginGameSession() {
  game.initGame();
  game.startGame();

  timerService.startTimer((elapsedMs) => {
    if (_sessionTimerEl) {
      _sessionTimerEl.textContent = timerService.formatDuration(elapsedMs);
    }
  });

  showGameArea();
  updateStats();
  playTrials(SESSION_TRIALS);
}

/**
 * Trial loop controls the tutorial uses to play practice rounds with the real display,
 * feedback, and Space and click handling.
 *
 * @type {import('./tutorial/tutorial.js').PracticeRoundControls}
 */
const PRACTICE_CONTROLS = Object.freeze({
  showGameArea,
  playTrials,
  stopTrials,
  getStimulusArea: () => _stimulusEl,
});

/**
 * Options for launching the tutorial from this game.
 *
 * @returns {import('../../components/tutorialLauncher.js').TutorialLaunchOptions}
 */
function tutorialOptions() {
  return { container: _container, onComplete: beginGameSession };
}

/**
 * Start a session, showing the tutorial first if the player has not seen it.
 *
 * @returns {Promise<void>}
 */
function start() {
  return tutorial.startIfNeeded(tutorialOptions());
}

/**
 * Stop the game, show the end panel, and persist progress via the score service.
 *
 * With no session running (on the welcome screen, during the tutorial, or when the app quits
 * after a session ended) there is nothing to save and the screen is left alone, except that
 * leaving a tutorial this way cancels it and returns to the welcome screen.
 *
 * @returns {{ score: number, noGoHits: number, misses: number,
 *             trialsCompleted: number, level: number, maxSequenceLength: number,
 *             duration: number, bestScore: number }}
 */
function stop() {
  stopTrials();

  if (!game.isRunning()) {
    if (tutorial.isActive()) reset();
    return {
      score: game.getScore(),
      noGoHits: game.getNoGoHits(),
      misses: game.getMisses(),
      trialsCompleted: game.getTrialsCompleted(),
      level: game.getLevel(),
      maxSequenceLength: game.getMaxSequenceLength(),
      duration: 0,
      bestScore: game.getSessionBestScore(),
    };
  }

  const result = game.stopGame();
  const sessionDurationMs = timerService.stopTimer();

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  showEndPanel(result);

  // Persist progress — fire and forget (never blocks the UI).
  saveScore(game.GAME_ID, {
    score: result.score,
    sessionDurationMs,
    level: result.level,
    lowestDisplayTime: game.getCurrentIntervalMs(),
  }, (prev) => ({
    maxSequenceLength: Math.max(
      (prev && prev.maxSequenceLength) || 0,
      result.maxSequenceLength || 0,
    ),
  }));

  return result;
}

/**
 * Reset the game to its initial state without reloading interface.html.
 * Returns to the instructions screen.
 */
function reset() {
  tutorial.cancel();
  stopTrials();
  game.initGame();

  timerService.resetTimer();
  if (_sessionTimerEl) _sessionTimerEl.textContent = '00:00';

  if (_gameAreaEl) _gameAreaEl.hidden = true;
  if (_endPanelEl) _endPanelEl.hidden = true;
  if (_instructionsEl) _instructionsEl.hidden = false;

  updateStats();
  updateTrendChart();
  updateAverageResponse();
}

export default {
  name,
  init,
  start,
  stop,
  reset,
};
