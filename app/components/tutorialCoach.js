/**
 * tutorialCoach.js — Practice-round UI for guided tutorials.
 *
 * Builds the pieces that tutorialService.js shows while a game plays a practice round:
 *   - The coach banner: a short instruction line (announced through `aria-live`), the
 *     "play another round?" prompt, and a Skip Practice button. Unlike the slide overlay it
 *     does not cover the game, so the player can still click the board.
 *   - The marker: a pulsing ring drawn over the element, or part of an element, that the
 *     player should click. It ignores pointer events, so clicks pass through to the game.
 *
 * Games do not call this module directly. They reach it through the practice-round context
 * that `runGuidedTutorial` passes to `playPracticeRound`.
 *
 * @file Coach banner and target marker for guided tutorial practice rounds.
 */

/** Smallest marker size in CSS pixels, so the ring stays visible around small targets. */
const MIN_MARKER_SIZE_PX = 48;

/**
 * A rectangle given as fractions (0–1) of an anchor element's rendered box.
 * Fractions keep the marker in place when the anchor is scaled by CSS, as canvases are.
 *
 * @typedef {object} MarkerRegion
 * @property {number} x      - Left edge, as a fraction of the anchor's width.
 * @property {number} y      - Top edge, as a fraction of the anchor's height.
 * @property {number} width  - Width, as a fraction of the anchor's width.
 * @property {number} height - Height, as a fraction of the anchor's height.
 */

/**
 * @typedef {object} MarkerOptions
 * @property {HTMLElement}  anchor   - Element to mark (a button, a canvas, and so on).
 * @property {MarkerRegion} [region] - Part of the anchor to mark. Defaults to all of it.
 * @property {'ring'|'box'} [shape='ring'] - A circle, or a rounded rectangle for wide targets.
 */

/**
 * @typedef {object} CoachChoice
 * @property {string}  label     - Visible button text (also its accessible name).
 * @property {string}  value     - Value the prompt resolves with when this button is chosen.
 * @property {boolean} [primary] - Style as the main action.
 */

/** @type {MarkerRegion} */
const FULL_REGION = {
  x: 0, y: 0, width: 1, height: 1,
};

// ── Coach banner ──────────────────────────────────────────────────────────────

/**
 * Build the coach banner. The caller inserts it into the page.
 *
 * Structure:
 *   section.tutorial-coach              — labeled region, focusable so focus can land on it
 *     .tutorial-coach__message          — aria-live region holding the label and text
 *       p.tutorial-coach__label         — "Practice round 1 of 2"
 *       p.tutorial-coach__text          — what to do right now
 *     .tutorial-coach__controls         — always present, so the banner keeps its height
 *       .tutorial-coach__actions        — prompt buttons (empty between prompts)
 *       button.tutorial-coach__skip     — Skip Practice
 *
 * @param {Function} onSkip - Called when the player presses Skip Practice.
 * @returns {HTMLElement} The `.tutorial-coach` element.
 */
export function createTutorialCoach(onSkip) {
  const coach = document.createElement('section');
  coach.className = 'tutorial-coach';
  coach.setAttribute('aria-label', 'Tutorial practice');
  coach.tabIndex = -1;

  coach.innerHTML = `
    <div class="tutorial-coach__message" aria-live="polite" aria-atomic="true">
      <p class="tutorial-coach__label"></p>
      <p class="tutorial-coach__text"></p>
    </div>
    <div class="tutorial-coach__controls">
      <div class="tutorial-coach__actions"></div>
      <button type="button" class="tutorial-coach__skip">Skip Practice</button>
    </div>
  `;

  coach.querySelector('.tutorial-coach__skip').addEventListener('click', () => onSkip());
  return coach;
}

/**
 * Update the coach banner's label, text, or both. Omitted fields keep their current value.
 *
 * @param {HTMLElement} coach - The `.tutorial-coach` element.
 * @param {{ label?: string, text?: string }} message - New label and/or text.
 * @returns {void}
 */
