/**
 * tutorialService.js — Reusable tutorial framework for BrainSpeedExercises.
 *
 * Provides a shared mechanism to:
 *   1. Track whether a player has seen a game's tutorial (persisted in progress data).
 *   2. Render a multi-step tutorial overlay inside any game container.
 *   3. Run a guided tutorial: the overlay, then live practice rounds the game plays at its
 *      easiest setting, with a coach banner and a marker on the control to use.
 *
 * All persistence calls go through the window.api IPC bridge; never import
 * Electron APIs directly in this module.
 *
 * Typical usage inside a game plugin's start():
 * ```js
 * import { runGuidedTutorialIfNeeded } from '../../components/tutorialService.js';
 *
 * if (_tutorialRun && _tutorialRun.isActive()) return;
 * _tutorialRun = await runGuidedTutorialIfNeeded({
 *   gameId: 'my-game-id',
 *   container,
 *   introSteps: await getTutorialSteps(),
 *   playPracticeRound, // (context) => Promise that resolves once the player answers
 *   onComplete: beginGameSession,
 * });
 * // In stop() and reset(): if (_tutorialRun) _tutorialRun.cancel();
 * ```
 *
 * @file Shared tutorial overlay service.
 */

import { logger } from './logService.js';
import {
  askCoachQuestion,
  createTutorialCoach,
  setCoachMessage,
  showTutorialMarker,
} from './tutorialCoach.js';

/** Default player ID used throughout the application. */
const DEFAULT_PLAYER_ID = 'default';

/**
 * @typedef {object} TutorialStep
 * @property {string} title   - Heading for this step.
 * @property {string} content - Body text (may contain HTML).
 */

/**
 * @typedef {object} TutorialStepDefinition
 * @property {string} title       - Heading for this step.
 * @property {string} contentPath - Path to the step's HTML fragment, relative to
 *   `app/index.html` (for example `./games/<id>/tutorial/tutorial-step-welcome.html`).
 */

/** Plain-text body shown in place of a step whose HTML fragment fails to load. */
const FALLBACK_STEP_CONTENT = 'Tutorial content is temporarily unavailable.';

/**
 * Loaded step markup, keyed by content path.
 * @type {Map<string, string>}
 */
const _stepMarkupCache = new Map();

// ── Persistence helpers ───────────────────────────────────────────────────────

/**
 * Load the full progress record for the default player.
 * Returns a safe fallback on any error.
 *
 * @returns {Promise<object>} Raw progress data from IPC, or a minimal fallback object.
 */
async function _loadProgress() {
  const fallback = { playerId: DEFAULT_PLAYER_ID, games: {}, tutorials: {} };
  if (typeof window === 'undefined' || !window.api) return fallback;
  try {
    return await window.api.invoke(
      'progress:load',
      { playerId: DEFAULT_PLAYER_ID },
    ) || fallback;
  } catch (err) {
    logger.warn('tutorialService: failed to load progress', err);
    return fallback;
  }
}

/**
 * Save updated progress data via IPC.
 *
 * @param {object} data - Full progress object to persist.
 * @returns {Promise<void>}
 */
