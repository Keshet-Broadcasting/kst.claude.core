---
name: nextjs-16
description: Use when writing, reviewing, or debugging any Next.js code in this project — App Router pages, layouts, route handlers, data fetching, caching, or config. Next.js 16 has breaking changes from Next 14/15; training-data patterns are wrong here. Covers Next.js 16 only.
---

# Next.js 16

**This project runs Next.js 16 with React 19.** For the exact pinned patch versions, read `package.json` and the `catalog:` block in the repo-root `pnpm-workspace.yaml` — those are the source of truth; this skill deliberately does not repeat a patch number, because it drifts. The full, version-exact docs are vendored at **`node_modules/next/dist/docs/`** — present only **after `pnpm install`** (a freshly scaffolded app has no `node_modules` yet). All doc paths below are relative to that directory. **Read the doc before writing code for anything not covered here** — do not answer from memory, Next 16 diverges from Next 14/15 in ways that silently break.

> **Version guard:** this skill documents Next.js 16. Before relying on it, check the `next` version in `package.json` / the pnpm catalog. If the project is on Next 17 or later, treat this skill as **STALE**: ignore its claims and rely exclusively on `node_modules/next/dist/docs/` for that version. A stale skill that contradicts the vendored docs is worse than no skill — the docs win every conflict.

**Before writing any caching code, read `next.config.ts` first.**

- If `cacheComponents: true` is **NOT** set: the project is on the _previous_ caching model — see `01-app/02-guides/caching-without-cache-components.md`. Do **NOT** write `"use cache"` / `cacheLife` / `cacheTag`.
- If `cacheComponents: true` **IS** set: the Cache Components model applies — see `01-app/01-getting-started/08-caching.md`.

---

## Breaking changes from Next 15 — what your training data gets wrong

