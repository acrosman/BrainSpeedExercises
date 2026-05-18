import { describe, test, expect } from '@jest/globals';
import { getCardImageDataUrl, getDeckBackImageDataUrl } from '../cardSvg.js';

/**
 * Decode a generated SVG data URL into plain SVG markup.
 *
 * @param {string} dataUrl
 * @returns {string}
 */
function decodeSvgDataUrl(dataUrl) {
  const encodedPayload = dataUrl.replace('data:image/svg+xml;charset=UTF-8,', '');
  return decodeURIComponent(encodedPayload);
}

describe('cardSvg', () => {
  test('generates a standard card SVG with rank and suit', () => {
    const dataUrl = getCardImageDataUrl({ rank: 'Q', suit: 'hearts', isJoker: false });
    const svgMarkup = decodeSvgDataUrl(dataUrl);

    expect(dataUrl.startsWith('data:image/svg+xml')).toBe(true);
    expect(svgMarkup).toContain('Q♥');
    expect(svgMarkup).toContain('#c1121f');
  });

  test('generates a joker SVG', () => {
    const dataUrl = getCardImageDataUrl({ rank: 'JOKER', suit: 'joker', isJoker: true });
    const svgMarkup = decodeSvgDataUrl(dataUrl);

    expect(svgMarkup).toContain('JOKER');
    expect(svgMarkup).toContain('WILD');
  });

  test('generates a deck back SVG', () => {
    const dataUrl = getDeckBackImageDataUrl();
    const svgMarkup = decodeSvgDataUrl(dataUrl);

    expect(svgMarkup).toContain('CR');
    expect(svgMarkup).toContain('#1e3a8a');
  });

  test('reuses cached data URLs for identical card requests', () => {
    const first = getCardImageDataUrl({ rank: '9', suit: 'spades', isJoker: false });
    const second = getCardImageDataUrl({ rank: '9', suit: 'spades', isJoker: false });

    expect(first).toBe(second);
  });

  test('escapes unsafe text in rank values', () => {
    const dataUrl = getCardImageDataUrl({ rank: '<A&', suit: 'clubs', isJoker: false });
    const svgMarkup = decodeSvgDataUrl(dataUrl);

    expect(svgMarkup).toContain('&lt;A&amp;');
  });
});
