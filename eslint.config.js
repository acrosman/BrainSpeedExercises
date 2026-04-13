import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'out/**'],
  },
  js.configs.recommended,
  // Default rules for all files
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreTemplateLiterals: true }],
      'no-console': 'warn',
    },
  },
  // Main process (Node.js) — scripts still allowed; main.js uses electron-log
  {
    files: ['forge.config.cjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  // main.js — Node.js globals; console is disallowed (use electron-log)
  {
    files: ['main.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Renderer process (browser)
  {
    files: ['app/interface.js', 'app/components/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Preload script (CommonJS + Node)
  {
    files: ['app/preload.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },
  // Game registry and progress (Node.js backend) — console is disallowed (use electron-log)
  {
    files: ['app/games/registry.js', 'app/progress/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Game plugin source files (can use browser globals)
  {
    files: ['app/games/**/*.js'],
    ignores: ['app/games/**/*.test.js', 'app/games/**/tests/**'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  // Test files
  {
    files: ['**/*.test.js', '**/tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
