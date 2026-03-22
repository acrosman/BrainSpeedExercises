/** @jest-environment jsdom */
/**
 * audio.test.js - Unit tests for Field of View audio feedback module.
 */
import {
  jest,
  describe,
  test,
  expect,
} from '@jest/globals';

/**
 * Build a complete mock AudioContext that satisfies all method calls in playFeedbackSound.
 *
 * @param {string} state - Initial context state ('running' | 'suspended' | 'closed').
 * @returns {{ mockCtx: object, MockAC: jest.Mock }}
 */
function buildMockAudioContext(state = 'running') {
  const mockOscillator = {
    connect: jest.fn(),
    type: '',
    frequency: { setValueAtTime: jest.fn() },
    start: jest.fn(),
    stop: jest.fn(),
    onended: null,
  };

  const mockGain = {
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  };

  const mockCtx = {
    state,
    currentTime: 0,
    destination: {},
    createOscillator: jest.fn(() => ({ ...mockOscillator })),
    createGain: jest.fn(() => ({ ...mockGain })),
    resume: jest.fn().mockResolvedValue(undefined),
  };

  const MockAC = jest.fn(() => mockCtx);
  return { mockCtx, MockAC };
}

// Import module once – ESM modules are singletons per test file.
const audioModule = await import('../audio.js');
const { getAudioContext, playFeedbackSound } = audioModule;

describe('getAudioContext', () => {
  test('returns an AudioContext when available', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    const ctx = getAudioContext();
    expect(ctx).toBe(mockCtx);

    globalThis.AudioContext = original;
  });

  test('returns cached context on repeated calls', () => {
    // After the previous test, _audioCtx is set; calling again should return the same object.
    const ctx1 = getAudioContext();
    const ctx2 = getAudioContext();
    expect(ctx1).toBe(ctx2);
  });

  test('handles constructor throwing by returning null', () => {
    // Force a fresh attempt by marking the cached ctx as 'closed'.
    const ctx = getAudioContext();
    if (ctx) ctx.state = 'closed';

    const ThrowingAC = jest.fn(() => { throw new Error('no audio hardware'); });
    const original = globalThis.AudioContext;
    globalThis.AudioContext = ThrowingAC;

    const result = getAudioContext();
    expect(result).toBeNull();

    globalThis.AudioContext = original;
  });
});

describe('playFeedbackSound', () => {
  test('plays success tone without throwing', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    // Reset module-level cache to force creating this mock ctx.
    const existingCtx = getAudioContext();
    if (existingCtx) existingCtx.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFeedbackSound(true)).not.toThrow();

    globalThis.AudioContext = original;
    void mockCtx;
  });

  test('plays failure tone without throwing', () => {
    expect(() => playFeedbackSound(false)).not.toThrow();
  });

  test('resumes suspended AudioContext before playing and handles rejection', async () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    // Use a rejecting resume to cover the catch handler.
    mockCtx.resume = jest.fn().mockRejectedValue(new Error('cannot resume'));

    const existingCtx = getAudioContext();
    if (existingCtx) existingCtx.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFeedbackSound(true)).not.toThrow();

    // Let the rejected promise settle (covers the catch handler).
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    globalThis.AudioContext = original;
    void mockCtx;
  });

  test('does not throw when no AudioContext is available', () => {
    const existingCtx = getAudioContext();
    if (existingCtx) existingCtx.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playFeedbackSound(true)).not.toThrow();
    expect(() => playFeedbackSound(false)).not.toThrow();

    globalThis.AudioContext = original;
  });
});
