---
name: env-vars
description: Load this skill whenever the user mentions environment variables, env vars, API keys, secrets, tokens, `.env` files, `NEXT_PUBLIC_` prefixes, or connecting the app to any external service (database, payment provider, AI API, analytics, auth, CMS). Also trigger when the user is about to hardcode a URL, credential, or token in source code. Trigger immediately when someone says "the API key isn't working", "I can't reach the database", or "the service isn't connecting" — those are almost always env var problems. V:0.1.2
---

# Environment variables

## The two kinds of env var in Next.js

Next.js splits your code into two worlds — server and browser. Env vars follow the same split:

| Prefix         | Visible to                                      | Safe for                                                                               |
| -------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_` | **Everyone** — compiled into the browser bundle | Public config only: feature flags, public CDN URLs, analytics IDs with no write access |
| _(no prefix)_  | **Server only** — never sent to the browser     | Secrets: API keys, database passwords, private tokens                                  |

Think of `NEXT_PUBLIC_` as writing on a whiteboard in a public hallway. Anyone who opens DevTools on your deployed site can read every `NEXT_PUBLIC_` value. A secret placed there is no longer a secret.

---

## Three rules — read these before adding any env var

**Rule 1 — `NEXT_PUBLIC_` is public.** Never put a secret, API key, database credential, or anything with write or billing access behind `NEXT_PUBLIC_`. If you are unsure whether a value is "public", treat it as private.

**Rule 2 — No-prefix vars are server-only.** A variable like `DATABASE_URL` or `STRIPE_SECRET_KEY` (no `NEXT_PUBLIC_` prefix) is invisible to the browser. If you try to read `process.env.DATABASE_URL` inside a component marked `'use client'`, it will be `undefined` at runtime — no build error, just a silent failure.

**Rule 3 — `.env.local` is never committed.** The `.gitignore` already contains `.env*` — every env file is excluded from version control. This protects you. Never remove that line, never force-add an env file with `git add -f`.

---

## Build-time vs. runtime — what this means in practice

`NEXT_PUBLIC_` vars are **inlined at build time**, not read at runtime. The build tool replaces every `process.env.NEXT_PUBLIC_FOO` reference with its literal value before the code reaches the browser.

Consequences:

- Changing a `NEXT_PUBLIC_` var in your hosting dashboard does **not** take effect until you trigger a new build.
- Server-only vars (no prefix) _are_ read at runtime — they can be rotated in your hosting dashboard and take effect on the next request without a rebuild.

---

## TypeScript validation at startup (recommended)

`process.env` is typed as `Record<string, string | undefined>` — TypeScript won't tell you if a required var is missing until it blows up at runtime. Add a validation file that checks all required vars at startup and gives you a typed object everywhere else:

```ts
// src/shared/config/env.server.ts
// Import ONLY from server-side code (Server Components, Server Actions, Route Handlers).
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  INTERNAL_API_SECRET: z.string().min(1, 'INTERNAL_API_SECRET is required'),
});

