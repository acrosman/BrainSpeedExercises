/** @jest-environment node */
import { jest } from '@jest/globals';
import path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

const GAMES_PATH = '/mock/games';

const validManifest = {
  id: 'test-game',
  name: 'Test Game',
  description: 'A brain training game.',
  entryPoint: 'index.js',
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockReaddir = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readdir: mockReaddir,
    readFile: mockReadFile,
  },
}));

const mockLogWarn = jest.fn();

jest.unstable_mockModule('electron-log', () => ({
  default: {
    error: jest.fn(),
    warn: mockLogWarn,
    info: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    silly: jest.fn(),
    initialize: jest.fn(),
    transports: {
      file: { level: 'info', resolvePathFn: jest.fn() },
      console: { level: 'warn' },
    },
  },
}));

const mockPlugin = {
  name: 'Test Game',
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
};

// Import the module under test AFTER mocks are registered.
const { scanGamesDirectory, loadGame } = await import('./registry.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a dirent-like object. */
function dirent(name, isDir = true) {
  return { name, isDirectory: () => isDir };
}

beforeEach(() => {
  jest.resetAllMocks();
});


// ─── scanGamesDirectory ───────────────────────────────────────────────────────

describe('scanGamesDirectory', () => {
  test('returns manifests for valid game directories', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(validManifest);
  });

  test('filters out non-directory entries', async () => {
    mockReaddir.mockResolvedValue([
      dirent('test-game', true),
      dirent('README.md', false),
    ]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(1);
  });

  test('skips directories whose names begin with "_"', async () => {
    mockReaddir.mockResolvedValue([dirent('_template')]);

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  test('skips (with a warning) entries whose manifest is missing required fields', async () => {
    mockReaddir.mockResolvedValue([dirent('bad-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify({ id: 'bad-game' }));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('bad-game'));
  });

  test('skips (with a warning) entries whose manifest.json cannot be read', async () => {
    mockReaddir.mockResolvedValue([dirent('broken-game')]);
    mockReadFile.mockRejectedValue(new Error('Permission denied'));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('broken-game'));
  });

  test('skips (with a warning) entries with malformed JSON in manifest', async () => {
    mockReaddir.mockResolvedValue([dirent('malformed-game')]);
    mockReadFile.mockResolvedValue('not valid json {{{{');

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockLogWarn).toHaveBeenCalled();
  });

  test('rejects when the games directory does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReaddir.mockRejectedValue(err);

    await expect(scanGamesDirectory(GAMES_PATH)).rejects.toThrow();
  });

  test('returns empty array when no valid games are found', async () => {
    mockReaddir.mockResolvedValue([]);

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toEqual([]);
  });

  test('resolves thumbnail path relative to the games directory', async () => {
    const manifestWithThumbnail = { ...validManifest, thumbnail: 'images/thumbnail.png' };
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(manifestWithThumbnail));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result[0].thumbnail).toBe('games/test-game/images/thumbnail.png');
  });
});

// ─── loadGame ────────────────────────────────────────────────────────────────

describe('loadGame', () => {
  test('returns { manifest, plugin } for a known game ID', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));
    const mockImportFn = jest.fn().mockResolvedValue({ default: mockPlugin });

    const result = await loadGame(GAMES_PATH, 'test-game', mockImportFn);

    expect(result.manifest).toEqual(validManifest);
    expect(result.plugin).toBe(mockPlugin);
    expect(mockImportFn).toHaveBeenCalledWith(
      path.join(GAMES_PATH, 'test-game', 'index.js'),
    );
  });

  test('rejects with a descriptive error for an unknown game ID', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    await expect(loadGame(GAMES_PATH, 'nonexistent-game')).rejects.toThrow(
      'nonexistent-game',
    );
  });

  test('uses the default import function when importFn is not provided', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    // No importFn passed — the default (p) => import(p) is used.
    // Importing a non-existent mock path will reject; that is expected.
    await expect(loadGame(GAMES_PATH, 'test-game')).rejects.toThrow();
  });

  test('finds the correct game when multiple games are registered', async () => {
    const secondManifest = {
      id: 'second-game',
      name: 'Second Game',
      description: 'Another brain training game.',
      entryPoint: 'index.js',
    };
    mockReaddir.mockResolvedValue([dirent('test-game'), dirent('second-game')]);
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(validManifest))
      .mockResolvedValueOnce(JSON.stringify(secondManifest));
    const mockImportFn = jest.fn().mockResolvedValue({ default: mockPlugin });

    const result = await loadGame(GAMES_PATH, 'second-game', mockImportFn);

    expect(result.manifest).toEqual(secondManifest);
    expect(mockImportFn).toHaveBeenCalledWith(
      path.join(GAMES_PATH, 'second-game', 'index.js'),
    );
  });
});
