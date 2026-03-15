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
