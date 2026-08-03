/**
 * Forces every integration test onto the TEST database.
 *
 * Set before any module loads, so PrismaService cannot pick up a developer's
 * .env by accident. Truncating the wrong database is a mistake you only make
 * once, and it should be impossible rather than merely unlikely.
 */
process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://marut@localhost:5432/drone_ops_test?schema=public';

process.env['NODE_ENV'] = 'test';
process.env['JWT_ACCESS_SECRET'] ??= 'integration-test-secret-at-least-32-chars-long';
process.env['API_PUBLIC_URL'] ??= 'http://localhost:3999';
process.env['STORAGE_LOCAL_DIR'] ??= '.storage-test';
