/**
 * cardSvg.js — SVG image generation for Card Rat cards.
 *
 * Produces data URLs for standard cards, jokers, and deck back art so the game
 * does not rely on a sprite sheet.
 *
 * @file Card Rat SVG rendering helpers.
 */

/** @type {Record<string, string>} */
const SUIT_SYMBOL_BY_SUIT = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

/** @type {Record<string, string>} */
const SUIT_COLOR_BY_SUIT = {
  hearts: '#c1121f',
  diamonds: '#c1121f',
  clubs: '#1f2937',
  spades: '#1f2937',
};

/** @type {Map<string, string>} */
const CARD_DATA_URL_CACHE = new Map();

/**
 * Escape SVG text content.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeSvgText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

/**
 * Encode an SVG string as a browser-safe data URL.
 *
 * @param {string} svgMarkup
 * @returns {string}
 */
function toSvgDataUrl(svgMarkup) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`;
}

/**
 * Build a data URL for a standard suit card.
 *
 * @param {{ rank: string, suit: string }} card
 * @returns {string}
 */
function buildStandardCardDataUrl(card) {
  const rank = escapeSvgText(card.rank);
  const suitSymbol = escapeSvgText(SUIT_SYMBOL_BY_SUIT[card.suit] || '?');
  const suitColor = SUIT_COLOR_BY_SUIT[card.suit] || '#1f2937';

  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="250" height="350" viewBox="0 0 250 350">
      <rect x="5" y="5" width="240" height="340" rx="18" fill="#ffffff" stroke="#6b4f2a" stroke-width="6" />
      <text x="25" y="45" font-size="36" font-weight="700" fill="${suitColor}"
        font-family="Arial, Helvetica, sans-serif">${rank}${suitSymbol}</text>
      <text x="225" y="315" text-anchor="end" font-size="36" font-weight="700" fill="${suitColor}"
        font-family="Arial, Helvetica, sans-serif">${rank}${suitSymbol}</text>
      <text x="125" y="205" text-anchor="middle" font-size="112" fill="${suitColor}"
        font-family="Arial, Helvetica, sans-serif">${suitSymbol}</text>
    </svg>
  `.trim();

  return toSvgDataUrl(svgMarkup);
}

/**
 * Build a data URL for a joker card.
 *
 * @returns {string}
 */
function buildJokerDataUrl() {
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="250" height="350" viewBox="0 0 250 350">
      <rect x="5" y="5" width="240" height="340" rx="18" fill="#ffffff" stroke="#6b4f2a" stroke-width="6" />
      <text x="125" y="92" text-anchor="middle" font-size="42" font-weight="800" fill="#6d28d9"
        font-family="Arial, Helvetica, sans-serif">JOKER</text>
      <text x="125" y="206" text-anchor="middle" font-size="92" fill="#2563eb"
        font-family="Arial, Helvetica, sans-serif">★</text>
      <text x="125" y="282" text-anchor="middle" font-size="30" font-weight="700" fill="#ef4444"
        font-family="Arial, Helvetica, sans-serif">WILD</text>
    </svg>
  `.trim();

  return toSvgDataUrl(svgMarkup);
}

/**
 * Build a data URL for the deck back card.
 *
 * @returns {string}
 */
function buildDeckBackDataUrl() {
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="250" height="350" viewBox="0 0 250 350">
      <rect x="5" y="5" width="240" height="340" rx="18" fill="#0f172a" stroke="#6b4f2a" stroke-width="6" />
      <rect x="24" y="24" width="202" height="302" rx="12" fill="#1e3a8a" stroke="#e2e8f0" stroke-width="3" />
      <path d="M36 56 L214 294 M214 56 L36 294" stroke="#93c5fd" stroke-width="6" opacity="0.6" />
      <circle cx="125" cy="175" r="44" fill="#2563eb" stroke="#bfdbfe" stroke-width="5" />
      <text x="125" y="188" text-anchor="middle" font-size="38" font-weight="800" fill="#f8fafc"
        font-family="Arial, Helvetica, sans-serif">CR</text>
    </svg>
  `.trim();

  return toSvgDataUrl(svgMarkup);
}

/**
 * Return a data URL for the provided card.
 *
 * @param {{ rank: string, suit: string, isJoker: boolean }} card
 * @returns {string}
 */
export function getCardImageDataUrl(card) {
  const cacheKey = card.isJoker ? 'joker' : `${card.rank}-${card.suit}`;
  if (CARD_DATA_URL_CACHE.has(cacheKey)) {
    return CARD_DATA_URL_CACHE.get(cacheKey);
  }

  const dataUrl = card.isJoker
    ? buildJokerDataUrl()
    : buildStandardCardDataUrl(card);
  CARD_DATA_URL_CACHE.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Return a data URL for the deck back image.
 *
 * @returns {string}
 */
export function getDeckBackImageDataUrl() {
  const cacheKey = 'deck-back';
  if (CARD_DATA_URL_CACHE.has(cacheKey)) {
    return CARD_DATA_URL_CACHE.get(cacheKey);
  }

  const dataUrl = buildDeckBackDataUrl();
  CARD_DATA_URL_CACHE.set(cacheKey, dataUrl);
  return dataUrl;
}
