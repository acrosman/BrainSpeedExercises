import { jest } from '@jest/globals';

// Mock game.js so index.js can be tested in isolation.
jest.unstable_mockModule('../game.js', () => ({
  initGame: jest.fn(),
  startGame: jest.fn(),
  stopGame: jest.fn(() => ({ score: 10, duration: 5 })),
  getScore: jest.fn(() => 10),
}));

const plugin = (await import('../index.js')).default;

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
    container = document.createElement('div');
    plugin.init(container);
  });

  test('updates the status element when present', () => {
    const status = document.createElement('p');
    status.className = 'game-template__status';
    container.appendChild(status);

    plugin.start();

    expect(status.textContent).toBe('Playing\u2026');
  });

  test('does not throw when the status element is absent', () => {
    expect(() => plugin.start()).not.toThrow();
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
    container = document.createElement('div');
    plugin.init(container);
  });

  test('returns the result from game logic', () => {
    const result = plugin.stop();
    expect(result).toMatchObject({ score: 10, duration: 5 });
  });

  test('updates the status element with the score when present', () => {
    const status = document.createElement('p');
    status.className = 'game-template__status';
    container.appendChild(status);

    plugin.stop();

    expect(status.textContent).toContain('10');
  });

  test('does not throw when the status element is absent', () => {
    expect(() => plugin.stop()).not.toThrow();
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.stop()).not.toThrow();
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    plugin.init(container);
  });

  test('resets the status element text when present', () => {
    const status = document.createElement('p');
    status.className = 'game-template__status';
    container.appendChild(status);

    plugin.reset();

    expect(status.textContent).toBe('Press Start to play.');
  });

  test('does not throw when the status element is absent', () => {
    expect(() => plugin.reset()).not.toThrow();
  });

  test('does not throw when container is null', () => {
    plugin.init(null);
    expect(() => plugin.reset()).not.toThrow();
  });
});