export function setCoachMessage(coach, { label, text }) {
  if (typeof label === 'string') {
    coach.querySelector('.tutorial-coach__label').textContent = label;
  }
  if (typeof text === 'string') {
    coach.querySelector('.tutorial-coach__text').textContent = text;
  }
}

/**
 * Show a question in the coach banner with one button per choice, and move focus to the
 * first button. The buttons are removed once the player picks one.
 *
 * If the coach is removed before the player answers, the promise never settles; callers
 * should not wait on it for cleanup.
 *
 * @param {HTMLElement}   coach   - The `.tutorial-coach` element.
 * @param {string}        text    - The question.
 * @param {CoachChoice[]} choices - Buttons to offer, in order.
 * @returns {Promise<string>} The `value` of the chosen button.
 */
export function askCoachQuestion(coach, text, choices) {
  const actions = coach.querySelector('.tutorial-coach__actions');
  setCoachMessage(coach, { text });
  actions.replaceChildren();

  return new Promise((resolve) => {
    choices.forEach(({ label, value, primary }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tutorial-coach__btn tutorial-coach__btn--${primary ? 'primary' : 'secondary'}`;
      button.textContent = label;
      button.addEventListener('click', () => {
        actions.replaceChildren();
        resolve(value);
      });
      actions.appendChild(button);
    });

    if (actions.firstElementChild) actions.firstElementChild.focus();
  });
}

// ── Marker ────────────────────────────────────────────────────────────────────

/**
 * Size and place a marker over a region of its anchor, in viewport coordinates.
 *
 * A ring is kept circular (its diameter is the larger side of the region); a box follows the
 * region's shape. Both are at least {@link MIN_MARKER_SIZE_PX} on each side.
 *
 * @param {HTMLElement}  marker - The `.tutorial-marker` element.
 * @param {HTMLElement}  anchor - The element being marked.
 * @param {MarkerRegion} region - Part of the anchor to mark.
 * @param {'ring'|'box'} shape  - Marker shape.
 * @returns {void}
 */
export function positionTutorialMarker(marker, anchor, region, shape) {
  const rect = anchor.getBoundingClientRect();
  let width = Math.max(rect.width * region.width, MIN_MARKER_SIZE_PX);
  let height = Math.max(rect.height * region.height, MIN_MARKER_SIZE_PX);
  if (shape === 'ring') {
    width = Math.max(width, height);
    height = width;
  }
  const centerX = rect.left + rect.width * (region.x + region.width / 2);
  const centerY = rect.top + rect.height * (region.y + region.height / 2);

  // CSSOM writes are allowed under the page CSP; inline style attributes are not.
  marker.style.left = `${centerX - width / 2}px`;
  marker.style.top = `${centerY - height / 2}px`;
  marker.style.width = `${width}px`;
  marker.style.height = `${height}px`;
}

/**
 * Show a pulsing marker over an anchor element, or over one region of it. The marker
 * follows the anchor when the window is resized or scrolled.
 *
 * The marker is decorative (`aria-hidden`); the coach instructions must say the same thing
 * in words, including the keyboard alternative.
 *
 * @param {HTMLElement}   container - Element to hold the marker (removed with it).
 * @param {MarkerOptions} options   - What to mark.
 * @returns {() => void} Function that removes the marker and its listeners.
 */
export function showTutorialMarker(container, { anchor, region = FULL_REGION, shape = 'ring' }) {
  const marker = document.createElement('div');
  marker.className = `tutorial-marker tutorial-marker--${shape}`;
  marker.setAttribute('aria-hidden', 'true');

  /** Re-place the marker over the anchor's current position. */
  const place = () => positionTutorialMarker(marker, anchor, region, shape);
  place();
  container.appendChild(marker);

  window.addEventListener('resize', place);
  // Capture so scrolling inside any ancestor, not only the window, moves the marker.
  window.addEventListener('scroll', place, true);

  return () => {
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    marker.remove();
  };
}
