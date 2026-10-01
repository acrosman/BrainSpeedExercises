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
    initialize: jest.fn(),
    transports: {
      file: { level: 'info', resolvePathFn: jest.fn() },
      console: { level: 'warn' },
    },
  },
}));

// Import the module under test AFTER mocks are registered.
const {
  scanGamesDirectory,
  findGame,
  listGameImages,
  resolveInside,
} = await import('./registry.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a dirent-like object. */
function dirent(name, isDir = true) {
  return { name, isDirectory: () => isDir };
}

beforeEach(() => {
  jest.resetAllMocks();
});


// ─── resolveInside ───────────────────────────────────────────────────────────

describe('resolveInside', () => {
  test('returns the absolute path for segments inside the base directory', () => {
    expect(resolveInside('/app/games', ['card-rat', 'index.js'], path.posix))
      .toBe('/app/games/card-rat/index.js');
  });

  test('allows ".." that stays inside the base directory', () => {
    expect(resolveInside('/app/games', ['card-rat', '..', 'fast-piggie'], path.posix))
      .toBe('/app/games/fast-piggie');
  });

  test('allows a name that only starts with ".."', () => {
    expect(resolveInside('/app/games', ['..card-rat'], path.posix))
      .toBe('/app/games/..card-rat');
  });

  test.each([
    [['..']],
    [['..', 'progress']],
    [['card-rat', '..', '..', 'main.js']],
    [['/etc/passwd']],
    [['.']],
  ])('rejects POSIX segments %j that leave the base directory', (segments) => {
    expect(() => resolveInside('/app/games', segments, path.posix)).toThrow('outside');
  });

  test('resolves Windows paths with a drive letter', () => {
    expect(resolveInside('C:\\app\\games', ['card-rat', 'index.js'], path.win32))
      .toBe('C:\\app\\games\\card-rat\\index.js');
  });

  test.each([
    [['..\\..\\Windows']],
    [['card-rat/../../main.js']],
    [['D:\\secrets']],
    [['C:\\Windows']],
    [['\\\\server\\share']],
  ])('rejects Windows segments %j that leave the base directory', (segments) => {
    expect(() => resolveInside('C:\\app\\games', segments, path.win32)).toThrow('outside');
  });

  test.each([
    [[undefined]],
    [[null]],
    [['']],
    [[42]],
    [[{}]],
  ])('rejects segments %j that are not non-empty strings', (segments) => {
    expect(() => resolveInside('/app/games', segments)).toThrow('non-empty strings');
  });

  test('uses the platform path module by default', () => {
    expect(resolveInside(GAMES_PATH, ['test-game']))
      .toBe(path.resolve(GAMES_PATH, 'test-game'));
  });
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

  test('skips (with a warning) entries whose manifest id does not match the folder', async () => {
    mockReaddir.mockResolvedValue([dirent('other-folder')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('does not match'));
  });

  test('skips (with a warning) entries whose entryPoint leaves the game folder', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(
      JSON.stringify({ ...validManifest, entryPoint: '../../main.js' }),
    );

    const result = await scanGamesDirectory(GAMES_PATH);

    expect(result).toHaveLength(0);
    expect(mockLogWarn).toHaveBeenCalledWith(expect.stringContaining('outside'));
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

// ─── findGame ────────────────────────────────────────────────────────────────

describe('findGame', () => {
  test('returns the manifest for a known game ID without importing game code', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    const result = await findGame(GAMES_PATH, 'test-game');

    expect(result).toEqual(validManifest);
  });

  test('rejects with a descriptive error for an unknown game ID', async () => {
    mockReaddir.mockResolvedValue([dirent('test-game')]);
    mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

    await expect(findGame(GAMES_PATH, 'nonexistent-game')).rejects.toThrow(
      'nonexistent-game',
    );
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

    const result = await findGame(GAMES_PATH, 'second-game');

    expect(result).toEqual(secondManifest);
  });
});

// ─── listGameImages ──────────────────────────────────────────────────────────

describe('listGameImages', () => {
  test('returns sorted PNG and JPEG names from the game image subfolder', async () => {
    mockReaddir.mockResolvedValue(['b.png', 'notes.txt', 'a.JPG', 'c.jpeg']);

    const result = await listGameImages(GAMES_PATH, 'test-game', 'backgrounds');

    expect(result).toEqual(['a.JPG', 'b.png', 'c.jpeg']);
    expect(mockReaddir).toHaveBeenCalledWith(
      path.resolve(GAMES_PATH, 'test-game', 'images', 'backgrounds'),
    );
  });

  test('returns an empty array when the folder cannot be read', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await listGameImages(GAMES_PATH, 'test-game', 'missing');

    expect(result).toEqual([]);
  });

  test.each([
    ['test-game', '..'],
    ['test-game', '../../other-game/images'],
    ['../..', 'backgrounds'],
    ['test-game', path.resolve('/')],
    ['test-game', undefined],
    [undefined, 'backgrounds'],
  ])('returns [] without reading for gameId %p and subfolder %p', async (gameId, subfolder) => {
    const result = await listGameImages(GAMES_PATH, gameId, subfolder);

    expect(result).toEqual([]);
    expect(mockReaddir).not.toHaveBeenCalled();
  });
});
