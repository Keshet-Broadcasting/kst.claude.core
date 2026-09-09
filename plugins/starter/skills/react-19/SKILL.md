---
name: react-19
description: Use when writing, reviewing, or debugging any React component or hook in this project — including refs, forms, Server/Client Component boundaries, and Actions. React 19 changed useRef, ref-as-prop, and form hooks; React 18 patterns are wrong here.
version: 0.1.2
---

# React 19

This project runs **React 19** (App Router via Next 16, state via Zustand 5). For the exact
pinned patch, read `package.json` and the `catalog:` block in the repo-root
`pnpm-workspace.yaml` — those are the source of truth; this skill deliberately does not repeat a
patch number, because it drifts.

Ground truth for every signature below is the installed `@types/react/index.d.ts`. **It only
exists after `pnpm install`** — a freshly scaffolded app has no `node_modules` yet. Once
installed, open the file and search for the symbol (the anchors below are `grep` targets, not
line numbers, so they survive patch bumps). Do not trust React 18 muscle memory — verify in the
`.d.ts` before writing a hook you are unsure about.

## React 18 → 19 breaking changes

| React 18 assumption (WRONG here)                | React 19 (correct)                                                                                                                                                                                                                                                                                                                                            | Where to verify (`grep` target)                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `useRef<T>()` with no argument is fine          | **Argument is required.** `useRef<T>()` → `TS2554: Expected 1 arguments, but got 0`. Write `useRef<T>(null)`                                                                                                                                                                                                                                                  | `@types/react`, `function useRef` — three overloads, none zero-arg                                                                             |
| `useRef` returns `MutableRefObject<T>`          | Returns `RefObject<T>`; `MutableRefObject` is `@deprecated`                                                                                                                                                                                                                                                                                                   | `@types/react`, `MutableRefObject`                                                                                                             |
| Need `forwardRef` to accept a ref               | `ref` is a **normal prop** on function components. `forwardRef` still exists and is **not** marked `@deprecated` in these types — fully supported today, so calling it "deprecated" is wrong. Don't reach for it in new code; the React 19 release post states the intent to deprecate and remove it later (an announced plan, not current type-level status) | `@types/react`, `forwardRef` (present, no `@deprecated` tag); [react.dev/blog/2024/12/05/react-19](https://react.dev/blog/2024/12/05/react-19) |
| `element.ref` readable off a JSX element        | Removed. Runtime error: _"Accessing element.ref was removed in React 19. ref is now a regular prop."_                                                                                                                                                                                                                                                         | React 19 runtime error message                                                                                                                 |
| Ref callbacks may only return `void`            | Ref callbacks may **return a cleanup function**; when they do, React skips the legacy `ref(null)`-on-unmount call                                                                                                                                                                                                                                             | `@types/react`, `RefCallback` (return union)                                                                                                   |
| `useFormState` from `react-dom`                 | **`useActionState` from `react`.** `react-dom` still _exports_ `useFormState` (types + runtime) but warns: _"ReactDOM.useFormState has been renamed to React.useActionState."_ `react` does **not** export `useFormState` at all                                                                                                                              | `@types/react`, `useActionState`; `@types/react-dom`, `useFormState`; runtime warning in `react-dom` client build                              |
| Context is provided with `<Ctx.Provider value>` | `<Ctx value>` works directly — `interface Context<T> extends Provider<T>`. `.Provider` still works (this repo uses it in `AppStoreProvider.tsx`)                                                                                                                                                                                                              | `@types/react`, `interface Context`                                                                                                            |
| `defaultProps` on function components           | Gone from the `FunctionComponent` type — use JS default parameters                                                                                                                                                                                                                                                                                            | `@types/react`, `FunctionComponent` (no `defaultProps` member)                                                                                 |
| `propTypes` does something                      | `@deprecated` / "Ignored by React" on both `FunctionComponent` and `Component`                                                                                                                                                                                                                                                                                | `@types/react`, `propTypes`                                                                                                                    |
| Components return `ReactNode`                   | `(props: P): ReactNode \| Promise<ReactNode>` — async components are typeable (Server Components)                                                                                                                                                                                                                                                             | `@types/react`, `FunctionComponent` call signature                                                                                             |

Also new in 19 / 19.2 and present in these types: `use`, `useActionState`, `useOptimistic`,
`cache`, `cacheSignal` (19.2), `useEffectEvent`. (Search each name in `@types/react`.)

### `useEffectEvent` — stable event handlers that see current values

