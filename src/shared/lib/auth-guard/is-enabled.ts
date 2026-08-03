import { serverEnv } from '@/shared/config';

// The guard is active only when explicitly switched on for the environment.
// Local machines leave AUTH_GUARD_ENABLED unset, so this returns false and the
// guard stays completely silent there.
export function isGuardEnabled(): boolean {
  return serverEnv.AUTH_GUARD_ENABLED === 'true';
}
