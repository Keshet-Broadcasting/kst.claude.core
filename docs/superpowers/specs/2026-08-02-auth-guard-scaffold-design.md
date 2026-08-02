# Auth guard scaffold — design

**Date:** 2026-08-02
**Status:** approved, ready for implementation plan

## Goal

Add an authentication guard to the project as a **scaffold**. The real auth
service does not exist yet, so the guard ships with a stubbed check that lets
everyone through. When the service arrives, only one function changes.

The guard must be **inert on local environments** and active only in
production, gated by an explicit environment flag.

## Approach

A thin Next.js `middleware.ts` at the project root is the entry point. All logic
lives in a Feature-Sliced Design slice under `shared`. The middleware asks the
guard whether to let the request through or redirect it.

### Environment detection

Production vs. local is decided by an **explicit env flag**, not `NODE_ENV` and
not hostname. This keeps a local `pnpm build` / `pnpm start` from triggering the
guard, and makes activation a deliberate act on the production environment.

- `AUTH_GUARD_ENABLED` — optional, default `'false'`. Guard runs only when this
  equals `'true'`.
- `AUTH_LOGIN_URL` — optional. Redirect target when a request is unauthenticated.

Both are **server-only** (no `NEXT_PUBLIC_` prefix) — they are read only inside
middleware, which runs on the server/edge. Because both are optional with safe
defaults, a machine with no env set (local) never throws and the guard stays
silent.

## Files

| File | Role |
| ---- | ---- |
| `middleware.ts` (root) | Next entry point. Thin: call the guard, pass through or redirect. A `matcher` excludes static assets and `_next`. |
| `src/shared/config/env.server.ts` | zod schema for server-only env. `AUTH_GUARD_ENABLED` (optional, default `'false'`), `AUTH_LOGIN_URL` (optional). |
| `src/shared/lib/auth-guard/is-enabled.ts` | Returns `true` only when `AUTH_GUARD_ENABLED === 'true'`. |
| `src/shared/lib/auth-guard/check-auth.ts` | **Stub.** Currently returns `{ authenticated: true }` with a `TODO` to wire the real service. |
| `src/shared/lib/auth-guard/guard.ts` | Orchestration: disabled → pass; enabled and unauthenticated → redirect to `AUTH_LOGIN_URL`; otherwise pass. |
| `src/shared/lib/auth-guard/index.ts` | Public surface of the slice. |
| `.env.example` | Documents both variables with empty values. |
| `src/shared/lib/auth-guard/guard.test.ts` | Vitest: disabled → pass; enabled + authenticated → pass; enabled + unauthenticated → redirect. |

## Behaviour

- **Local:** flag unset → `is-enabled` is `false` → guard is fully silent.
- **Production:** set `AUTH_GUARD_ENABLED=true`. The stubbed `check-auth` still
  returns authenticated, so nothing breaks until the real check is wired in.

## Data flow

```
request → middleware.ts → guard(request)
  guard:
    if (!isEnabled()) return pass
    if (checkAuth().authenticated) return pass
    return redirect(AUTH_LOGIN_URL)
```

## Error handling

- Missing env on local is not an error: both vars are optional with defaults.
- If `AUTH_GUARD_ENABLED=true` but `AUTH_LOGIN_URL` is unset, `guard` cannot
  redirect meaningfully — it logs a server-side warning and passes through
  (fail-open), because the scaffold must never lock a live app out over a
  misconfiguration before the real service exists.

## Testing

Vitest unit tests over `guard.ts` with `is-enabled` and `check-auth` stubbed:

1. disabled → pass (no redirect)
2. enabled + authenticated → pass
3. enabled + unauthenticated → redirect to login URL
4. enabled + unauthenticated + no login URL → pass (fail-open) + warning

## Dependencies

- `pnpm add zod` — used by `env.server.ts` for startup validation.

## Out of scope

- The real auth service and its token/session logic.
- A login page or UI.
- Role/permission checks beyond authenticated vs. not.
