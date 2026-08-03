/**
 * Integration tests: real Postgres, real transactions, real constraints.
 *
 * Separate from the unit config on purpose. These are slower and need a
 * database, so mixing them would make the fast suite slow and stop it being
 * run on every save. Different guarantees, different command.
 *
 * runInBand because every spec truncates shared tables — parallel workers
 * would clobber each other's fixtures.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  setupFiles: ['<rootDir>/test/helpers/env.ts'],
  testTimeout: 20000,
  maxWorkers: 1,
};
