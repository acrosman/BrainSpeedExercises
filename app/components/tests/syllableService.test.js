/** @jest-environment jsdom */
/**
 * syllableService.test.js - Unit tests for the synthesized syllable service.
 *
 * Covers SYLLABLE_IDS, VOICE_IDS, getSyllableSequenceDurationMs, and playSyllableSequence
 * against a mock AudioContext.
 */
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
} from '@jest/globals';

/**
 * Build a mock AudioParam that records scheduled values.
 *
 * @param {number} [value=0]
 * @returns {object}
 */
function createMockParam(value = 0) {
  return {
    value,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
  };
}

/**
 * Build a mock AudioContext that records every node it creates.
 *
 * @param {string} [state='running']
 * @returns {object}
 */
function buildMockContext(state = 'running') {
  const ctx = {
    state,
    currentTime: 10,
    sampleRate: 1000,
    destination: { name: 'destination' },
    oscillators: [],
    gains: [],
    filters: [],
    sources: [],
    resume: jest.fn().mockResolvedValue(undefined),
    createOscillator: jest.fn(() => {
      const node = {
        type: '',
        frequency: createMockParam(),
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };
      ctx.oscillators.push(node);
      return node;
    }),
    createGain: jest.fn(() => {
      const node = { gain: createMockParam(1), connect: jest.fn() };
      ctx.gains.push(node);
      return node;
    }),
    createBiquadFilter: jest.fn(() => {
      const node = {
        type: '',
        frequency: createMockParam(),
        Q: createMockParam(),
        connect: jest.fn(),
      };
      ctx.filters.push(node);
      return node;
    }),
    createBufferSource: jest.fn(() => {
      const node = {
        buffer: null,
        loop: false,
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };
      ctx.sources.push(node);
      return node;
    }),
    createBuffer: jest.fn((channels, length) => {
      const data = new Float32Array(length);
      return { getChannelData: jest.fn(() => data) };
    }),
  };
  return ctx;
}

/** @type {object|null} Context the mocked getAudioContext returns. */
let mockCtx = null;

jest.unstable_mockModule('../audioService.js', () => ({
  getAudioContext: jest.fn(() => mockCtx),
}));

const {
  SYLLABLE_IDS,
  VOICE_IDS,
  getSyllableSequenceDurationMs,
  playSyllableSequence,
} = await import('../syllableService.js');

/** A valid three-syllable request, as a target-match trial plays it. */
const TRIAL = Object.freeze({
  syllables: ['ba', 'da', 'ba'],
  voices: ['lower', 'lower', 'lower'],
  gapsMs: [600, 200],
  transitionMs: 40,
  snrDb: null,
});

/**
 * The formant filters of the first syllable: the first three biquads created.
 *
 * @returns {object[]}
 */
function firstSyllableFormants() {
  return mockCtx.filters.slice(0, 3);
}

/**
 * Final value each formant filter ramps to.
 *
 * @param {object[]} filters
 * @returns {number[]}
 */
function rampTargets(filters) {
  return filters.map((f) => f.frequency.linearRampToValueAtTime.mock.calls[0][0]);
}

beforeEach(() => {
  mockCtx = buildMockContext();
});

describe('exported IDs', () => {
  test('lists the ten syllables and two voices', () => {
    expect(SYLLABLE_IDS).toEqual(['ba', 'da', 'ga', 'pa', 'ta', 'bi', 'di', 'gi', 'pi', 'ti']);
    expect(VOICE_IDS).toEqual(['lower', 'higher']);
    expect(Object.isFrozen(SYLLABLE_IDS)).toBe(true);
    expect(Object.isFrozen(VOICE_IDS)).toBe(true);
  });
});