async function _saveProgress(data) {
  if (typeof window === 'undefined' || !window.api) return;
  try {
    await window.api.invoke('progress:save', { playerId: DEFAULT_PLAYER_ID, data });
  } catch (err) {
    logger.warn('tutorialService: failed to save progress', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the tutorial for the given game has already been seen.
 *
 * @param {string} gameId - The game ID matching the manifest.json `id` field.
 * @returns {Promise<boolean>} `true` if the tutorial has been seen, `false` otherwise.
 */
export async function hasTutorialBeenSeen(gameId) {
  const progress = await _loadProgress();
  return !!(progress.tutorials && progress.tutorials[gameId]);
}

/**
 * Mark the tutorial for the given game as seen, persisting the flag to disk.
 *
 * @param {string} gameId - The game ID matching the manifest.json `id` field.
 * @returns {Promise<void>}
 */
export async function markTutorialSeen(gameId) {
  const progress = await _loadProgress();
  const updated = {
    ...progress,
    tutorials: {
      ...(progress.tutorials || {}),
      [gameId]: true,
    },
  };
  await _saveProgress(updated);
}

// ── Step content loading ──────────────────────────────────────────────────────

/**
 * Clear cached tutorial step markup so the next load fetches it again.
 *
 * @returns {void}
 */
export function clearTutorialMarkupCache() {
  _stepMarkupCache.clear();
}

/**
 * Fetch one step's HTML fragment, caching the result. Falls back to
 * {@link FALLBACK_STEP_CONTENT} (and caches that) if the fetch fails.
 *
 * @param {string} contentPath - Path to the HTML fragment.
 * @returns {Promise<string>} The step markup.
 */
async function _loadStepMarkup(contentPath) {
  if (!_stepMarkupCache.has(contentPath)) {
    try {
      const response = await fetch(contentPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      _stepMarkupCache.set(contentPath, await response.text());
    } catch (err) {
      logger.warn(`tutorialService: failed to load tutorial step ${contentPath}`, err);
      _stepMarkupCache.set(contentPath, FALLBACK_STEP_CONTENT);
    }
  }
  return _stepMarkupCache.get(contentPath);
}

/**
 * Build tutorial steps from definitions whose content lives in HTML fragment files.
 *
 * The fragments are trusted, game-authored files; see the XSS warning on
 * {@link createTutorialOverlay}.
 *
 * @param {TutorialStepDefinition[]} definitions - Ordered step definitions.
 * @returns {Promise<TutorialStep[]>} Steps ready for {@link showTutorial}.
 */
export function loadTutorialSteps(definitions) {
  return Promise.all(definitions.map(async ({ title, contentPath }) => ({
    title,
    content: await _loadStepMarkup(contentPath),
  })));
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Build and return the tutorial overlay DOM element.
 *
 * The overlay is a modal dialog with:
 *   - A step indicator (e.g. "Step 1 of 3").
 *   - A heading and body for the current step.
 *   - "Previous" / "Next" navigation buttons.
 *   - A "Got it!" / "Finish" button on the last step.
 *   - A "Skip Tutorial" link.
 *
 * The element is **not** appended to the DOM by this function; call
 * {@link showTutorial} to insert and display it.
 *
 *
 * @warning The `content` field of each step is inserted as `innerHTML`.
 *   It must **never** include user-provided data, only trusted static strings
 *   authored by the game plugin developer. Interpolating user input into step
 *   content would introduce a cross-site scripting (XSS) vulnerability.
 *
 * @param {TutorialStep[]} steps - Ordered list of tutorial steps (minimum 1).
 * @returns {HTMLElement} The root `.tutorial-overlay` element.
 * @throws {Error} If `steps` is empty.
 */
export function createTutorialOverlay(steps) {
  if (!steps || steps.length === 0) {
    throw new Error('tutorialService: steps array must not be empty.');
  }

  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tutorial-overlay-title');

  overlay.innerHTML = `
    <div class="tutorial-overlay__backdrop"></div>
    <div class="tutorial-overlay__panel">
      <p class="tutorial-overlay__step-indicator" aria-live="polite"></p>
      <h2 class="tutorial-overlay__title" id="tutorial-overlay-title"></h2>
      <div class="tutorial-overlay__content" aria-live="polite"></div>
      <div class="tutorial-overlay__actions" role="group" aria-label="Tutorial navigation">
        <button type="button" class="tutorial-overlay__btn tutorial-overlay__btn--secondary"
          id="tutorial-overlay-prev">
          Previous
        </button>
        <button type="button" class="tutorial-overlay__btn tutorial-overlay__btn--primary"
          id="tutorial-overlay-next">
          Next
        </button>
      </div>
      <button type="button" class="tutorial-overlay__skip"
        id="tutorial-overlay-skip">
        Skip Tutorial
      </button>
    </div>
  `;

  return overlay;
}

/**
 * Update the visible content of an existing overlay element for the given step index.
 *
 * @param {HTMLElement}     overlay   - The root `.tutorial-overlay` element.
 * @param {TutorialStep[]}  steps     - Full ordered list of tutorial steps.
 * @param {number}          stepIndex - Zero-based index of the step to display.
 * @param {string}          [finishLabel='Got it!'] - Text of the Next button on the last step.
 * @returns {void}
 */
export function renderTutorialStep(overlay, steps, stepIndex, finishLabel = 'Got it!') {
  const total = steps.length;
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;

  const indicatorEl = overlay.querySelector('.tutorial-overlay__step-indicator');
  const titleEl = overlay.querySelector('.tutorial-overlay__title');
  const contentEl = overlay.querySelector('.tutorial-overlay__content');
  const prevBtn = overlay.querySelector('#tutorial-overlay-prev');
  const nextBtn = overlay.querySelector('#tutorial-overlay-next');

  if (indicatorEl) indicatorEl.textContent = `Step ${stepIndex + 1} of ${total}`;
  if (titleEl) titleEl.textContent = step.title;
  if (contentEl) contentEl.innerHTML = step.content;

  if (prevBtn) {
    prevBtn.hidden = isFirst;
    prevBtn.disabled = isFirst;
  }

  // No aria-label: the accessible name must match the visible text (WCAG 2.5.3), and the
  // live step indicator already announces the position.
  if (nextBtn) nextBtn.textContent = isLast ? finishLabel : 'Next';
}

/**
 * Append a slide overlay to `container`, focus it, and wire its navigation.
 * The caller decides what finishing and skipping mean, and removes the overlay.
 *
 * @param {TutorialStep[]} steps     - Ordered list of tutorial steps.
 * @param {HTMLElement}    container - DOM element to append the overlay into.
 * @param {object}         handlers
 * @param {Function}       handlers.onFinish - Called when Next is pressed on the last step.
 * @param {Function}       handlers.onSkip   - Called when Skip Tutorial is pressed.
 * @param {string}         [handlers.finishLabel] - Next button text on the last step.
 * @returns {HTMLElement} The overlay element.
 */
function _openSlideOverlay(steps, container, { onFinish, onSkip, finishLabel }) {
  const overlay = createTutorialOverlay(steps);
  let currentStep = 0;

  renderTutorialStep(overlay, steps, currentStep, finishLabel);
  container.appendChild(overlay);

  // Move focus into the overlay panel for keyboard accessibility.
  const panel = overlay.querySelector('.tutorial-overlay__panel');
  panel.setAttribute('tabindex', '-1');
  panel.focus();

  overlay.querySelector('#tutorial-overlay-next').addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      renderTutorialStep(overlay, steps, currentStep, finishLabel);
    } else {
      onFinish();
    }
  });

  overlay.querySelector('#tutorial-overlay-prev').addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderTutorialStep(overlay, steps, currentStep, finishLabel);
    }
  });

  overlay.querySelector('#tutorial-overlay-skip').addEventListener('click', () => onSkip());

  return overlay;
}

