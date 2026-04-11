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
