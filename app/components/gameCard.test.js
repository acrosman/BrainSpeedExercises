import { createGameCard } from './gameCard.js';

const validManifest = {
  id: 'test-game',
  name: 'Test Game',
  description: 'A test game description.',
  thumbnail: '/images/test.png',
};

describe('createGameCard', () => {
  test('renders an <article> element', () => {
    const card = createGameCard(validManifest);
    expect(card.tagName).toBe('ARTICLE');
  });

  test('button fires game:select with correct detail.gameId', () => {
    const card = createGameCard(validManifest);
    const button = card.querySelector('button');

    let firedEvent = null;
    card.addEventListener('game:select', (e) => {
      firedEvent = e;
    });

    button.click();

    expect(firedEvent).not.toBeNull();
    expect(firedEvent.detail.gameId).toBe(validManifest.id);
  });

  test('<img> has a non-empty alt attribute', () => {
    const card = createGameCard(validManifest);
    const img = card.querySelector('img');
    expect(img.alt).toBeTruthy();
  });

  test('throws when manifest is null', () => {
    expect(() => createGameCard(null)).toThrow();
  });

  test('throws when manifest is missing id', () => {
    expect(() => createGameCard({ name: 'No ID Game' })).toThrow();
  });

  test('throws when manifest is missing name', () => {
    expect(() => createGameCard({ id: 'no-name' })).toThrow();
  });

  test('renders game name in heading', () => {
    const card = createGameCard(validManifest);
    const heading = card.querySelector('h2');
    expect(heading.textContent).toBe(validManifest.name);
  });

  test('renders description text', () => {
    const card = createGameCard(validManifest);
    const p = card.querySelector('p');
    expect(p.textContent).toBe(validManifest.description);
  });

  test('renders empty description when omitted', () => {
    const card = createGameCard({ id: 'no-desc', name: 'No Desc' });
    const p = card.querySelector('p');
    expect(p.textContent).toBe('');
  });

  test('button has accessible aria-label', () => {
    const card = createGameCard(validManifest);
    const button = card.querySelector('button');
    expect(button.getAttribute('aria-label')).toBeTruthy();
  });
});
