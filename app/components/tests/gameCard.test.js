import { jest } from '@jest/globals';

// Mock timerService so tests are not date-dependent.
// Must be called before dynamic import of gameCard.js.
jest.unstable_mockModule('../timerService.js', () => ({
  formatDuration: jest.fn((ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }),
  getTodayDateString: jest.fn(() => '2024-01-15'),
}));

const { createGameCard } = await import('../gameCard.js');

// ── Shared test fixtures ───────────────────────────────────────────────────────

const validManifest = {
  id: 'test-game',
  name: 'Test Game',
  description: 'A test game description.',
  thumbnail: '/images/test.png',
};

/**
 * Factory for game-specific manifests used in progress-display tests.
 * All game manifests share the same description and thumbnail placeholder.
 *
 * @param {string} id - Game ID.
 * @param {string} name - Display name.
 * @returns {{ id: string, name: string, description: string, thumbnail: string }}
 */
function makeManifest(id, name) {
  return {
    id,
    name,
    description: 'Test desc',
    thumbnail: '/images/test.png',
  };
}

describe('createGameCard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an <article> element', () => {
    const card = createGameCard(validManifest);
    expect(card.tagName).toBe('ARTICLE');
  });

  it('button fires game:select with correct detail.gameId', () => {
    const card = createGameCard(validManifest);
    document.body.appendChild(card);
    const button = card.querySelector('button');

    let firedEvent = null;
    card.addEventListener('game:select', (e) => {
      firedEvent = e;
    });

    button.click();

    expect(firedEvent).not.toBeNull();
    expect(firedEvent.detail.gameId).toBe(validManifest.id);
  });

  it('clicking the card body (outside the button) fires game:select', () => {
    const card = createGameCard(validManifest);
    document.body.appendChild(card);

    let firedEvent = null;
    card.addEventListener('game:select', (e) => {
      firedEvent = e;
    });

    // Simulate a click directly on the article element (not via the button).
    card.click();

    expect(firedEvent).not.toBeNull();
    expect(firedEvent.detail.gameId).toBe(validManifest.id);
  });

  it('<img> has a non-empty alt attribute', () => {
    const card = createGameCard(validManifest);
    const img = card.querySelector('img');
    expect(img.alt).toBeTruthy();
  });

  it('throws when manifest is null', () => {
    expect(() => createGameCard(null)).toThrow();
  });

  it('throws when manifest is missing id', () => {
    expect(() => createGameCard({ name: 'No ID Game' })).toThrow();
  });

  it('throws when manifest is missing name', () => {
    expect(() => createGameCard({ id: 'no-name' })).toThrow();
  });

  it('renders game name in heading', () => {
    const card = createGameCard(validManifest);
    const heading = card.querySelector('h2');
    expect(heading.textContent).toBe(validManifest.name);
  });

  it('renders description text', () => {
    const card = createGameCard(validManifest);
    const p = card.querySelector('p');
    expect(p.textContent).toBe(validManifest.description);
  });

  it('renders empty description when omitted', () => {
    const card = createGameCard({ id: 'no-desc', name: 'No Desc' });
    const p = card.querySelector('p');
    expect(p.textContent).toBe('');
  });

  it('button has accessible aria-label', () => {
    const card = createGameCard(validManifest);
    const button = card.querySelector('button');
    expect(button.getAttribute('aria-label')).toBeTruthy();
  });

  it('displays high score when provided', () => {
    const progress = { highScore: 42 };
    const card = createGameCard(makeManifest('fast-piggie', 'Fast Piggie'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).not.toBeNull();
    expect(scoreElem.textContent).toContain('42');
  });

  it('displays highest level when provided', () => {
    const progress = { highScore: 10, highestLevel: 4 };
    const card = createGameCard(makeManifest('high-speed-memory', 'High Speed Memory'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).not.toBeNull();
    // highestLevel 4 is displayed as level 5 (1-indexed)
    expect(scoreElem.textContent).toContain('Max Level: 5');
  });

  it('displays min display time when lowestDisplayTime is provided', () => {
    const progress = { lowestDisplayTime: 84.2 };
    const card = createGameCard(makeManifest('any-game', 'Any Game'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).not.toBeNull();
    expect(scoreElem.textContent).toContain('Min Display Time: 84.2ms');
  });

  it('displays lowestDisplayTime for field-of-view via generic progress', () => {
    const progress = { lowestDisplayTime: 84.2 };
    const card = createGameCard(makeManifest('field-of-view', 'Field of View'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).not.toBeNull();
    expect(scoreElem.textContent).toContain('84.2ms');
  });

  it('shows no progress element when progress has no displayable fields', () => {
    const progress = {};
    const card = createGameCard(makeManifest('field-of-view', 'Field of View'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).toBeNull();
  });

  it('displays today\'s time played when dailyTime has an entry for today', () => {
    // '2024-01-15' matches the mocked getTodayDateString return value.
    const progress = { dailyTime: { '2024-01-15': 90000 } };
    const card = createGameCard(makeManifest('otter-stop', 'Otter Stop!'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).not.toBeNull();
    // 90000 ms = 01:30
    expect(scoreElem.textContent).toContain('Today: 01:30');
  });

  it('does not display today label when dailyTime has no entry for today', () => {
    const progress = { dailyTime: { '2023-12-01': 90000 } };
    const card = createGameCard(makeManifest('otter-stop', 'Otter Stop!'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    // No other progress fields → no score elem
    expect(scoreElem).toBeNull();
  });

  it('shows no progress element when dailyTime only has old dates', () => {
    const progress = { dailyTime: { '2023-01-01': 1000 } }; // old date
    const card = createGameCard(makeManifest('field-of-view', 'Field of View'), progress);
    const scoreElem = card.querySelector('.game-high-score');
    expect(scoreElem).toBeNull();
  });
});