describe('getSyllableSequenceDurationMs', () => {
  test('adds the lead, the syllables, the gaps, and the tail', () => {
    // Lead 250 + 3 × (5 + 40 + 150 + 30) + 600 + 200 + tail 150.
    expect(getSyllableSequenceDurationMs(TRIAL)).toBe(250 + 3 * 225 + 800 + 150);
  });

  test('longer transitions lengthen every syllable', () => {
    const short = getSyllableSequenceDurationMs(TRIAL);
    const long = getSyllableSequenceDurationMs({ ...TRIAL, transitionMs: 100 });
    expect(long - short).toBe(3 * 60);
  });

  test('handles a single syllable with no gaps', () => {
    expect(getSyllableSequenceDurationMs({ syllables: ['pa'], gapsMs: [], transitionMs: 40 }))
      .toBe(250 + 225 + 150);
  });

  test.each([
    ['no syllables', { syllables: [], gapsMs: [], transitionMs: 40 }],
    ['syllables not an array', { syllables: 'ba', gapsMs: [], transitionMs: 40 }],
    ['an unknown syllable', { syllables: ['ka'], gapsMs: [], transitionMs: 40 }],
    ['an inherited property name', { syllables: ['toString'], gapsMs: [], transitionMs: 40 }],
    ['gaps not an array', { syllables: ['ba'], gapsMs: null, transitionMs: 40 }],
    ['too many gaps', { syllables: ['ba'], gapsMs: [10], transitionMs: 40 }],
    ['a negative gap', { syllables: ['ba', 'da'], gapsMs: [-1], transitionMs: 40 }],
    ['a non-numeric gap', { syllables: ['ba', 'da'], gapsMs: ['1'], transitionMs: 40 }],
    ['a zero transition', { syllables: ['ba'], gapsMs: [], transitionMs: 0 }],
    ['a non-numeric transition', { syllables: ['ba'], gapsMs: [], transitionMs: '40' }],
  ])('returns 0 for %s', (_, options) => {
    expect(getSyllableSequenceDurationMs(options)).toBe(0);
  });
});

describe('playSyllableSequence: validation', () => {
  test.each([
    ['bad timing', { ...TRIAL, gapsMs: [600] }],
    ['voices not an array', { ...TRIAL, voices: 'lower' }],
    ['too few voices', { ...TRIAL, voices: ['lower'] }],
    ['an unknown voice', { ...TRIAL, voices: ['lower', 'lower', 'child'] }],
    ['a non-numeric SNR', { ...TRIAL, snrDb: '5' }],
  ])('schedules nothing for %s', (_, options) => {
    const stop = playSyllableSequence(options);
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
    expect(mockCtx.createGain).not.toHaveBeenCalled();
  });

  test('schedules nothing without Web Audio', () => {
    mockCtx = null;
    const stop = playSyllableSequence(TRIAL);
    expect(() => stop()).not.toThrow();
  });

  test('treats a missing SNR as no noise', () => {
    const { snrDb, ...withoutSnr } = TRIAL;
    expect(snrDb).toBeNull();
    playSyllableSequence(withoutSnr);
    expect(mockCtx.sources.some((s) => s.loop)).toBe(false);
  });
});

