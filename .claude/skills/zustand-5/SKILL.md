---
name: zustand-5
description: Use when creating, modifying, testing, or reviewing any Zustand store, selector, or store provider in this project. Zustand 5 + Next.js App Router requires store-per-request; v4 patterns and module-singleton stores are wrong here.
---

# Zustand 5 (5.0.14)

Installed: `zustand@5.0.14`, `react@19.2.7`, `@types/react@19.2.17`, `next@16.2.10`
(`package.json`). Every rule below is verified against the installed `.d.ts` files
and this repo's own stores — not from memory. Match the house style in `src/store/`.

## Core rule: no module-level singleton store that holds server-seeded state

On the server a module is evaluated **once per process**, not once per request. A
`create(...)` call at module scope therefore produces **one store shared by every
concurrent SSR request**. User A's state leaks into User B's HTML. `src/store/appStore.ts:23-26`
states this as the reason it exports a factory:

> "A factory, not a singleton. A module-level store seeded with server data would be shared
> across every SSR request in the same process. One store per request, owned by the provider."

| Store kind                                                                                | Correct shape                                  | Why                              | File                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| Seeded from the server (props, cookies, fetched data)                                     | `createStore` factory + React context provider | one store per request/mount      | `src/store/appStore.ts`, `src/store/AppStoreProvider.tsx` |
| Purely client-side, never seeded on the server (e.g. theme read from `<html data-theme>`) | module-level `create(...)` singleton is fine   | nothing to leak between requests | `src/store/themeStore.ts:34-38`                           |

`src/store/themeStore.ts:34-37` spells out the exemption: _"A singleton is safe here, unlike the
app store: this state is never seeded from the server, so there is nothing to leak between SSR
requests."_ Don't cargo-cult the provider onto stores like this one.

### The provider pattern as it actually exists here

`src/store/appStore.ts` — the factory. Note **`createStore` from `zustand/vanilla`**, not `create`:

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

`src/store/AppStoreProvider.tsx` — the provider. **It uses `useState`, not `useRef`:**

```tsx
'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppInitialState, type AppState, type AppStore } from './appStore';

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ initialState, children }: Props) {
  // Lazy initializer: runs exactly once per component instance.
  const [store] = useState<AppStore>(() => createAppStore(initialState));

  useEffect(() => {
    void store.persist.rehydrate(); // read localStorage only after mount
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return useStore(store, selector);
}
```

Why `useState` and not the `useRef` from Zustand's own docs — two reasons, both live here:

1. `eslint-config-next` (see `eslint.config.mjs`, `nextVitals` + `nextTs`) flags reading
   `ref.current` during render. `src/store/AppStoreProvider.tsx:15-18` records this decision.
2. Under React 19 types there is **no zero-argument `useRef` overload**. The only three
   signatures in `node_modules/@types/react/index.d.ts:1737-1761` are `useRef<T>(initialValue: T)`,
   `useRef<T>(initialValue: T | null)`, `useRef<T>(initialValue: T | undefined)`. So
   `useRef<AppStore>()` is a **type error**; the ref form would have to be
   `useRef<AppStore | undefined>(undefined)`. Don't write it — use `useState` as this repo does.

The server component wires it up: `src/app/layout.tsx` calls `getInitialAppState()`
(`src/lib/appState.ts`) and passes the result to `<AppStoreProvider initialState={…}>`.

## v4 → v5 breaking changes

