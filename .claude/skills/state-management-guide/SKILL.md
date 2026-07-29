---
name: state-management-guide
description: Consult this skill whenever there is any question about where state should live — "where do I put this", "useState or Zustand", "should this be in the store", "global state", "shared state", "re-renders from the store", "form state", "URL filters", "pagination", "server data", "optimistic update", or any question about managing state in this app. Also invoke proactively when someone is about to add loading flags, hover state, open/closed toggles, server-fetched data, or form drafts to the global Zustand store — those do not belong there.
---

# State Management Guide

The most common mistake in this codebase is putting things in the global Zustand store that do not belong there. Fetched server data, loading flags, form field values, and open/closed toggles all end up there and produce either unnecessary re-renders or hard-to-trace bugs (a flag from one request bleeds into another's UI).

Run through these four questions in order. Stop at the first "yes."

---

## The four questions

**1. Does this data come from the server (fetched, loaded, streamed)?**

If yes — keep it in the server layer. Do NOT put it in Zustand.

In Next.js App Router, server components fetch their own data. Zustand is a _client_ store; putting server data into it means you fetched on the server, serialized across the network, and then re-stored it on the client — extra work for zero benefit, and it breaks on cache revalidation.

```tsx
// ✅ Server Component — fetch here, pass as props
async function UserProfile({ id }: { id: string }) {
  const user = await fetchUser(id); // fetched once, cached by Next
  return <ProfileCard user={user} />;
}

// ❌ Wrong — do not mirror fetched data into the store
const setUser = useAppStore((state) => state.setUser);
useEffect(() => {
  fetchUser(id).then(setUser); // re-fetches on client, now you have two sources
}, [id]);
```

**For optimistic updates** — when you want the UI to reflect a mutation before the server confirms it — use React 19's `useOptimistic`:

```tsx
'use client';
import { useOptimistic, useTransition } from 'react';

function LikeButton({ post }: { post: Post }) {
  const [optimisticLikes, addOptimisticLike] = useOptimistic(
    post.likes,
    (current, increment: number) => current + increment,
  );
  const [, startTransition] = useTransition();

  function handleLike() {
    startTransition(async () => {
      addOptimisticLike(1); // shown immediately
      await likePost(post.id); // server action; reverts if it throws
    });
  }

  return <button onClick={handleLike}>♥ {optimisticLikes}</button>;
}
```

`useOptimistic` state is local to the component and automatically reconciles when the server response lands — no Zustand needed. See the `react-19` skill for `useTransition` and Server Actions.

---

**2. Should the user be able to bookmark, share, or reload this state?**

If yes — put it in the URL.

Good fits: search queries, active filters, pagination page number, tab selection, sort order. Anything a user might want to send to a colleague or refresh and keep.

```tsx
// Reading
const searchParams = useSearchParams();
const page = searchParams.get('page') ?? '1';

// Writing
const router = useRouter();
router.push(`?page=${newPage}`);
```

See `node_modules/next/dist/docs/` for the App Router `useSearchParams` and `useRouter` guides — this version has differences from what training data shows.

---

**3. Does only one component need this state?**

If yes — use `useState` (or `useReducer` for complex local logic).

Good fits: dropdown open/closed, hover state, accordion expanded, form field value before submit, a "copied to clipboard" flash. None of these need to leave the component that owns them.

```tsx
const [isOpen, setIsOpen] = useState(false);
```

Rule of thumb: if you can describe the state as "what this specific UI element is doing right now," it lives in the component.

**When multiple components need the same local-ish state:** lift it to the closest common ancestor and pass it down as props. Only reach for Zustand when that ancestor is so far up the tree that prop-drilling becomes genuinely painful. Two levels of props is not painful; Zustand is not the answer to two levels.

---

**4. Do multiple distant components need this state, and it cannot come from the URL?**

If yes — use Zustand.

Good fits: user preferences, auth/session state, a shopping cart, theme selection — data that several distant components read and write simultaneously without a clean common ancestor, and that must survive page navigation.

---

## Derived state — compute, don't store

If a value can be calculated from state you already have, calculate it; do not store it separately.

```tsx
// ❌ Wrong — derived value mirrored into the store
const setFilteredItems = useAppStore((state) => state.setFilteredItems);
useEffect(() => {
  setFilteredItems(items.filter((i) => i.active));
}, [items]);

// ✅ Correct — compute at the point of use
const filteredItems = useAppStore((state) => state.items.filter((i) => i.active));
```

A stored derived value is a second source of truth. When the source changes the derived value gets stale; you add an effect to sync them; the effect has a bug; now you have three problems. Compute instead.

---

## This project's Zustand store

The canonical example is `src/entities/preferences/model/store.ts`. It holds `reduceMotion` — a user preference that must survive page reloads (persisted to `localStorage`) and be readable anywhere in the app. This is exactly the right kind of thing for Zustand: shared, not derivable from the URL, must outlive any individual component.

**Reading from the store — the pattern to follow:**

`src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`:

```tsx
const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);
const setReduceMotion = useAppStore((state) => state.setReduceMotion);
```

Two things to notice:

- Each `useAppStore` call selects **one primitive or stable reference**. This is what prevents re-renders from unrelated store changes. A selector that returns a new object on every call will cause an infinite re-render loop. See the `zustand-5` skill for why.
- Value and setter are two separate calls. Do not combine them into one selector that returns `{ value, setter }` — that returns a new object every time.

**For Zustand API, `persist`, `devtools`, selector patterns, and testing:** read the `zustand-5` skill. This skill covers _when_ to use the store; that one covers _how_.

---

## Where store code lives in FSD

This matters because the wrong location breaks the layer graph and fails `pnpm steiger`.

| File                                            | Layer      | Why it lives there                                                                   |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `src/entities/preferences/model/store.ts`       | `entities` | Shared state is business state, not a user action.                                   |
| `src/entities/preferences/model/useAppStore.ts` | `entities` | The hook lives next to the store it reads, not next to the provider.                 |
| `src/app/AppStoreProvider.tsx`                  | `app`      | The provider that creates the store per-request lives at the top of the layer stack. |

A `features` slice may import `useAppStore` from `@/entities/preferences` — `entities` is _below_ `features` in the FSD graph, so that import is legal. It must **never** import `AppStoreProvider` from `src/app` — `app` is _above_ `features`. Steiger enforces this; `pnpm lint` will catch the violation.

When you add new shared state:

1. Add the field to `AppState` and `AppInitialState` in `src/entities/preferences/model/store.ts`.
2. Add a setter action in the same `(set) => ({...})` initializer.
3. Read it in `features` or `widgets` via `useAppStore((state) => state.yourField)`.

---

## Anti-patterns: what not to put in Zustand

| State                                              | Where it actually belongs                                 |
| -------------------------------------------------- | --------------------------------------------------------- |
| Data fetched from an API or database               | Server Component fetch (or RSC cache)                     |
| Loading / fetching flag for a single request       | Co-located with the fetch (or a data-fetching library)    |
| Whether a dropdown, modal, or popover is open      | `useState` in the component that owns it                  |
| Form field values before submit                    | `useState` (or a form library) in the form component      |
| Active URL filter, search query, or page number    | URL via `useSearchParams`                                 |
| Data that can be computed from URL params or store | Derive it inline — do not mirror into store               |
| A flag tracking which step a wizard is on          | `useState` unless the wizard step must survive navigation |
| Optimistic UI during a mutation                    | `useOptimistic` (React 19) — scoped to the component      |

The pattern behind these: **store state should outlive the component that writes it and be needed by components that have no shared ancestor.** If removing the component also makes the state pointless, it was never store state to begin with.

---

## Quick reference

```
Fetched from the server?               →  Server Component fetch (RSC)
Optimistic update during a mutation?   →  useOptimistic (React 19)
Bookmarkable / shareable?              →  URL (useSearchParams / router.push)
Can be computed from existing state?   →  Compute inline — don't store it
Only one component needs it?           →  useState
Multiple distant components need it?   →  Zustand (useAppStore)
```

For Zustand implementation details — store factory, `createStore`, `persist`, `devtools`, selectors, `useShallow`, and tests — read the `zustand-5` skill.