```ts
function useEffectEvent<T extends Function>(event: T): T;
```

Extracts a callback from a `useEffect` dependency array without making it a dependency. Use when
you need to read a value inside an effect but the value changes too often or causes unwanted
re-runs. The returned function is stable (same reference) but always sees fresh props/state.
Not callable outside an effect — only call it from inside a `useEffect` body.

### `cache` — per-request memoisation on the server

```ts
function cache<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
```

Server-only (throws if called during client render). Wraps an async function so identical
arguments within one server request share one promise. Use it on DB/API helpers that may be called
from multiple Server Components in one render tree. Not a substitute for Next's `unstable_cache`
(which persists across requests) — `cache` is per-render-pass only.

## The useRef trap

This is the single most common break. There are exactly **three** overloads, all requiring an
argument (search `function useRef` in `@types/react/index.d.ts`):

```ts
function useRef<T>(initialValue: T): RefObject<T>;
function useRef<T>(initialValue: T | null): RefObject<T | null>;
function useRef<T>(initialValue: T | undefined): RefObject<T | undefined>;
```

| Goal                                         | Write this                            | Result                                                         |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| DOM element ref                              | `useRef<HTMLInputElement>(null)`      | `RefObject<HTMLInputElement \| null>` — assignable to `ref={}` |
| Mutable instance value (timer, latest value) | `useRef<number>(0)`                   | `RefObject<number>` — `.current` is writable                   |
| Mutable value with no sensible initial       | `useRef<Foo \| undefined>(undefined)` | `RefObject<Foo \| undefined>`                                  |
| Nothing                                      | ~~`useRef<HTMLInputElement>()`~~      | **TS2554: Expected 1 arguments, but got 0**                    |

Notes:

- `.current` is still writable on `RefObject<T>` (it is `current: T`, not `readonly` — search
  `interface RefObject` in `@types/react`). The React 18 `MutableRefObject` vs `RefObject` split
  is gone; do **not** import `MutableRefObject`.
- Always read `.current` behind a guard: `inputRef.current?.focus()`.
- Never read or write `.current` **during render** — this repo's `eslint-config-next` flags it.
  `src/app/AppStoreProvider.tsx` documents exactly this and uses `useState(() => …)` as the
  lazy-init escape hatch instead of a ref. Follow that pattern.

## Server vs Client Components (Next 16 App Router)

Everything under root `app/` (the Next routing directory — routing only, per this project's FSD
layout) is a **Server Component by default**. `'use client'` is an opt-in marker that must be the
first line of the file; it makes that module _and everything it imports_ part of the client
bundle. This defaults to server for FSD's `pages`/`widgets` layers too (`src/views/*`,
`src/widgets/*`) — `'use client'` only appears at the lowest point it's actually needed, in
`features` (and in cross-cutting `shared` pieces like `ThemeToggle` and the `src/app` provider).

|                                                        | Server Component (default)                                                                                                  | Client Component (`'use client'`)                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Examples here                                          | `app/page.tsx`, `app/layout.tsx`, `src/views/home/ui/HomePage.tsx`, `src/widgets/preferences-panel/ui/PreferencesPanel.tsx` | `app/error.tsx`, `src/shared/ui/ThemeToggle/ThemeToggle.tsx`, `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`, `src/app/AppStoreProvider.tsx` |
| Hooks                                                  | ❌ none (`useState`, `useEffect`, `useRef`, `useOptimistic`, `useFormStatus`)                                               | ✅ all                                                                                                                                                            |
| `use(promise)` / `use(Context)`                        | ✅ allowed                                                                                                                  | ✅ allowed                                                                                                                                                        |
| Event handlers (`onClick`, …)                          | ❌                                                                                                                          | ✅                                                                                                                                                                |
| Browser globals (`window`, `document`, `localStorage`) | ❌                                                                                                                          | ✅ (in effects / handlers, not during render — hydration)                                                                                                         |
| `async function Component()`                           | ✅ (the call signature allows `Promise<ReactNode>`)                                                                         | ❌                                                                                                                                                                |
| Zustand store (`useAppStore`, `useThemeStore`)         | ❌                                                                                                                          | ✅                                                                                                                                                                |
| Secrets / server-only modules                          | ✅                                                                                                                          | ❌ (would ship to the browser)                                                                                                                                    |

**What cannot cross the boundary** — props passed from a Server Component into a Client Component
must be serializable:

