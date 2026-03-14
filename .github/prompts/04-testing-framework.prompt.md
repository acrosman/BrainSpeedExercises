You are configuring the testing infrastructure for an Electron app called
BrainSpeedExercises. The project uses ES Modules ("type": "module"), ESLint
(Airbnb-base flat config), and Jest. The goal is 100% function coverage on
all modules at all times.

## Files to create or update

### 1. package.json (update scripts and devDependencies)
- Add to `devDependencies` (use latest major-version ranges):
  - `"jest": "^29"`
  - `"jest-environment-jsdom": "^29"`
  - `"@jest/globals": "^29"`
  - `"babel-jest": "^29"`
  - `"@babel/core": "^7"`
  - `"@babel/preset-env": "^7"`
- Update `scripts`:
  - `"test": "node --experimental-vm-modules node_modules/.bin/jest"`
  - `"test:watch": "node --experimental-vm-modules node_modules/.bin/jest --watch"`
  - `"test:coverage": "node --experimental-vm-modules node_modules/.bin/jest --coverage"`
  - `"lint": "eslint ."`
  - `"lint:fix": "eslint . --fix"`

### 2. jest.config.js — root Jest configuration
- Use `"transform": {}` and `"extensionsToTreatAsEsm": [".js"]` to
  support native ES Modules via `--experimental-vm-modules`.
- Set `testEnvironment` to `'jsdom'` for renderer-side tests; use an
  inline `@jest-environment node` docblock for main-process test files.
- Set `coverageThreshold`:
  ```json
  { "global": { "functions": 100, "branches": 80, "lines": 80, "statements": 80 } }
  ```
- `collectCoverageFrom`: `["app/**/*.js", "!app/games/_template/**", "!**/*.test.js"]`
- `testMatch`: `["**/*.test.js"]`

### 3. __mocks__/electron.js — Lightweight mock for Electron's main-process modules
- Mock `app.getPath` to return `/tmp/test-userdata`.
- Mock `ipcMain.handle` and `ipcMain.on` as `jest.fn()`.
- Mock `BrowserWindow` as a class with `loadURL`, `on`, `webContents.send`
  as `jest.fn()` methods.
- Export as a named object matching Electron's export shape.

### 4. .babelrc (or babel.config.json) — Babel configuration for Jest transforms only
- Target current Node.js version.
- Enable `@babel/preset-env` with `modules: 'auto'`.

### 5. app/components/gameCard.test.js — Example test file demonstrating the required pattern
- Import using ES Module `import` syntax.
- Use `describe` / `it` blocks.
- Clean up DOM state in `afterEach`.
- Check function coverage with `--coverage`.

## Coverage enforcement
Add a CI step that fails if function coverage drops below 100%:
```
npm run test:coverage -- --passWithNoTests
```
This command must run on every pull request.

## Constraints
- Do not use CommonJS (`require`).
- The Jest mock for Electron must not import from `electron` itself.
- Match Airbnb ESLint rules in all test files.
