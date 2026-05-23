/** @jest-environment jsdom */
/**
 * audioService.test.js - Unit tests for the central audio service.
 *
 * Covers all exported functions: getAudioContext, playSuccessSound,
 * playFailureSound, playFeedbackSound, playCardFlickSound, and playSweepPair.
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
  const createMockOscillator = () => ({
    connect: jest.fn(),
    type: '',
    frequency: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
    start: jest.fn(),
    stop: jest.fn(),
  });

  const createMockGain = () => ({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  });

  const createMockBufferSource = () => ({
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    buffer: null,
  });

  const createMockBiquadFilter = () => ({
    connect: jest.fn(),
    type: '',
    frequency: {
      setValueAtTime: jest.fn(),
    },
  });

  const mockCtx = {
    state,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createOscillator: jest.fn(() => createMockOscillator()),
    createGain: jest.fn(() => createMockGain()),
    createBuffer: jest.fn(() => ({ getChannelData: jest.fn(() => new Float32Array(1)) })),
    createBufferSource: jest.fn(() => createMockBufferSource()),
    createBiquadFilter: jest.fn(() => createMockBiquadFilter()),
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
  playCardFlickSound,
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

  test('handles resume rejection gracefully', async () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    mockCtx.resume = jest.fn().mockRejectedValue(new Error('cannot resume'));
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playCardFlickSound()).not.toThrow();
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

describe('playCardFlickSound', () => {
  test('plays without throwing when AudioContext is running', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    expect(() => playCardFlickSound()).not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('creates a noise buffer and buffer source for the swish layer', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playCardFlickSound();
    expect(mockCtx.createBuffer).toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
    expect(mockCtx.createBiquadFilter).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('configures the swish filter as a low-pass filter', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playCardFlickSound();
    const filter = mockCtx.createBiquadFilter.mock.results[0].value;
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.setValueAtTime).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('plays swish before snap and uses the shorter snap timing', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playCardFlickSound();
    const noiseSource = mockCtx.createBufferSource.mock.results[0].value;
    const snapOsc = mockCtx.createOscillator.mock.results[0].value;
    expect(noiseSource.start).toHaveBeenCalledWith(0);
    expect(snapOsc.start).toHaveBeenCalledWith(0.01);
    expect(snapOsc.stop).toHaveBeenCalledWith(0.035);

    globalThis.AudioContext = original;
  });

  test('uses half-loud peak gains for snap and swish', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playCardFlickSound();
    const swishGain = mockCtx.createGain.mock.results[0].value;
    const snapGain = mockCtx.createGain.mock.results[1].value;
    expect(swishGain.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(0.075, expect.any(Number));
    expect(snapGain.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(0.15, expect.any(Number));

    globalThis.AudioContext = original;
  });

  test('resumes a suspended context before playing', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('suspended');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playCardFlickSound();
    expect(mockCtx.resume).toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('does not throw when no AudioContext is available', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    delete globalThis.AudioContext;
    if (globalThis.window) delete globalThis.window.webkitAudioContext;

    expect(() => playCardFlickSound()).not.toThrow();

    globalThis.AudioContext = original;
  });

  test('swallows errors thrown during audio node setup', () => {
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const ThrowingCtx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      destination: {},
      createOscillator: jest.fn(() => { throw new Error('osc error'); }),
      createGain: jest.fn(),
      createBuffer: jest.fn(),
      createBufferSource: jest.fn(),
      createBiquadFilter: jest.fn(),
    };
    const original = globalThis.AudioContext;
    globalThis.AudioContext = jest.fn(() => ThrowingCtx);

    expect(() => playCardFlickSound()).not.toThrow();

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

  test('returns without scheduling when sequence array is not length 2', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up'], { sweepDurationMs: 200, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    playSweepPair([], { sweepDurationMs: 200, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('returns without scheduling when a direction is not "up" or "down"', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up', 'left'], { sweepDurationMs: 200, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    playSweepPair(['diagonal', 'down'], { sweepDurationMs: 200, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('returns without scheduling when sweepDurationMs is not a positive number', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up', 'down'], { sweepDurationMs: 0, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    playSweepPair(['up', 'down'], { sweepDurationMs: -100, isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    playSweepPair(['up', 'down'], { sweepDurationMs: 'fast', isiMs: 200 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('returns without scheduling when isiMs is negative', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    playSweepPair(['up', 'down'], { sweepDurationMs: 200, isiMs: -1 });
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    globalThis.AudioContext = original;
  });

  test('schedules sweeps correctly when sweepDurationMs is very short (clamped envelope)', () => {
    const { mockCtx, MockAC } = buildMockAudioContext('running');
    const existing = getAudioContext();
    if (existing) existing.state = 'closed';

    const original = globalThis.AudioContext;
    globalThis.AudioContext = MockAC;

    // 5 ms is shorter than SWEEP_ATTACK_S (15 ms) + SWEEP_RELEASE_S (15 ms);
    // the envelope clamping should still schedule without browser errors.
    expect(() => playSweepPair(['up', 'down'], { sweepDurationMs: 5, isiMs: 0 }))
      .not.toThrow();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);

    globalThis.AudioContext = original;
  });
});
