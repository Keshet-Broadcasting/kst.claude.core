---
name: data-fetching
description: >
  Load this skill the moment ANY data-loading question arises — "how do I fetch
  data", "useEffect + fetch", "useEffect to load", "API call", "get data from
  server", "load data on mount", "call an API", "async component", "where does
  data fetching go", "React Query", "SWR", "client-side fetch", "use cache",
  "cacheTag", "cacheLife", "Promise.all", "parallel fetch", "streaming data",
  "use() hook", "pass promise to client", or any question about reading external
  data into a component or page. Also trigger immediately whenever you SEE a
  useEffect that calls fetch — that is the single most common React 18 SPA
  antipattern that breaks App Router, and it must be corrected before writing
  any other code.
---

# Data Fetching

You are acting as a Next.js App Router data-fetching specialist. Your first job
on any data question is to choose the right pattern — most mistakes happen
because developers reach for the wrong tool before thinking about where the data
belongs.

---

## Decision guide — run this before writing any fetch code

```
Where does this data request belong?
│
├── Are you READING data (not changing it)?
│   │
│   ├── Does the page/component need to run on the server?  (default: YES)
│   │   │
│   │   ├── Data ready before HTML is sent → Pattern 1a — async Server Component
│   │   ├── Multiple independent fetches → Pattern 1b — parallel (Promise.all)
│   │   └── Data can stream in after first paint → Pattern 1c — use() + Suspense
│   │
│   └── Does the data genuinely require the client?
│       (real-time WebSocket, user-specific data that changes per interaction,
│        browser APIs, data that must NOT hit the server at all)
│       └─► Pattern 4 — SWR / React Query  ← last resort only
│
└── Are you CHANGING data (form submit, button action, mutation)?
    │
    ├── Triggered by a user action in the same app?
    │   └─► Pattern 2 — Server Action
    │
    └── Triggered by an external system (webhook, third-party callback, public
        REST consumers, curl)?
        └─► Pattern 3 — Route Handler  (app/api/)
```

---

## Pattern 1a — async Server Component (default)

The component is `async`. Data is ready before HTML is sent. No `useEffect`,
no loading state, no client JavaScript for the fetch itself.

**In FSD:** page-level loading lives in `src/views/<page>/`. Entity-level reads
(shared data like preferences or the current user) live in
`src/entities/<name>/api/`. Never put a fetch in a widget — widgets compose,
they do not load.

```ts
// src/entities/posts/api/getPosts.ts
export async function getPosts(): Promise<Post[]> {
  const res = await fetch('https://api.example.com/posts');
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}
```

```tsx
// src/views/posts/ui/PostsPage.tsx
import { getPosts } from '@/entities/posts';

export async function PostsPage() {
  const posts = await getPosts(); // runs on server, no useEffect
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  );
}
```

### Caching in Next.js 16 — `use cache` directive

Next.js 16 ships a new function-level caching API. The old `fetch({ cache: 'force-cache' })`
still works for plain `fetch` calls, but for any async function (database call,
ORM query, complex aggregation) use the `'use cache'` directive instead.

```ts
// src/entities/posts/api/getPosts.ts
import { unstable_cacheTag as cacheTag, unstable_cacheLife as cacheLife } from 'next/cache';

export async function getPosts(): Promise<Post[]> {
  'use cache';
  cacheLife('hours'); // built-in profile: seconds | minutes | hours | days | weeks | max
  cacheTag('posts'); // tag for targeted invalidation
  const res = await fetch('https://api.example.com/posts');
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}
```

Invalidate by tag from a Server Action or Route Handler:

```ts
import { revalidateTag } from 'next/cache';
revalidateTag('posts'); // busts every cache entry tagged 'posts'
```

> Read the `nextjs-16` skill's caching section before choosing a `cacheLife`
> profile — the profiles differ from `next.revalidate` values you may know from
> Next 13/14/15.

---

## Pattern 1b — Parallel fetching

Sequential `await` inside a Server Component is the most common accidental perf
regression. If two fetches are independent, run them in parallel with
`Promise.all`.

```tsx
// src/views/dashboard/ui/DashboardPage.tsx
import { getPosts } from '@/entities/posts';
import { getUser } from '@/entities/user';

export async function DashboardPage() {
  // ✅ Both requests fire simultaneously
  const [posts, user] = await Promise.all([getPosts(), getUser()]);

  // ❌ This version takes getPosts-time + getUser-time instead of max(both)
  // const posts = await getPosts();
  // const user = await getUser();

  return <Dashboard posts={posts} user={user} />;
}
```

