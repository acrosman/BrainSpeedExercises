import fs from 'fs/promises';
import path from 'path';

const REQUIRED_FIELDS = ['id', 'name', 'description', 'entryPoint'];

/**
 * Scans the games directory and returns an array of valid game manifests.
 * Directories whose names begin with '_' are treated as internal and skipped.
 * Entries whose manifest.json is missing required fields are skipped with a warning.
 *
 * @param {string} gamesPath - Absolute path to the games directory.
 * @returns {Promise<Object[]>} Resolved array of manifest objects.
 * @throws Will reject if gamesPath does not exist.
 */
export async function scanGamesDirectory(gamesPath) {
  const entries = await fs.readdir(gamesPath, { withFileTypes: true });

  const results = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(async (dir) => {
        const manifestPath = path.join(gamesPath, dir.name, 'manifest.json');
        try {
          const raw = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(raw);
          const missingFields = REQUIRED_FIELDS.filter((f) => !manifest[f]);
          if (missingFields.length > 0) {
            console.warn(
              `Skipping game "${dir.name}": manifest missing required fields: ${missingFields.join(', ')}`,
            );
            return null;
          }
          return manifest;
        } catch (err) {
          console.warn(`Skipping game "${dir.name}": ${err.message}`);
          return null;
        }
      }),
  );

  return results.filter(Boolean);
}

/**
 * Loads a game plugin by ID.
 *
 * @param {string} gamesPath - Absolute path to the games directory.
 * @param {string} gameId - The ID of the game to load.
 * @param {function} [importFn] - Optional import function override (used for testing).
 * @returns {Promise<{manifest: Object, plugin: Object}>}
 * @throws Will reject with a descriptive error if the game ID is not found.
 */
export async function loadGame(gamesPath, gameId, importFn = (p) => import(p)) {
  const manifests = await scanGamesDirectory(gamesPath);
  const manifest = manifests.find((m) => m.id === gameId);

  if (!manifest) {
    throw new Error(`Game not found: "${gameId}"`);
  }

  const entryPointPath = path.join(gamesPath, manifest.id, manifest.entryPoint);
  const mod = await importFn(entryPointPath);

  return { manifest, plugin: mod.default };
}
