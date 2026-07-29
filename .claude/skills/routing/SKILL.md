---
name: routing
description: >
  Use this skill for ANY routing or page-related question in this project — adding a new page,
  new route, or new URL path; questions about where to put page code; App Router file conventions
  (page.tsx, layout.tsx, loading.tsx, error.tsx, not-found.tsx); dynamic routes like [slug];
  route groups like (marketing); navigation hooks (useRouter, usePathname, useSearchParams);
  Link vs router.push; redirect() and notFound(); URL search params for filters/pagination;
  route handlers (route.ts); parallel routes. Trigger proactively when the user says "new page",
  "add a page", "add a route", "navigate", "redirect", "search params", "filters in URL",
  or asks about URL structure.
---

# Routing in this project

This project separates **routing** from **page content** into two distinct locations. That split
is intentional and required — getting it wrong either breaks the build or violates the FSD
architecture that `steiger` enforces.

> For Next.js 16 API specifics (params as Promises, caching models, proxy.ts), see the
> `nextjs-16` skill — this skill covers the project's structural conventions and navigation patterns.

---

## The two `app/` directories — don't confuse them

| Directory     | What it is             | What goes here                                                                                      |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `app/` (root) | **Next.js App Router** | Route files ONLY: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` |
| `src/app/`    | **FSD app layer**      | Global providers (`AppStoreProvider`), `globals.css`, `favicon.ico`                                 |

The root `app/` handles the URL structure. `src/app/` handles app-wide setup. Never put page content in `app/`, and never put route files in `src/app/`.

---

## How to add a new page — two files, always

Every new page requires **two** things: a route file in `app/` and a view slice in `src/views/`.

### Step 1 — Create the route file in `app/`

The route file is a single-line re-export. Nothing else belongs here.

```
app/
  about/
    page.tsx          ← new file
```

```tsx
// app/about/page.tsx
export { AboutPage as default } from '@/views/about';
```

That is the entire file. No JSX, no logic, no imports beyond the view.

### Step 2 — Create the view slice in `src/views/`

```
src/views/
  about/
    index.ts          ← public surface (required)
    ui/
      AboutPage.tsx   ← actual component
```

```ts
// src/views/about/index.ts
export { AboutPage } from './ui/AboutPage';
```

```tsx
// src/views/about/ui/AboutPage.tsx
export function AboutPage() {
  return (
    <main>
      <h1>About</h1>
    </main>
  );
}
```

The view is a server component by default. Add `'use client'` only if you need browser-only
APIs — and prefer to push `'use client'` down into a `features/` component instead.

### Real example already in the project

`app/page.tsx` has exactly one line:

```tsx
export { HomePage as default } from '@/views/home';
```

And the content lives in `src/views/home/ui/HomePage.tsx`, which handles server-side data
loading (`getInitialAppState()`) and composes widgets.

---

## Folder naming in `app/` — what each syntax means

| Folder name    | What it does                                           | Example URL                                           |
| -------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `about/`       | Normal segment                                         | `/about`                                              |
| `[slug]/`      | Dynamic segment — value from the URL                   | `/posts/hello-world` → `slug = "hello-world"`         |
| `[...rest]/`   | Catch-all — one or more segments                       | `/docs/a/b/c` → `rest = ["a","b","c"]`                |
| `[[...rest]]/` | Optional catch-all — zero or more segments             | `/docs` and `/docs/a/b` both match                    |
| `(group)/`     | Route group — **no URL segment**, just organises files | `/about` (same URL, even with `(marketing)/about/`)   |
| `_folder/`     | Not a route at all — Next.js ignores it entirely       | —                                                     |
| `@slot/`       | Parallel route slot                                    | — (advanced; requires `default.tsx` in every sibling) |

**The most common need is `[param]/`** for things like `/products/[id]/` or `/blog/[slug]/`.

Note: in Next.js 16, `params` from a dynamic route is a **Promise** — always `await` it:

```tsx
// app/blog/[slug]/page.tsx
export { BlogPostPage as default } from '@/views/blog-post';
```

```tsx
// src/views/blog-post/ui/BlogPostPage.tsx
export async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // ...
}
```

See the `nextjs-16` skill for full async params documentation.

### Route groups — when to use them

Route groups `(group)` organise files without affecting URLs. Common uses:

```
app/
  (marketing)/        ← shared layout for public pages
    layout.tsx        ← e.g. navbar + footer
    page.tsx          ← /
    about/
      page.tsx        ← /about
  (dashboard)/        ← shared layout for authenticated pages
    layout.tsx        ← e.g. sidebar + top bar
    settings/
      page.tsx        ← /settings
    profile/
      page.tsx        ← /profile
