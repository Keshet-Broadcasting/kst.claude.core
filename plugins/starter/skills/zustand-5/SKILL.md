---
name: zustand-5
description: Use when creating, modifying, testing, or reviewing any Zustand store, selector, or store provider in this project. Zustand 5 + Next.js App Router requires store-per-request; v4 patterns and module-singleton stores are wrong here.
version: 1.0.0
---

# Zustand 5

This project runs **Zustand 5** (React 19, Next 16 App Router). For the exact pinned patch, read
`package.json` and the `catalog:` block in the repo-root `pnpm-workspace.yaml` — this skill
deliberately omits patch numbers because they drift.

Every rule below is verified against the installed `.d.ts` files in `node_modules/zustand/` and
this repo's own stores. **`node_modules/` only exists after `pnpm install`** — a freshly
scaffolded app has none; run install first, then verify a claim by searching the symbol in the
relevant `.d.ts`. Match the house style in `src/entities/preferences/model/` (the store and the
hook that reads it) and `src/app/` (the provider).

## Core rule: no module-level singleton store that holds server-seeded state

On the server a module is evaluated **once per process**, not once per request. A
`create(...)` call at module scope therefore produces **one store shared by every
concurrent SSR request**. User A's state leaks into User B's HTML. The header comment on the
`createAppStore` factory in `src/entities/preferences/model/store.ts` states this as the reason it exports a factory:

> "A factory, not a singleton. A module-level store seeded with server data would be shared
> across every SSR request in the same process. One store per request, owned by the provider."

| Store kind                                                                                | Correct shape                                  | Why                              | File                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seeded from the server (props, cookies, fetched data)                                     | `createStore` factory + React context provider | one store per request/mount      | `src/entities/preferences/model/store.ts` (factory), `src/entities/preferences/model/context.ts` + `useAppStore.ts` (context + hook), `src/app/AppStoreProvider.tsx` (provider) |
| Purely client-side, never seeded on the server (e.g. theme read from `<html data-theme>`) | module-level `create(...)` singleton is fine   | nothing to leak between requests | `src/shared/lib/themeStore.ts`                                                                                                                                                  |

The singleton-is-safe comment in `src/shared/lib/themeStore.ts` spells out the exemption: _"A singleton
is safe here, unlike the app store: this state is never seeded from the server, so there is nothing
to leak between SSR requests."_ Don't cargo-cult the provider onto stores like this one.

### The provider pattern as it actually exists here

`src/entities/preferences/model/store.ts` — the factory. Note **`createStore` from `zustand/vanilla`**, not `create`:

```ts
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

export function createAppStore(initialState: AppInitialState) {
  const store = createStore<AppState>()(
    devtools(
      persist(
        (set) => ({
          preferences: initialState.preferences,
          hasHydrated: false,
          setReduceMotion: (value) =>
            set(
              (state) => ({ preferences: { ...state.preferences, reduceMotion: value } }),
              false,
              'preferences/setReduceMotion',
            ),
          setHasHydrated: (value) => set({ hasHydrated: value }, false, 'app/setHasHydrated'),
        }),
        {
          name: APP_STORAGE_KEY,
          storage: createJSONStorage(() => localStorage),
          skipHydration: true,
          partialize: (state) => ({ preferences: state.preferences }) /* … */,
        },
      ),
      { name: 'AppStore' },
    ),
  );
  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
```

The provider (`src/app/AppStoreProvider.tsx`), the context + hook (`src/entities/preferences/model/context.ts`
and `useAppStore.ts`), and the factory (`src/entities/preferences/model/store.ts`) are three
separate files, not one — this is deliberate FSD layering, not an accident. `useAppStore` lives
next to the store it reads (`entities/preferences`), **not** next to the provider that seeds it
(`src/app`): FSD layers import top-to-bottom as `app → pages → widgets → features → entities → shared`,
so a `features` slice may legally import the hook from `entities/preferences` (below it), but
must never import `AppStoreProvider` itself from `src/app` (above it) — that exact mistake was
caught by a design review and is now guarded by `pnpm steiger`.

