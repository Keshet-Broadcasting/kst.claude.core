import { serverEnv } from '@/shared/config';
import { checkAuth } from './check-auth';
import { isGuardEnabled } from './is-enabled';

// A framework-free decision so the guard can be unit-tested without constructing
// Next's request/response objects. `middleware.ts` maps this to a NextResponse.
export type GuardDecision = { type: 'pass' } | { type: 'redirect'; location: string };

const PASS: GuardDecision = { type: 'pass' };

export function guard(): GuardDecision {
  // Off on local (flag unset) — the guard does nothing.
  if (!isGuardEnabled()) return PASS;

  // Stubbed today: always authenticated. Wire the real check in check-auth.ts.
  if (checkAuth().authenticated) return PASS;

  const location = serverEnv.AUTH_LOGIN_URL;
  if (!location) {
    // Enabled but misconfigured: fail open rather than lock a live app out
    // before the auth service and its login page exist.
    console.warn(
      '[auth-guard] enabled but AUTH_LOGIN_URL is not set — passing request through (fail-open)',
    );
    return PASS;
  }

  return { type: 'redirect', location };
}
