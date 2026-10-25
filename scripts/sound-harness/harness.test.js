/**
 * harness.test.js - Unit tests for the sound harness page script.
 */
import {
  jest,
  describe,
  test,
  expect,
} from '@jest/globals';

const {
  DEFAULT_SWEEP_SETTINGS,
  SOUND_PRESETS,
  listSoundEffects,
  listUncoveredSounds,
  getSoundLabel,
  readSweepSettings,
  renderSoundButtons,
} = await import('./harness.js');
const audio = await import('../../app/components/audioService.js');

/**
 * Build a stand-in for audioService.js with sounds that take no arguments, sounds that
 * need them, and a helper that is not a sound.
 *
 * @returns {Record<string, unknown>}
 */
function buildSoundModule() {
  return {
    playShuffleSound: jest.fn(() => {}),
    playCardFlickSound: jest.fn(() => {}),
    playFeedbackSound: jest.fn((isSuccess) => isSuccess),
    playSweepPair: jest.fn((sequence, options) => [sequence, options]),
    getAudioContext: () => null,
    SWEEP_LOW_FREQ_HZ: 300,
  };
}

/**
 * Build sweep timing inputs like the ones in index.html.
 *
 * @param {string} duration - Value of the sweep length input.
 * @param {string} isi - Value of the gap input.
 * @returns {HTMLElement}
 */
function buildSettings(duration, isi) {
  const root = document.createElement('div');
  root.innerHTML = `
    <input id="sweep-duration-ms" type="number" value="${duration}">
    <input id="sweep-isi-ms" type="number" value="${isi}">
  `;
  return root;
}

describe('the real audio service', () => {
  test('every sound it exports has a harness button', () => {
    expect(listUncoveredSounds(audio)).toEqual([]);
    expect(listSoundEffects(audio)).toEqual(expect.arrayContaining([
      'playCardFlickSound',
      'playFailureSound',
      'playShuffleSound',
      'playSuccessSound',
    ]));
  });

  test('every preset names a function the service exports', () => {
    SOUND_PRESETS.forEach((preset) => {
      expect(typeof audio[preset.exportName]).toBe('function');
    });
  });
});

describe('listSoundEffects', () => {
  test('lists only play functions that take no arguments, sorted', () => {
    expect(listSoundEffects(buildSoundModule())).toEqual([
      'playCardFlickSound',
      'playShuffleSound',
    ]);
  });
});

describe('listUncoveredSounds', () => {
  test('names a sound that needs arguments and has no preset', () => {
    const sounds = { ...buildSoundModule(), playChordSound: (notes) => notes };
    expect(listUncoveredSounds(sounds)).toEqual(['playChordSound']);
  });
});

describe('getSoundLabel', () => {
  test('drops the play prefix and Sound suffix and splits the words', () => {
    expect(getSoundLabel('playCardFlickSound')).toBe('Card flick');
    expect(getSoundLabel('playShuffleSound')).toBe('Shuffle');
  });
});

describe('readSweepSettings', () => {
  test('reads whole milliseconds from the inputs', () => {
    expect(readSweepSettings(buildSettings('80', '40.4'))).toEqual({
      sweepDurationMs: 80,
      isiMs: 40,
    });
  });

  test('falls back to the defaults for missing, empty, or non-positive values', () => {
    expect(readSweepSettings(document.createElement('div'))).toEqual(DEFAULT_SWEEP_SETTINGS);
    expect(readSweepSettings(buildSettings('', '0'))).toEqual(DEFAULT_SWEEP_SETTINGS);
  });
});

describe('renderSoundButtons', () => {
  test('adds the no-argument sounds first, then the presets', () => {
    const list = document.createElement('ul');

    renderSoundButtons(list, buildSoundModule());

    const labels = Array.from(list.querySelectorAll('li > button'), (b) => b.textContent);
    expect(labels).toEqual([
      'Card flick',
      'Shuffle',
      'Feedback: success',
      'Feedback: failure',
      'Sweeps: Up-Up',
      'Sweeps: Up-Down',
      'Sweeps: Down-Up',
      'Sweeps: Down-Down',
    ]);
  });

  test('a no-argument button plays only its own sound', () => {
    const list = document.createElement('ul');
    const sounds = buildSoundModule();
    renderSoundButtons(list, sounds);

    list.querySelectorAll('button')[1].click();

    expect(sounds.playShuffleSound).toHaveBeenCalledTimes(1);
    expect(sounds.playCardFlickSound).not.toHaveBeenCalled();
  });

  test('preset buttons pass their arguments and read the sweep timing on each click', () => {
    const list = document.createElement('ul');
    const sounds = buildSoundModule();
    const readSettings = jest.fn()
      .mockReturnValueOnce({ sweepDurationMs: 600, isiMs: 600 })
      .mockReturnValue({ sweepDurationMs: 20, isiMs: 10 });
    renderSoundButtons(list, sounds, readSettings);
    const byLabel = (label) => Array.from(list.querySelectorAll('button'))
      .find((button) => button.textContent === label);

    byLabel('Sweeps: Up-Down').click();
    byLabel('Sweeps: Down-Down').click();
    byLabel('Feedback: failure').click();

    expect(sounds.playFeedbackSound).toHaveBeenCalledWith(false);
    expect(sounds.playSweepPair).toHaveBeenNthCalledWith(
      1,
      ['up', 'down'],
      { sweepDurationMs: 600, isiMs: 600 },
    );
    expect(sounds.playSweepPair).toHaveBeenNthCalledWith(
      2,
      ['down', 'down'],
      { sweepDurationMs: 20, isiMs: 10 },
    );
  });

  test('uses the default sweep timing without a settings reader', () => {
    const list = document.createElement('ul');
    const sounds = buildSoundModule();
    renderSoundButtons(list, sounds);

    Array.from(list.querySelectorAll('button'))
      .find((button) => button.textContent === 'Sweeps: Up-Up')
      .click();

    expect(sounds.playSweepPair).toHaveBeenCalledWith(['up', 'up'], DEFAULT_SWEEP_SETTINGS);
  });

  test('skips presets for sounds the module does not export', () => {
    const list = document.createElement('ul');
    renderSoundButtons(list, { playShuffleSound: () => {} });

    expect(list.querySelectorAll('button')).toHaveLength(1);
  });

  test('does nothing without a list element', () => {
    expect(() => renderSoundButtons(null, buildSoundModule())).not.toThrow();
  });
});
