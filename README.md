# Starter

Next.js · React · Zustand · CSS Modules. Clone it, run it, build on it.

This is a template, not an app. `src/app/page.tsx` is a landing page that names the stack and
points at the handful of patterns worth reading before you start. Delete the page and the
landing components (`Hero`, `StackBadges`, `PatternCard`, `PreferenceToggle`), wire your own UI
into `AppStoreProvider`, and build.

> **Before you delete `Hero`:** it renders `ThemeToggle` internally, which is the only caller of
> `useThemeStore`. Deleting `Hero` outright silently removes the only way to toggle the theme,
> while leaving the theme store and the anti-flash inline script in place with nothing driving
> them. Move `ThemeToggle` into your own header first, then delete the rest of the landing
> components.

## Requirements

Node >= 22, pnpm (via `corepack enable`).

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script              | Purpose                    |
| ------------------- | -------------------------- |
| `pnpm dev`          | Dev server (Turbopack)     |
| `pnpm build`        | Production build           |
| `pnpm start`        | Serve the production build |
| `pnpm lint`         | ESLint                     |
| `pnpm typecheck`    | `tsc --noEmit`             |
| `pnpm format`       | Prettier (write)           |
| `pnpm format:check` | Prettier (check only)      |
| `pnpm test`         | Vitest                     |
| `pnpm test:watch`   | Vitest, watch mode         |

## The patterns worth reading

### Zustand under SSR

`src/store/appStore.ts`, `src/store/AppStoreProvider.tsx`

The app store is a per-request **factory** (`createAppStore(initialState)`), not a module
singleton. A singleton seeded with server data would be mutated during SSR inside a module
shared by every request in the process — harmless when the seed is constant, a real cross-user
leak the moment it is user-specific. The provider creates one store per component instance
instead.

`persist` uses `skipHydration: true`, and the provider rehydrates from `localStorage` in a
mount effect (`useEffect`), never during render — reading `localStorage` while rendering is the
classic hydration-mismatch bug, since the server has no `localStorage` to read at all.

Precedence: **persisted state wins; otherwise the server seed stands.** `src/store/appStore.test.ts`
pins this in both directions, and another test pins cross-instance isolation.

The store carries one neutral example preference (`preferences.reduceMotion`), consumed live on
the landing page by `PreferenceToggle` so the seed → rehydrate → persist chain is visible.
Replace `Preferences` with your app's real state.

The theme store (`src/store/themeStore.ts`) _is_ a module singleton, deliberately — its state is
never seeded from the server, so there is nothing to leak between requests. The starter shows
both patterns side by side so the "why" for each is obvious from the diff between them.

### Seeding client state from the server

`src/lib/appState.ts`, `src/app/layout.tsx`

`layout.tsx` is a server component. It calls `getInitialAppState()` **directly** and hands the
result to a client `<AppStoreProvider>`, so the first paint already has state on the server and
the client alike — no fetch from a server component to our own route handler.

Note that `/` currently builds as **static** (`○` in the `next build` output), because
`getInitialAppState()` doesn't read anything request-specific. The per-request store factory
above is still structurally correct — it's what makes the route safe to switch to dynamic — and
it starts to matter the moment the seed reads `cookies()` or `headers()`. Don't be misled by
"per-request" language into thinking the route is currently rendered per-request; today it isn't.

### No theme flash

`src/lib/theme.ts`, `src/app/layout.tsx`

An inline script in `<head>` stamps `data-theme` on `<html>` before first paint, so a dark-theme
reload never flashes white. Two subtleties here were real bugs caught in review:

- The theme constants and the script source live in `src/lib/theme.ts`, a **plain module with no
  `'use client'` directive**. The root layout is a server component, and in RSC a client
  module's exports become unusable stubs when imported from server code — importing the storage
  key from the `'use client'` theme store instead of this plain module silently corrupted the
  inline script into a syntax error and killed the anti-flash feature outright.
  `src/lib/theme.test.ts` guards this import boundary.
- `themeStore` reads its initial theme from `<html data-theme>` rather than hardcoding `'light'`,
  because by the time any module evaluates, the inline script has already resolved the right
  value. Hardcoding a default here clobbered the OS preference (`prefers-color-scheme`) on a
  first visit.

`ThemeToggle` renders **both** icons and lets CSS pick the visible one off `[data-theme]`, so the
button has no hydration-dependent branch in its markup and cannot flicker.

The inline script is injected with `dangerouslySetInnerHTML`, which a strict
Content-Security-Policy blocks unless the script carries a matching nonce. If you add a CSP,
follow [Next's nonce guidance](https://nextjs.org/docs/app/guides/content-security-policy) to
thread a per-request nonce onto this script instead of relaxing the policy.

### A route handler

`src/app/api/health/route.ts`

A minimal `GET` returning `{ status: "ok" }`, kept as a live example of an App Router route
handler. `curl http://localhost:3000/api/health`.

## Utilities

`src/lib/id.ts` — `createId()`. Not currently called anywhere in the app; kept because the trap
it guards against is real: `crypto.randomUUID()` is only defined in secure contexts, so it is
`undefined` when the app is opened over plain `http`, e.g. Next's dev "Network:" URL opened on a
phone on the same LAN. `createId()` falls back to `crypto.getRandomValues` in that case so ID
generation keeps working. Reach for it anywhere you'd otherwise call `crypto.randomUUID()`
directly.

## Design tokens

Tokens (colors, spacing, etc.) live in `src/app/globals.css`. Stylesheets should read these
tokens rather than hard-code colours, so theme switching and future rebranding stay one-file
changes.

## Versions

Pinned: **Next 16.2.10, React 19.2.7, Zustand 5.0.14, TypeScript 5.9.3, ESLint 9.39.5.**

TypeScript 7 and ESLint 10 are both published and both install and typecheck fine on their own.
They are deliberately **not** adopted here: `eslint-config-next@16.2.10` pulls in
`typescript-eslint@8.64.0`, which does not yet support the TypeScript 7 compiler API and makes
ESLint crash outright when TypeScript 7 is installed alongside it. This is a decision, not an
oversight — revisit the pin once `typescript-eslint` ships TypeScript 7 support.