| Wrong assumption (Next 14/15 habit)                                                | Actual Next 16 behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Doc path                                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `next/legacy/image` was **removed**                                                | **False — it is deprecated, not removed.** It still ships (`node_modules/next/legacy/image.d.ts`). Prefer `next/image`.                                                                                                                                                                                                                                                                                                                                                                                                   | `01-app/02-guides/upgrading/version-16.md` ("`next/legacy/image` Component (deprecated)")                       |
| PPR is opted into with `experimental.ppr` / `export const experimental_ppr = true` | **Both removed.** PPR is now the default rendering behavior of **Cache Components**. Config key is **top-level `cacheComponents: true`** (not `experimental.*`). A codemod strips `experimental_ppr` segment exports.                                                                                                                                                                                                                                                                                                     | `version-16.md` §Partial Prerendering; `01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md` |
| `params` / `searchParams` can be read synchronously (15 allowed it with a warning) | **True that they are Promises — and in 16 the sync fallback is fully gone.** Sync access is _removed_, not deprecated. Same for `cookies()`, `headers()`, `draftMode()`. `params` is a Promise in `layout`, `page`, `route`, `default`, `opengraph-image`, `twitter-image`, `icon`, `apple-icon`.                                                                                                                                                                                                                         | `version-16.md` §Async Request APIs; `01-app/03-api-reference/03-file-conventions/page.md`                      |
| `fetch()` is "uncached by default", full stop                                      | **Nuance.** The docs _call_ the default `auto no cache` — but that is prose, **not a value you may pass**. The only legal values are `cache: 'force-cache' \| 'no-store'`; writing `cache: 'auto no cache'` is a type error. Behaviour of the default: not stored in the Data Cache, but still fetched **once during `next build`** if the route statically prerenders. It re-fetches per request only in dev, or when Request-time APIs are on the route. `'no-store'` is what actually forces a fetch on every request. | `01-app/03-api-reference/04-functions/fetch.md`                                                                 |
| `revalidateTag('posts')`                                                           | **Pass the second argument**: `revalidateTag('posts', 'max')`. The single-arg form is deprecated: it is a **TypeScript error**, though it still runs if you suppress the error, and may be removed later. Second arg is a `cacheLife` profile (or `{ expire: 0 }`). **This applies whether or not `cacheComponents` is on** — it is a signature change, not a Cache-Components feature.                                                                                                                                   | `01-app/03-api-reference/04-functions/revalidateTag.md`                                                         |
| `middleware.ts` / `export function middleware()`                                   | Renamed to **`proxy.ts` / `export function proxy()`**. `middleware` is **deprecated but still works** — existing `middleware.ts` files keep running. **`runtime: 'edge'` is NOT supported in `proxy`** (proxy is Node.js only, not configurable), so if you need the `edge` runtime the docs say to **stay on `middleware`** for now. Config flags renamed: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.                                                                                                       | `version-16.md`                                                                                                 |
| Add `--turbopack` to opt into Turbopack                                            | **Turbopack is the default** for `next dev` _and_ `next build`. `--turbopack` is redundant. Opt **out** with `--webpack`. A custom `webpack` config now **fails the build** unless you pass `--webpack` (or `--turbopack` to ignore it). Config moved: `experimental.turbopack` → top-level **`turbopack`**.                                                                                                                                                                                                              | `version-16.md` §Turbopack by default                                                                           |
| `unstable_cacheLife` / `unstable_cacheTag` imports                                 | **Stable**: `import { cacheLife, cacheTag } from 'next/cache'`. No `unstable_` prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `version-16.md` §cacheLife and cacheTag                                                                         |
| `experimental.dynamicIO` / `experimental.useCache`                                 | Deprecated. All three (`ppr`, `dynamicIO`, `useCache`) collapse into one top-level flag: **`cacheComponents: true`**.                                                                                                                                                                                                                                                                                                                                                                                                     | `version-16.md`; `cacheComponents.md` version history                                                           |
| `next lint` in CI; `eslint: {}` in next config; `next build` lints                 | **`next lint` is removed.** `next build` no longer runs linting. The `eslint` key in next config is **removed**. This project lints with `eslint .` (see `package.json`). `@next/eslint-plugin-next` defaults to **flat config**.                                                                                                                                                                                                                                                                                         | `version-16.md` §`next lint` Command / §ESLint Flat Config                                                      |
| `serverRuntimeConfig` / `publicRuntimeConfig` + `getConfig()`                      | **Removed.** Use env vars; `NEXT_PUBLIC_` for client. For runtime (not build-time) env reads, `await connection()` first.                                                                                                                                                                                                                                                                                                                                                                                                 | `version-16.md` §Runtime Configuration                                                                          |
| `next/amp`, `useAmp`, `export const config = { amp: true }`                        | **Removed entirely.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `version-16.md` §AMP Support                                                                                    |
| Parallel-route slots fall back implicitly                                          | Every parallel-route slot now **requires an explicit `default.js`**; builds fail without one.                                                                                                                                                                                                                                                                                                                                                                                                                             | `version-16.md` §Parallel Routes `default.js` requirement                                                       |
| `unstable_rootParams()`                                                            | **Removed**, with no replacement yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `version-16.md` §`unstable_rootParams`                                                                          |
| Image defaults you memorized                                                       | `minimumCacheTTL` 60s → **4h**; `imageSizes` **drops `16`**; `qualities` defaults to **`[75]`** only (other values are coerced to the nearest allowed); `maximumRedirects` unlimited → **3**; local IPs blocked (`images.dangerouslyAllowLocalIP`); local `src` with a query string needs `images.localPatterns[].search`. `images.domains` is deprecated → use `remotePatterns`.                                                                                                                                         | `version-16.md` §`next/image` changes                                                                           |
| `scroll-behavior: smooth` is auto-overridden on navigation                         | No longer overridden by default. Opt back in with `<html data-scroll-behavior="smooth">`.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `version-16.md` §Scroll Behavior Override                                                                       |
| `next build` prints `size` / `First Load JS`                                       | Removed from build output (deemed inaccurate for RSC).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `version-16.md` §Performance Improvements                                                                       |
| `.next` is one dir                                                                 | `next dev` now writes to **`.next/dev`**, so dev and build can run concurrently. A lockfile blocks two `next dev` on the same project.                                                                                                                                                                                                                                                                                                                                                                                    | `version-16.md` §Concurrent `dev` and `build`                                                                   |
| `process.argv.includes('dev')` inside `next.config`                                | Now **`false`** during `next dev` (the config is no longer double-loaded). Check `NODE_ENV === 'development'` or use `phase`.                                                                                                                                                                                                                                                                                                                                                                                             | `version-16.md` §`next dev` config load                                                                         |
| `reactCompiler` is experimental                                                    | Stable top-level `reactCompiler: true` (off by default; requires `babel-plugin-react-compiler`).                                                                                                                                                                                                                                                                                                                                                                                                                          | `version-16.md` §React Compiler Support                                                                         |
| Node 18 / TS 4.x are fine                                                          | **Node.js ≥ 20.9**, **TypeScript ≥ 5.1**. Browsers: Chrome/Edge/Firefox 111+, Safari 16.4+.                                                                                                                                                                                                                                                                                                                                                                                                                               | `version-16.md` §Node.js runtime and browser support                                                            |

