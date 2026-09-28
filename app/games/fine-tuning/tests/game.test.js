/**
 * game.test.js — Unit tests for the Fine Tuning game logic module.
 *
 * @jest-environment node
 */
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals';

import {
  GAME_ID,
  CONTRAST_PAIRS,
  ANSWERS,
  TARGET_GAP_MS,
  VOICE_SETTINGS,
  DEFAULT_VOICE_SETTING,
  CORRECT_STREAK_TO_ADVANCE,
  WRONG_STREAK_TO_DROP,
  LEVEL_DROP,
  LEVELS,
  initGame,
  startGame,
  stopGame,
  buildTrial,
  pickTrial,
  generatePracticeTrial,
  formatAnswer,
  setVoiceSetting,
  getVoiceSetting,
  recordTrial,
  getCurrentLevel,
  getCurrentLevelConfig,
  getScore,
  getTrialsCompleted,
  getConsecutiveCorrect,
  getConsecutiveWrong,
  isRunning,
  getSpeedHistory,
} from '../game.js';
import { SYLLABLE_IDS, VOICE_IDS } from '../../../components/syllableService.js';
import manifest from '../manifest.json' with { type: 'json' };

/**
 * Make Math.random return each value in turn.
 *
 * @param {...number} values
 */
function mockRandom(...values) {
  const spy = jest.spyOn(Math, 'random');
  values.forEach((v) => spy.mockReturnValueOnce(v));
}

/** Level 1 and a cross-voice level, for building trials. */
const EASY = LEVELS[0];
const CROSS = LEVELS[LEVELS.length - 1];

