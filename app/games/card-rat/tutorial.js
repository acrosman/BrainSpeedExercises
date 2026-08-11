/**
 * tutorial.js — Card Rat tutorial step definitions.
 *
 * @file Card Rat tutorial content.
 */

/**
 * Screenshot used in the guided tutorial overlay.
 * Path is renderer-root relative so it resolves from app/index.html.
 *
 * @type {string}
 */
const TUTORIAL_SCREENSHOT_PATH = './games/card-rat/images/tutorialScreenshot.png';

/** Card Rat tutorial steps shown for first-time players and replay flow. */
export const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Card Rat',
    content: '<p>React quickly, but only slap when a valid target appears.</p>',
  },
  {
    title: 'Find the Main Play Area',
    content: [
      '<p>Use the guide to learn what to watch while cards are dealt:</p>',
      '<figure class="card-rat__tutorial-figure">',
      '<div class="card-rat__tutorial-image-wrap">',
      '  <img',
      `    src="${TUTORIAL_SCREENSHOT_PATH}"`,
      '    alt="Card Rat gameplay layout with score stats, card row, and controls."',
      '    class="card-rat__tutorial-image"',
      '  >',
      `
        <span class="card-rat__tutorial-highlight card-rat__tutorial-highlight--stats"
          aria-hidden="true"></span>
      `,
      `
        <span class="card-rat__tutorial-highlight card-rat__tutorial-highlight--cards"
          aria-hidden="true"></span>
      `,
      `
        <span class="card-rat__tutorial-highlight card-rat__tutorial-highlight--controls"
          aria-hidden="true"></span>
      `,
      '</div>',
      '<figcaption class="card-rat__tutorial-caption">',
      '  Blue: live stats. Green: reaction cards. Orange: game controls.',
      '</figcaption>',
      '</figure>',
    ].join(''),
  },
  {
    title: 'When to Slap',
    content: [
      '<ul>',
      '<li>Pair: two cards in a row match.</li>',
      '<li>Sandwich: one card between two matching ranks.</li>',
      '<li>Joker: slap immediately.</li>',
      '</ul>',
    ].join(''),
  },
  {
    title: 'How to Score',
    content: [
      '<p>Use <kbd>Space</kbd> or click the cards.</p>',
      '<p>',
      'Correct slaps build streaks and speed up the deck.',
      'False alarms and misses cost momentum.',
      '</p>',
    ].join(''),
  },
];
