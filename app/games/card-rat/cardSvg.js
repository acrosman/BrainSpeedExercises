/**
 * cardSvg.js — Card Rat image helpers for sprite and standalone card assets.
 *
 * @file Card Rat image helper module.
 */

import { logger } from '../../components/logService.js';

/** Sprite path for standard suit cards. */
const STANDARD_CARD_SPRITE_PATH = 'games/card-rat/images/cards-sprite.png';

/** Deck-back image path. */
const DECK_BACK_IMAGE_PATH = 'games/card-rat/images/card-back.png';

/** Joker image paths keyed by joker variant. */
const JOKER_IMAGE_PATHS = {
  joker1: 'games/card-rat/images/joker1.png',
  joker2: 'games/card-rat/images/joker2.png',
  joker3: 'games/card-rat/images/joker3.png',
};

/** Sprite file width in pixels. */
const SPRITE_WIDTH_PX = 5081;

/** Sprite file height in pixels. */
const SPRITE_HEIGHT_PX = 2283;

/** Source-sheet left offset to first card image. */
const SOURCE_LEFT_OFFSET_PX = 22;

/** Source-sheet top offset to first card image. */
const SOURCE_TOP_OFFSET_PX = 18;

/** Source-sheet card width in pixels. */
const SOURCE_CARD_WIDTH_PX = 722;

/** Source-sheet card height in pixels. */
const SOURCE_CARD_HEIGHT_PX = 1082;

/** Source-sheet gap between neighboring cards. */
const SOURCE_CARD_GAP_PX = 30;

/** Number of columns in the standard-card sprite sheet. */
const CARD_COLUMNS = 13;

/** Number of rows in the standard-card sprite sheet. */
const CARD_ROWS = 4;

/** Row index by suit using top-to-bottom order from the provided sprite. */
const ROW_BY_SUIT = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

/** Source sheet width before scaling/export. */
const SOURCE_SHEET_WIDTH_PX = (SOURCE_LEFT_OFFSET_PX * 2)
  + (CARD_COLUMNS * SOURCE_CARD_WIDTH_PX)
  + ((CARD_COLUMNS - 1) * SOURCE_CARD_GAP_PX);

/** Source sheet height before scaling/export. */
const SOURCE_SHEET_HEIGHT_PX = (SOURCE_TOP_OFFSET_PX * 2)
  + (CARD_ROWS * SOURCE_CARD_HEIGHT_PX)
  + ((CARD_ROWS - 1) * SOURCE_CARD_GAP_PX);

/** Width scaling ratio from source-card coordinates to exported sprite. */
const SPRITE_SCALE_X = SPRITE_WIDTH_PX / SOURCE_SHEET_WIDTH_PX;

/** Height scaling ratio from source-card coordinates to exported sprite. */
const SPRITE_SCALE_Y = SPRITE_HEIGHT_PX / SOURCE_SHEET_HEIGHT_PX;

/** Effective card width in exported sprite coordinates. */
const CARD_WIDTH_PX = SOURCE_CARD_WIDTH_PX * SPRITE_SCALE_X;

/** Effective card height in exported sprite coordinates. */
const CARD_HEIGHT_PX = SOURCE_CARD_HEIGHT_PX * SPRITE_SCALE_Y;

/**
 * Resolve the standalone image path for a joker card.
 *
 * @param {{ jokerVariant?: string }} card
 * @returns {string}
 */
export function getJokerImagePath(card) {
  if (card.jokerVariant && JOKER_IMAGE_PATHS[card.jokerVariant]) {
    return JOKER_IMAGE_PATHS[card.jokerVariant];
  }
  return JOKER_IMAGE_PATHS.joker1;
}

/**
 * Return the deck-back image path.
 *
 * @returns {string}
 */
export function getDeckBackImagePath() {
  return DECK_BACK_IMAGE_PATH;
}

/**
 * Return CSS style values for the requested standard card inside the sprite.
 *
 * @param {{
 *   rank: string,
 *   suit: string,
 * }} card
 * @param {number} renderedCardWidth
 * @param {number} renderedCardHeight
 * @param {Array<string>} ranks
 * @returns {{ imagePath: string, backgroundSize: string, backgroundPosition: string }}
 */
export function getStandardCardSpriteStyle(
  card,
  renderedCardWidth,
  renderedCardHeight,
  ranks,
) {
  const rankLookup = ranks.indexOf(card.rank);
  const suitLookup = ROW_BY_SUIT[card.suit];
  if (rankLookup < 0 || suitLookup === undefined) {
    logger.warn('Card Rat sprite lookup fallback used', {
      rank: card.rank,
      suit: card.suit,
    });
  }

  const rankIndex = Math.max(0, rankLookup);
  const suitRow = suitLookup ?? 0;

  const xOffset = (
    SOURCE_LEFT_OFFSET_PX + (rankIndex * (SOURCE_CARD_WIDTH_PX + SOURCE_CARD_GAP_PX))
  )
    * SPRITE_SCALE_X;
  const yOffset = (
    SOURCE_TOP_OFFSET_PX + (suitRow * (SOURCE_CARD_HEIGHT_PX + SOURCE_CARD_GAP_PX))
  )
    * SPRITE_SCALE_Y;

  const widthScale = renderedCardWidth / CARD_WIDTH_PX;
  const heightScale = renderedCardHeight / CARD_HEIGHT_PX;

  return {
    imagePath: STANDARD_CARD_SPRITE_PATH,
    backgroundSize: `${SPRITE_WIDTH_PX * widthScale}px ${SPRITE_HEIGHT_PX * heightScale}px`,
    backgroundPosition: `${-xOffset * widthScale}px ${-yOffset * heightScale}px`,
  };
}
