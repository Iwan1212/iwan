module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  testMatch: ['**/tests/**/*.test.js'],
  testEnvironment: 'node',
  clearMocks: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