Use `Promise.allSettled` when one failure should not block the rest:

```ts
const [postsResult, userResult] = await Promise.allSettled([getPosts(), getUser()]);
const posts = postsResult.status === 'fulfilled' ? postsResult.value : [];
```

---

## Pattern 1c — Streaming with `use()` + Suspense

When a slow fetch would delay the entire page's first paint, start the Promise
on the server but don't await it — pass it to a Client Component that uses
React 19's `use()` hook. The page shell renders immediately; the component
suspends until data arrives.

```tsx
// src/views/posts/ui/PostsPage.tsx  (Server Component — note: NOT async)
import { Suspense } from 'react';
import { getPosts } from '@/entities/posts';
import { PostsList } from '@/entities/posts';

export function PostsPage() {
  // Promise starts on the server, but we don't await it here.
  const postsPromise = getPosts();

  return (
    <Suspense fallback={<p>Loading posts…</p>}>
      <PostsList postsPromise={postsPromise} />
    </Suspense>
  );
}
```

```tsx
// src/entities/posts/ui/PostsList.tsx
'use client';
import { use } from 'react';

interface Props {
  postsPromise: Promise<Post[]>;
}

export function PostsList({ postsPromise }: Props) {
  // `use()` suspends this component until the promise resolves.
  // React picks up the Suspense boundary above and shows the fallback.
  const posts = use(postsPromise);
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  );
}
```

**When to choose streaming over plain async:**

- The data is slow and the page has other content ready to show immediately.
- You want the shell (nav, header, layout) to appear before the data loads.
- You want fine-grained loading states per section, not a whole-page spinner.

**When NOT to stream:** if the page is meaningless without that data (e.g. a
product page without product details), just `await` it — streaming adds
complexity for no user benefit.

> For `error.tsx` and the full Suspense boundary placement guide, read the
> `loading-and-error` skill.

---

## Pattern 2 — Server Action (mutations)

Use a Server Action when a user action (button click, form submit) must change
data. The function runs on the server but is called from the client. No route
handler involved — Next.js wires the RPC automatically.

**In FSD:** Server Actions live in `src/features/<name>/api/`.

```ts
// src/features/save-preferences/api/savePreferences.ts
'use server';
import { revalidateTag } from 'next/cache';

export async function savePreferences(formData: FormData) {
  const reduceMotion = formData.get('reduceMotion') === 'on';
  await db.preferences.upsert({ reduceMotion });
  revalidateTag('preferences'); // bust cache so next RSC read is fresh
}
```

```tsx
// src/features/save-preferences/ui/SavePreferencesForm.tsx
'use client';
import { useActionState } from 'react';
import { savePreferences } from '../api/savePreferences';

export function SavePreferencesForm() {
  const [state, action, isPending] = useActionState(savePreferences, null);
  return (
    <form action={action}>
      <input type="checkbox" name="reduceMotion" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
```

### Optimistic updates

When the mutation result is predictable, update the UI before the server
responds using `useOptimistic`:

```tsx
'use client';
import { useOptimistic, useTransition } from 'react';
import { toggleLike } from '../api/toggleLike';

export function LikeButton({ postId, initialLiked }: Props) {
  const [optimisticLiked, setOptimistic] = useOptimistic(initialLiked);
  const [, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          setOptimistic((prev) => !prev); // immediate UI update
          await toggleLike(postId); // server catches up
        })
      }
    >
      {optimisticLiked ? '♥' : '♡'}
    </button>
  );
}
```

> For `useActionState`, `useFormStatus`, and full error-handling patterns, read
> the `react-19` skill.

---

## Pattern 3 — Route Handler (real HTTP endpoint)

Use a Route Handler when you need a genuine HTTP endpoint — one that external
systems call directly. Examples: a webhook receiver, a public REST API other
apps consume, a health check endpoint.

Do NOT use a Route Handler just to fetch your own data from a Server Component —
that adds a network hop for no reason. Call the function directly instead
(Pattern 1a).

**Location:** `app/api/<path>/route.ts`. This sits in the Next.js App Router
(`app/`), not in `src/` — it is routing infrastructure, not FSD business logic.

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

Route with dynamic path parameters:

```ts
// app/api/posts/[id]/route.ts
import type { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/posts/[id]'>) {
  const { id } = await ctx.params; // params is a Promise in Next 16 — always await
  const post = await db.posts.findById(id);
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(post);
}
```

