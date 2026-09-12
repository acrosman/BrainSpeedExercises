/**
 * tutorialService.js — Reusable tutorial framework for BrainSpeedExercises.
 *
 * Provides a shared mechanism to:
 *   1. Track whether a player has seen a game's tutorial (persisted in progress data).
 *   2. Render a multi-step tutorial overlay inside any game container.
 *
 * All persistence calls go through the window.api IPC bridge; never import
 * Electron APIs directly in this module.
 *
 * Typical usage inside a game plugin's init():
 * ```js
 * import { showTutorialIfNeeded } from '../../components/tutorialService.js';
 *
 * async function init(gameContainer) {
 *   // ... other init work ...
 *   await showTutorialIfNeeded('my-game-id', TUTORIAL_STEPS, gameContainer, () => {
 *     start();
 *   });
 * }
 * ```
 *
 * @file Shared tutorial overlay service.
 */

import { logger } from './logService.js';

/** Default player ID used throughout the application. */
const DEFAULT_PLAYER_ID = 'default';

/**
 * @typedef {object} TutorialStep
 * @property {string} title   - Heading for this step.
 * @property {string} content - Body text (may contain HTML).
 */

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
 * @returns {void}
 */
export function renderTutorialStep(overlay, steps, stepIndex) {
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

  if (nextBtn) {
    nextBtn.textContent = isLast ? 'Got it!' : 'Next';
    nextBtn.setAttribute(
      'aria-label',
      isLast ? 'Finish tutorial' : `Go to step ${stepIndex + 2} of ${total}`,
    );
  }
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
  const overlay = createTutorialOverlay(steps);
  let currentStep = 0;

  renderTutorialStep(overlay, steps, currentStep);
  container.appendChild(overlay);

  // Move focus into the overlay panel for keyboard accessibility.
  const panel = overlay.querySelector('.tutorial-overlay__panel');
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    panel.focus();
  }

  /** Finish the tutorial: persist seen state, remove overlay, invoke callback. */
  async function _finish() {
    try {
      await markTutorialSeen(gameId);
    } finally {
      overlay.remove();
      onComplete();
    }
  }

  overlay.querySelector('#tutorial-overlay-next').addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      renderTutorialStep(overlay, steps, currentStep);
    } else {
      _finish();
    }
  });

  overlay.querySelector('#tutorial-overlay-prev').addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderTutorialStep(overlay, steps, currentStep);
    }
  });

  overlay.querySelector('#tutorial-overlay-skip').addEventListener('click', () => {
    _finish();
  });

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