Also new in `next/cache`: **`updateTag`** and **`refresh`** (see below).

---

## Correct signatures

### Dynamic route page — `params` and `searchParams` are Promises

```tsx
// app/blog/[slug]/page.tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const { query } = await searchParams;
  return <h1>Blog Post: {slug}</h1>;
}
```

Preferred: the generated global `PageProps` helper (types come from `next dev` / `next build` / `next typegen`; no import needed):

```tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params;
  const query = await props.searchParams;
  return <h1>Blog Post: {slug}</h1>;
}
```

In a Client Component page, unwrap with React's `use()` — client components cannot be `async`:

```tsx
'use client';
import { use } from 'react';

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
}
```

Source: `01-app/03-api-reference/03-file-conventions/page.md`. Layouts use `LayoutProps<'/route'>`.

### Route handler — `context.params` is a Promise

```ts
// app/users/[id]/route.ts
import type { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
  const { id } = await ctx.params;
  return Response.json({ id });
}
```

Longhand: `{ params }: { params: Promise<{ id: string }> }`. Methods: `GET POST PUT PATCH DELETE HEAD OPTIONS`. `fetch` memoization does **not** apply in route handlers. Source: `01-app/03-api-reference/03-file-conventions/route.md`.

This project's existing handler (`src/app/api/health/route.ts`) uses `NextResponse.json` with no params — that shape is still valid.

### Async request APIs

```ts
import { cookies, headers, draftMode } from 'next/headers';

const cookieStore = await cookies(); // always await
const headersList = await headers();
const { isEnabled } = await draftMode();
```

### Metadata image + sitemap generators

```js
// app/shop/[slug]/opengraph-image.js
export async function generateImageMetadata({ params }) {
  const { slug } = params; // still SYNC here
  return [{ id: '1' }, { id: '2' }];
}

export default async function Image({ params, id }) {
  const { slug } = await params; // Promise
  const imageId = await id; // Promise<string>
}
```

```js
// app/product/sitemap.js
export default async function sitemap({ id }) {
  const resolvedId = await id; // Promise, was a number in 15
}
```

Source: `version-16.md` §Async parameters for icon/open-graph Image, §Async `id` parameter for `sitemap`.

---

## Caching: two mutually exclusive models

Pick based on whether `cacheComponents: true` is in `next.config.ts` — **check the file to find out which model applies.**

### Model A — previous model (applies when `cacheComponents` is off)

`01-app/02-guides/caching-without-cache-components.md`

- `fetch(url)` → not stored in the Data Cache by default; `{ cache: 'force-cache' }` to cache.
- `{ next: { revalidate: 3600 } }`, `{ next: { tags: ['posts'] } }`.
- `unstable_cache(fn, keyParts, { tags, revalidate })` for non-`fetch` work.
- Route segment configs still exist: `dynamic`, `revalidate`, `fetchCache`, `dynamicParams`, `runtime`, `preferredRegion`.
- `React.cache()` to dedupe non-`fetch` calls within a render pass.

