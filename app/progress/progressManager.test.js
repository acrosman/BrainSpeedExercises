/** @jest-environment node */
import { jest } from '@jest/globals';
import path from 'path';

const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockRename = jest.fn();
const mockUnlink = jest.fn();
const mockGetPath = jest.fn();
const mockLogInfo = jest.fn();

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    rename: mockRename,
    unlink: mockUnlink,
  },
}));

jest.unstable_mockModule('electron', () => ({
  app: { getPath: mockGetPath },
}));

jest.unstable_mockModule('electron-log', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: mockLogInfo,
    verbose: jest.fn(),
    debug: jest.fn(),
    initialize: jest.fn(),
    transports: {
      file: { level: 'info', resolvePathFn: jest.fn() },
      console: { level: 'warn' },
    },
  },
}));

const { loadProgress, saveProgress, resetProgress } = await import('./progressManager.js');

beforeEach(() => {
  jest.resetAllMocks();
  mockGetPath.mockReturnValue('/mock/userData');
});

describe('loadProgress', () => {
  test('returns default object when file is missing (ENOENT)', async () => {
    const err = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(err);

    const result = await loadProgress('player1');

    expect(result.playerId).toBe('player1');
    expect(result.games).toEqual({});
    expect(typeof result.lastUpdated).toBe('string');
  });

  test('returns parsed data when file exists', async () => {
    const data = {
      playerId: 'player1',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      games: {},
    };
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await loadProgress('player1');

    expect(result).toEqual(data);
  });

  test('rejects on corrupt JSON', async () => {
    mockReadFile.mockResolvedValue('not-valid-json{{{');

    await expect(loadProgress('player1')).rejects.toThrow();
  });

  test('re-throws non-ENOENT file system errors', async () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    mockReadFile.mockRejectedValue(err);

    await expect(loadProgress('player1')).rejects.toThrow('Permission denied');
  });
});

describe('saveProgress', () => {
  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  test('writes to .tmp path then renames to final path', async () => {
    await saveProgress('player1', { playerId: 'player1', games: {} });

    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join('/mock/userData', 'player1.json.tmp'),
      expect.any(String),
      'utf8',
    );
    expect(mockRename).toHaveBeenCalledWith(
      path.join('/mock/userData', 'player1.json.tmp'),
      path.join('/mock/userData', 'player1.json'),
    );
  });

  test('sets lastUpdated to current ISO timestamp', async () => {
    const before = new Date().toISOString();
    await saveProgress('player1', { playerId: 'player1', games: {} });
    const after = new Date().toISOString();

    const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
    expect(written.lastUpdated >= before).toBe(true);
    expect(written.lastUpdated <= after).toBe(true);
  });

  test('logs an info message including the saved file path', async () => {
    await saveProgress('player1', { playerId: 'player1', games: {} });

    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/mock/userData', 'player1.json')),
    );
  });
});

describe('resetProgress', () => {
  test('calls unlink on the player file', async () => {
    mockUnlink.mockResolvedValue(undefined);

    await resetProgress('player1');

    expect(mockUnlink).toHaveBeenCalledWith(path.join('/mock/userData', 'player1.json'));
  });

  test('resolves silently when file is missing (ENOENT)', async () => {
    const err = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    mockUnlink.mockRejectedValue(err);

    await expect(resetProgress('player1')).resolves.toBeUndefined();
  });

  test('rejects on other file system errors', async () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    mockUnlink.mockRejectedValue(err);

    await expect(resetProgress('player1')).rejects.toThrow('Permission denied');
  });
});

describe('input validation', () => {
  test('loadProgress rejects for empty string', async () => {
    await expect(loadProgress('')).rejects.toThrow('non-empty string');
  });

  test('loadProgress rejects for non-string value', async () => {
    await expect(loadProgress(123)).rejects.toThrow('non-empty string');
  });

  test('loadProgress rejects for path-traversal with ..', async () => {
    await expect(loadProgress('../evil')).rejects.toThrow('path-traversal');
  });

  test('loadProgress rejects for path-traversal with /', async () => {
    await expect(loadProgress('/etc/passwd')).rejects.toThrow('path-traversal');
  });

  test('loadProgress rejects for path-traversal with backslash', async () => {
    await expect(loadProgress('C:\\Windows')).rejects.toThrow('path-traversal');
  });

  test('saveProgress rejects for empty string', async () => {
    await expect(saveProgress('', {})).rejects.toThrow('non-empty string');
  });

  test('saveProgress rejects for path-traversal', async () => {
    await expect(saveProgress('../evil', {})).rejects.toThrow('path-traversal');
  });

  test('resetProgress rejects for empty string', async () => {
    await expect(resetProgress('')).rejects.toThrow('non-empty string');
  });

  test('resetProgress rejects for path-traversal', async () => {
    await expect(resetProgress('../evil')).rejects.toThrow('path-traversal');
  });
});
