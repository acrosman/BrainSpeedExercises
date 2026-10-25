/**
 * harness.js — Page script for the sound test harness.
 *
 * Builds one button per sound effect that audioService.js exports. A sound
 * effect is any exported `play*` function that takes no arguments, so a new
 * sound shows up here without changes to the harness.
 *
 * @file Sound harness page.
 */
import * as audio from '../../app/components/audioService.js';

/**
 * List the sound effects a module exports that play with no arguments.
 *
 * @param {Record<string, unknown>} soundModule
 * @returns {string[]} Export names, such as `playShuffleSound`, sorted.
 */
export function listSoundEffects(soundModule) {
  return Object.keys(soundModule)
    .filter((key) => key.startsWith('play')
      && typeof soundModule[key] === 'function'
      && soundModule[key].length === 0)
    .sort();
}

/**
 * Turn an export name into a button label, for example `playCardFlickSound` → `Card flick`.
 *
 * @param {string} exportName
 * @returns {string}
 */
export function getSoundLabel(exportName) {
  const words = exportName
    .replace(/^play/, '')
    .replace(/Sound$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Add a play button to the list for each sound effect in the module.
 *
 * @param {HTMLElement|null} listEl - The `<ul>` to fill.
 * @param {Record<string, unknown>} soundModule
 */
export function renderSoundButtons(listEl, soundModule) {
  if (!listEl) return;

  listSoundEffects(soundModule).forEach((exportName) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-btn game-btn--primary';
    button.textContent = getSoundLabel(exportName);
    button.addEventListener('click', () => soundModule[exportName]());
    item.appendChild(button);
    listEl.appendChild(item);
  });
}

renderSoundButtons(document.querySelector('#sound-list'), audio);
