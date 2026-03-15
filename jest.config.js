/**
 * jest.config.js — Jest configuration for BrainSpeedExercises.
 *
 * Configures test environment, coverage thresholds, and file patterns for the test suite.
 *
 * @file Jest configuration.
 */
export default {
  testEnvironment: 'jsdom',
  transform: {},
  testMatch: ['**/*.test.js'],
  coverageThreshold: {
    global: {
      functions: 100,
      branches: 80,
      lines: 80,
      statements: 80,
    },
  },
  collectCoverageFrom: [
    'app/**/*.js',
    '!app/games/_template/**',
    '!**/*.test.js',
  ],
};