```

Use a route group when a section of your app needs its own persistent layout wrapper but the
group name itself should not appear in the URL.

---

## Special files in `app/` — what each one does

All of these go in `app/` (or in a segment subfolder). All are optional except `page.tsx`.

| File            | When Next.js uses it                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`      | The content rendered at this URL. **Required for a route to exist.**                                                                    |
| `layout.tsx`    | Wraps all pages at this level and below; persists across navigations. The root `app/layout.tsx` sets up fonts, providers, and `<html>`. |
| `loading.tsx`   | Shown while navigating **to** this route (Suspense boundary). The content appears while the next page's data loads.                     |
| `error.tsx`     | Shown when this segment throws. Must be `'use client'` — in Next.js 16 the retry prop is `unstable_retry`, not `reset`.                 |
| `not-found.tsx` | Shown when `notFound()` is called inside this segment, or on a 404.                                                                     |
| `route.ts`      | API endpoint (`GET`, `POST`, etc.) — replaces the whole `pages/api/` folder. Cannot coexist with `page.tsx` at the same path.           |

### When to create them

- `loading.tsx` — add one when navigating to this page involves a noticeable wait (data fetching, heavy component).
- `error.tsx` — add one when this page could throw and you want a recovery UI (retry button). Root `app/error.tsx` is already set up.
- `not-found.tsx` — add one per segment only if you want custom copy beyond the root one.
- `layout.tsx` in a sub-segment — add only when a section of the app genuinely needs its own persistent wrapper (e.g. a dashboard with a sidebar).

---

## Navigation — Link vs router.push

**Use `Link` by default.** It is declarative, prefetches the destination, and works without JS.

```tsx
import Link from 'next/link';

// Static link
<Link href="/about">About</Link>

// Dynamic link
<Link href={`/blog/${slug}`}>Read post</Link>

// With query params
<Link href={{ pathname: '/search', query: { q: 'nextjs' } }}>Search</Link>
```

**Use `router.push()` only when navigation is triggered by a non-click event** — a form
submission result, a timer, a keyboard shortcut, or after an async operation completes.

```tsx
'use client';
import { useRouter } from 'next/navigation';

export function SubmitButton() {
  const router = useRouter();

  async function handleSubmit() {
    await saveData();
    router.push('/dashboard'); // navigate after async work
  }

  return <button onClick={handleSubmit}>Save</button>;
}
```

`useRouter` requires `'use client'`. In FSD terms, it belongs in `features/` (user actions).
Never call it in a `widgets/` or `entities/` server component.

---

## Reading the current URL — usePathname and useSearchParams

Both hooks require `'use client'`. Place them in `features/` components.

### usePathname — active nav links, analytics

```tsx
'use client';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <Link href={href} aria-current={pathname === href ? 'page' : undefined}>
      {children}
    </Link>
  );
}
```

### useSearchParams — read query string values

`useSearchParams` requires a **Suspense boundary** in the component tree above it (Next.js
enforces this at build time).

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function FilterControls() {
  const searchParams = useSearchParams();
  const category = searchParams.get('category') ?? 'all';
  return <select defaultValue={category}>...</select>;
}

