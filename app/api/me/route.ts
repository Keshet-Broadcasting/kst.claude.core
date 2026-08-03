import { NextResponse } from 'next/server';
import { getAuthUser, authErrorResponse } from '@/shared/lib/auth-server';

/**
 * Protected example endpoint. It carries no auth logic of its own — the proxy (`proxy.ts`)
 * has already verified the token and attached the identity, so the handler just reads it back.
 *
 * Try it: `curl localhost:3000/api/me` returns 401 (no token); the same call from the browser
 * through `useApiFetch()` returns the signed-in user.
 */
export function GET(request: Request) {
  try {
    const user = getAuthUser(request);
    return NextResponse.json(user);
  } catch (error) {
    return authErrorResponse(error);
  }
}
