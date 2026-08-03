import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

/**
 * Verifies Microsoft Entra ID (Azure AD) access tokens.
 *
 * `jose` is used rather than `jsonwebtoken` + `jwks-rsa` because this file is imported by
 * `middleware.ts`, which runs on the Edge runtime: `jose` is built on Web Crypto and works
 * there, while `jsonwebtoken` depends on Node's `crypto` and will fail to bundle.
 *
 * Verification is not decoding. A decoded token proves nothing — anyone can mint one. All
 * three of these must hold before a request is trusted:
 *   - signature: signed by a current key from the tenant's JWKS endpoint
 *   - audience:  minted *for this API*, not for Graph or a sibling service
 *   - issuer:    minted by *our* tenant
 */

export interface AzureAdUser {
  /** `oid` — stable object id of the user in the tenant. Use this as the user key, not the email. */
  userId: string;
  /** `preferred_username` / `upn` — usually the email. Can change; don't key data on it. */
  username: string;
  /** `name` — display name. May contain non-ASCII characters. */
  displayName: string;
  /** `groups` — Entra ID security group object ids. See the overage note below. */
  groups: string[];
  /** `roles` — app roles declared on the app registration and assigned to the user. */
  roles: string[];
  /** `scp` — delegated permissions. Empty for app-only (client credentials) tokens. */
  scopes: string[];
}

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Deliberately loud: a missing audience or tenant would otherwise turn into a token
    // check that silently accepts less than you think it does.
    throw new Error(`[auth] Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * The JWKS is fetched over the network and the keys rotate, so the set is cached at module
 * scope. `createRemoteJWKSet` handles caching, rotation and rate-limiting internally — build
 * it once, or every request pays for a fresh fetch.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${requiredEnv('AZURE_AD_TENANT_ID')}/discovery/v2.0/keys`,
      ),
      { cooldownDuration: 30_000 },
    );
  }
  return jwks;
}

/**
 * `AZURE_AD_AUDIENCE` may be written either way in different portals and .env files, and the
 * token carries whichever form the app registration exposes. Accept both rather than making
 * the caller guess — this widens nothing: both forms identify the same single app registration.
 */
function acceptedAudiences(): string[] {
  const configured = requiredEnv('AZURE_AD_AUDIENCE');
  const bare = configured.replace(/^api:\/\//, '');
  return Array.from(new Set([configured, bare, `api://${bare}`]));
}

/**
 * Entra ID issues v1.0 and v2.0 tokens with different issuer strings, and which one you get
 * depends on the `accessTokenAcceptedVersion` of the app registration — not on anything the
 * client controls. Accepting both means the API keeps working if that setting is changed.
 */
function acceptedIssuers(): string[] {
  const tenantId = requiredEnv('AZURE_AD_TENANT_ID');
  return [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
}

function readBearer(authorizationHeader: string | null | undefined): string {
  if (!authorizationHeader) {
    throw new AuthError(401, 'Missing Authorization header');
  }
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AuthError(401, 'Authorization header must be "Bearer <token>"');
  }
  return token;
}

function asStringArray(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((v): v is string => typeof v === 'string');
  if (typeof claim === 'string') return claim.split(' ').filter(Boolean);
  return [];
}

function toUser(payload: JWTPayload): AzureAdUser {
  return {
    userId: (payload.oid as string) ?? (payload.sub as string) ?? '',
    username:
      (payload.preferred_username as string) ??
      (payload.upn as string) ??
      (payload.unique_name as string) ??
      '',
    displayName: (payload.name as string) ?? '',
    groups: asStringArray(payload.groups),
    roles: asStringArray(payload.roles),
    scopes: asStringArray(payload.scp),
  };
}

/**
 * Verifies an `Authorization: Bearer <token>` header and returns the caller's identity.
 * Throws `AuthError(401)` for anything that fails — never returns a partially trusted user.
 */
export async function verifyAzureToken(
  authorizationHeader: string | null | undefined,
): Promise<AzureAdUser> {
  const token = readBearer(authorizationHeader);

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: acceptedAudiences(),
      issuer: acceptedIssuers(),
      algorithms: ['RS256'],
      // Small allowance for clock drift between Entra ID and the server.
      clockTolerance: 60,
    });

    const user = toUser(payload);

    // Group *overage*: when a user belongs to more groups than fit in a token (~200 for JWTs),
    // Entra ID omits `groups` entirely and sets `hasgroups`/`_claim_names` instead. Silently
    // treating that as "no groups" would deny an admin their access. Prefer app `roles` for
    // authorization; if you must use groups, detect overage and resolve them via Graph.
    if (payload.hasgroups === true || payload._claim_names) {
      console.warn(
        `[auth] Group overage for user ${user.userId}: the token carries no groups claim. ` +
          'Authorize with app roles, or resolve group membership via Microsoft Graph.',
      );
    }

    return user;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof errors.JWTExpired) throw new AuthError(401, 'Access token expired');
    if (error instanceof errors.JWTClaimValidationFailed) {
      // Most often: a token minted for Microsoft Graph, or for a different app registration.
      throw new AuthError(401, `Token rejected: ${error.claim} claim is not accepted`);
    }
    throw new AuthError(401, 'Invalid access token');
  }
}
