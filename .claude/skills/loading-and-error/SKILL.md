---
name: loading-and-error
description: >
  Use this skill whenever a page, route, or async Server Component needs a loading state, error
  boundary, or not-found fallback. Triggers on: "add a loading spinner", "show a loading state",
  "handle errors on a page", "what to do when data is not found", "404 page", "not found page",
  "error page", "loading page", "skeleton", "loading flash", creating or editing loading.tsx /
  error.tsx / not-found.tsx / global-error.tsx, or any mention of Suspense fallbacks, error
  boundaries, streaming SSR, or missing-data handling in Next.js App Router. Read this skill
  BEFORE writing any of these files — the correct shapes differ from training data.
---

# Loading, Error, and Not-Found Pages

Five special files Next.js App Router recognizes. Each lives in the **same folder** as the
`page.tsx` it covers. A file in `app/` covers the whole app; one in `app/dashboard/` covers
only that segment.

---

## Quick decision: which file do I need?

| Situation                                                            | File                |
| -------------------------------------------------------------------- | ------------------- |
| Async Server Component that fetches data and might take a moment     | `loading.tsx`       |
| Need granular loading state for part of a page (not the whole route) | `<Suspense>` inline |
| Any Server/Client Component in that segment might throw              | `error.tsx`         |
| Root layout itself might throw (rare)                                | `global-error.tsx`  |
| Page calls `notFound()` when an item does not exist                  | `not-found.tsx`     |

If unsure: create `loading.tsx`, `error.tsx`, and `not-found.tsx`. They are small, cost nothing
to have, and missing one leaves users on a blank white screen.

---

## How streaming SSR works (mental model)

Understanding this prevents misplaced Suspense boundaries.

Next.js App Router streams HTML progressively to the browser:

1. **First chunk** — the shell renders immediately: root `<html>`, `<head>`, and the nearest
   layout above the suspended segment.
2. **Loading fallback** — `loading.tsx` (or a `<Suspense>` fallback) is sent as a placeholder
   while async Server Components fetch.
3. **Content chunk** — when the async work finishes, the real content streams in and React
   swaps the placeholder out client-side.

This means users see a usable shell in milliseconds even before data arrives — but only if the
layout above is synchronous. **Never put awaits in layout.tsx** if you want the shell to be fast.

---

## `loading.tsx` — while the route is loading

Next.js wraps your `page.tsx` in a `<Suspense>` automatically. While the page suspends
(fetching data), it shows the nearest `loading.tsx` above it. As soon as the page finishes,
loading disappears and the page renders.

**Where:** same folder as the `page.tsx` it covers.

**Pattern used in this project** (`app/loading.tsx`):

```tsx
import styles from './loading.module.css';

export default function Loading() {
  return <p className={styles.loading}>Loading…</p>;
}
```

```css
/* loading.module.css */
.loading {
  padding: var(--space-5);
}
```

### Skeleton vs spinner: when to use which

**Skeleton** (layout placeholder mimicking the real content shape):

- Use when the page has a predictable structure (cards, lists, article bodies).
- Reduces perceived wait — users understand what is loading.
- Do not make skeletons pixel-perfect; approximate shapes are enough.

**Spinner** (generic activity indicator):

- Use for actions (button loading states, modal overlays, short waits < 300 ms).
- Acceptable as a route-level fallback when the page structure is unpredictable.

Rule of thumb: **skeleton for pages, spinner for actions**.

### The loading flash problem

When data loads very fast (< 100 ms), a skeleton or spinner flickers briefly and disappears.
This looks broken. Next.js App Router navigations already use `startTransition` internally,
which means React holds the previous page visible until the new page is ready (up to ~5 s), then
shows the loading fallback only if it takes longer. This eliminates most flashes.

If you still see a flash:

- Add a CSS `opacity` transition to the loading component so it fades in/out smoothly.
- Consider skipping `loading.tsx` entirely for routes where data is almost always fast, and
  let the layout handle empty states instead.

---

## Manual `<Suspense>` boundaries — granular loading within a page

`loading.tsx` covers the entire route segment. For loading only _part_ of a page while the
rest is already visible, wrap the slow async Server Component directly:

```tsx
// src/views/dashboard/ui/DashboardPage.tsx (Server Component)
import { Suspense } from 'react';
import { FeedSkeleton } from '@/widgets/feed';
import { Feed } from '@/widgets/feed';
import { StatsPanel } from '@/widgets/stats-panel';

export default function DashboardPage() {
  return (
    <div>
      <StatsPanel /> {/* fast — renders immediately */}
      <Suspense fallback={<FeedSkeleton />}>
        <Feed /> {/* slow — streams in separately */}
      </Suspense>
    </div>
  );
}
```