`src/entities/preferences/model/context.ts` — just the context object, no directive needed since
nothing here renders JSX:

```ts
import { createContext } from 'react';
import type { AppStore } from './store';

export const AppStoreContext = createContext<AppStore | null>(null);
```

`src/entities/preferences/model/useAppStore.ts` — the hook, `'use client'` since it calls React hooks:

```ts
'use client';
import { useContext } from 'react';
import { useStore } from 'zustand';
import { AppStoreContext } from './context';
import type { AppState } from './store';

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return useStore(store, selector);
}
```

`src/app/AppStoreProvider.tsx` — the provider, importing the context and factory from the entity
instead of declaring its own. **It uses `useState`, not `useRef`:**

```tsx
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { AppStoreContext, createAppStore } from '@/entities/preferences';
import type { AppInitialState, AppStore } from '@/entities/preferences';

export function AppStoreProvider({ initialState, children }: Props) {
  // Lazy initializer: runs exactly once per component instance.
  const [store] = useState<AppStore>(() => createAppStore(initialState));

  useEffect(() => {
    void store.persist.rehydrate(); // read localStorage only after mount
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}
```

Why `useState` and not the `useRef` from Zustand's own docs — two reasons, both live here (see the
lazy-init `useState` comment in `src/app/AppStoreProvider.tsx`):

1. `eslint-config-next` (see `eslint.config.mjs`, `nextVitals` + `nextTs`) flags reading
   `ref.current` during render. `src/app/AppStoreProvider.tsx` records this decision.
2. Under React 19 types there is **no zero-argument `useRef` overload**. The only three
   signatures in `@types/react/index.d.ts` (search `function useRef`) are `useRef<T>(initialValue: T)`,
   `useRef<T>(initialValue: T | null)`, `useRef<T>(initialValue: T | undefined)`. So
   `useRef<AppStore>()` is a **type error**; the ref form would have to be
   `useRef<AppStore | undefined>(undefined)`. Don't write it — use `useState` as this repo does.

The server component wires it up: `app/layout.tsx` calls `getInitialAppState()`
(`src/entities/preferences/api/getInitialAppState.ts`) and passes the result to `<AppStoreProvider initialState={…}>`.

## Actions and derived state

**Actions live inside the store initializer** — they are function values on the state object, set
at creation time. They use the `set` callback to update state:

```ts
// ✅ action inside the initializer
setReduceMotion: (value: boolean) =>
  set(
    (state) => ({ preferences: { ...state.preferences, reduceMotion: value } }),
    false,            // replace = false → merge, not replace the whole state
    'preferences/setReduceMotion', // devtools action label (only works with devtools middleware)
  ),
```

**Never define actions outside the store** as standalone functions that call `store.setState()`
directly — that bypasses devtools labeling and middleware. Keep all mutation inside the initializer.

**Derived / computed values belong in selectors, not the store.** Don't store values that can be
calculated from other state — compute them in the component or in a selector function:

```ts
// ❌ storing derived state
isMotionEnabled: !state.preferences.reduceMotion, // stale, recalculates wrong

// ✅ compute in the selector
const isMotionEnabled = useAppStore((s) => !s.preferences.reduceMotion);
```

**Nested updates use explicit spread** — immer is not installed. For deeply nested state, spread
each level you change:

```ts
set((state) => ({
  preferences: {
    ...state.preferences,
    nested: { ...state.preferences.nested, value: newValue },
  },
}));
```

If spread chains become unwieldy on a new store (3+ levels deep), add `immer` as a dependency and
wrap the creator: `immer(persist(creator, persistOpts))`.

## v4 → v5 breaking changes

