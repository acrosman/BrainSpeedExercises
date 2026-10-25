/**
 * harness.js — Page script for the sound test harness.
 *
 * Builds one button per sound that audioService.js can make. Every exported
 * `play*` function that takes no arguments gets a button without changes to
 * the harness. A sound that needs arguments gets its buttons from
 * SOUND_PRESETS; `listUncoveredSounds` names any that are missing, and the
 * harness test fails until a preset is added.
 *
 * @file Sound harness page.
 */
import * as audio from '../../app/components/audioService.js';

/**
 * Sweep timing used when the inputs are missing or invalid: Sound Sweep's easiest level.
 * @type {Readonly<{ sweepDurationMs: number, isiMs: number }>}
 */
export const DEFAULT_SWEEP_SETTINGS = Object.freeze({ sweepDurationMs: 600, isiMs: 600 });

/** Every sweep direction pair `playSweepPair` accepts. */
const SWEEP_SEQUENCES = [['up', 'up'], ['up', 'down'], ['down', 'up'], ['down', 'down']];

/**
 * Capitalize the first letter of a word.
 *
 * @param {string} word
 * @returns {string}
 */
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Buttons for sounds that need arguments. `getArgs(settings)` returns the arguments to pass,
 * where `settings` is the page's current sweep timing from {@link readSweepSettings}.
 *
 * @type {ReadonlyArray<{
 *   exportName: string,
 *   label: string,
 *   getArgs: (settings: { sweepDurationMs: number, isiMs: number }) => unknown[],
 * }>}
 */
export const SOUND_PRESETS = Object.freeze([
  { exportName: 'playFeedbackSound', label: 'Feedback: success', getArgs: () => [true] },
  { exportName: 'playFeedbackSound', label: 'Feedback: failure', getArgs: () => [false] },
  ...SWEEP_SEQUENCES.map((sequence) => ({
    exportName: 'playSweepPair',
    label: `Sweeps: ${sequence.map(capitalize).join('-')}`,
    getArgs: (settings) => [sequence, settings],
  })),
]);

/**
 * Return the exported `play*` functions of a module.
 *
 * @param {Record<string, unknown>} soundModule
 * @returns {string[]} Export names, sorted.
 */
function listPlayFunctions(soundModule) {
  return Object.keys(soundModule)
    .filter((key) => key.startsWith('play') && typeof soundModule[key] === 'function')
    .sort();
}

/**
 * List the sound effects a module exports that play with no arguments.
 *
 * @param {Record<string, unknown>} soundModule
 * @returns {string[]} Export names, such as `playShuffleSound`, sorted.
 */
export function listSoundEffects(soundModule) {
  return listPlayFunctions(soundModule).filter((key) => soundModule[key].length === 0);
}

/**
 * List the sounds that need arguments but have no preset, so the harness cannot play them.
 *
 * @param {Record<string, unknown>} soundModule
 * @returns {string[]} Export names, sorted.
 */
export function listUncoveredSounds(soundModule) {
  const presetNames = new Set(SOUND_PRESETS.map((preset) => preset.exportName));
  return listPlayFunctions(soundModule)
    .filter((key) => soundModule[key].length > 0 && !presetNames.has(key));
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
  return capitalize(words);
}

/**
 * Read one positive whole number of milliseconds from an input.
 *
 * @param {HTMLInputElement|null} inputEl
 * @param {number} fallback - Used when the input is missing or not a positive number.
 * @returns {number}
 */
function readMs(inputEl, fallback) {
  const value = Number(inputEl?.value);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

/**
 * Read the sweep timing inputs on the page.
 *
 * @param {ParentNode} root - Holds `#sweep-duration-ms` and `#sweep-isi-ms`.
 * @returns {{ sweepDurationMs: number, isiMs: number }}
 */
export function readSweepSettings(root) {
  return {
    sweepDurationMs: readMs(
      root.querySelector('#sweep-duration-ms'),
      DEFAULT_SWEEP_SETTINGS.sweepDurationMs,
    ),
    isiMs: readMs(root.querySelector('#sweep-isi-ms'), DEFAULT_SWEEP_SETTINGS.isiMs),
  };
}

/**
 * Add a list item holding one play button.
 *
 * @param {HTMLElement} listEl
 * @param {string} label
 * @param {() => void} onClick
 */
function addButton(listEl, label, onClick) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'game-btn game-btn--primary';
  button.textContent = label;
  button.addEventListener('click', onClick);
  item.appendChild(button);
  listEl.appendChild(item);
}

/**
 * Add a play button to the list for each sound in the module: the sounds that need no
 * arguments first, then the presets for sounds that do.
 *
 * @param {HTMLElement|null} listEl - The `<ul>` to fill.
 * @param {Record<string, unknown>} soundModule
 * @param {() => { sweepDurationMs: number, isiMs: number }} [readSettings] - Called on each
 *   click, so preset buttons use the current inputs.
 */
export function renderSoundButtons(
  listEl,
  soundModule,
  readSettings = () => DEFAULT_SWEEP_SETTINGS,
) {
  if (!listEl) return;

  listSoundEffects(soundModule).forEach((exportName) => {
    addButton(listEl, getSoundLabel(exportName), () => soundModule[exportName]());
  });

  SOUND_PRESETS
    .filter((preset) => typeof soundModule[preset.exportName] === 'function')
    .forEach((preset) => {
      addButton(listEl, preset.label, () => {
        soundModule[preset.exportName](...preset.getArgs(readSettings()));
      });
    });
}

renderSoundButtons(document.querySelector('#sound-list'), audio, () => readSweepSettings(document));