Key rules:

- The `<Suspense>` boundary must be **above** the async component, not inside it.
- The fallback renders server-side and is included in the first HTML chunk.
- Nesting `<Suspense>` boundaries is fine — each resolves independently.
- The closest `error.tsx` above still catches errors from inside any `<Suspense>`.

---

## `error.tsx` — when something throws

Next.js wraps the route segment in a React Error Boundary. When any Server Component in that
segment throws, Next.js catches it and renders `error.tsx` instead.

**`error.tsx` MUST start with `'use client'`.** The reason: React's error boundary mechanism
is class-based and operates in the browser after hydration. Forgetting `'use client'` causes
a silent build failure or inactive boundary.

**Where:** same folder as the `page.tsx` it covers.

**Pattern used in this project** (`app/error.tsx`):

```tsx
'use client';

import { useEffect } from 'react';
import styles from './error.module.css';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Log to your error tracking service (Sentry, Datadog, etc.)
    console.error(error);
  }, [error]);

  return (
    <main className={styles.main}>
      <h1>Something went wrong</h1>
      <p>We could not load this page. Please try again.</p>
      {error.digest && <p className={styles.digest}>Error reference: {error.digest}</p>}
      <button type="button" onClick={() => unstable_retry()}>
        Try again
      </button>
    </main>
  );
}
```

```css
/* error.module.css */
.main {
  padding: var(--space-5);
}
.digest {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
```

### About the props

- `error` — the thrown value cast to `Error`. **In production `error.message` is always
  redacted** to a generic string for security — never show it to users. The real message is
  in server logs. `error.digest` is a short hash you can show users so they can quote it in
  support tickets, and you can use it to find the matching server log entry.
- `unstable_retry` — reruns the failed Server Component. This is the Next 16 name (previously
  `reset` in Next 15). Wire it to a "Try again" button — a dead-end error page with no action
  is worse than the crash.

### What to log vs what to show users

|                                        | Show to user     | Log only |
| -------------------------------------- | ---------------- | -------- |
| Generic "something went wrong" message | ✅               |          |
| `error.digest` (safe reference ID)     | ✅               |          |
| `error.message` (raw error text)       | ❌ in production | ✅       |
| Stack traces                           | ❌ always        | ✅       |

Log in a `useEffect` (shown above) — never in render, never as JSX text.

### Offline and network error states

When a Server Component fails because the network is unavailable, `error.tsx` still catches it.
Detect offline conditions in the error component to show a more specific message:

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <main>
      <h1>{isOffline ? 'You are offline' : 'Something went wrong'}</h1>
      <p>
        {isOffline
          ? 'Check your internet connection and try again.'
          : 'We could not load this page. Please try again.'}
      </p>
      <button type="button" onClick={() => unstable_retry()}>
        Try again
      </button>
    </main>
  );
}
```

---

## `global-error.tsx` — when the root layout itself throws

`global-error.tsx` lives at `app/global-error.tsx` and catches errors thrown inside
`app/layout.tsx`. This is rare but important — if the root layout throws, no `error.tsx` below
it can help because the layout is not rendered at all.

**Critical difference from `error.tsx`:** because `global-error.tsx` replaces the entire root
layout, it **must include its own `<html>` and `<body>` tags**. Forgetting them produces a
malformed HTML document.

```tsx
// app/global-error.tsx
'use client';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: '2rem' }}>
          <h1>Something went wrong</h1>
          <button type="button" onClick={() => unstable_retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
```

`global-error.tsx` must be `'use client'` for the same reason as `error.tsx`. It does not need
a CSS module because it renders outside all providers — keep it minimal and inline styles are
acceptable here.

---

## `not-found.tsx` — when the requested item does not exist

Unlike `loading.tsx` and `error.tsx`, the not-found page does **not** trigger automatically.
You must call `notFound()` from `next/navigation` inside your Server Component (usually after a
database lookup that returned nothing).

**Where:** same folder as the `page.tsx` that might return nothing. A root `app/not-found.tsx`
is the global fallback for unmatched URLs — place route-specific ones in the route folder.

**How to trigger it from a page:**

```tsx
import { notFound } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await db.findById(id);

  if (!item) {
    notFound(); // throws — Next shows not-found.tsx; nothing below this line runs
  }

  return <div>{item.name}</div>;
}
```

`notFound()` throws internally. You do not need a return after it, but TypeScript does not know
that — the `if (!item) notFound();` guard is enough to narrow the type.

**Pattern used in this project** (`app/not-found.tsx`):

```tsx
import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1>Not found</h1>
      <Link href="/">Back to the home page</Link>
    </main>
  );
}
```

```css
/* not-found.module.css */
.main {
  padding: var(--space-5);
}
```

`not-found.tsx` is a plain Server Component (no `'use client'` needed). It does not receive
the request URL or any props — if you need to show which item was not found, render that
information from a parent layout or pass it via search params before calling `notFound()`.

---

## React 19 `use()` hook with Suspense

The `use()` hook lets a **Client Component** read a Promise and suspend until it resolves.
The Server Component creates the Promise (does not await it) and passes it as a prop:

```tsx
// Server Component — create the promise, do NOT await it
import { Suspense } from 'react';
import { UserCard } from './UserCard';
import { UserCardSkeleton } from './UserCardSkeleton';