beforeEach(() => {
  initGame();
  setVoiceSetting(DEFAULT_VOICE_SETTING);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Constants ─────────────────────────────────────────────────────────────────

describe('exported constants', () => {
  test('GAME_ID matches the manifest', () => {
    expect(GAME_ID).toBe(manifest.id);
    expect(GAME_ID).toBe('fine-tuning');
  });

  test('every contrast pair is two different syllables the service can play', () => {
    expect(CONTRAST_PAIRS).toHaveLength(10);
    CONTRAST_PAIRS.forEach(([a, b]) => {
      expect(a).not.toBe(b);
      expect(SYLLABLE_IDS).toContain(a);
      expect(SYLLABLE_IDS).toContain(b);
    });
  });

  test('ANSWERS lists first then second', () => {
    expect(ANSWERS).toEqual(['first', 'second']);
  });

  test('TARGET_GAP_MS is positive', () => {
    expect(TARGET_GAP_MS).toBeGreaterThan(0);
  });

  test('voice settings are the service voices plus mixed', () => {
    expect(VOICE_SETTINGS).toEqual([...VOICE_IDS, 'mixed']);
    expect(VOICE_SETTINGS).toContain(DEFAULT_VOICE_SETTING);
  });

  test('staircase constants are positive integers', () => {
    [CORRECT_STREAK_TO_ADVANCE, WRONG_STREAK_TO_DROP, LEVEL_DROP].forEach((n) => {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    });
    expect(LEVEL_DROP).toBeLessThan(LEVELS.length);
  });

  test('every level has valid fields', () => {
    expect(LEVELS).toHaveLength(14);
    LEVELS.forEach((level) => {
      expect(level.transitionMs).toBeGreaterThan(0);
      expect(level.isiMs).toBeGreaterThan(0);
      expect(level.snrDb === null || Number.isFinite(level.snrDb)).toBe(true);
      expect(typeof level.crossVoice).toBe('boolean');
      expect(Object.isFrozen(level)).toBe(true);
    });
  });

  test('levels only get harder', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      const prev = LEVELS[i - 1];
      const curr = LEVELS[i];
      expect(curr.transitionMs).toBeLessThanOrEqual(prev.transitionMs);
      expect(curr.isiMs).toBeLessThanOrEqual(prev.isiMs);
      if (prev.snrDb !== null) {
        expect(curr.snrDb).not.toBeNull();
        expect(curr.snrDb).toBeLessThanOrEqual(prev.snrDb);
      }
      if (prev.crossVoice) expect(curr.crossVoice).toBe(true);
    }
  });

  test('levels follow the three phases: clean, natural speed, then noise', () => {
    expect(LEVELS[0].snrDb).toBeNull();
    expect(LEVELS[0].transitionMs).toBeGreaterThan(40);
    expect(LEVELS.some((l) => l.transitionMs === 40 && l.snrDb === null)).toBe(true);
    expect(LEVELS[LEVELS.length - 1].snrDb).not.toBeNull();
    expect(LEVELS[0].crossVoice).toBe(false);
    expect(CROSS.crossVoice).toBe(true);
  });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('initGame / startGame / stopGame', () => {
  test('initGame resets session state', () => {
    startGame();
    recordTrial({ success: true });
    initGame();
    expect(isRunning()).toBe(false);
    expect(getScore()).toBe(0);
    expect(getTrialsCompleted()).toBe(0);
    expect(getCurrentLevel()).toBe(0);
    expect(getConsecutiveCorrect()).toBe(0);
    expect(getConsecutiveWrong()).toBe(0);
    expect(getSpeedHistory()).toEqual([]);
  });

  test('initGame keeps the voice setting', () => {
    setVoiceSetting('mixed');
    initGame();
    expect(getVoiceSetting()).toBe('mixed');
  });

  test('startGame sets running and throws if already running', () => {
    startGame();
    expect(isRunning()).toBe(true);
    expect(() => startGame()).toThrow('Game is already running.');
  });

  test('stopGame returns the result and throws when not running', () => {
    expect(() => stopGame()).toThrow('Game is not running.');
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(4500);
    startGame();
    recordTrial({ success: true });
    recordTrial({ success: false });
    expect(stopGame()).toEqual({ score: 1, level: 0, trialsCompleted: 2, duration: 3500 });
    expect(isRunning()).toBe(false);
  });
});

// ── Trials ────────────────────────────────────────────────────────────────────

describe('buildTrial', () => {
  test('puts the target first when the answer is first', () => {
    // Pair index 0 (ba–da), target ba, answer first, then voice (unused for lower).
    mockRandom(0, 0, 0);
    const trial = buildTrial(EASY, 'lower');
    expect(trial).toEqual({
      target: 'ba',
      choices: ['ba', 'da'],
      voices: ['lower', 'lower', 'lower'],
      answer: 'first',
      transitionMs: EASY.transitionMs,
      isiMs: EASY.isiMs,
      snrDb: EASY.snrDb,
    });
  });

  test('puts the target second when the answer is second', () => {
    // Last pair (di–ti), target ti, answer second.
    mockRandom(0.99, 0.99, 0.99);
    const trial = buildTrial(CROSS, 'higher');
    expect(trial.target).toBe('ti');
    expect(trial.choices).toEqual(['di', 'ti']);
    expect(trial.answer).toBe('second');
    expect(trial.voices).toEqual(['higher', 'higher', 'higher']);
    expect(trial.snrDb).toBe(CROSS.snrDb);
  });

  test('the matching choice is always the target and the other is its pair partner', () => {
    for (let i = 0; i < 50; i += 1) {
      const trial = buildTrial(EASY, 'lower');
      const matchIndex = ANSWERS.indexOf(trial.answer);
      expect(trial.choices[matchIndex]).toBe(trial.target);
      const pair = CONTRAST_PAIRS.find((p) => p.includes(trial.target)
        && p.includes(trial.choices[1 - matchIndex]));
      expect(pair).toBeDefined();
    }
  });

  test('mixed uses one random voice for all three when not cross-voice', () => {
    mockRandom(0, 0, 0, 0.9);
    expect(buildTrial(EASY, 'mixed').voices).toEqual(['higher', 'higher', 'higher']);
    mockRandom(0, 0, 0, 0.1);
    expect(buildTrial(EASY, 'mixed').voices).toEqual(['lower', 'lower', 'lower']);
  });

  test('mixed gives the choices the other voice at cross-voice levels', () => {
    mockRandom(0, 0, 0, 0.1);
    expect(buildTrial(CROSS, 'mixed').voices).toEqual(['lower', 'higher', 'higher']);
    mockRandom(0, 0, 0, 0.9);
    expect(buildTrial(CROSS, 'mixed').voices).toEqual(['higher', 'lower', 'lower']);
  });

  test('a single-voice setting ignores cross-voice levels', () => {
    expect(buildTrial(CROSS, 'lower').voices).toEqual(['lower', 'lower', 'lower']);
  });
});

describe('pickTrial / generatePracticeTrial', () => {
  test('pickTrial uses the current level and voice setting', () => {
    setVoiceSetting('higher');
    startGame();
    for (let i = 0; i < CORRECT_STREAK_TO_ADVANCE; i += 1) recordTrial({ success: true });
    const trial = pickTrial();
    expect(trial.transitionMs).toBe(LEVELS[1].transitionMs);
    expect(trial.voices).toEqual(['higher', 'higher', 'higher']);
  });

  test('generatePracticeTrial uses level 1 and changes no state', () => {
    setVoiceSetting('mixed');
    startGame();
    for (let i = 0; i < CORRECT_STREAK_TO_ADVANCE; i += 1) recordTrial({ success: true });
    const trial = generatePracticeTrial();
    expect(trial.transitionMs).toBe(EASY.transitionMs);
    expect(trial.snrDb).toBeNull();
    expect(new Set(trial.voices).size).toBe(1);
    expect(getCurrentLevel()).toBe(1);
    expect(getTrialsCompleted()).toBe(CORRECT_STREAK_TO_ADVANCE);
  });
});

describe('formatAnswer', () => {
  test('capitalizes the answer', () => {
    expect(formatAnswer('first')).toBe('First');
    expect(formatAnswer('second')).toBe('Second');
  });
});

describe('setVoiceSetting / getVoiceSetting', () => {
  test('defaults to the lower voice', () => {
    expect(getVoiceSetting()).toBe('lower');
  });

  test.each(VOICE_SETTINGS)('accepts %s', (setting) => {
    expect(setVoiceSetting(setting)).toBe(true);
    expect(getVoiceSetting()).toBe(setting);
  });

  test.each(['child', '', null, undefined, 3])('ignores %p', (setting) => {
    setVoiceSetting('higher');
    expect(setVoiceSetting(setting)).toBe(false);
    expect(getVoiceSetting()).toBe('higher');
  });
});

// ── Staircase ─────────────────────────────────────────────────────────────────

describe('recordTrial', () => {
  test('counts trials and correct answers', () => {
    recordTrial({ success: true });
    recordTrial({ success: false });
    recordTrial({ success: true });
    expect(getTrialsCompleted()).toBe(3);
    expect(getScore()).toBe(2);
  });

  test('advances one level after three correct in a row', () => {
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getConsecutiveCorrect()).toBe(2);
    const result = recordTrial({ success: true });
    expect(result).toEqual({ level: 1, consecutiveCorrect: 0, consecutiveWrong: 0 });
    expect(getCurrentLevelConfig()).toBe(LEVELS[1]);
  });

  test('drops two levels after three wrong in a row', () => {
    for (let i = 0; i < 9; i += 1) recordTrial({ success: true });
    expect(getCurrentLevel()).toBe(3);
    recordTrial({ success: false });
    recordTrial({ success: false });
    expect(getConsecutiveWrong()).toBe(2);
    recordTrial({ success: false });
    expect(getCurrentLevel()).toBe(1);
  });

  test('never goes below the first level or above the last', () => {
    for (let i = 0; i < 6; i += 1) recordTrial({ success: false });
    expect(getCurrentLevel()).toBe(0);
    for (let i = 0; i < LEVELS.length * 3 + 3; i += 1) recordTrial({ success: true });
    expect(getCurrentLevel()).toBe(LEVELS.length - 1);
  });

  test('records the transition length after each trial', () => {
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    expect(getSpeedHistory()).toEqual([
      LEVELS[0].transitionMs,
      LEVELS[0].transitionMs,
      LEVELS[1].transitionMs,
    ]);
  });

  test('getSpeedHistory returns a copy', () => {
    recordTrial({ success: true });
    getSpeedHistory().push(999);
    expect(getSpeedHistory()).toHaveLength(1);
  });
});
