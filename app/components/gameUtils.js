/**
 * gameUtils.js — Shared utility functions for BrainSpeedExercises game plugins.
 *
 * Functions in this module are common to multiple game plugins.
 * Import what you need directly rather than importing the whole module.
 *
 * @file Shared game utilities.
 */

/**
 * Dispatch the app-level event that instructs the shell to return to the
 * main game-selection screen.
 *
 * Safe to call outside a browser environment (no-op when `window` is absent).
 *
 * @returns {void}
 */
export function returnToMainMenu() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bsx:return-to-main-menu'));
  }
}

/**
 * Move keyboard focus to the first heading inside `root`, so focus does not fall to
 * `<body>` when the screen changes (WCAG 2.4.3). A heading without a tabindex gets
 * `tabindex="-1"`, which lets it take focus from script without joining the Tab order.
 *
 * Does nothing when `root` is missing or holds no heading.
 *
 * @param {Element|null|undefined} root - The element to search, such as a panel or screen.
 * @returns {boolean} True when a heading received focus.
 */
export function focusHeading(root) {
  if (!root) return false;
  const heading = root.querySelector('h1, h2, h3, h4, h5, h6');
  if (!heading) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
  return true;
}

/**
 * Run `rebuild`, which removes or replaces controls inside `container`, without letting focus
 * fall to `<body>`. When focus was inside `container` and the focused control is gone
 * afterwards, `target` takes focus. A container used as the target needs `tabindex="-1"` in
 * its markup.
 *
 * @param {Element|null|undefined} container - The element whose controls are rebuilt.
 * @param {function(): void} rebuild - Removes or replaces the controls.
 * @param {HTMLElement|null|undefined} [target=container] - Where focus goes if it was lost.
 * @returns {void}
 */
export function keepFocusInside(container, rebuild, target = container) {
  const hadFocus = Boolean(container && container.contains(document.activeElement));
  rebuild();
  if (hadFocus && target && !container.contains(document.activeElement)) target.focus();
}
