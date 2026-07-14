import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a unique id each call', () => {
    expect(createId()).not.toBe(createId());
  });

  it('returns a well-formed v4 UUID', () => {
    expect(createId()).toMatch(UUID_V4_PATTERN);
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', () => {
    // crypto.randomUUID() is undefined on non-secure-context origins (e.g. a LAN http:// URL) —
    // simulate that by stubbing the global crypto object without it.
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);

    vi.stubGlobal('crypto', {
      ...crypto,
      randomUUID: undefined,
      getRandomValues: originalGetRandomValues,
    });

    expect(crypto.randomUUID).toBeUndefined();

    const first = createId();
    const second = createId();

    expect(first).toMatch(UUID_V4_PATTERN);
    expect(second).toMatch(UUID_V4_PATTERN);
    expect(first).not.toBe(second);
  });
});
