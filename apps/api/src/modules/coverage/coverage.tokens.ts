/**
 * Injection token for the TTL cache the PUBLIC coverage endpoint reads
 * through. Own file, not the module file: the service and the module both
 * import it, and a service importing the module that imports it would be a
 * circular dependency Nest refuses to scan.
 */
export const COVERAGE_CACHE = Symbol('COVERAGE_CACHE');

/** Key under which the aggregated overview is held. One value, one key. */
export const COVERAGE_CACHE_KEY = 'overview';