| Prop value                                                                              | Crosses?                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| strings, numbers, booleans, `null`, plain objects/arrays of those, `Date`, `Map`, `Set` | ✅                                                                     |
| JSX (`children`, or any `ReactNode` prop)                                               | ✅ — this is how you nest a Server subtree _inside_ a Client component |
| Promises                                                                                | ✅ — pass down, unwrap in the client with `use()`                      |
| Server Actions (`'use server'` functions)                                               | ✅                                                                     |
| Arbitrary functions, class instances, `Symbol`, `Ref` objects                           | ❌ runtime serialization error                                         |

Rules of thumb, in this codebase's style:

- Push `'use client'` **down the tree**, to the leaf that actually needs interactivity.
  `views/home/ui/HomePage.tsx` stays a Server Component; only
  `features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`, nested inside it through the
  `widgets/preferences-panel` composition, is `'use client'`.
- A Server Component can render a Client Component. A Client Component can only render a Server
  Component if it arrives **as `children`** (see `AppStoreProvider` wrapping `{children}` in
  `layout.tsx`).
- Server-computed data is handed in as props, not fetched from our own route (`layout.tsx` calls
  `getInitialAppState()` directly).

## Transitions & Concurrent Features

### `useTransition` and `startTransition` — React 19 upgrade

```ts
function useTransition(): [isPending: boolean, startTransition: TransitionStartFunction];
function startTransition(action: () => void | Promise<void>): void;
```

