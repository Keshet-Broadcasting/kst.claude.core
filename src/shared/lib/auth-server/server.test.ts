import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_USER_HEADER,
  AuthError,
  authErrorResponse,
  decodeUser,
  encodeUser,
  getAuthUser,
  hasAnyRole,
  resolveRoles,
  withAuth,
  type AzureAdUser,
} from './server';

function makeUser(overrides: Partial<AzureAdUser> = {}): AzureAdUser {
  return {
    userId: 'oid-123',
    username: 'user@example.com',
    displayName: 'Test User',
    groups: [],
    roles: [],
    scopes: [],
    ...overrides,
  };
}

function requestWithUser(user: AzureAdUser): Request {
  return new Request('http://localhost/api/me', {
    headers: { [AUTH_USER_HEADER]: encodeUser(user) },
  });
}

describe('encodeUser / decodeUser', () => {
  it('round-trips a user, including a non-ASCII display name', () => {
    const user = makeUser({ displayName: 'שם משתמש', roles: ['admin'] });
    expect(decodeUser(encodeUser(user))).toEqual(user);
  });
});

describe('getAuthUser', () => {
  it('returns the identity middleware attached', () => {
    const user = makeUser();
    expect(getAuthUser(requestWithUser(user))).toEqual(user);
  });

  it('throws AuthError(401) when the header is absent', () => {
    const request = new Request('http://localhost/api/me');
    expect(() => getAuthUser(request)).toThrowError(AuthError);
    try {
      getAuthUser(request);
    } catch (error) {
      expect((error as AuthError).status).toBe(401);
    }
  });
});

describe('resolveRoles / hasAnyRole', () => {
  const ORIGINAL_ADMIN_GROUP = process.env.AZURE_AD_ROLE_GROUP_ADMIN;

  afterEach(() => {
    if (ORIGINAL_ADMIN_GROUP === undefined) delete process.env.AZURE_AD_ROLE_GROUP_ADMIN;
    else process.env.AZURE_AD_ROLE_GROUP_ADMIN = ORIGINAL_ADMIN_GROUP;
  });

  it('reads named app roles directly, lower-cased', () => {
    expect(resolveRoles(makeUser({ roles: ['Admin'] }))).toContain('admin');
  });

  it('maps a configured security group id to a role', () => {
    process.env.AZURE_AD_ROLE_GROUP_ADMIN = 'group-guid';
    expect(resolveRoles(makeUser({ groups: ['group-guid'] }))).toContain('admin');
  });

  it('treats an empty requirement as "any signed-in user"', () => {
    expect(hasAnyRole(makeUser(), [])).toBe(true);
  });

  it('rejects a user missing the required role', () => {
    expect(hasAnyRole(makeUser({ roles: ['viewer'] }), ['admin'])).toBe(false);
  });
});

describe('authErrorResponse', () => {
  it('uses the AuthError status', async () => {
    const response = authErrorResponse(new AuthError(403, 'nope'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ statusCode: 403, message: 'nope' });
  });

  it('falls back to 500 for an unknown error', () => {
    expect(authErrorResponse(new Error('boom')).status).toBe(500);
  });
});

describe('withAuth', () => {
  const context = { params: Promise.resolve({}) };

  it('passes the verified user to the handler when no role is required', async () => {
    const handler = withAuth(async (_request, { user }) =>
      Response.json({ id: user.userId }),
    );
    const response = await handler(requestWithUser(makeUser()), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 'oid-123' });
  });

  it('returns 403 when the user lacks the required role', async () => {
    const handler = withAuth(async () => new Response(null, { status: 204 }), {
      roles: ['admin'],
    });
    const response = await handler(requestWithUser(makeUser({ roles: ['viewer'] })), context);
    expect(response.status).toBe(403);
  });
});
