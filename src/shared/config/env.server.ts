// Server-only environment contract. Import ONLY from server-side code
// (middleware, Server Components, Server Actions, Route Handlers).
// Never import this from a `'use client'` file — these values must never
// reach the browser bundle.
import { z } from 'zod';

const schema = z.object({
  // Auth guard master switch. The guard runs ONLY when this is exactly 'true'.
  // Optional with a safe default so local machines (flag unset) stay silent and
  // a local `pnpm build` never trips the guard.
  AUTH_GUARD_ENABLED: z.string().optional().default('false'),
  // Where an unauthenticated request is redirected once the guard is live.
  // Optional: while the auth service does not exist yet, an enabled guard with
  // no login URL fails open rather than locking the app out.
  AUTH_LOGIN_URL: z.string().optional(),
});

export const serverEnv = schema.parse(process.env);