export default function Page() {
  const userPromise = fetchUser(userId); // intentionally not awaited
  return (
    <Suspense fallback={<UserCardSkeleton />}>
      <UserCard userPromise={userPromise} />
    </Suspense>
  );
}
```

```tsx
// Client Component — use() suspends until the promise resolves
'use client';

import { use } from 'react';
import type { User } from '@/entities/user';

export function UserCard({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise); // suspends here until resolved
  return <div>{user.name}</div>;
}
```

**When to use this pattern vs a plain async Server Component:**

- Use a plain `async` Server Component when the component itself is on the server and can
  directly await.
- Use `use()` when you need Client Component interactivity (state, effects, event handlers)
  but want to avoid prop-drilling a loader or redundant `useEffect` fetches.
- The `<Suspense>` wrapping the Client Component still requires a `loading.tsx` or explicit
  fallback — the boundary catches the suspension from `use()` just like from a Server Component.

---

## Where the files live relative to `page.tsx`

```
app/
├── global-error.tsx     ← catches errors in root layout (needs <html><body>)
├── loading.tsx          ← covers the whole app (root segment)
├── error.tsx            ← covers the whole app
├── not-found.tsx        ← global 404 fallback
├── page.tsx
└── dashboard/
    ├── loading.tsx      ← covers only /dashboard
    ├── error.tsx        ← covers only /dashboard
    ├── not-found.tsx    ← covers only /dashboard (if dashboard pages call notFound())
    └── page.tsx
```

Each file only covers the **segment it sits in** and everything nested below it. An error in
`app/dashboard/settings/page.tsx` bubbles up to `app/dashboard/error.tsx` if there is no
`app/dashboard/settings/error.tsx`.

---

## CSS module conventions in this project

Every fallback page uses a CSS module named after the file (`loading.module.css`,
`error.module.css`, `not-found.module.css`). The root-level pattern:

- `loading.tsx` uses class `.loading` (just padding)
- `error.tsx` and `not-found.tsx` use class `.main` (just padding)

Use `var(--space-5)` for consistent padding — not hardcoded pixel values.

When you add a route-specific fallback, copy this minimal pattern first. Grow it only if the
design calls for something beyond padding.

---

## Common mistakes

**Forgetting `'use client'` on `error.tsx` or `global-error.tsx`** — build succeeds but the
error boundary silently does not activate.

**Forgetting `<html>` and `<body>` in `global-error.tsx`** — produces a malformed document
because `global-error.tsx` replaces the root layout entirely.

**Showing `error.message` to users in production** — in production this is always a generic
redacted string ("An error occurred"), not the real message. Never use it for user-facing copy;
always write your own generic message.

**Using `reset` instead of `unstable_retry`** — this project's `error.tsx` uses `unstable_retry`.
Copying the Next 15 prop name `reset` causes a TypeScript error.

**Trying to catch errors with try/catch inside render** — render must be pure. Wrapping data
fetches in try/catch that returns fallback UI inline breaks Suspense integration and hides
errors from the boundary. Let errors throw; let `error.tsx` catch them.

**Awaiting data in `layout.tsx` before letting anything render** — this blocks the shell and
kills streaming. Move data fetching into `page.tsx` or async child Server Components so the
layout renders immediately.

**Calling `notFound()` inside a Client Component** — `notFound()` only works in Server
Components. Handle it server-side before rendering, or redirect to a dedicated 404 route from
the client.

**Creating an empty `not-found.tsx` that renders nothing** — users see a blank page. Always
include a heading and a link back somewhere useful.

**Putting these files in `src/views/` or `src/features/`** — `loading.tsx`, `error.tsx`,
`not-found.tsx`, and `global-error.tsx` must sit in the `app/` directory (the routing
directory), not in the FSD layer tree. They are router conventions, not application features.