| Wrong v4 assumption                                                                            | Correct v5                                                                                                                                                                                                                    | Where to verify (`grep` target)                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import create from 'zustand'` (default export)                                                | `import { create } from 'zustand'` — **no default export exists**; `index.d.ts` is only `export * from 'zustand/vanilla'; export * from 'zustand/react';` and `index.js` explicitly skips the `default` key when re-exporting | `zustand/index.d.ts`, `zustand/index.js`, `zustand/react.js` (`exports.create`)                                                                                                              |
| `import createStore from 'zustand/vanilla'` (default)                                          | `import { createStore } from 'zustand/vanilla'` — named only                                                                                                                                                                  | `zustand/vanilla.d.ts` (`export declare const createStore`)                                                                                                                                  |
| `useStore(selector, equalityFn)` / `useBoundStore(selector, shallow)` — equality fn as 2nd arg | Gone. `useStore` is `(api)` or `(api, selector)`; `UseBoundStore` is `()` or `(selector)`. No 3rd/2nd equality parameter exists                                                                                               | `zustand/react.d.ts`                                                                                                                                                                         |
| "…so you must use `useShallow`"                                                                | `useShallow` is the _usual_ answer, but not the only one: `createWithEqualityFn` / `useStoreWithEqualityFn` from **`zustand/traditional`** still take an `equalityFn`                                                         | `zustand/traditional.d.ts`; README                                                                                                                                                           |
| `import { shallow } from 'zustand/shallow'` used as a hook arg                                 | `shallow` is a plain comparator `(a, b) => boolean` — only usable with `zustand/traditional` or `subscribeWithSelector`'s `{ equalityFn }`. The hook-safe wrapper is `useShallow`                                             | `zustand/vanilla/shallow.d.ts`, `zustand/middleware/subscribeWithSelector.d.ts`                                                                                                              |
| `create<State>(...)` in TS                                                                     | `create<State>()(...)` — curried; same for `createStore<State>()(...)`. Required whenever middleware is involved                                                                                                              | `zustand/react.d.ts` / `zustand/vanilla.d.ts` (both `Create` types have the `<T>(): (initializer) => …` overload); `src/entities/preferences/model/store.ts`, `src/shared/lib/themeStore.ts` |
| `getState()` only                                                                              | `getInitialState()` also exists on `StoreApi` and backs `useSyncExternalStore`'s server snapshot                                                                                                                              | `zustand/vanilla.d.ts` (`StoreApi`), `zustand/react.js`                                                                                                                                      |
| React 17 / non-`useSyncExternalStore` support                                                  | Requires React ≥18 (`use-sync-external-store` semantics); the hook is `React.useSyncExternalStore` directly                                                                                                                   | `zustand/package.json` peerDeps, `zustand/react.js`                                                                                                                                          |

Import surface actually shipped by v5 (from `package.json#exports` + the `.d.ts` files):

| Import                    | Exports                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zustand`                 | `create`, `useStore`, `createStore`, types (`StoreApi`, `StateCreator`, `UseBoundStore`, `ExtractState`, `Mutate`, `StoreMutatorIdentifier`)                                                                                                      |
| `zustand/vanilla`         | `createStore` + the vanilla types                                                                                                                                                                                                                 |
| `zustand/react`           | `create`, `useStore`, `UseBoundStore`                                                                                                                                                                                                             |
| `zustand/react/shallow`   | `useShallow`                                                                                                                                                                                                                                      |
| `zustand/vanilla/shallow` | `shallow`                                                                                                                                                                                                                                         |
| `zustand/shallow`         | re-exports both `shallow` and `useShallow`                                                                                                                                                                                                        |
| `zustand/traditional`     | `createWithEqualityFn`, `useStoreWithEqualityFn` (the equality-fn escape hatch)                                                                                                                                                                   |
| `zustand/middleware`      | `persist`, `createJSONStorage`, `devtools`, `subscribeWithSelector`, `combine`, `redux`, `unstable_ssrSafe` (verified: `zustand/middleware.d.ts` re-exports `ssrSafe as unstable_ssrSafe`; throws on `setState` during SSR — unused in this repo) |

## Selectors & useShallow

**Always select a slice.** `useAppStore((state) => state.preferences.reduceMotion)` — one
subscription per value, as in `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`.
Calling the hook with no selector subscribes to the whole store and re-renders on every change.

`useStore` is built on `useSyncExternalStore` with a **strict `Object.is`** comparison of the
selector's output (`zustand/react.js`; `createStoreImpl` also bails on `Object.is`
in `zustand/vanilla.js`). So a selector that builds a **new object or array on every call** returns a
value that is never `Object.is`-equal to the previous one → React sees the snapshot change on
every render → re-render loop / "The result of getSnapshot should be cached" warning.

| Selector                                  | Verdict                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `(s) => s.preferences.reduceMotion`       | fine — primitive, stable                                              |
| `(s) => s.setReduceMotion`                | fine — action identity is stable across `set` calls                   |
| `(s) => ({ a: s.a, b: s.b })`             | **loop** — new object each call                                       |
| `(s) => s.items.filter(…)`                | **loop** — new array each call                                        |
| `useShallow((s) => ({ a: s.a, b: s.b }))` | fine — shallow-compares and returns the previous reference when equal |

```ts
import { useShallow } from 'zustand/react/shallow'; // exact path — verify in zustand/react/shallow.d.ts

