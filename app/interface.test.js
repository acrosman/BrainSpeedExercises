/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Mock the game module dynamically imported by loadAndInitGame.
// Must be registered before interface.js is imported.
const mockGameInit = jest.fn();

// Capture the DOMContentLoaded callback before importing interface.js.
let domReadyCallback;

// jest.unstable_mockModule MUST be called at module top level (with top-level await) so that
// the mock is registered before Jest's coverage instrumentation pre-loads interface.js.
await jest.unstable_mockModule('./games/fast-piggie/index.js', () => ({
  default: { init: mockGameInit },
}));

// Spy on document.addEventListener to capture the DOMContentLoaded callback before
// importing interface.js, so tests can invoke it directly.
const origDocAddEventListener = document.addEventListener.bind(document);
jest.spyOn(document, 'addEventListener').mockImplementation((event, cb, opts) => {
  if (event === 'DOMContentLoaded') domReadyCallback = cb;
  return origDocAddEventListener(event, cb, opts);
});

await import('./interface.js');

// Restore so that tests can use document.addEventListener normally.
document.addEventListener.mockRestore();

// ─── Test fixtures ────────────────────────────────────────────────────────────

const MANIFESTS = [{ id: 'fast-piggie', name: 'Test Game', description: 'A test game.' }];

const GAME_LOAD_RESULT = {
  html: '<div id="game-ui">Game UI</div>',
  manifest: { name: 'Test Game', entryPoint: 'index.js' },
};

