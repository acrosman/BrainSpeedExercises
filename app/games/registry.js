
/**
 * registry.js — Game plugin registry for BrainSpeedExercises.
 *
 * Scans the games directory for valid plugins and looks up games by ID.
 * Used by the main process to provide game manifests and game files. The main process never
 * imports game code; the renderer imports each game's entry point itself.
 *
 * @file Game plugin registry and loader.
 */

import fs from 'fs/promises';
import path from 'path';
import log from 'electron-log';

const REQUIRED_FIELDS = ['id', 'name', 'description', 'entryPoint'];

/**
 * Resolves path segments under a base directory and confirms the result stays inside it.
 * The check uses the platform's path rules, so `..`, an absolute path, or a Windows drive
 * letter in a segment cannot escape the base directory on any operating system.
 *
 * @param {string} baseDir - Directory the result must stay inside.
 * @param {string[]} segments - Path segments, relative to baseDir.
 * @param {import('path').PlatformPath} [pathImpl] - Path module to use (overridden in tests).
 * @returns {string} Absolute path inside baseDir.
 * @throws {Error} If a segment is not a non-empty string or the result is outside baseDir.
 */
export function resolveInside(baseDir, segments, pathImpl = path) {
  if (!segments.every((segment) => typeof segment === 'string' && segment.length > 0)) {
    throw new Error('Path segments must be non-empty strings.');
  }
  const base = pathImpl.resolve(baseDir);
  const target = pathImpl.resolve(base, ...segments);
  const relative = pathImpl.relative(base, target);
  const outside = relative === ''
    || relative === '..'
    || relative.startsWith(`..${pathImpl.sep}`)
    || pathImpl.isAbsolute(relative);
  if (outside) {
    throw new Error(`Path is outside ${base}: ${segments.join(', ')}`);
  }
  return target;
}


/**
 * Scans the games directory and returns an array of valid game manifests.
 * Directories whose names begin with '_' are treated as internal and skipped.
 * Entries whose manifest.json is missing required fields, whose id does not match the
 * directory name, or whose entryPoint is outside the game directory are skipped with a warning.
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
            log.warn(
              `Skipping game "${dir.name}": manifest missing required fields: ${missingFields.join(', ')}`,
            );
            return null;
          }
          if (manifest.id !== dir.name) {
            log.warn(`Skipping game "${dir.name}": manifest id "${manifest.id}" does not match`);
            return null;
          }
          resolveInside(path.join(gamesPath, dir.name), [manifest.entryPoint]);
          if (manifest.thumbnail) {
            manifest.thumbnail = `games/${dir.name}/${manifest.thumbnail}`;
          }
          return manifest;
        } catch (err) {
          log.warn(`Skipping game "${dir.name}": ${err.message}`);
          return null;
        }
      }),
  );

  return results.filter(Boolean);
}

/**
 * Finds a game's manifest by ID.
 *
 * @param {string} gamesPath - Absolute path to the games directory.
 * @param {string} gameId - The ID of the game to find (untrusted renderer input).
 * @returns {Promise<Object>} The game's manifest.
 * @throws Will reject with a descriptive error if the game ID is not found.
 */
export async function findGame(gamesPath, gameId) {
  const manifests = await scanGamesDirectory(gamesPath);
  const manifest = manifests.find((m) => m.id === gameId);

  if (!manifest) {
    throw new Error(`Game not found: "${gameId}"`);
  }

  return manifest;
}

/**
 * Lists the PNG and JPEG files in one of a game's image subfolders.
 * Both arguments come from the renderer, so the folder must resolve inside
 * `<gamesPath>/<gameId>/images`; anything else returns an empty list.
 *
 * @param {string} gamesPath - Absolute path to the games directory.
 * @param {string} gameId - The game's ID (untrusted renderer input).
 * @param {string} subfolder - Subfolder of the game's images folder (untrusted renderer input).
 * @returns {Promise<string[]>} Sorted file names, or an empty array if the folder is invalid.
 */
export async function listGameImages(gamesPath, gameId, subfolder) {
  try {
    const imagesPath = resolveInside(gamesPath, [gameId, 'images']);
    const files = await fs.readdir(resolveInside(imagesPath, [subfolder]));
    return files.filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  } catch {
    return [];
  }
}
