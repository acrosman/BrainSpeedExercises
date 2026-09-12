import { describe, test, expect } from '@jest/globals';
import {
  getDeckBackImagePath,
  getJokerImagePath,
  getStandardCardSpriteStyle,
} from '../cardSvg.js';

describe('cardSvg', () => {
  test('returns deck-back image path', () => {
    const imagePath = getDeckBackImagePath();
    expect(imagePath).toBe('games/card-rat/images/card-back.png');
  });

  test('returns specific joker image path when variant exists', () => {
    const imagePath = getJokerImagePath({ jokerVariant: 'joker3' });
    expect(imagePath).toBe('games/card-rat/images/joker3.png');
  });

  test('falls back to joker1 image path when variant is missing', () => {
    const imagePath = getJokerImagePath({});
    expect(imagePath).toBe('games/card-rat/images/joker1.png');
  });

  test('returns sprite style for a standard card', () => {
    const style = getStandardCardSpriteStyle(
      { rank: 'A', suit: 'spades' },
      170,
      255,
      ['A', '2', '3'],
    );

    expect(style.imagePath).toBe('games/card-rat/images/cards-sprite.png');
    expect(style.backgroundSize).toContain('px');
    expect(style.backgroundPosition).toContain('-');
  });

  test('defaults to first rank and row when rank or suit is unknown', () => {
    const style = getStandardCardSpriteStyle(
      { rank: 'unknown', suit: 'unknown' },
      170,
      255,
      ['A', '2', '3'],
    );

    expect(style.imagePath).toBe('games/card-rat/images/cards-sprite.png');
    expect(style.backgroundPosition).toMatch(/^-\d+(\.\d+)?px -\d+(\.\d+)?px$/);
  });
});
