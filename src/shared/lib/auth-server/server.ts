import { NextResponse } from 'next/server';
import { AuthError, verifyAzureToken, type AzureAdUser } from './verify-azure-token';

/**
 * Server-side helpers for App Router route handlers.
 *
 * The division of labour: `proxy.ts` verifies the token once per request and hands the
 * identity forward on a request header; route handlers read it back with `getAuthUser` and
 * apply their own role rules. Verifying once rather than once-per-handler keeps the crypto
 * off the hot path and keeps "is this request authenticated?" answerable in one place.
 */

/** The header the proxy uses to forward the verified identity. Never trust it from a client. */
export const AUTH_USER_HEADER = 'x-auth-user';

/**
 * The identity the proxy injects when enforcement is off (local development). It carries every
 * app role so role-gated handlers also pass locally — the point of the local bypass is that
 * nothing blocks you. Real environments never see this: with `NEXT_PUBLIC_AUTH_ENABLED=true`
 * the proxy verifies a real token instead.
 */
export const DEV_AUTH_USER: AzureAdUser = {
  userId: 'dev-user',
  username: 'dev@localhost',
  displayName: 'Local Dev User',
  groups: [],
  roles: ['admin', 'editor', 'viewer'],
  scopes: [],
};

/**
 * Headers are ASCII-only by spec, and display names on this platform are frequently not
 * (Hebrew, accented Latin). `encodeURIComponent` keeps the payload header-safe without pulling
 * in a base64 polyfill that the Edge runtime doesn't have.
 */
export function encodeUser(user: AzureAdUser): string {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeUser(raw: string): AzureAdUser {
  return JSON.parse(decodeURIComponent(raw)) as AzureAdUser;
}

/**
 * Reads the identity that the proxy attached. Throws `AuthError(401)` when it is absent,
 * which in practice means the route sits outside the proxy matcher — a wiring bug worth
 * failing loudly on rather than serving the request as anonymous.
 */
export function getAuthUser(request: Request): AzureAdUser {
  const raw = request.headers.get(AUTH_USER_HEADER);
  if (!raw) {
    throw new AuthError(
      401,
      'No verified identity on the request. Is this path covered by the proxy matcher?',
    );
  }
  return decodeUser(raw);
}

/**
 * Maps Entra ID security group object ids to application roles. Group ids are opaque GUIDs
 * that differ per environment, so they belong in configuration, never in code.
 *
 * Highest privilege wins. Extend the ladder rather than branching on group ids at call sites.
 */
const ROLE_LADDER: ReadonlyArray<{ role: string; envVar: string }> = [
  { role: 'admin', envVar: 'AZURE_AD_ROLE_GROUP_ADMIN' },
  { role: 'editor', envVar: 'AZURE_AD_ROLE_GROUP_EDITOR' },
  { role: 'viewer', envVar: 'AZURE_AD_ROLE_GROUP_VIEWER' },
];

export function resolveRoles(user: AzureAdUser): string[] {
  // App roles assigned on the app registration arrive already named — prefer them: they
  // survive the group-overage problem and read the same in every environment.
  const roles = new Set(user.roles.map((role) => role.toLowerCase()));

  for (const { role, envVar } of ROLE_LADDER) {
    const groupId = process.env[envVar];
    if (groupId && user.groups.includes(groupId)) roles.add(role);
  }

  return [...roles];
}

export function hasAnyRole(user: AzureAdUser, required: readonly string[]): boolean {
  if (required.length === 0) return true;
  const roles = resolveRoles(user);
  return required.some((role) => roles.includes(role.toLowerCase()));
}

/** Turns an `AuthError` into the JSON error shape used by the rest of the API. */
export function authErrorResponse(error: unknown): NextResponse {
  const status = error instanceof AuthError ? error.status : 500;
  const message = error instanceof AuthError ? error.message : 'Internal server error';
  if (status === 500) console.error('[auth] Unexpected error in route handler', error);
  return NextResponse.json({ statusCode: status, message }, { status });
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/**
 * Wraps a route handler so it receives a verified user and, optionally, only runs for callers
 * holding one of `roles`. Use it when a route needs authorization beyond "is signed in" —
 * the wrapper keeps the check next to the handler instead of in a growing middleware switch.
 *
 *   export const DELETE = withAuth(async (request, { user, params }) => { ... }, { roles: ['admin'] });
 */
export function withAuth<TContext extends RouteContext>(
  handler: (
    request: Request,
    context: TContext & { user: AzureAdUser },
  ) => Promise<Response> | Response,
  options: { roles?: readonly string[] } = {},
) {
  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      const user = getAuthUser(request);
      if (!hasAnyRole(user, options.roles ?? [])) {
        throw new AuthError(403, 'Insufficient role for this operation');
      }
      return await handler(request, { ...context, user });
    } catch (error) {
      return authErrorResponse(error);
    }
  };
}

/**
 * Verifies the token directly, for the rare handler that sits outside the proxy matcher
 * (a webhook receiver you later decided to protect, a route under a custom matcher). Anything
 * covered by the proxy should use `getAuthUser` instead and skip the second verification.
 */
export async function requireAuth(request: Request): Promise<AzureAdUser> {
  return verifyAzureToken(request.headers.get('authorization'));
}

export { AuthError, type AzureAdUser };