| Wrong v4 assumption                                                                            | Correct v5                                                                                                                                                                                                                    | Verified in                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import create from 'zustand'` (default export)                                                | `import { create } from 'zustand'` — **no default export exists**; `index.d.ts` is only `export * from 'zustand/vanilla'; export * from 'zustand/react';` and `index.js` explicitly skips the `default` key when re-exporting | `node_modules/zustand/index.d.ts`, `index.js:9`, `react.js` (`exports.create`)                                                                              |
| `import createStore from 'zustand/vanilla'` (default)                                          | `import { createStore } from 'zustand/vanilla'` — named only                                                                                                                                                                  | `node_modules/zustand/vanilla.d.ts` (`export declare const createStore`)                                                                                    |
| `useStore(selector, equalityFn)` / `useBoundStore(selector, shallow)` — equality fn as 2nd arg | Gone. `useStore` is `(api)` or `(api, selector)`; `UseBoundStore` is `()` or `(selector)`. No 3rd/2nd equality parameter exists                                                                                               | `node_modules/zustand/react.d.ts`                                                                                                                           |
| "…so you must use `useShallow`"                                                                | `useShallow` is the _usual_ answer, but not the only one: `createWithEqualityFn` / `useStoreWithEqualityFn` from **`zustand/traditional`** still take an `equalityFn`                                                         | `node_modules/zustand/traditional.d.ts`; README:120                                                                                                         |
| `import { shallow } from 'zustand/shallow'` used as a hook arg                                 | `shallow` is a plain comparator `(a, b) => boolean` — only usable with `zustand/traditional` or `subscribeWithSelector`'s `{ equalityFn }`. The hook-safe wrapper is `useShallow`                                             | `node_modules/zustand/vanilla/shallow.d.ts`, `middleware/subscribeWithSelector.d.ts`                                                                        |
| `create<State>(...)` in TS                                                                     | `create<State>()(...)` — curried; same for `createStore<State>()(...)`. Required whenever middleware is involved                                                                                                              | `react.d.ts` / `vanilla.d.ts` (both `Create` types have the `<T>(): (initializer) => …` overload); `src/store/appStore.ts:28`, `src/store/themeStore.ts:38` |
| `getState()` only                                                                              | `getInitialState()` also exists on `StoreApi` and backs `useSyncExternalStore`'s server snapshot                                                                                                                              | `node_modules/zustand/vanilla.d.ts` (`StoreApi`), `react.js`                                                                                                |
| React 17 / non-`useSyncExternalStore` support                                                  | Requires React ≥18 (`use-sync-external-store` semantics); the hook is `React.useSyncExternalStore` directly                                                                                                                   | `node_modules/zustand/package.json` peerDeps, `react.js`                                                                                                    |

Import surface actually shipped by 5.0.14 (from `package.json#exports` + the `.d.ts` files):

| Import                    | Exports                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zustand`                 | `create`, `useStore`, `createStore`, types (`StoreApi`, `StateCreator`, `UseBoundStore`, `ExtractState`, `Mutate`, `StoreMutatorIdentifier`)                                                                                                |
| `zustand/vanilla`         | `createStore` + the vanilla types                                                                                                                                                                                                           |
| `zustand/react`           | `create`, `useStore`, `UseBoundStore`                                                                                                                                                                                                       |
| `zustand/react/shallow`   | `useShallow`                                                                                                                                                                                                                                |
| `zustand/vanilla/shallow` | `shallow`                                                                                                                                                                                                                                   |
| `zustand/shallow`         | re-exports both `shallow` and `useShallow`                                                                                                                                                                                                  |
| `zustand/traditional`     | `createWithEqualityFn`, `useStoreWithEqualityFn` (the equality-fn escape hatch)                                                                                                                                                             |
| `zustand/middleware`      | `persist`, `createJSONStorage`, `devtools`, `subscribeWithSelector`, `combine`, `redux`, `unstable_ssrSafe` (verified: `middleware.d.ts:6` re-exports `ssrSafe as unstable_ssrSafe`; throws on `setState` during SSR — unused in this repo) |

## Selectors & useShallow

**Always select a slice.** `useAppStore((state) => state.preferences.reduceMotion)` — one
subscription per value, as in `src/components/PreferenceToggle/PreferenceToggle.tsx:13-14`.
Calling the hook with no selector subscribes to the whole store and re-renders on every change.

`useStore` is built on `useSyncExternalStore` with a **strict `Object.is`** comparison of the
selector's output (`node_modules/zustand/react.js`; `createStoreImpl` also bails on `Object.is`
in `vanilla.js`). So a selector that builds a **new object or array on every call** returns a
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
import { useShallow } from 'zustand/react/shallow'; // exact path — verified in node_modules/zustand/react/shallow.d.ts

const { a, b } = useAppStore(useShallow((state) => ({ a: state.a, b: state.b })));
```

`useShallow` is itself a hook (it holds a `useRef` internally — see
`node_modules/zustand/react/shallow.js`), so it must be called **inside the component**, in the
hook argument position. Never hoist it to module scope or call it in a loop/condition.

Nothing in this repo needs `useShallow` yet (no usages in `src/`) — reach for it only when a
selector must return a composite. Prefer two atomic selectors first.

