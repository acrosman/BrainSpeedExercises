// forge.config.cjs — Electron Forge config for BrainSpeedExercises (CommonJS)
const path = require('path');

module.exports = {
  packagerConfig: {
    appId: 'com.aaroncrosman.brainspeedexercises',
    productName: 'Brain Speed Exercises',
    executableName: 'brain-speed-exercises',
    icon: path.resolve(__dirname, 'assets/icons/icon'), // .icns/.ico/.png auto-appended
    asar: false, // dynamic import() of game modules
    ignore: [
      /^\/\.github/, /^\/coverage/, /^\/__mocks__/,
      /^\/scripts/, 'contributing.md', 'CODE_OF_CONDUCT.md',
      '.eslint.config.js', 'jest.config.js', 'forge.config.cjs',
      /\/tests\//, /.test.js$/, /assets\/icons\/source\.png$/
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
