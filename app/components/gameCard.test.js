it('displays high score for Fast Piggie when provided', () => {
  const manifest = {
    id: 'fast-piggie',
    name: 'Fast Piggie',
    description: 'Test desc',
    thumbnail: '/images/test.png',
  };
  const progress = { highScore: 42 };
  const card = createGameCard(manifest, progress);
  const scoreElem = card.querySelector('.game-high-score');
  expect(scoreElem).not.toBeNull();
  expect(scoreElem.textContent).toContain('42');
});
import { createGameCard } from './gameCard.js';

const validManifest = {
  id: 'test-game',
  name: 'Test Game',
  description: 'A test game description.',
  thumbnail: '/images/test.png',
};

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
});