### Model B — Cache Components (`cacheComponents: true`)

`01-app/01-getting-started/08-caching.md`, `09-revalidating.md`, `01-app/02-guides/migrating-to-cache-components.md`

```ts
// next.config.ts  — top-level, NOT under experimental
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { cacheComponents: true };
export default nextConfig;
```

What it actually is (per `cacheComponents.md`): data fetching is **dynamic by default**; you opt _into_ caching per page/component/function; Next prerenders a static HTML shell and streams dynamic content in — i.e. **PPR is the default behavior**, and it also turns on React `<Activity>` state preservation across client navigations.

**`"use cache"`** (`01-app/03-api-reference/01-directives/use-cache.md`) marks a route, component, or async function cacheable. File-level (all exports must be async) or first statement in a function body.

```tsx
import { cacheLife, cacheTag } from 'next/cache';

async function getProducts(category: string) {
  'use cache';
  cacheLife('hours'); // optional; defaults to the `default` profile
  cacheTag('products'); // optional; enables on-demand invalidation
  return db.query('SELECT * FROM products WHERE category = ?', category);
}
```

- **Cache key** = build ID + function ID + serializable arguments + **variables captured from outer scope** (+ HMR hash in dev).
- Arguments and return values must be serializable. **Not allowed:** class instances, functions, symbols, `URL` instances. JSX may be _returned_ and may be passed _through_ (e.g. `children`) as long as you don't introspect it.
- **Cannot call `cookies()`, `headers()`, or read `searchParams` inside a `use cache` scope.** Read them outside and pass the _values_ as arguments.
- Default storage is **in-memory**; on serverless it may not survive between requests. `'use cache: remote'` for a durable/shared handler; `'use cache: private'` (experimental) for browser-only caching of runtime-dependent data.
- Draft Mode makes every cached function re-execute and skip writing to the cache.

**`cacheLife(profile | object)`** (`01-app/03-api-reference/04-functions/cacheLife.md`) — only inside a cache scope, never at module scope. Default profile when omitted: `stale` 5m / `revalidate` 15m / `expire` never.

| Profile   | stale | revalidate | expire |
| --------- | ----- | ---------- | ------ |
| `default` | 5m    | 15m        | never  |
| `seconds` | 30s   | 1s         | 60s    |
| `minutes` | 5m    | 1m         | 1h     |
| `hours`   | 5m    | 1h         | 1d     |
| `days`    | 5m    | 1d         | 1w     |
| `weeks`   | 5m    | 1w         | 30d    |
| `max`     | 5m    | 30d        | 1y     |

Or `cacheLife({ stale: 3600, revalidate: 7200, expire: 86400 })`. A "short-lived" cache (`seconds` profile, `revalidate: 0`, or `expire` < 5m) is **excluded from the prerender** and becomes a dynamic hole.

**`cacheTag('a', 'b')`** tags the entry. Invalidate it with:

| API                          | Where                                      | Behavior                                               |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `updateTag(tag)`             | **Server Actions only** (throws elsewhere) | Expires immediately — read-your-own-writes             |
| `revalidateTag(tag, 'max')`  | Server Actions **and** Route Handlers      | Stale-while-revalidate                                 |
| `revalidatePath('/profile')` | Server Actions and Route Handlers          | Invalidates a path (unchanged from the previous model) |
| `refresh()`                  | Server Actions                             | Refreshes the client router                            |

Source: `09-revalidating.md`, `04-functions/{revalidateTag,updateTag,refresh}.md`.

**Streaming uncached data** — anything that reads runtime data or fetches uncached data must be inside `<Suspense>`, or you get the `Uncached data was accessed outside of <Suspense>` / `blocking-route` error at dev and build time:

```tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';

async function UserGreeting() {
  const theme = (await cookies()).get('theme')?.value ?? 'light';
  return <p>Your theme: {theme}</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UserGreeting />
    </Suspense>
  );
}
```

