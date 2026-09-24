// forge.config.cjs — Electron Forge config for BrainSpeedExercises (CommonJS)
const path = require('path');

module.exports = {
  packagerConfig: {
    appBundleId: 'com.aaroncrosman.brainspeedexercises',
    executableName: 'brain-speed-exercises',
    icon: path.resolve(__dirname, 'assets/icons/app'), // .icns/.ico/.png auto-appended
    asar: false, // dynamic import() of game modules
    // Ad-hoc sign the whole bundle ('-' identity) so the signature stays valid after
    // packager renames the app. No Apple Developer ID is needed. Hardened runtime is off
    // because it requires every framework to share a Team ID, which ad-hoc signing lacks.
    osxSign: {
      identity: '-',
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
    ignore: [
      /^\/\.github/, /^\/coverage/, /^\/__mocks__/, /^\/out\//,
      /^\/scripts/, 'contributing.md', 'CODE_OF_CONDUCT.md',
      '.eslint.config.js', 'jest.config.js', 'forge.config.cjs',
      /\/tests\//, /.test.js$/, /assets\/icons\/source\.png$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULMO',
      },
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'BrainSpeedExercises',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        maintainer: 'Aaron Crosman',
        homepage: 'https://github.com/acrosman/BrainSpeedExercises',
        categories: ['Game', 'Education'],
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {
        homepage: 'https://github.com/acrosman/BrainSpeedExercises',
        categories: ['Game', 'Education'],
      },
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'acrosman',
          name: 'BrainSpeedExercises',
        },
        draft: true,
        generateReleaseNotes: true,
      },
    },
  ],
};
