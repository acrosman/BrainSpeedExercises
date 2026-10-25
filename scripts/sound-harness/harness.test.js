/**
 * harness.test.js - Unit tests for the sound harness page script.
 */
import {
  jest,
  describe,
  test,
  expect,
} from '@jest/globals';

const { listSoundEffects, getSoundLabel, renderSoundButtons } = await import('./harness.js');

/**
 * Build a stand-in for audioService.js with sounds, a sound that needs arguments, and a helper.
 *
 * @returns {Record<string, unknown>}
 */
function buildSoundModule() {
  return {
    playShuffleSound: jest.fn(() => {}),
    playCardFlickSound: jest.fn(() => {}),
    playSweepPair: (sequence, options) => [sequence, options],
    getAudioContext: () => null,
    SWEEP_LOW_FREQ_HZ: 300,
  };
}

describe('listSoundEffects', () => {
  test('lists only play functions that take no arguments, sorted', () => {
    expect(listSoundEffects(buildSoundModule())).toEqual([
      'playCardFlickSound',
      'playShuffleSound',
    ]);
  });

  test('finds the shuffle sound in the real audio service', async () => {
    const audio = await import('../../app/components/audioService.js');
    expect(listSoundEffects(audio)).toContain('playShuffleSound');
  });
});

describe('getSoundLabel', () => {
  test('drops the play prefix and Sound suffix and splits the words', () => {
    expect(getSoundLabel('playCardFlickSound')).toBe('Card flick');
    expect(getSoundLabel('playShuffleSound')).toBe('Shuffle');
  });
});

describe('renderSoundButtons', () => {
  test('adds one button per sound that plays it when clicked', () => {
    const list = document.createElement('ul');
    const sounds = buildSoundModule();

    renderSoundButtons(list, sounds);

    const buttons = list.querySelectorAll('li > button');
    expect(Array.from(buttons, (button) => button.textContent)).toEqual(['Card flick', 'Shuffle']);
    buttons[1].click();
    expect(sounds.playShuffleSound).toHaveBeenCalledTimes(1);
    expect(sounds.playCardFlickSound).not.toHaveBeenCalled();
  });

  test('does nothing without a list element', () => {
    expect(() => renderSoundButtons(null, buildSoundModule())).not.toThrow();
  });
});
