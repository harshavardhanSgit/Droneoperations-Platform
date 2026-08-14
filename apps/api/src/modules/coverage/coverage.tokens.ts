/** Injection token for the TTL cache the PUBLIC coverage endpoint reads through. */
export const COVERAGE_CACHE = Symbol('COVERAGE_CACHE');

/** Key under which the aggregated overview is held. One value, one key. */
export const COVERAGE_CACHE_KEY = 'overview';