// Throws at startup with a clear error message if any var is missing or malformed.
export const serverEnv = schema.parse(process.env);
```

```ts
// src/shared/config/env.client.ts
// Safe to import anywhere — only contains NEXT_PUBLIC_ vars.
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_ANALYTICS_ID: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export const clientEnv = schema.parse({
  NEXT_PUBLIC_ANALYTICS_ID: process.env.NEXT_PUBLIC_ANALYTICS_ID,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
```

If `zod` is not yet in the project, add it: `pnpm add zod`.

Without validation, a missing env var silently becomes `undefined` and causes a cryptic error far from the root cause. With validation, the app refuses to start and prints exactly which var is missing.

---

## Before adding an env var — ask yourself

1. **Is this a secret?** (API key, database URL, private token, anything with billing or write access)
   - Yes → no prefix, add to `.env.local` only, read it server-side via `serverEnv`.
   - No → `NEXT_PUBLIC_` prefix is fine, add to `clientEnv`.

2. **Does the browser actually need this value?**
   - If the browser only needs the _result_ of a server computation (e.g. "is this feature enabled?"), keep the raw var server-only and pass the result through the store — see the pattern below.
   - If the browser genuinely needs the raw value (e.g. a public CDN URL), `NEXT_PUBLIC_` is acceptable.

3. **Am I about to hardcode this in source code?**
   - A URL, key, or ID embedded directly in a `.ts` file is almost always wrong. Put it in `.env.local` and reference it via the typed `env` objects above.

---

## Where to read server env vars safely

Server-only env vars can be read in any of these locations — all run exclusively on the server:

- **`src/entities/preferences/api/getInitialAppState.ts`** — called from `app/layout.tsx`, a Server Component. Good for seeding the store with config derived from env vars.
- **Server Actions** in `src/features/<name>/api/` — any file without `'use client'` at the top.
- **Route Handlers** in `app/api/` — these run on the server by definition.

Example — passing a server-derived value to the client store without exposing the raw secret:

```ts
// src/entities/preferences/api/getInitialAppState.ts
import { serverEnv } from '@/shared/config/env.server';

export function getInitialAppState(): AppInitialState {
  return {
    preferences: { reduceMotion: false },
    featureFlags: {
      // The raw API key never leaves the server.
      // Only the processed flag reaches the client.
      newPaymentFlow: serverEnv.ENABLE_NEW_PAYMENT === 'true',
    },
  };
}
```

---

## Security: what NOT to do

**Never log env vars**, even in development:

```ts
// BAD — this appears in server logs, CI output, error trackers
console.log('Config:', process.env);
console.log('DB:', process.env.DATABASE_URL);
```

Server logs are often stored long-term and visible to more people than you expect. Log only what is needed (e.g. "DB connected" not "DB connected to postgres://user:pass@host").

**Never include env var values in error messages** sent to the client:

```ts
// BAD — the DB URL ends up in the browser's error response
throw new Error(`Failed to connect: ${process.env.DATABASE_URL}`);

// GOOD — generic message to the client, full detail stays in server logs
console.error('DB connection failed:', err);
throw new Error('Database unavailable — please try again later.');
```

**Never expose env vars through API responses.** A route that returns `{ ...process.env }` or echoes request config is a common accidental leak.

---

## What goes wrong if you break the rules

**Secret in `NEXT_PUBLIC_`**

Your API key ships inside the JavaScript bundle downloaded by every visitor. It is trivially readable in DevTools > Sources. Attackers automate this scan. The consequence: billing fraud, data breach, or service shutdown depending on what the key controls.

**Server-only var read in a Client Component**

```ts
'use client';
// This silently returns undefined in the browser.
const url = process.env.DATABASE_URL;
```

No build error. At runtime, `url` is `undefined`. Anything that depends on it fails in production — often with an opaque error that is hard to trace back to this cause.

**`.env.local` committed to git**

Even one accidental commit exposes the secret in git history permanently. Removing the file does not remove it from history. Recovery requires rotating every credential in that file.

---

## "The API key isn't working" — diagnosis flow

When a user says an API key, token, or connection isn't working, check these in order:

1. **Is the var set?** Add a temporary log: `console.log('KEY present:', !!process.env.MY_KEY)` — log the boolean, not the value. Check server output (terminal running `pnpm dev`), not the browser console.

2. **Is it in the right file?** The var must be in `.env.local` at the project root (same folder as `package.json`). A file named `.env` without `.local` is lower priority and may be shadowed.

3. **Did you restart the dev server?** Next.js reads env files at startup. After editing `.env.local`, stop and restart `pnpm dev` — changes are not picked up on the fly.

4. **Is it being read server-side?** If the code reading the var is in a `'use client'` file, the var will be `undefined`. Move the read to a Server Component, Server Action, or Route Handler.

5. **Is the prefix correct?** A secret with `NEXT_PUBLIC_` is public (bad). A public config without `NEXT_PUBLIC_` is `undefined` in the browser (broken). Check the prefix matches the access pattern.

6. **Is the value correct?** Copy-paste issues (trailing space, line break, wrong quote character) are common. Check the actual value character by character.

---

## Working with `.env.local` and `.env.example`

Create `.env.local` at the project root (next to `package.json`) if it does not exist:

```
# .env.local  —  never committed, already in .gitignore

# Server-only (no prefix) — safe for secrets
DATABASE_URL=postgres://...
STRIPE_SECRET_KEY=sk_live_...
INTERNAL_API_SECRET=...

# Public (NEXT_PUBLIC_ prefix) — safe for non-secrets only
NEXT_PUBLIC_ANALYTICS_ID=UA-...
NEXT_PUBLIC_APP_URL=https://myapp.com
```

After editing `.env.local`, restart `pnpm dev`.

To tell teammates which vars to set without exposing values, maintain a committed `.env.example` with placeholder values:

```
# .env.example  —  committed, contains no real values
# Copy to .env.local and fill in real values from the team's secret manager.

DATABASE_URL=
STRIPE_SECRET_KEY=
INTERNAL_API_SECRET=
NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_APP_URL=
```

Each teammate copies this to `.env.local` and fills in real values from your team's secret manager (1Password, Doppler, Vault, etc.).

---

## Quick reference

| I want to…                                 | Do this                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Store an API key or secret                 | No prefix → `.env.local` → import from `env.server.ts` in server-side code  |
| Pass a public URL to the browser           | `NEXT_PUBLIC_` prefix → `.env.local` → import from `env.client.ts`          |
| Pass a server-computed value to the client | Read server-side, put only the result in the store via `getInitialAppState` |
| Validate all required vars at startup      | Add them to the zod schema in `env.server.ts` or `env.client.ts`            |
| Share required var names with teammates    | Create a committed `.env.example` with empty values                         |
| Check nothing secret is exposed            | `grep -r "NEXT_PUBLIC_" src/ --include="*.ts"` — review every hit           |
| Restart so new vars take effect            | Stop `pnpm dev`, then `pnpm dev` again                                      |