> `fetch` memoization does NOT apply inside route handlers.
> See the `nextjs-16` skill for the full Route Handler signature.

---

## Pattern 4 — Client-side fetch (SWR / React Query)

Reach for this only when server rendering genuinely does not work:

- Real-time data that updates while the user is on the page (WebSocket, polling)
- Data that depends on browser state (geolocation, clipboard) that cannot be
  serialized and passed from the server
- Data the user changes immediately and must see reflected without a full
  navigation

This pattern requires `'use client'`, adds JavaScript to the bundle, shows a
loading state to the user, and is invisible to search engines. It is the React
18 SPA default — App Router's default is Pattern 1a.

```tsx
// src/features/live-feed/ui/LiveFeed.tsx
'use client';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function LiveFeed() {
  const { data, error, isLoading } = useSWR('/api/feed', fetcher, {
    refreshInterval: 5000,
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Failed to load</p>;
  return (
    <ul>
      {data.items.map((i) => (
        <li key={i.id}>{i.text}</li>
      ))}
    </ul>
  );
}
```

### Pagination and infinite scroll

For cursor/page-based lists, SWR's `useSWRInfinite` is the right tool:

```tsx
'use client';
import useSWRInfinite from 'swr/infinite';

const getKey = (page: number, prev: { nextCursor?: string } | null) => {
  if (prev && !prev.nextCursor) return null; // no more pages
  return `/api/feed?cursor=${prev?.nextCursor ?? ''}`;
};

export function InfiniteFeed() {
  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher);
  const items = data?.flatMap((page) => page.items) ?? [];

  return (
    <>
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.text}</li>
        ))}
      </ul>
      <button onClick={() => setSize(size + 1)} disabled={isLoading}>
        Load more
      </button>
    </>
  );
}
```

**In FSD:** client-side SWR lives in `src/features/<name>/` if it drives a user
interaction, or `src/entities/<name>/` if it reads shared state. Client
components that need `'use client'` belong at the lowest point in the tree —
read the `server-vs-client` skill before placing the directive.

---

## FSD layer map

| Pattern               | FSD layer & path                                            | Why                                                                     |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Server read (entity)  | `src/entities/<name>/api/`                                  | Shared business data, no user action                                    |
| Server read (page)    | `src/views/<name>/ui/` (async function)                     | Page-specific load, visible only to that route                          |
| Streaming Promise     | start in `src/views/`, consume in `src/entities/<name>/ui/` | Shell in views, data component in entities                              |
| Server Action         | `src/features/<name>/api/`                                  | User-initiated mutation = a feature                                     |
| Route Handler         | `app/api/<path>/route.ts`                                   | Router infrastructure, not FSD — lives outside `src/`                   |
| Client-side SWR/Query | `src/features/<name>/ui/`                                   | Interactive, client-only — lowest layer that actually needs the browser |

---

## Common mistakes

| Mistake                                                                  | Fix                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `useEffect(() => { fetch(...).then(setData) }, [])` in a component       | Move the call to an `async` Server Component — no hook needed                    |
| Sequential `await a(); await b()` when both are independent              | `await Promise.all([a(), b()])` — run in parallel                                |
| Calling a Route Handler from your own Server Component                   | Call the data function directly — a Route Handler adds a network hop for nothing |
| Using `cache: 'force-cache'` on a non-fetch call (DB, ORM)               | Use the `'use cache'` directive + `cacheTag`/`cacheLife` instead                 |
| Putting a Server Action in `src/entities/`                               | Actions (mutations) are features — move it to `src/features/<name>/api/`         |
| `await ctx.params` forgotten in a Route Handler                          | `params` is a Promise in Next 16 — always `await` it                             |
| Passing a Promise as a prop without a Suspense boundary above            | Wrap the consuming Client Component in `<Suspense fallback={…}>`                 |
| Using React Query/SWR for data that never changes while the page is open | That is Pattern 1a; client-side polling is overhead you do not need              |
| Fetching in a widget (`src/widgets/`)                                    | Widgets compose — data loading belongs in views or entities, not widgets         |

---

## Related skills

- `nextjs-16` — `use cache` profiles, Route Handler signatures, `params` as Promise
- `zustand-5` — seeding the store from server-fetched data (`getInitialAppState`)
- `server-vs-client` — where to place `'use client'` when Pattern 4 is needed
- `react-19` — `useActionState`, `useOptimistic`, Server Action error handling
- `loading-and-error` — `<Suspense>` boundaries, `loading.tsx`, `error.tsx`