const { a, b } = useAppStore(useShallow((state) => ({ a: state.a, b: state.b })));
```

`useShallow` is itself a hook (it holds a `useRef` internally — see `zustand/react/shallow.js`), so
it must be called **inside the component**, in the hook argument position. Never hoist it to module
scope or call it in a loop/condition.

Nothing in this repo needs `useShallow` yet (no usages in `src/`) — reach for it only when a
selector must return a composite. Prefer two atomic selectors first.

## subscribeWithSelector middleware

`subscribeWithSelector` is for **subscribing to state changes outside React** — in a service, an
effect cleanup, or an analytics observer that should run every time a specific slice changes, not
just when a component renders.

Without this middleware, `store.subscribe(listener)` fires on every state change with
`(newState, prevState)` and you have to diff manually. With it you get
`store.subscribe(selector, listener, options)`:

```ts
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

const store = createStore<MyState>()(
  subscribeWithSelector((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) })),
);

// fires only when `count` changes, not on every set()
const unsub = store.subscribe(
  (state) => state.count, // selector
  (count, prevCount) => {
    analytics.track('count_changed', { count, prevCount });
  },
  { equalityFn: (a, b) => a === b, fireImmediately: false },
);

// call unsub() to clean up (in useEffect return, or on store teardown)
```

Use it when: you need side effects on state transitions (logging, syncing to an external system);
a non-React service needs to react to store changes; or you want `fireImmediately: true` to prime
the observer with the current value.

Don't add it to `createAppStore` preemptively — add it to a specific factory only when a concrete
subscriber exists. Middleware order: `devtools(persist(subscribeWithSelector(creator)))` — i.e.
`subscribeWithSelector` wraps the creator directly, `persist` wraps that, `devtools` outermost.

## Testing stores

The repo tests stores at two levels. Follow both.

**Vanilla store, no React** — `src/entities/preferences/model/store.test.ts`. Call the factory, drive it through
`getState()`, assert with `getState()`. Note `localStorage.clear()` in `beforeEach` and the
explicit `await store.persist.rehydrate()` (needed because `skipHydration: true`):

```ts
const store = createAppStore(seed);
store.getState().setReduceMotion(true);
expect(store.getState().preferences.reduceMotion).toBe(true);

