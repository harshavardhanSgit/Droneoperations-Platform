import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns what was set, within the TTL', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    expect(cache.get('a')).toBe('value');
    expect(cache.size).toBe(1);
  });

  it('expires entries after the TTL has passed', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    jest.advanceTimersByTime(60_001);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('honours a per-set TTL that overrides the default', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('short', 'value', 1_000);

    jest.advanceTimersByTime(1_001);
    expect(cache.get('short')).toBeUndefined();

    cache.set('long', 'value');
    jest.advanceTimersByTime(30_000);
    expect(cache.get('long')).toBe('value');
  });

  it('does not expire before the TTL has elapsed', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'value');

    jest.advanceTimersByTime(59_999);
    expect(cache.get('a')).toBe('value');
  });

  it('delete and clear remove entries', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', '1');
    cache.set('b', '2');

    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');

    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('an expired entry is dropped even after a fresh write', () => {
    const cache = new TtlCache<string>(60_000);
    cache.set('a', 'first');

    jest.advanceTimersByTime(60_001);
    cache.set('a', 'second');

    // The overwrite resets the clock — the entry must be alive again.
    expect(cache.get('a')).toBe('second');
  });
});
