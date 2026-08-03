import { describe, expect, it } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import { hasAnyRole, rolesOf } from './roles';

function account(claims: Record<string, unknown>): AccountInfo {
  // Only the fields the resolver reads matter; the rest of AccountInfo is irrelevant here.
  return { idTokenClaims: claims } as unknown as AccountInfo;
}

describe('rolesOf', () => {
  it('returns an empty list for no account', () => {
    expect(rolesOf(null)).toEqual([]);
  });

  it('reads named app roles, lower-cased', () => {
    expect(rolesOf(account({ roles: ['Admin', 'Editor'] }))).toEqual(['admin', 'editor']);
  });

  it('ignores unknown claim shapes', () => {
    expect(rolesOf(account({ roles: 'not-an-array' }))).toEqual([]);
  });
});

describe('hasAnyRole', () => {
  it('is true for any signed-in account when nothing is required', () => {
    expect(hasAnyRole(account({}), [])).toBe(true);
  });

  it('is true when the account holds one of the required roles', () => {
    expect(hasAnyRole(account({ roles: ['editor'] }), ['admin', 'editor'])).toBe(true);
  });

  it('is false when the account holds none of them', () => {
    expect(hasAnyRole(account({ roles: ['viewer'] }), ['admin'])).toBe(false);
  });
});
