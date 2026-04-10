/** @jest-environment jsdom */
/**
 * audioService.test.js - Unit tests for the central audio service.
 *
 * Covers all exported functions: getAudioContext, playSuccessSound,
 * playFailureSound, playFeedbackSound, and playSweepPair.
 */
import {
  jest,
  describe,
  test,
  expect,
} from '@jest/globals';

/**
 * Build a complete mock AudioContext that satisfies all method calls made
 * by playSuccessSound, playFailureSound, and playSweepPair.
 *
 * @param {string} state - Initial context state ('running' | 'suspended' | 'closed').
 * @returns {{ mockCtx: object, MockAC: jest.Mock }}
 */
function buildMockAudioContext(state = 'running') {
  const mockOscillator = {
    connect: jest.fn(),
    type: '',
    frequency: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    },
    start: jest.fn(),
    stop: jest.fn(),
  };

  const mockGain = {
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
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

// Import module once — ESM modules are singletons per test file.
const audioModule = await import('../audioService.js');
const {
  getAudioContext,
  playSuccessSound,
  playFailureSound,
  playFeedbackSound,
  playSweepPair,
  SWEEP_LOW_FREQ_HZ,
  SWEEP_HIGH_FREQ_HZ,
} = audioModule;

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
    const ctx1 = getAudioContext();
    const ctx2 = getAudioContext();
    expect(ctx1).toBe(ctx2);
  });

  test('falls back to window.webkitAudioContext when AudioContext is absent', () => {
    const ctx = getAudioContext();
    if (ctx) ctx.state = 'closed';

    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const originalAC = globalThis.AudioContext;
    delete globalThis.AudioContext;
    globalThis.window = globalThis.window || {};
    const originalWebkit = globalThis.window.webkitAudioContext;
    globalThis.window.webkitAudioContext = MockAC;

    const result = getAudioContext();
    expect(result).toBe(mockCtx);

    globalThis.AudioContext = originalAC;
    globalThis.window.webkitAudioContext = originalWebkit;
  });

  test('returns null when no AudioContext implementation is available', () => {
    const ctx = getAudioContext();
    if (ctx) ctx.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    const originalWebkit = globalThis.window && globalThis.window.webkitAudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    const result = getAudioContext();
    expect(result).toBeNull();

    globalThis.AudioContext = original;
    if (globalThis.window && originalWebkit !== undefined) {
      globalThis.window.webkitAudioContext = originalWebkit;
    }
  });

  test('returns null when the AudioContext constructor throws', () => {
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

describe('playSuccessSound', () => {
  test('plays without throwing when AudioContext is running', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playSuccessSound()).not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('resumes a suspended context before playing', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSuccessSound();
    expect(mockCtx.resume).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('handles resume rejection gracefully', async () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    mockCtx.resume = jest.fn().mockRejectedValue(new Error('cannot resume'));
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playSuccessSound()).not.toThrow();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    globalThis.AudioContext = original;
  });

  test('does not throw when no AudioContext is available', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playSuccessSound()).not.toThrow();

    globalThis.AudioContext = original;
  });

  test('swallows errors thrown during tone setup', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const ThrowingCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: jest.fn(() => { throw new Error('osc error'); }),
      createGain: jest.fn(),
    };
    const original = globalThis.AudioContext;
    globalThis.AudioContext = jest.fn(() => ThrowingCtx);

    expect(() => playSuccessSound()).not.toThrow();

    globalThis.AudioContext = original;
  });
});

describe('playFailureSound', () => {
  test('plays without throwing when AudioContext is running', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFailureSound()).not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('resumes a suspended context before playing', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playFailureSound();
    expect(mockCtx.resume).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('handles resume rejection gracefully', async () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    mockCtx.resume = jest.fn().mockRejectedValue(new Error('cannot resume'));
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFailureSound()).not.toThrow();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    globalThis.AudioContext = original;
  });

  test('does not throw when no AudioContext is available', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playFailureSound()).not.toThrow();

    globalThis.AudioContext = original;
  });

  test('swallows errors thrown during tone setup', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const ThrowingCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: jest.fn(() => { throw new Error('osc error'); }),
      createGain: jest.fn(),
    };
    const original = globalThis.AudioContext;
    globalThis.AudioContext = jest.fn(() => ThrowingCtx);

    expect(() => playFailureSound()).not.toThrow();

    globalThis.AudioContext = original;
  });
});

