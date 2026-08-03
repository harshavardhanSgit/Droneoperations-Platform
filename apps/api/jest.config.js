/**
 * Unit tests only — no database, no HTTP.
 *
 * Everything here runs against pure functions or services with mocked
 * repositories, so the whole suite finishes in under a second and can run on
 * every save. Integration tests that need Postgres are a separate concern with
 * a separate config; mixing them makes the fast suite slow and the slow suite
 * unreliable.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/generated/**', '!**/*.module.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
