/** @jest-environment node */
import {
  START_SOA_MS,
  MIN_SOA_MS,
  MAX_SOA_MS,
  DEFAULT_STEP_UP_MS,
  DEFAULT_STEP_DOWN_MS,
  DEFAULT_ACCURACY_BUFFER_SIZE,
  DEFAULT_DOWN_AFTER_SUCCESSES,
  GRID_SIZES,
  CENTRAL_TARGET_SET,
  PERIPHERAL_TARGET_SET,
  MASK_SPEC,
  initGame,
  startGame,
  stopGame,
  getGridSizeForCurrentSoa,
  createTrialLayout,
  recordTrial,
  getCurrentSoaMs,
  getRecentAccuracy,
  getAccuracyBuffer,
  getThresholdHistory,
  getDownAfterSuccesses,
  isRunning,
  getTrialsCompleted,
  getSuccessCount,
} from '../game.js';

beforeEach(() => {
  initGame();
});

describe('asset specs', () => {
  test('defines kitten, toy, and field-mask specs', () => {
    expect(Array.isArray(CENTRAL_TARGET_SET)).toBe(true);
    expect(CENTRAL_TARGET_SET.length).toBe(2);
    expect(CENTRAL_TARGET_SET[0].file).toBe('primaryKitten.png');
    expect(CENTRAL_TARGET_SET[1].file).toBe('secondaryKitten.png');
    expect(PERIPHERAL_TARGET_SET.length).toBe(2);
    expect(PERIPHERAL_TARGET_SET[0].file).toBe('toy1.png');
    expect(PERIPHERAL_TARGET_SET[1].file).toBe('toy2.png');
    expect(MASK_SPEC.file).toBe('Field.png');
  });

  test('defines allowed grid sizes', () => {
    expect(GRID_SIZES).toEqual([3, 5]);
  });
});

describe('initGame', () => {
  test('defaults to 1-up / 2-down when not configured', () => {
    expect(getDownAfterSuccesses()).toBe(DEFAULT_DOWN_AFTER_SUCCESSES);
  });

  test('resets SOA, running state, and counters', () => {
    startGame();
    recordTrial({ success: false });
    initGame();

    expect(isRunning()).toBe(false);
    expect(getCurrentSoaMs()).toBe(START_SOA_MS);
    expect(getTrialsCompleted()).toBe(0);
    expect(getSuccessCount()).toBe(0);
    expect(getAccuracyBuffer()).toEqual([]);
  });

  test('supports 1-up / 3-down mode when configured', () => {
    initGame({ downAfterSuccesses: 3 });
    expect(getDownAfterSuccesses()).toBe(3);
  });

  test('clamps accuracy buffer size to 3..5', () => {
    initGame({ accuracyBufferSize: 99 });
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });
    recordTrial({ success: true });

    expect(getAccuracyBuffer().length).toBe(5);

    initGame({ accuracyBufferSize: 1 });
    recordTrial({ success: true });
    recordTrial({ success: false });
    recordTrial({ success: true });
    recordTrial({ success: false });

    expect(getAccuracyBuffer().length).toBe(3);
  });
});

describe('startGame and stopGame', () => {
  test('startGame sets running true', () => {
    startGame();
    expect(isRunning()).toBe(true);
  });

  test('startGame throws if already running', () => {
    startGame();
    expect(() => startGame()).toThrow('already running');
  });

  test('stopGame returns threshold-oriented result and sets running false', () => {
    startGame();
    const result = stopGame();

    expect(isRunning()).toBe(false);
    expect(result).toMatchObject({
      score: START_SOA_MS,
      thresholdMs: START_SOA_MS,
      trialsCompleted: 0,
      recentAccuracy: 0,
    });
    expect(typeof result.duration).toBe('number');
  });

  test('stopGame throws if game is not running', () => {
    expect(() => stopGame()).toThrow('not running');
  });
});

describe('getGridSizeForCurrentSoa', () => {
  test('returns 3 at starting SOA', () => {
    expect(getGridSizeForCurrentSoa()).toBe(3);
  });

  test('returns 5 when SOA is reduced to 120ms or lower', () => {
    // Two-success chunks reduce SOA by one step each.
    for (let i = 0; i < 10; i += 1) {
      recordTrial({ success: true });
      recordTrial({ success: true });
    }

    expect(getCurrentSoaMs()).toBeLessThanOrEqual(120);
    expect(getGridSizeForCurrentSoa()).toBe(5);
  });
});