function setupApi({ progressData = {}, manifests = MANIFESTS, gameLoad = GAME_LOAD_RESULT } = {}) {
  const invoke = jest.fn().mockImplementation((channel) => {
    if (channel === 'progress:load') return Promise.resolve(progressData);
    if (channel === 'games:list') return Promise.resolve(manifests);
    if (channel === 'games:load') return Promise.resolve(gameLoad);
    return Promise.resolve(null);
  });
  global.window.api = { invoke, on: jest.fn() };
  return invoke;
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function dispatchGameSelect(gameId = 'fast-piggie') {
  document.getElementById('game-selector').dispatchEvent(
    new CustomEvent('game:select', { bubbles: true, detail: { gameId } }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('interface.js', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<section id="game-selector"></section><main id="game-container"></main>';
    document.head.innerHTML = '';
    mockGameInit.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  // ── DOMContentLoaded initialisation ─────────────────────────────────────────

  describe('DOMContentLoaded initialisation', () => {
    it('requests progress:load and games:list', async () => {
      const invoke = setupApi();
      await domReadyCallback();
      expect(invoke).toHaveBeenCalledWith('progress:load', { playerId: 'default' });
      expect(invoke).toHaveBeenCalledWith('games:list');
    });

    it('appends an aria-live polite announcer to the body', async () => {
      setupApi();
      await domReadyCallback();
      const announcer = document.querySelector('[aria-live="polite"]');
      expect(announcer).not.toBeNull();
      expect(announcer.getAttribute('aria-atomic')).toBe('true');
      expect(announcer.classList.contains('sr-only')).toBe(true);
    });

    it('renders a game card for each manifest returned', async () => {
      setupApi();
      await domReadyCallback();
      expect(document.querySelectorAll('#game-selector article').length).toBe(MANIFESTS.length);
    });

    it('passes per-game progress data to game cards when available', async () => {
      setupApi({ progressData: { games: { 'fast-piggie': { highScore: 42 } } } });
      await domReadyCallback();
      const scoreElem = document.querySelector('.game-high-score');
      expect(scoreElem).not.toBeNull();
      expect(scoreElem.textContent).toContain('42');
    });

    it('falls back to empty progress and still renders cards when progress:load rejects',
      async () => {
        const invoke = jest.fn().mockImplementation((channel) => {
          if (channel === 'progress:load') return Promise.reject(new Error('disk error'));
          if (channel === 'games:list') return Promise.resolve(MANIFESTS);
          return Promise.resolve(null);
        });
        global.window.api = { invoke, on: jest.fn() };
        await domReadyCallback();
        expect(document.querySelectorAll('#game-selector article').length).toBe(MANIFESTS.length);
      });

    it('shows an error message when games:list rejects', async () => {
      const invoke = jest.fn().mockImplementation((channel) => {
        if (channel === 'progress:load') return Promise.resolve({});
        if (channel === 'games:list') return Promise.reject(new Error('IPC error'));
        return Promise.resolve(null);
      });
      global.window.api = { invoke, on: jest.fn() };
      await domReadyCallback();
      expect(document.getElementById('game-selector').textContent)
        .toContain('Unable to load games');
    });
  });

  describe('game:select handler', () => {
    it('removes the game selector from the DOM', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      expect(document.getElementById('game-selector')).toBeNull();
    });

    it('calls games:load and injects HTML into the game container', async () => {
      const invoke = setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      expect(invoke).toHaveBeenCalledWith('games:load', 'fast-piggie');
      expect(document.getElementById('game-container').innerHTML).toContain('game-ui');
    });

    it('injects a game stylesheet link into the document head', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      const link = document.getElementById('active-game-stylesheet');
      expect(link).not.toBeNull();
      expect(link.href).toContain('fast-piggie');
    });

    it('replaces an existing game stylesheet rather than duplicating it', async () => {
      setupApi();
      await domReadyCallback();
      // Pre-insert a stylesheet from a previous game.
      const stale = document.createElement('link');
      stale.id = 'active-game-stylesheet';
      stale.href = './games/old-game/style.css';
      document.head.appendChild(stale);
      dispatchGameSelect();
      await flush();
      const links = document.head.querySelectorAll('#active-game-stylesheet');
      expect(links.length).toBe(1);
      expect(links[0].href).toContain('fast-piggie');
    });

    it('calls the game module init function', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      expect(mockGameInit).toHaveBeenCalledWith(document.getElementById('game-container'));
    });

    it('sets the announcer text after loading the game', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      const announcer = document.querySelector('[aria-live="polite"]');
      expect(announcer.textContent).toContain('Test Game');
    });
  });

  // ── bsx:return-to-main-menu handler (exercises removeGameStylesheet + restore) ─

  describe('bsx:return-to-main-menu handler', () => {
    it('clears the game container and removes the active stylesheet', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      // Confirm game is loaded.
      expect(document.getElementById('active-game-stylesheet')).not.toBeNull();

      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      expect(document.getElementById('game-container').querySelector('#game-ui')).toBeNull();
      expect(document.getElementById('game-container').querySelector('#game-selector'))
        .not.toBeNull();
      expect(document.getElementById('active-game-stylesheet')).toBeNull();
    });

    it('handles removeGameStylesheet gracefully when no stylesheet exists', async () => {
      setupApi();
      await domReadyCallback();
      // Dispatch return-to-menu without ever loading a game (no stylesheet present).
      expect(() => window.dispatchEvent(new Event('bsx:return-to-main-menu'))).not.toThrow();
    });

    it('recreates the game-selector section inside the container', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      await flush();
      expect(document.getElementById('game-selector')).not.toBeNull();
    });

    it('reloads and renders game cards after returning to the main menu', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      await flush();
      expect(document.querySelectorAll('#game-selector article').length).toBe(MANIFESTS.length);
    });

    it('sets the announcer text to the main menu message', async () => {
      setupApi();
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      const announcer = document.querySelector('[aria-live="polite"]');
      expect(announcer.textContent).toBe('Main menu loaded. Select a game.');
    });

    it('does not recreate the selector if it already exists in the document', async () => {
      setupApi();
      await domReadyCallback();
      // game-selector is still in its original sibling position (no game:select fired).
      expect(document.getElementById('game-selector')).not.toBeNull();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      // Should not create a duplicate.
      expect(document.querySelectorAll('#game-selector').length).toBe(1);
    });

    it('reloads progress-aware game cards on return', async () => {
      const invoke = jest.fn().mockImplementation((channel) => {
        if (channel === 'progress:load')
          return Promise.resolve({ games: { 'fast-piggie': { highScore: 77 } } });
        if (channel === 'games:list') return Promise.resolve(MANIFESTS);
        if (channel === 'games:load') return Promise.resolve(GAME_LOAD_RESULT);
        return Promise.resolve(null);
      });
      global.window.api = { invoke, on: jest.fn() };
      await domReadyCallback();
      dispatchGameSelect();
      await flush();
      window.dispatchEvent(new Event('bsx:return-to-main-menu'));
      await flush();
      const scoreElem = document.querySelector('#game-selector .game-high-score');
      expect(scoreElem).not.toBeNull();
      expect(scoreElem.textContent).toContain('77');
    });
  });
});
