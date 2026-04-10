import { jest } from '@jest/globals';

// Mock scoreService so stop() doesn't make IPC calls.
jest.unstable_mockModule('../../../components/scoreService.js', () => ({
  saveScore: jest.fn(() => Promise.resolve({ highScore: 10 })),
  loadProgress: jest.fn(() => Promise.resolve({})),
  loadGameScore: jest.fn(() => Promise.resolve({})),
  clearHistory: jest.fn(() => Promise.resolve()),
}));

// Mock game.js so index.js can be tested in isolation.
jest.unstable_mockModule('../game.js', () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 10, duration: 5 })),
  getScore: jest.fn(() => 10),
}));

const plugin = (await import('../index.js')).default;

/** Build a minimal container element that mirrors the template interface.html structure. */
function buildContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="game-template-instructions"></div>
    <div id="game-template-play-area" hidden></div>
    <div id="game-template-end-panel" hidden>
      <dd id="game-template-final-score">0</dd>
    </div>
    <button id="game-template-start"></button>
    <button id="game-template-stop"></button>
    <button id="game-template-play-again"></button>
    <button id="game-template-return"></button>
  `;
  return el;
}

// ─── Plugin contract ──────────────────────────────────────────────────────────

describe('plugin contract', () => {
  test('exposes a string name', () => {
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
  });

  test('exposes init, start, stop, and reset functions', () => {
    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.start).toBe('function');
    expect(typeof plugin.stop).toBe('function');
    expect(typeof plugin.reset).toBe('function');
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('init', () => {
  test('accepts a DOM element without throwing', () => {
    const el = document.createElement('div');
    expect(() => plugin.init(el)).not.toThrow();
  });

  test('accepts null without throwing', () => {
    expect(() => plugin.init(null)).not.toThrow();
  });
});

// ─── start ────────────────────────────────────────────────────────────────────

describe('start', () => {
  let container;

  beforeEach(() => {
    container = buildContainer();
    plugin.init(container);
  });

  test('hides the instructions panel', () => {
    plugin.start();
    expect(container.querySelector('#game-template-instructions').hidden).toBe(true);
  });

  test('shows the play area', () => {
    plugin.start();
    expect(container.querySelector('#game-template-play-area').hidden).toBe(false);
  });

  test('hides the end panel', () => {
    plugin.start();
    expect(container.querySelector('#game-template-end-panel').hidden).toBe(true);
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.start()).not.toThrow();
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('stop', () => {
  let container;

  beforeEach(() => {
    container = buildContainer();
    plugin.init(container);
    plugin.start();
  });

  test('returns the result from game logic', async () => {
    const result = await plugin.stop();
    expect(result).toMatchObject({ score: 10, duration: 5 });
  });

  test('shows the end panel', async () => {
    await plugin.stop();
    expect(container.querySelector('#game-template-end-panel').hidden).toBe(false);
  });

  test('writes the score into the final-score element', async () => {
    await plugin.stop();
    expect(container.querySelector('#game-template-final-score').textContent).toBe('10');
  });

  test('does not throw when container is null', async () => {
    plugin.init(null);
    await expect(plugin.stop()).resolves.toBeDefined();
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  let container;

  beforeEach(() => {
    container = buildContainer();
    plugin.init(container);
    plugin.start();
  });

  test('shows the instructions panel', () => {
    plugin.reset();
    expect(container.querySelector('#game-template-instructions').hidden).toBe(false);
  });

  test('hides the play area', () => {
    plugin.reset();
    expect(container.querySelector('#game-template-play-area').hidden).toBe(true);
  });

  test('hides the end panel', () => {
    plugin.reset();
    expect(container.querySelector('#game-template-end-panel').hidden).toBe(true);
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.reset()).not.toThrow();
  });
});