describe('createTrialLayout', () => {
  test('creates a complete square grid layout', () => {
    const layout = createTrialLayout();
    const expectedCells = layout.gridSize * layout.gridSize;

    expect(layout.cells.length).toBe(expectedCells);
    expect(layout.centerIndex).toBe(Math.floor(expectedCells / 2));
  });

  test('includes exactly one peripheral target and one center cell', () => {
    const layout = createTrialLayout();
    const centerCount = layout.cells.filter((c) => c.role === 'center').length;
    const peripheralCount = layout.cells.filter(
      (c) => c.role === 'peripheral-target',
    ).length;

    expect(centerCount).toBe(1);
    expect(peripheralCount).toBe(1);
    expect(layout.peripheralIndex).not.toBe(layout.centerIndex);

    const row = Math.floor(layout.peripheralIndex / layout.gridSize);
    const col = layout.peripheralIndex % layout.gridSize;
    const max = layout.gridSize - 1;
    expect(row === 0 || row === max || col === 0 || col === max).toBe(true);
  });

  test('uses only declared icon sets', () => {
    const layout = createTrialLayout();

    const centerFiles = CENTRAL_TARGET_SET.map((i) => i.file);
    const toyFiles = PERIPHERAL_TARGET_SET.map((i) => i.file);

    expect(centerFiles).toContain(layout.centerIcon.file);
    expect(toyFiles).toContain(layout.peripheralIcon.file);

    layout.cells.forEach((cell) => {
      if (cell.role === 'center') {
        expect(centerFiles).toContain(cell.icon.file);
      }
      if (cell.role === 'peripheral-target') {
        expect(toyFiles).toContain(cell.icon.file);
      }
      if (cell.role === 'empty') {
        expect(cell.icon).toBeNull();
      }
    });
  });
});

describe('recordTrial staircase behavior', () => {
  test('in 1-up / 2-down mode, two successes step down once', () => {
    recordTrial({ success: true });
    expect(getCurrentSoaMs()).toBe(START_SOA_MS);

    recordTrial({ success: true });
    expect(getCurrentSoaMs()).toBe(Number((START_SOA_MS - DEFAULT_STEP_DOWN_MS).toFixed(2)));
  });

  test('failure immediately steps SOA up and resets success streak', () => {
    recordTrial({ success: true });
    recordTrial({ success: false });

    expect(getCurrentSoaMs()).toBe(Number((START_SOA_MS + DEFAULT_STEP_UP_MS).toFixed(2)));

    // A single success should not step down because streak was reset.
    recordTrial({ success: true });
    expect(getCurrentSoaMs()).toBe(Number((START_SOA_MS + DEFAULT_STEP_UP_MS).toFixed(2)));
  });

  test('respects SOA floor and ceiling clamps', () => {
    for (let i = 0; i < 200; i += 1) {
      recordTrial({ success: true });
      recordTrial({ success: true });
    }
    expect(getCurrentSoaMs()).toBe(MIN_SOA_MS);

    for (let i = 0; i < 200; i += 1) {
      recordTrial({ success: false });
    }
    expect(getCurrentSoaMs()).toBe(MAX_SOA_MS);
  });

  test('tracks trial count and success count', () => {
    recordTrial({ success: true });
    recordTrial({ success: false });
    recordTrial({ success: true });

    expect(getTrialsCompleted()).toBe(3);
    expect(getSuccessCount()).toBe(2);
  });

  test('maintains fixed-size accuracy buffer with recent outcomes', () => {
    for (let i = 0; i < DEFAULT_ACCURACY_BUFFER_SIZE + 2; i += 1) {
      recordTrial({ success: i % 2 === 0 });
    }

    expect(getAccuracyBuffer().length).toBe(DEFAULT_ACCURACY_BUFFER_SIZE);
    expect(getRecentAccuracy()).toBeGreaterThanOrEqual(0);
    expect(getRecentAccuracy()).toBeLessThanOrEqual(1);
  });

  test('records threshold history entries per trial', () => {
    recordTrial({ success: true });
    recordTrial({ success: false });

    const history = getThresholdHistory();

    expect(history.length).toBe(2);
    expect(history[0]).toMatchObject({ trial: 1, success: true });
    expect(history[1]).toMatchObject({ trial: 2, success: false });
  });
});