describe('playSyllableSequence: graph', () => {
  test('connects a master bus to the destination and a speech bus to the master', () => {
    playSyllableSequence(TRIAL);
    const [master, speech] = mockCtx.gains;
    expect(master.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(speech.connect).toHaveBeenCalledWith(master);
  });

  test('builds one voice and one noise source per syllable', () => {
    playSyllableSequence(TRIAL);
    expect(mockCtx.oscillators).toHaveLength(3);
    expect(mockCtx.sources).toHaveLength(3);
    mockCtx.oscillators.forEach((osc) => expect(osc.type).toBe('sawtooth'));
    // Three formant filters and a burst filter per syllable.
    expect(mockCtx.filters).toHaveLength(12);
  });

  test('a voiceless syllable adds an aspiration gain that feeds only F2 and F3', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['ba'], voices: ['lower'], gapsMs: [] });
    const voicedGains = mockCtx.gains.length;

    mockCtx = buildMockContext();
    playSyllableSequence({ ...TRIAL, syllables: ['pa'], voices: ['lower'], gapsMs: [] });
    expect(mockCtx.gains).toHaveLength(voicedGains + 1);

    const aspiration = mockCtx.gains[mockCtx.gains.length - 1];
    const [f1, f2, f3] = firstSyllableFormants();
    expect(aspiration.connect).toHaveBeenCalledWith(f2);
    expect(aspiration.connect).toHaveBeenCalledWith(f3);
    expect(aspiration.connect).not.toHaveBeenCalledWith(f1);
  });

  test('voicing starts later for a voiceless syllable', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['ba', 'pa'], voices: ['lower', 'lower'],
      gapsMs: [0] });
    const [voiced, voiceless] = mockCtx.oscillators;
    const [voicedSource, voicelessSource] = mockCtx.sources;
    const voicedVot = voiced.start.mock.calls[0][0] - voicedSource.start.mock.calls[0][0];
    const voicelessVot = voiceless.start.mock.calls[0][0]
      - voicelessSource.start.mock.calls[0][0];
    expect(voicedVot).toBeCloseTo(0.01);
    expect(voicelessVot).toBeCloseTo(0.05);
  });

  test('aspiration fades out just after voicing starts', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['ta'], voices: ['lower'], gapsMs: [] });
    const aspiration = mockCtx.gains[mockCtx.gains.length - 1];
    const ramps = aspiration.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[ramps.length - 1][0]).toBe(0);
    const voiceOnset = mockCtx.oscillators[0].start.mock.calls[0][0];
    expect(ramps[ramps.length - 1][1]).toBeCloseTo(voiceOnset + 0.01);
    expect(mockCtx.sources[0].stop.mock.calls[0][0]).toBeCloseTo(voiceOnset + 0.01);
  });

  test('each place has its own burst, and /g/ has the longest, most compact one', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['ba', 'da', 'ga'] });
    const bursts = [3, 7, 11].map((i) => mockCtx.filters[i]);
    const [labialQ, alveolarQ, velarQ] = bursts.map((f) => f.Q.setValueAtTime.mock.calls[0][0]);
    expect(velarQ).toBeGreaterThan(alveolarQ);
    expect(alveolarQ).toBeGreaterThan(labialQ);

    const [ba, da, ga] = mockCtx.sources.map(
      (s) => s.stop.mock.calls[0][0] - s.start.mock.calls[0][0],
    );
    expect(ga).toBeCloseTo(0.015);
    expect(ba).toBeCloseTo(0.005);
    expect(da).toBeCloseTo(0.006);
  });

  test('a voiceless burst is louder than its voiced partner', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['da', 'ta'], voices: ['lower', 'lower'],
      gapsMs: [0] });
    // Each syllable creates four filters; the fourth is the burst filter, which feeds the
    // burst gain.
    const burstPeaks = [3, 7].map((i) => {
      const burstGain = mockCtx.filters[i].connect.mock.calls[0][0];
      return burstGain.gain.linearRampToValueAtTime.mock.calls[0][0];
    });
    expect(burstPeaks).toHaveLength(2);
    expect(burstPeaks[1]).toBeCloseTo(burstPeaks[0] * 1.4);
  });

  test('syllables start after the lead and the gaps', () => {
    playSyllableSequence(TRIAL);
    const starts = mockCtx.sources.map((s) => s.start.mock.calls[0][0]);
    expect(starts[0]).toBeCloseTo(10.25);
    expect(starts[1]).toBeCloseTo(10.25 + 0.225 + 0.6);
    expect(starts[2]).toBeCloseTo(10.25 + 2 * 0.225 + 0.8);
  });

  test('formants glide from the consonant onsets to the vowel over the transition', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['da'], voices: ['lower'], gapsMs: [] });
    const formants = firstSyllableFormants();
    formants.forEach((f) => expect(f.type).toBe('bandpass'));
    expect(formants.map((f) => f.frequency.setValueAtTime.mock.calls[0][0]))
      .toEqual([200, 1700, 2800]);
    expect(rampTargets(formants)).toEqual([700, 1220, 2600]);
    const rampEnd = formants[0].frequency.linearRampToValueAtTime.mock.calls[0][1];
    expect(rampEnd).toBeCloseTo(10.25 + 0.005 + 0.04);
  });

  test('the /i/ vowel uses its own formants and onsets', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['gi'], voices: ['lower'], gapsMs: [] });
    const formants = firstSyllableFormants();
    expect(formants.map((f) => f.frequency.setValueAtTime.mock.calls[0][0]))
      .toEqual([200, 2800, 2900]);
    expect(rampTargets(formants)).toEqual([270, 2300, 3000]);
  });

  test('the higher voice raises F0 and scales every formant', () => {
    playSyllableSequence({ ...TRIAL, syllables: ['ba', 'ba'], voices: ['lower', 'higher'],
      gapsMs: [0] });
    const [lower, higher] = mockCtx.oscillators;
    expect(lower.frequency.setValueAtTime.mock.calls[0][0]).toBe(125);
    expect(lower.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBe(100);
    expect(higher.frequency.setValueAtTime.mock.calls[0][0]).toBe(220);
    expect(higher.frequency.linearRampToValueAtTime.mock.calls[0][0]).toBe(185);

    const lowerTargets = rampTargets(mockCtx.filters.slice(0, 3));
    const higherTargets = rampTargets(mockCtx.filters.slice(4, 7));
    higherTargets.forEach((hz, i) => expect(hz).toBeCloseTo(lowerTargets[i] * 1.17));
    const lowerBurst = mockCtx.filters[3].frequency.setValueAtTime.mock.calls[0][0];
    const higherBurst = mockCtx.filters[7].frequency.setValueAtTime.mock.calls[0][0];
    expect(higherBurst).toBeCloseTo(lowerBurst * 1.17);
  });

  test('builds the noise buffer once and reuses it', () => {
    playSyllableSequence(TRIAL);
    playSyllableSequence(TRIAL);
    expect(mockCtx.createBuffer).toHaveBeenCalledTimes(1);
    const buffers = new Set(mockCtx.sources.map((s) => s.buffer));
    expect(buffers.size).toBe(1);
  });

  test('rebuilds the noise buffer for a new context', () => {
    playSyllableSequence(TRIAL);
    mockCtx = buildMockContext();
    playSyllableSequence(TRIAL);
    expect(mockCtx.createBuffer).toHaveBeenCalledTimes(1);
  });

  test('resumes a suspended context and ignores a failed resume', () => {
    mockCtx = buildMockContext('suspended');
    mockCtx.resume.mockRejectedValue(new Error('no'));
    playSyllableSequence(TRIAL);
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  test('swallows audio errors and returns a harmless stop', () => {
    mockCtx.createOscillator = jest.fn(() => { throw new Error('boom'); });
    let stop;
    expect(() => { stop = playSyllableSequence(TRIAL); }).not.toThrow();
    expect(() => stop()).not.toThrow();
  });
});

describe('playSyllableSequence: background noise', () => {
  /**
   * Find the looping noise-bed source and its gain node.
   *
   * @returns {{ source: object, gain: object }}
   */
  function findNoiseBed() {
    const source = mockCtx.sources.find((s) => s.loop);
    const gain = mockCtx.gains[mockCtx.gains.length - 1];
    return { source, gain };
  }

  /**
   * Peak gain the noise bed ramps to.
   *
   * @returns {number}
   */
  function noisePeak() {
    return findNoiseBed().gain.gain.linearRampToValueAtTime.mock.calls[0][0];
  }

  test('adds no noise bed when the SNR is null', () => {
    playSyllableSequence(TRIAL);
    expect(mockCtx.sources.some((s) => s.loop)).toBe(false);
  });

  test('plays looping brown noise, unfiltered, across the whole sequence', () => {
    playSyllableSequence({ ...TRIAL, snrDb: 10 });
    const { source, gain } = findNoiseBed();
    expect(source).toBeDefined();
    expect(mockCtx.filters.some((f) => f.type === 'lowpass')).toBe(false);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(source.start).toHaveBeenCalledWith(10);
    const totalS = getSyllableSequenceDurationMs(TRIAL) / 1000;
    expect(source.stop.mock.calls[0][0]).toBeCloseTo(10 + totalS);
    expect(gain.connect).toHaveBeenCalledWith(mockCtx.gains[0]);
  });

  test('the background uses its own buffer, not the white noise of the bursts', () => {
    playSyllableSequence({ ...TRIAL, snrDb: 10 });
    const burstBuffer = mockCtx.sources[0].buffer;
    const { source } = findNoiseBed();
    expect(source.buffer).not.toBe(burstBuffer);
    expect(mockCtx.createBuffer).toHaveBeenCalledTimes(2);

    // Both buffers are cached.
    playSyllableSequence({ ...TRIAL, snrDb: 10 });
    expect(mockCtx.createBuffer).toHaveBeenCalledTimes(2);
  });

  describe('brown noise', () => {
    /**
     * Samples of the background noise buffer.
     *
     * @returns {Float32Array}
     */
    function brownSamples() {
      playSyllableSequence({ ...TRIAL, snrDb: 10 });
      return findNoiseBed().source.buffer.getChannelData(0);
    }

    /**
     * Mean absolute difference between neighboring samples.
     *
     * @param {Float32Array} data
     * @returns {number}
     */
    function meanStep(data) {
      let sum = 0;
      for (let i = 1; i < data.length; i += 1) sum += Math.abs(data[i] - data[i - 1]);
      return sum / (data.length - 1);
    }

    test('is scaled to the calibrated RMS level', () => {
      const data = brownSamples();
      const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
      expect(rms).toBeCloseTo(0.18, 5);
    });

    test('changes slowly from sample to sample, unlike white noise', () => {
      const data = brownSamples();
      // White noise at the same RMS would move about 0.2 between samples.
      expect(meanStep(data)).toBeLessThan(0.1);
    });

    test('loops without a jump from the last sample to the first', () => {
      const data = brownSamples();
      const seam = Math.abs(data[0] - data[data.length - 1]);
      expect(seam).toBeLessThan(meanStep(data) * 5);
    });

    test('a silent walk is left silent', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const data = brownSamples();
      jest.restoreAllMocks();
      expect(data.every((v) => v === 0)).toBe(true);
    });
  });

  test('a lower SNR plays louder noise', () => {
    playSyllableSequence({ ...TRIAL, snrDb: 20 });
    const quiet = noisePeak();
    mockCtx = buildMockContext();
    playSyllableSequence({ ...TRIAL, snrDb: 5 });
    expect(noisePeak()).toBeGreaterThan(quiet);
    expect(noisePeak() / quiet).toBeCloseTo(10 ** (15 / 20));
  });

  test('fades the noise in and out over 150 ms', () => {
    playSyllableSequence({ ...TRIAL, snrDb: 10 });
    const { gain } = findNoiseBed();
    const ramps = gain.gain.linearRampToValueAtTime.mock.calls;
    expect(ramps[0][1]).toBeCloseTo(10.15);
    const totalS = getSyllableSequenceDurationMs(TRIAL) / 1000;
    const holds = gain.gain.setValueAtTime.mock.calls;
    expect(holds[1][1]).toBeCloseTo(10 + totalS - 0.15);
    // The noise is at full level before the first syllable starts, 250 ms in.
    expect(ramps[0][1]).toBeLessThan(10.25);
  });

  test('caps the noise gain', () => {
    playSyllableSequence({ ...TRIAL, snrDb: -40 });
    expect(noisePeak()).toBe(0.5);
  });
});

describe('playSyllableSequence: stop', () => {
  test('fades the master bus out and stops every source', () => {
    const stop = playSyllableSequence({ ...TRIAL, snrDb: 0 });
    mockCtx.currentTime = 11;
    stop();
    const master = mockCtx.gains[0];
    expect(master.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 11.02);
    expect(mockCtx.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
    expect(mockCtx.sources.every((s) => s.stop.mock.calls.length === 2)).toBe(true);
  });

  test('does nothing the second time', () => {
    const stop = playSyllableSequence(TRIAL);
    stop();
    stop();
    expect(mockCtx.gains[0].gain.cancelScheduledValues).toHaveBeenCalledTimes(1);
  });

  test('swallows audio errors', () => {
    const stop = playSyllableSequence(TRIAL);
    mockCtx.gains[0].gain.cancelScheduledValues.mockImplementation(() => {
      throw new Error('closed');
    });
    expect(() => stop()).not.toThrow();
  });
});
