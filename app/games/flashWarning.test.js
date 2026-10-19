/**
 * @file Checks that every game with visual stimuli shows the photosensitivity warning on its
 * welcome panel, and that audio-only games do not.
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const GAMES_PATH = path.dirname(fileURLToPath(import.meta.url));

/** Games with no visual stimuli. Every other game must show the warning. */
const AUDIO_ONLY_GAMES = ['fine-tuning', 'sound-sweep'];

/**
 * Lists the game directories the registry would scan (skipping `_` directories).
 *
 * @returns {Promise<string[]>} Game directory names.
 */
async function listGameIds() {
  const entries = await readdir(GAMES_PATH, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);
}

/**
 * Parses a game's interface.html into a detached container.
 *
 * @param {string} gameId - Game directory name.
 * @returns {Promise<HTMLElement>} Container holding the game's markup.
 */
async function loadInterface(gameId) {
  const html = await readFile(path.join(GAMES_PATH, gameId, 'interface.html'), 'utf8');
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('photosensitivity warning', () => {
  test('the audio-only list names real games', async () => {
    const ids = await listGameIds();
    AUDIO_ONLY_GAMES.forEach((id) => expect(ids).toContain(id));
  });

  test('every visual game shows the warning in its welcome panel, before Start', async () => {
    const ids = (await listGameIds()).filter((id) => !AUDIO_ONLY_GAMES.includes(id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const container = await loadInterface(id);
      const warning = container.querySelector('.game-welcome .game-flash-warning');
      expect({ id, found: Boolean(warning) }).toEqual({ id, found: true });
      expect(warning.textContent).toMatch(/Photosensitivity warning:/);
      const start = container.querySelector('.game-welcome .game-btn--primary');
      const follows = warning.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect({ id, startFollowsWarning: Boolean(follows) })
        .toEqual({ id, startFollowsWarning: true });
    }
  });

  test('audio-only games do not show the warning', async () => {
    for (const id of AUDIO_ONLY_GAMES) {
      const container = await loadInterface(id);
      expect(container.querySelector('.game-flash-warning')).toBeNull();
    }
  });
});