**React 19 change:** `startTransition` now accepts an **async function** (it didn't in React 18).
Awaiting a Server Action inside `startTransition` keeps `isPending` true for the full round-trip.

```tsx
'use client';
import { useTransition } from 'react';
import { saveAction } from '../api/save';

export function SaveButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await saveAction(id); // async — React 19 supports this
        });
      }}
    >
      {isPending ? 'Saving…' : 'Save'}
    </button>
  );
}
```

Rules:

- `useTransition` is Client-only (needs `'use client'`). `startTransition` (standalone import) can
  wrap async work anywhere, including Server Components — but reading `isPending` requires the hook.
- State updates inside a transition are non-urgent: React may defer them if higher-priority updates
  arrive. Never wrap user-typed input in a transition; do wrap network calls and navigation.
- `useActionState`'s third `isPending` element covers the same pattern for form submissions — prefer
  it over a manual `useTransition` when the trigger is a `<form action>`.

## Server Actions (`'use server'`)

A Server Action is an async function that runs **on the server**, callable from Client Components
as if it were a regular function. Two declaration forms:

```ts
// File-level directive — every export in this file becomes a Server Action
'use server';

export async function subscribe(fd: FormData): Promise<{ error?: string }> {
  const email = fd.get('email') as string;
  // db call, email send, etc.
  return {};
}
```

```ts
// Inline directive — a single function inside a Server Component
async function handleSubmit(fd: FormData) {
  'use server';
  // runs on the server
}
```

In this codebase, Server Actions live in `features/<name>/api/` (FSD rule — not in
`widgets` or `views`). Pass them to Client Components as props (they are serializable):

```tsx
// src/features/subscribe/api/subscribe.ts  (file-level 'use server')
// src/features/subscribe/ui/SubscribeForm.tsx  ('use client', receives the action as prop)
// src/views/home/ui/HomePage.tsx (Server Component — imports both and wires them)
```

Never import a `'use server'` file from a `'use client'` file directly — Next will bundle-split
it correctly only when passed as a serializable prop or used via `useActionState`.

## Hydration

React 19 improved hydration error messages. When server HTML and client render differ, you now
see a **diff** in the console showing the expected vs actual element tree — no more generic
"Text content did not match" message.

Common sources of hydration mismatches in this codebase:

- Accessing `window`/`document`/`localStorage` during initial render (always guard with `useEffect`)
- Date/time rendering without a stable seed (see `ThemeToggle.tsx` — uses `useEffect` to read `prefers-color-scheme`)
- Dynamic className based on browser state (same fix: apply in `useEffect`, not during render)

`suppressHydrationWarning` on a DOM element tells React to skip that element's mismatch check.
Use it only for intentionally dynamic content (e.g., a timestamp rendered server-side as
placeholder). Never use it to silence a real bug.

## Forms & Actions

Only these are confirmed by the installed types.

### `useActionState` — from `react` (search `useActionState` in `@types/react`)

```ts
function useActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean];
```

- Returns a **3-tuple** — `isPending` is the third element (React 18's `useFormState` returned 2).
- The action receives `(previousState, payload)`; for a `<form action={dispatch}>` the payload is `FormData`.
- Client Components only. Import from `react`, never `react-dom`.

```tsx
'use client';
import { useActionState } from 'react';

export function SubscribeForm({
  subscribe,
}: {
  subscribe: (prev: string | null, fd: FormData) => Promise<string | null>;
}) {
  const [error, formAction, isPending] = useActionState(subscribe, null);

  return (
    <form action={formAction}>
      <input name="email" type="email" required />
      <button type="submit" disabled={isPending}>
        Subscribe
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

### `useFormStatus` — from `react-dom` (search `useFormStatus` in `@types/react-dom`)

```ts
type FormStatus =
  | {
      pending: true;
      data: FormData;
      method: string;
      action: string | ((formData: FormData) => void | Promise<void>);
    }
  | { pending: false; data: null; method: null; action: null };

function useFormStatus(): FormStatus;
```

Must be called from a component rendered **inside** the `<form>` — it reads the _parent_ form's
status, so it returns `{ pending: false }` in the component that renders the `<form>` itself.
Typical use: a `<SubmitButton />` child.

### `useOptimistic` — from `react` (search `useOptimistic` in `@types/react`)

```ts
function useOptimistic<State>(
  passthrough: State,
): [State, (action: State | ((pending: State) => State)) => void];
function useOptimistic<State, Action>(
  passthrough: State,
  reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void];
```

The optimistic value reverts automatically when the surrounding action settles. Call the setter
**inside** the action/transition, not in an event handler outside one.

### `use` — from `react` (search `function use` in `@types/react`)

```ts
type Usable<T> = ReactPromise<T> | Context<T>;
function use<T>(usable: Usable<T>): T;
```

- Accepts **only a promise or a context**. `use(42)` is a type error (`TS2345: not assignable to Usable<unknown>`).
- Callable **during render only** — but unlike other hooks it _may_ be called conditionally, in loops, or after an early return.
- Do not `use()` a promise created during render; create it in a Server Component (or a cache) and pass it down as a prop.
- Reading context: `const store = use(AppStoreContext)` is a valid drop-in for `useContext`.

## Common mistakes

| Mistake                                                                 | Fix                                                                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `const ref = useRef<HTMLDivElement>()`                                  | `useRef<HTMLDivElement>(null)`                                                                                                          |
| `import { MutableRefObject } from 'react'`                              | Use `RefObject<T>`; annotate as `RefObject<HTMLDivElement \| null>`                                                                     |
| Wrapping a new component in `forwardRef`                                | Declare `ref` as a plain prop: `function Field({ ref, ...rest }: { ref?: Ref<HTMLInputElement> } & Props)`                              |
| `import { useFormState } from 'react-dom'`                              | `import { useActionState } from 'react'` — and remember the third `isPending` element                                                   |
| Destructuring 2 values from `useActionState`                            | It returns `[state, action, isPending]`                                                                                                 |
| `useFormStatus()` in the component that renders `<form>`                | Move it into a child rendered inside the form                                                                                           |
| `useState`/`useEffect`/Zustand in a file without `'use client'`         | Add `'use client'`, or move the interactivity into a leaf client component                                                              |
| Adding `'use client'` to `page.tsx`/`layout.tsx` to fix one button      | Keep the page a Server Component; extract the button (see `ToggleReduceMotionButton`)                                                   |
| Passing a callback prop from a Server Component to a Client Component   | Pass a Server Action, or make the parent a Client Component                                                                             |
| Reading `ref.current` during render                                     | Lazy-init with `useState(() => …)` — see `src/app/AppStoreProvider.tsx`                                                                 |
| Touching `document`/`window` during a client render                     | Do it in `useEffect` — see `ToggleReduceMotionButton.tsx`, `ThemeToggle.tsx`                                                            |
| `Component.defaultProps = {...}`                                        | Default parameters in the destructure                                                                                                   |
| Passing async fn to `startTransition` in React 18 style (no-op)         | In React 19 this works — async transitions keep `isPending` true for the full async duration                                            |
| Importing a `'use server'` function directly into a `'use client'` file | Pass Server Actions as props from a Server Component, or use via `useActionState`                                                       |
| Using `suppressHydrationWarning` to silence a real mismatch             | Find and fix the cause (usually `window`/`Date` read during render); `suppressHydrationWarning` is for intentional dynamic content only |

House style (match it): named function exports (`export function Foo`), a local `type Props = {...}`,
CSS Modules imported **last** (`import styles from './Foo.module.css'`), one folder per component
with a colocated `.test.tsx`.