**Migration mapping** (`migrating-to-cache-components.md`): `dynamic = 'force-dynamic'` → delete; `dynamic = 'force-static'` → `'use cache'` + `cacheLife('max')`; `revalidate = N` → `cacheLife`; `fetchCache` → delete; `unstable_cache` → `'use cache'`; `unstable_noStore()` → delete; `runtime = 'edge'` → **unsupported**, use Node.js; `generateStaticParams` returning `[]` → **errors**, must return ≥ 1 param; `'use cache'` cannot be applied to the `GET` export itself — call a cached helper from it.

---

## Common mistakes

1. **Reading `params`/`searchParams` synchronously.** They're Promises and the Next 15 sync escape hatch is gone in 16. `await` them (or `use()` in a Client Component).
2. **Writing `revalidateTag('posts')` with one argument.** TypeScript error (still runs if suppressed, but deprecated). Use `revalidateTag('posts', 'max')`, or `updateTag('posts')` in a Server Action when the user must see their own write. Applies regardless of whether `cacheComponents` is enabled.
3. **Assuming `next/legacy/image` is gone.** It is only deprecated — but still migrate to `next/image`.
4. **Reaching for `experimental.ppr` or `export const experimental_ppr = true`.** Both removed; the only key is top-level `cacheComponents: true`.
5. **Putting `cacheComponents` (or `turbopack`, or `reactCompiler`, or `adapterPath`) under `experimental`.** They are all top-level now.
6. **Calling `cookies()`/`headers()` inside a `"use cache"` function.** Immediate error. Read outside, pass values in as args (they become part of the cache key).
7. **Passing a runtime Promise (e.g. the `cookies()` store) into a cached component.** The build _hangs_, then fails with "Filling a cache during prerender timed out" after 50s. Await it first, pass the plain value.
8. **Using `"use cache"` / `cacheLife` / `cacheTag` while `cacheComponents` is off** — if it's off (check `next.config.ts`). They only work with the flag enabled.
9. **Creating a _new_ `middleware.ts`.** Use `proxy.ts` with `export function proxy(request)` — Node.js runtime only, no `edge`. (An _existing_ `middleware.ts` still runs; and if you genuinely need the `edge` runtime, the docs say keep using `middleware` until a follow-up minor lands.)
10. **Adding a `webpack` config** — it now fails `next build` (Turbopack is default). Use `turbopack.resolveAlias` (no `~` tilde prefix for Sass imports), or build with `--webpack`.
11. **Adding a parallel-route slot without `default.tsx`.** Build failure.
12. **Assuming `unstable_cache`/`fetch` Data Cache semantics carry over to `use cache`.** They don't: `fetch`/`unstable_cache` persist across deployments and serverless instances; `use cache` is in-memory per-instance and per-deployment unless you use `'use cache: remote'` or a `cacheHandlers` entry.
13. **`export const runtime = 'edge'` in a Cache Components app.** Not supported.
14. **Assuming `revalidateTag` immediately regenerates pages.** With `'max'` it only marks tags stale; regeneration happens on the next visit.

---

## Where to look next

Everything above is derived from `node_modules/next/dist/docs/`. Start points:

- Breaking changes: `01-app/02-guides/upgrading/version-16.md`
- Caching (Cache Components): `01-app/01-getting-started/08-caching.md`, `09-revalidating.md`
- Caching (previous model, when `cacheComponents` is off): `01-app/02-guides/caching-without-cache-components.md`
- Directives: `01-app/03-api-reference/01-directives/` (`use-cache.md`, `use-cache-remote.md`, `use-cache-private.md`)
- File conventions: `01-app/03-api-reference/03-file-conventions/` (`page.md`, `layout.md`, `route.md`, `proxy.md`, `default.md`)
- Config keys: `01-app/03-api-reference/05-config/01-next-config-js/` — if a key isn't a file in there, it probably doesn't exist (note: **there is no `ppr.md`**).
- Functions: `01-app/03-api-reference/04-functions/`

If a claim isn't covered here, read the doc rather than trusting recall.