/**
 * Show a multi-step tutorial overlay inside `container`.
 *
 * Appends the overlay to the container, renders the first step, and sets up
 * navigation. When the player completes or skips the tutorial:
 *   1. The game tutorial is marked as seen via {@link markTutorialSeen}.
 *   2. The overlay is removed from the DOM.
 *   3. `onComplete` is called.
 *
 * @param {string}          gameId      - Game ID used to persist seen state.
 * @param {TutorialStep[]}  steps       - Ordered list of tutorial steps.
 * @param {HTMLElement}     container   - DOM element to append the overlay into.
 * @param {Function}        [onComplete=()=>{}] - Callback invoked after the tutorial ends.
 * @returns {HTMLElement} The overlay element (already appended to `container`).
 */
export function showTutorial(gameId, steps, container, onComplete = () => {}) {
  /** Finish the tutorial: persist seen state, remove overlay, invoke callback. */
  async function _finish() {
    try {
      await markTutorialSeen(gameId);
    } finally {
      overlay.remove();
      onComplete();
    }
  }

  const overlay = _openSlideOverlay(steps, container, { onFinish: _finish, onSkip: _finish });
  return overlay;
}

/**
 * Show the tutorial overlay only if the player has not yet seen it.
 *
 * If the tutorial has already been seen, `onComplete` is called immediately
 * and no overlay is created. This is the primary entry point for game plugins.
 *
 * @param {string}          gameId      - Game ID (must match manifest.json `id`).
 * @param {TutorialStep[]}  steps       - Ordered list of tutorial steps.
 * @param {HTMLElement}     container   - DOM element to append the overlay into.
 * @param {Function}        [onComplete=()=>{}] - Callback invoked after the tutorial ends
 *   (or immediately if already seen).
 * @returns {Promise<HTMLElement|null>} The overlay element, or `null` if the
 *   tutorial was skipped because it has already been seen.
 */
