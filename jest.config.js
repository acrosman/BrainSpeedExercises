export default {
  testEnvironment: 'jsdom',
  transform: {},
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
    '!app/**/*.test.js',
    '!app/preload.js',
    '!app/interface.js',
  ],
};
