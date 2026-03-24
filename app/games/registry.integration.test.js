/**
 * registry.integration.test.js — Integration tests for the game plugin registry.
 *
 * Unlike registry.test.js (which mocks fs/promises), these tests read the REAL
 * games directory on disk. They act as a "game discovery smoke test": if a game's
 * manifest.json is missing, malformed, or its interface.html doesn't exist, these
 * tests will fail — catching the class of "application fails to find and load games"
 * regressions that unit tests (with mocked file I/O) cannot detect.
 *
 * @file Integration tests for game plugin registry (real filesystem).
 */
/** @jest-environment node */
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the real games directory relative to this file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_GAMES_PATH = __dirname;

// Import the registry WITHOUT mocking fs so it reads the actual filesystem.
const { scanGamesDirectory } = await import('./registry.js');

describe('registry integration — real filesystem', () => {
  /** @type {object[]} */
  let manifests;

  beforeAll(async () => {
    manifests = await scanGamesDirectory(REAL_GAMES_PATH);
  });

  test('scanGamesDirectory finds at least one game', () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  test('every manifest has the required fields: id, name, description, entryPoint', () => {
    manifests.forEach((m) => {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.name).toBe('string');
      expect(m.name.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe('string');
      expect(m.description.length).toBeGreaterThan(0);
      expect(typeof m.entryPoint).toBe('string');
      expect(m.entryPoint.length).toBeGreaterThan(0);
    });
  });

  test('every game has an interface.html that can be read as a string', async () => {
    for (const manifest of manifests) {
      const htmlPath = path.join(REAL_GAMES_PATH, manifest.id, 'interface.html');
      const html = await readFile(htmlPath, 'utf8');
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    }
  });

  test('every game entry-point file exists and can be read', async () => {
    for (const manifest of manifests) {
      const entryPath = path.join(REAL_GAMES_PATH, manifest.id, manifest.entryPoint);
      const src = await readFile(entryPath, 'utf8');
      expect(typeof src).toBe('string');
      expect(src.length).toBeGreaterThan(0);
    }
  });

  test('no game IDs are duplicated', () => {
    const ids = manifests.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