export async function showTutorialIfNeeded(
  gameId, steps, container, onComplete = () => {},
) {
  const seen = await hasTutorialBeenSeen(gameId);
  if (seen) {
    onComplete();
    return null;
  }
  return showTutorial(gameId, steps, container, onComplete);
}

// ── Guided tutorial runner ────────────────────────────────────────────────────

/**
 * What a game's `playPracticeRound` receives for each round.
 *
 * @typedef {object} PracticeRoundContext
 * @property {number}  round     - This round's number, starting at 1.
 * @property {number}  maxRounds - Most practice rounds the player can be offered.
 * @property {boolean} guided    - Whether to show the marker this round. Rounds after
 *   `guidedRounds` leave the player on their own.
 * @property {AbortSignal} signal - Aborted when the tutorial ends for any reason (finished,
 *   skipped, or cancelled). Cancel practice timers and clear practice state when it fires.
 *   The runner stops waiting on the round then, so its promise need not settle.
 * @property {(text: string) => void} setInstructions - Replace the coach instruction line.
 *   Include the keyboard alternative whenever the text describes a click.
 * @property {(options: import('./tutorialCoach.js').MarkerOptions) => void} showMarker -
 *   Mark the control to use, replacing any marker already shown.
 * @property {() => void} hideMarker - Remove the marker.
 */

/**
 * @typedef {object} GuidedTutorialOptions
 * @property {string}         gameId    - Game ID (must match manifest.json `id`).
 * @property {HTMLElement}    container - Game container; the overlay and coach go inside it.
 * @property {TutorialStep[]} [introSteps=[]] - Slides shown before practice. Empty skips them.
 * @property {(context: PracticeRoundContext) => Promise<void>} [playPracticeRound] - Play one
 *   round at the game's easiest setting without scoring, saving, timing the session, or
 *   changing difficulty. Resolve once the player has answered. Omit it for a slides-only
 *   tutorial.
 * @property {number}   [maxRounds=2]    - Most practice rounds to offer.
 * @property {number}   [guidedRounds=1] - How many rounds, counting from the first, are guided.
 * @property {Function} [onComplete]     - Called after the tutorial is finished or skipped and
 *   marked seen, to start the real game. Not called when the run is cancelled.
 */

/**
 * @typedef {'completed'|'skipped'|'cancelled'} GuidedTutorialOutcome
 */

/**
 * @typedef {object} GuidedTutorialRun
 * @property {() => void} cancel - End the tutorial now without marking it seen or calling
 *   `onComplete`. Call it from the game's `stop()` and `reset()`. Safe to call at any time,
 *   including after the run has ended.
 * @property {() => boolean} isActive - Whether the run is still in progress (until
 *   `finished` settles). Use it to guard against launching a second tutorial.
 * @property {Promise<GuidedTutorialOutcome>} finished - Settles when the tutorial ends.
 */

/** Coach button that ends practice and starts the real game. */
const START_GAME_CHOICE = { label: 'Start the Game', value: 'start' };
/** Coach button that plays another practice round. */
const ANOTHER_ROUND_CHOICE = { label: 'Play Another Round', value: 'again' };

/**
 * Run a guided tutorial: intro slides, then live practice rounds with a coach banner and a
 * marker, then the real game.
 *
 * Flow: slides → `playPracticeRound` → "Play another round?" → (repeat up to `maxRounds`)
 * → mark seen → `onComplete`. "Skip Tutorial" on the slides and "Skip Practice" on the coach
 * both jump to mark seen → `onComplete`.
 *
 * @param {GuidedTutorialOptions} options - What to show and how to play a practice round.
 * @returns {GuidedTutorialRun} Handle for cancelling the run.
 */