// Always wrap in Suspense when you use useSearchParams
export function FilterSection() {
  return (
    <Suspense fallback={<FilterSkeleton />}>
      <FilterControls />
    </Suspense>
  );
}
```

---

## URL search params for filters and pagination

Keep filter/pagination state in the URL — it makes the page shareable and bookmarkable.
The pattern: read with `useSearchParams` (client) or `searchParams` prop (server), write by
pushing a new URL.

```tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function CategoryFilter({ options }: { options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setCategory(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('category');
    } else {
      params.set('category', value);
    }
    params.delete('page'); // reset pagination on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={searchParams.get('category') ?? 'all'}
      onChange={(e) => setCategory(e.target.value)}
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
```

On the server side, `searchParams` is also a Promise in Next.js 16:

```tsx
// src/views/products/ui/ProductsPage.tsx
export async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { category = 'all', page = '1' } = await searchParams;
  const products = await fetchProducts({ category, page: Number(page) });
  // ...
}
```

---

## Server-side: redirect() and notFound()

These are server-only functions from `next/navigation`. Call them inside server components,
server actions, or route handlers — never inside a `'use client'` component (use
`router.push()` there instead).

### redirect()

```tsx
import { redirect } from 'next/navigation';

export async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    redirect('/login'); // throws internally — no return needed after this
  }

  return <UserProfile user={user} />;
}
```

`redirect()` throws a special error that Next.js catches. Do not wrap it in `try/catch`.

### notFound()

Call `notFound()` when a resource genuinely does not exist (as opposed to a permission error,
which should be a `redirect`).

```tsx
import { notFound } from 'next/navigation';

export async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound(); // renders the nearest not-found.tsx
  }

  return <Article post={post} />;
}
```

The nearest `not-found.tsx` in the segment tree is rendered. The root `app/not-found.tsx`
is the fallback for the whole app.

---

## Route handlers (API routes)

`route.ts` files define API endpoints. They live in `app/` alongside page routes but cannot
coexist at the same path as a `page.tsx`.

```
app/
  api/
    users/
      route.ts          ← GET /api/users, POST /api/users
    users/[id]/
      route.ts          ← GET /api/users/123, DELETE /api/users/123
```

```ts
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const users = await getUsers();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await createUser(body);
  return NextResponse.json(user, { status: 201 });
}
```

In FSD terms, the business logic for these handlers belongs in `features/<name>/api/` — the
route handler itself is just the HTTP entry point, same as how `app/page.tsx` is just the
routing entry point.

---

## Parallel routes and intercepting routes

These are advanced patterns. Use them only when the UI genuinely requires them.

**Parallel routes** (`@slot/`) render two segments simultaneously in the same layout — e.g.
a dashboard with a sidebar and main panel that each navigate independently. Every slot in a
layout must have a `default.tsx` to handle the unmatched state.

**Intercepting routes** (`(.)path`, `(..)path`) show a route in a modal while keeping the
background page visible — e.g. opening a photo detail in a modal from a grid, then showing
the full page if opened directly via URL.

Both patterns are documented in full in `node_modules/next/dist/docs/`. Read the docs before
implementing — the folder naming conventions are strict and easy to get wrong.

---

## What NOT to do

**Do not create `pages/` at the root.** `pages/` is the Next.js 12/13 Pages Router. This project
uses the App Router (`app/`). A `pages/` folder at the root will either conflict or confuse.

**Do not put JSX or logic directly in `app/page.tsx`.** The route file is always a one-line
re-export pointing to `src/views/<name>`. The view slice is where the component lives.

**Do not import across FSD layers from inside `app/`.** The root `app/` is the composition root
and is exempt from the FSD layer graph (steiger ignores it), but this exemption is only for
wiring providers (`src/app`) to views (`src/views`). Do not use it as a shortcut to bypass
layer rules elsewhere.

**Do not put route files inside `src/views/`.** Views render page content; they are not URL
endpoints. Routing lives in the root `app/` folder, full stop.

**Do not call `redirect()` or `notFound()` inside a `'use client'` component.** They are
server-only. Use `router.push()` for client-side navigation instead.

**Do not use `useRouter` from `next/router`.** That is the old Pages Router. Always import
from `next/navigation`.

---

## Quick checklist for a new page

1. Create `app/<route>/page.tsx` with a single re-export line.
2. Create `src/views/<name>/index.ts` exporting the page component.
3. Create `src/views/<name>/ui/<Name>Page.tsx` with the component body.
4. If the route is dynamic (`[param]`), `await params` in the view component.
5. If the page reads query params server-side, `await searchParams` too.
6. Run `pnpm typecheck && pnpm lint` to confirm nothing is broken.