describe('playFeedbackSound', () => {
  test('delegates to playSuccessSound when isSuccess is true', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFeedbackSound(true)).not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('delegates to playFailureSound when isSuccess is false', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playFeedbackSound(false)).not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('does not throw when no AudioContext is available', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playFeedbackSound(true)).not.toThrow();
    expect(() => playFeedbackSound(false)).not.toThrow();

    globalThis.AudioContext = original;
  });
});

describe('playSweepPair', () => {
  test('exported frequency constants are positive numbers', () => {
    expect(typeof SWEEP_LOW_FREQ_HZ).toBe('number');
    expect(typeof SWEEP_HIGH_FREQ_HZ).toBe('number');
    expect(SWEEP_LOW_FREQ_HZ).toBeGreaterThan(0);
    expect(SWEEP_HIGH_FREQ_HZ).toBeGreaterThan(SWEEP_LOW_FREQ_HZ);
  });

  test('schedules two oscillators when AudioContext is running', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playSweepPair(['up', 'down'], { sweepDurationMs: 200, isiMs: 200 }))
      .not.toThrow();
    // One oscillator per sweep → 2 total
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);

    globalThis.AudioContext = original;
  });

  test('resumes a suspended context before scheduling', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up', 'up'], { sweepDurationMs: 100, isiMs: 100 });
    expect(mockCtx.resume).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('handles resume rejection gracefully', async () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    mockCtx.resume = jest.fn().mockRejectedValue(new Error('cannot resume'));
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playSweepPair(['down', 'up'], { sweepDurationMs: 150, isiMs: 150 }))
      .not.toThrow();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    globalThis.AudioContext = original;
  });

  test('does not throw when no AudioContext is available', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playSweepPair(['up', 'down'], { sweepDurationMs: 200, isiMs: 200 }))
      .not.toThrow();

    globalThis.AudioContext = original;
  });

  test('swallows errors thrown during oscillator setup', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const ThrowingCtx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: jest.fn(() => { throw new Error('osc error'); }),
      createGain: jest.fn(),
    };
    const original = globalThis.AudioContext;
    globalThis.AudioContext = jest.fn(() => ThrowingCtx);

    expect(() => playSweepPair(['up', 'down'], { sweepDurationMs: 200, isiMs: 200 }))
      .not.toThrow();

    globalThis.AudioContext = original;
  });

  test('up sweep ramps frequency from low to high', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up', 'down'], { sweepDurationMs: 200, isiMs: 200 });

    // First oscillator created is the 'up' sweep.
    const firstOscCall = mockCtx.createOscillator.mock.results[0].value;
    expect(firstOscCall.frequency.setValueAtTime)
      .toHaveBeenCalledWith(SWEEP_LOW_FREQ_HZ, expect.any(Number));
    expect(firstOscCall.frequency.linearRampToValueAtTime)
      .toHaveBeenCalledWith(SWEEP_HIGH_FREQ_HZ, expect.any(Number));

    globalThis.AudioContext = original;
  });

  test('down sweep ramps frequency from high to low', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['down', 'up'], { sweepDurationMs: 200, isiMs: 200 });

    // First oscillator created is the 'down' sweep.
    const firstOscCall = mockCtx.createOscillator.mock.results[0].value;
    expect(firstOscCall.frequency.setValueAtTime)
      .toHaveBeenCalledWith(SWEEP_HIGH_FREQ_HZ, expect.any(Number));
    expect(firstOscCall.frequency.linearRampToValueAtTime)
      .toHaveBeenCalledWith(SWEEP_LOW_FREQ_HZ, expect.any(Number));

    globalThis.AudioContext = original;
  });
});