export function runGuidedTutorial({
  gameId,
  container,
  introSteps = [],
  playPracticeRound = null,
  maxRounds = 2,
  guidedRounds = 1,
  onComplete = () => {},
}) {
  const controller = new AbortController();
  let overlay = null;
  let coach = null;
  let removeMarker = () => {};
  let ended = false;
  let cancelled = false;
  let settled = false;
  let resolveFinished;
  const finished = new Promise((resolve) => { resolveFinished = resolve; });

  /**
   * Settle `finished` with the run's outcome.
   * @param {GuidedTutorialOutcome} outcome
   */
  function settle(outcome) {
    settled = true;
    resolveFinished(outcome);
  }

  /** Remove the current marker, if any. */
  function hideMarker() {
    removeMarker();
    removeMarker = () => {};
  }

  /**
   * Replace the marker. Ignored once the run has ended.
   * @param {import('./tutorialCoach.js').MarkerOptions} options
   */
  function showMarker(options) {
    if (ended) return;
    hideMarker();
    removeMarker = showTutorialMarker(container, options);
  }

  /**
   * Replace the coach instruction line. Ignored once the run has ended.
   * @param {string} text
   */
  function setInstructions(text) {
    if (ended || !coach) return;
    setCoachMessage(coach, { text });
  }

  /**
   * End the run once: remove the tutorial UI and abort the practice signal. Finishing and
   * skipping then mark the tutorial seen and call `onComplete`, unless the run is cancelled
   * while the flag is being saved.
   * @param {GuidedTutorialOutcome} outcome
   * @returns {Promise<void>}
   */
  async function end(outcome) {
    if (ended) return;
    ended = true;
    if (overlay) overlay.remove();
    hideMarker();
    if (coach) coach.remove();
    controller.abort();

    if (!cancelled) await markTutorialSeen(gameId);
    if (cancelled) {
      settle('cancelled');
      return;
    }
    onComplete();
    settle(outcome);
  }

  /**
   * Play practice rounds, asking after each one whether to play another.
   * @returns {Promise<void>}
   */
  async function practice() {
    coach = createTutorialCoach(() => { void end('skipped'); });
    container.prepend(coach);

    for (let round = 1; round <= maxRounds; round += 1) {
      setCoachMessage(coach, { label: `Practice round ${round} of ${maxRounds}`, text: '' });
      // Focus the coach so its instructions are read, and so focus is not left on the
      // removed prompt button (or the closed overlay) when a round starts.
      coach.focus();
      await playPracticeRound({
        round,
        maxRounds,
        guided: round <= guidedRounds,
        signal: controller.signal,
        setInstructions,
        showMarker,
        hideMarker,
      });
      if (ended) return;
      hideMarker();

      const isLastRound = round === maxRounds;
      const choice = await askCoachQuestion(
        coach,
        isLastRound
          ? 'Practice complete. Start the game when you are ready.'
          : `Round ${round} done. Play another practice round, or start the game?`,
        isLastRound
          ? [{ ...START_GAME_CHOICE, primary: true }]
          : [{ ...ANOTHER_ROUND_CHOICE, primary: true }, START_GAME_CHOICE],
      );
      // No `ended` check needed: ending removes the coach, so the prompt can't be answered.
      if (choice === START_GAME_CHOICE.value) break;
    }
    await end('completed');
  }

  /** Close the slides and begin practice, or finish if there is nothing to practice. */
  function startPractice() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    if (!playPracticeRound || maxRounds < 1) {
      void end('completed');
      return;
    }
    practice().catch((err) => {
      // Never strand the player in a broken practice round: go on to the real game.
      logger.error('tutorialService: practice round failed', err);
      void end('skipped');
    });
  }

  if (introSteps.length > 0) {
    overlay = _openSlideOverlay(introSteps, container, {
      onFinish: startPractice,
      onSkip: () => { void end('skipped'); },
      finishLabel: playPracticeRound ? 'Start Practice' : undefined,
    });
  } else {
    startPractice();
  }

  return {
    cancel() {
      if (settled) return;
      cancelled = true;
      void end('cancelled');
    },
    isActive: () => !settled,
    finished,
  };
}

/**
 * Run the guided tutorial only if the player has not yet seen it. Otherwise call
 * `onComplete` immediately and return `null`.
 *
 * @param {GuidedTutorialOptions} options - Same options as {@link runGuidedTutorial}.
 * @returns {Promise<GuidedTutorialRun|null>} The run handle, or `null` if already seen.
 */
export async function runGuidedTutorialIfNeeded(options) {
  if (await hasTutorialBeenSeen(options.gameId)) {
    if (typeof options.onComplete === 'function') options.onComplete();
    return null;
  }
  return runGuidedTutorial(options);
}
