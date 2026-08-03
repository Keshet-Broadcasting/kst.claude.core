import { NextResponse, type NextRequest } from 'next/server';
import {
  AuthError,
  verifyAzureToken,
  AUTH_USER_HEADER,
  DEV_AUTH_USER,
  encodeUser,
} from '@/shared/lib/auth-server';

/**
 * Off by default so local development needs no Entra ID setup. When false, the gate below is
 * skipped and a mock identity is injected instead — real verification runs only where
 * `NEXT_PUBLIC_AUTH_ENABLED=true` (production, locked-down staging).
 */
const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';

/**
 * The API gate (Next 16 renamed the `middleware` convention to `proxy` — same mechanism, runs
 * on the server before a request reaches a route handler). Every request under `/api` is
 * rejected unless it carries a valid Entra ID access token — one place to change, and no route
 * handler can forget to opt in.
 *
 * Why only `/api`: the browser holds the token in MSAL's cache, so a plain page navigation
 * carries no Authorization header. The proxy physically cannot tell a signed-in visitor from
 * an anonymous one on a page request. Pages are guarded on the client instead (`<AuthGuard>`),
 * which is safe because the data behind them is what's actually protected — here.
 */
export const config = {
  // Matchers must be static strings — they are analysed at build time, not evaluated.
  matcher: ['/api/:path*'],
};

/**
 * Routes that must stay reachable without a token. Keep this list short and specific;
 * every entry is a hole in the gate. Prefix matches, so '/api/health' also covers
 * '/api/health/db'.
 */
const PUBLIC_API_PREFIXES = ['/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  // CORS preflights never carry credentials; rejecting them breaks cross-origin callers
  // before the real request is ever sent.
  if (request.method === 'OPTIONS') return NextResponse.next();

  if (isPublic(request.nextUrl.pathname)) return NextResponse.next();

  // Local development: no token check. Inject a mock identity so protected route handlers
  // (which read it back via `getAuthUser`) still work without an Entra ID setup. Still delete
  // any incoming header first — the injected identity must be the only one downstream sees.
  if (!AUTH_ENABLED) {
    const headers = new Headers(request.headers);
    headers.delete(AUTH_USER_HEADER);
    headers.set(AUTH_USER_HEADER, encodeUser(DEV_AUTH_USER));
    return NextResponse.next({ request: { headers } });
  }

  try {
    const user = await verifyAzureToken(request.headers.get('authorization'));

    const headers = new Headers(request.headers);
    // A client can send any header it likes, including this one. Deleting before setting is
    // what makes the header trustworthy downstream — without it, `x-auth-user: {"roles":
    // ["admin"]}` from curl would sail straight through to the route handler.
    headers.delete(AUTH_USER_HEADER);
    headers.set(AUTH_USER_HEADER, encodeUser(user));

    return NextResponse.next({ request: { headers } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    const message = error instanceof AuthError ? error.message : 'Unauthorized';

    console.warn(
      `[auth] ${status} ${request.method} ${request.nextUrl.pathname} — ${message}`,
    );

    return NextResponse.json({ statusCode: status, message }, { status });
  }
}