## Testing stores

The repo tests stores at two levels. Follow both.

**Vanilla store, no React** — `src/store/appStore.test.ts`. Call the factory, drive it through
`getState()`, assert with `getState()`. Note `localStorage.clear()` in `beforeEach` and the
explicit `await store.persist.rehydrate()` (needed because `skipHydration: true`):

```ts
const store = createAppStore(seed);
store.getState().setReduceMotion(true);
expect(store.getState().preferences.reduceMotion).toBe(true);

await store.persist.rehydrate();
expect(store.getState().hasHydrated).toBe(true);
```

Keep the isolation test — it is the regression guard for the whole core rule
(`src/store/appStore.test.ts:64-72`): two `createAppStore()` calls, mutate one, assert the other
is untouched ("one request cannot leak into another").

**Through React** — `src/store/AppStoreProvider.test.tsx` and
`src/components/PreferenceToggle/PreferenceToggle.test.tsx`. Render the component wrapped in a
real `<AppStoreProvider initialState={…}>` (never mock the store), seed `localStorage` first if
you're testing rehydration, and assert on the DOM via Testing Library. Each `render` gets a fresh
store for free — that's the provider doing its job.

**Singleton store** — `src/components/ThemeToggle/ThemeToggle.test.tsx` resets it in `beforeEach`
with `useThemeStore.setState({ theme: 'light' })` (a singleton persists across tests in one file).
To test module-evaluation-time behavior, that file uses `vi.resetModules()` + a fresh dynamic
`import('@/store/themeStore')` — that's the sanctioned way here.

Setup: Vitest + jsdom + `@testing-library/jest-dom` (`vitest.config.ts`, `vitest.setup.ts`).
`localStorage` is real jsdom storage — clear it, don't stub it.

## Common mistakes

| Mistake                                                                         | Fix                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(...)` at module scope for server-seeded state                           | factory + provider (`src/store/appStore.ts`)                                                                                                                                                                                                                |
| `useRef<AppStore>()` in the provider                                            | React 19 has no 0-arg `useRef` overload — use `useState(() => createStore(…))` like `src/store/AppStoreProvider.tsx:19`                                                                                                                                     |
| `create(...)` (React) as the base of the context provider                       | `createStore` from `zustand/vanilla` — a `create` store _is a hook_, and passing a hook through context and calling it conditionally violates the rules of hooks. Read it with `useStore(store, selector)`                                                  |
| `import create from 'zustand'`                                                  | `import { create } from 'zustand'`                                                                                                                                                                                                                          |
| Passing `shallow` as a 2nd hook argument                                        | `useShallow((s) => …)` from `zustand/react/shallow`                                                                                                                                                                                                         |
| Selector returning a fresh object/array                                         | atomic selectors, or wrap in `useShallow`                                                                                                                                                                                                                   |
| Reading `localStorage` during render / hydrating persist automatically          | `skipHydration: true` in the persist options + `void store.persist.rehydrate()` in a mount `useEffect` (`src/store/appStore.ts:51`, `src/store/AppStoreProvider.tsx:21-25`). Otherwise: SSR hydration mismatch                                              |
| Gating UI on persisted state without knowing if it landed                       | latch a `hasHydrated` flag in `onRehydrateStorage`, _including on error_ (`src/store/appStore.ts:53-59`)                                                                                                                                                    |
| Persisting derived/ephemeral fields                                             | `partialize` down to what must survive a reload (`src/store/appStore.ts:52`)                                                                                                                                                                                |
| `set(partial, false, 'name')` without `devtools`                                | the 3rd action-name argument only exists once `devtools` wraps the creator — it's added by the `zustand/devtools` store mutator (`node_modules/zustand/middleware/devtools.d.ts`)                                                                           |
| Wrong middleware order                                                          | `devtools(persist(creator, persistOpts), devtoolsOpts)` — devtools outermost, as in `src/store/appStore.ts:29-63`                                                                                                                                           |
| Store file without `'use client'` when it's imported by a client component tree | `src/store/themeStore.ts:1` and `AppStoreProvider.tsx:1` have it. `appStore.ts` deliberately does not — it's a plain factory module imported by the client provider, and `src/lib/theme.ts:8-10` explains the mirror-image constraint for server components |