await store.persist.rehydrate();
expect(store.getState().hasHydrated).toBe(true);
```

Keep the isolation test — it is the regression guard for the whole core rule (the two-store leak
test in `src/entities/preferences/model/store.test.ts`): two `createAppStore()` calls, mutate one, assert the other
is untouched ("one request cannot leak into another").

**Through React** — `src/app/AppStoreProvider.test.tsx` and
`src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.test.tsx`. Render the component wrapped in a
real `<AppStoreProvider initialState={…}>` (never mock the store), seed `localStorage` first if
you're testing rehydration, and assert on the DOM via Testing Library. Each `render` gets a fresh
store for free — that's the provider doing its job.

**Singleton store** — `src/shared/ui/ThemeToggle/ThemeToggle.test.tsx` resets it in `beforeEach`
with `useThemeStore.setState({ theme: 'light' })` (a singleton persists across tests in one file).
To test module-evaluation-time behavior, that file uses `vi.resetModules()` + a fresh dynamic
`import('@/shared/lib/themeStore')` — that's the sanctioned way here.

Setup: Vitest + jsdom + `@testing-library/jest-dom` (`vitest.config.ts`, `vitest.setup.ts`).
`localStorage` is real jsdom storage — clear it, don't stub it.

## Common mistakes

| Mistake                                                                              | Fix                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(...)` at module scope for server-seeded state                                | factory + provider (`src/entities/preferences/model/store.ts`)                                                                                                                                                                                                                                                               |
| `useRef<AppStore>()` in the provider                                                 | React 19 has no 0-arg `useRef` overload — use `useState(() => createStore(…))` like `src/app/AppStoreProvider.tsx`                                                                                                                                                                                                           |
| `create(...)` (React) as the base of the context provider                            | `createStore` from `zustand/vanilla` — a `create` store _is a hook_, and passing a hook through context and calling it conditionally violates the rules of hooks. Read it with `useStore(store, selector)`                                                                                                                   |
| `import create from 'zustand'`                                                       | `import { create } from 'zustand'`                                                                                                                                                                                                                                                                                           |
| Passing `shallow` as a 2nd hook argument                                             | `useShallow((s) => …)` from `zustand/react/shallow`                                                                                                                                                                                                                                                                          |
| Selector returning a fresh object/array                                              | atomic selectors, or wrap in `useShallow`                                                                                                                                                                                                                                                                                    |
| Storing computed/derived values on the state object                                  | compute in the selector instead: `useAppStore((s) => !s.preferences.reduceMotion)`                                                                                                                                                                                                                                           |
| Defining actions outside the store initializer (e.g. `store.setState(...)` directly) | keep all mutation inside the `(set, get) => ({...})` initializer; use the devtools action-name 3rd arg for tracing                                                                                                                                                                                                           |
| Reading `localStorage` during render / hydrating persist automatically               | `skipHydration: true` in the persist options + `void store.persist.rehydrate()` in a mount `useEffect` (the `persist` options in `src/entities/preferences/model/store.ts`, the `rehydrate` effect in `src/app/AppStoreProvider.tsx`). Otherwise: SSR hydration mismatch                                                     |
| Gating UI on persisted state without knowing if it landed                            | latch a `hasHydrated` flag in `onRehydrateStorage`, _including on error_ (see `onRehydrateStorage` in `src/entities/preferences/model/store.ts`)                                                                                                                                                                             |
| Persisting derived/ephemeral fields                                                  | `partialize` down to what must survive a reload (the `partialize` option in `src/entities/preferences/model/store.ts`)                                                                                                                                                                                                       |
| `set(partial, false, 'name')` without `devtools`                                     | the 3rd action-name argument only exists once `devtools` wraps the creator — it's added by the `zustand/devtools` store mutator (`zustand/middleware/devtools.d.ts`)                                                                                                                                                         |
| Wrong middleware order                                                               | `devtools(persist(creator, persistOpts), devtoolsOpts)` — devtools outermost, as in `createAppStore` in `src/entities/preferences/model/store.ts`                                                                                                                                                                            |
| Store file without `'use client'` when it's imported by a client component tree      | `src/shared/lib/themeStore.ts` and `src/app/AppStoreProvider.tsx` have it. `src/entities/preferences/model/store.ts` deliberately does not — it's a plain factory module imported by the client provider, and the mirror-image constraint comment in `src/shared/lib/theme.ts` explains the constraint for server components |
