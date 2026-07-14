---
name: react-19
description: Use when writing, reviewing, or debugging any React component or hook in this project — including refs, forms, Server/Client Component boundaries, and Actions. React 19 changed useRef, ref-as-prop, and form hooks; React 18 patterns are wrong here.
---

# React 19 (19.2.7)

Installed: `react` / `react-dom` **19.2.7**, `@types/react` **19.2.17**, `@types/react-dom` **19.2.3**, `next` **16.2.10** (App Router), `zustand` **5.0.14**.

Ground truth for every signature below is the installed `node_modules/@types/react/index.d.ts` — cited as `types/react:LINE`. Do not trust React 18 muscle memory; verify in the `.d.ts` before writing a hook you are unsure about.

## React 18 → 19 breaking changes

| React 18 assumption (WRONG here)                | React 19 (correct)                                                                                                                                                                                                                                                                                                                                                                        | Verified in                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `useRef<T>()` with no argument is fine          | **Argument is required.** `useRef<T>()` → `TS2554: Expected 1 arguments, but got 0`. Write `useRef<T>(null)`                                                                                                                                                                                                                                                                              | `types/react:1737,1749,1761` (no zero-arg overload)                                                                                  |
| `useRef` returns `MutableRefObject<T>`          | Returns `RefObject<T>`; `MutableRefObject` is `@deprecated`                                                                                                                                                                                                                                                                                                                               | `types/react:1667-1672`                                                                                                              |
| Need `forwardRef` to accept a ref               | `ref` is a **normal prop** on function components. `forwardRef` still exists and is **not** marked `@deprecated` in these types — it is fully supported today, so calling it "deprecated" is wrong. Don't reach for it in new code; the React 19 release post states the intent to deprecate and remove it in a future version (that is an announced plan, not current type-level status) | `types/react:1403` (present, no `@deprecated` tag); [react.dev/blog/2024/12/05/react-19](https://react.dev/blog/2024/12/05/react-19) |
| `element.ref` readable off a JSX element        | Removed. Runtime error text: _"Accessing element.ref was removed in React 19. ref is now a regular prop."_                                                                                                                                                                                                                                                                                | `react/cjs/react.development.js:195`                                                                                                 |
| Ref callbacks may only return `void`            | Ref callbacks may **return a cleanup function**; when they do, React skips the legacy `ref(null)`-on-unmount call                                                                                                                                                                                                                                                                         | `types/react:176-185` (`RefCallback` return union)                                                                                   |
| `useFormState` from `react-dom`                 | **`useActionState` from `react`.** `react-dom` still _exports_ `useFormState` (types + runtime) but it warns: _"ReactDOM.useFormState has been renamed to React.useActionState."_ `react` does **not** export `useFormState` at all                                                                                                                                                       | `types/react:1966-1975`; `types/react-dom:45-54`; warning at `react-dom/cjs/react-dom-client.development.js:7592`                    |
| Context is provided with `<Ctx.Provider value>` | `<Ctx value>` works directly — `interface Context<T> extends Provider<T>`. `.Provider` still works (this repo uses it in `AppStoreProvider.tsx:27`)                                                                                                                                                                                                                                       | `types/react:678`                                                                                                                    |
| `defaultProps` on function components           | Gone from the `FunctionComponent` type — use JS default parameters                                                                                                                                                                                                                                                                                                                        | `types/react:1060-1085` (no `defaultProps` member)                                                                                   |
| `propTypes` does something                      | `@deprecated` / "Ignored by React" on both `FunctionComponent` and `Component`                                                                                                                                                                                                                                                                                                            | `types/react:1064`, `types/react:935`                                                                                                |
| Components return `ReactNode`                   | `(props: P): ReactNode \| Promise<ReactNode>` — async components are typeable (Server Components)                                                                                                                                                                                                                                                                                         | `types/react:1061`                                                                                                                   |

Also new in 19 / 19.2 and present in these types: `use` (`:1964`), `useActionState` (`:1966`), `useOptimistic` (`:1930`), `cache` (`:1978`), `cacheSignal` (`:1984`, 19.2), `useEffectEvent` (`:1791`).

## The useRef trap

This is the single most common break. There are exactly **three** overloads, all requiring an argument:

```ts
function useRef<T>(initialValue: T): RefObject<T>; // types/react:1737
function useRef<T>(initialValue: T | null): RefObject<T | null>; // types/react:1749
function useRef<T>(initialValue: T | undefined): RefObject<T | undefined>; // types/react:1761
```

| Goal                                         | Write this                            | Result                                                         |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| DOM element ref                              | `useRef<HTMLInputElement>(null)`      | `RefObject<HTMLInputElement \| null>` — assignable to `ref={}` |
| Mutable instance value (timer, latest value) | `useRef<number>(0)`                   | `RefObject<number>` — `.current` is writable                   |
| Mutable value with no sensible initial       | `useRef<Foo \| undefined>(undefined)` | `RefObject<Foo \| undefined>`                                  |
| Nothing                                      | ~~`useRef<HTMLInputElement>()`~~      | **TS2554: Expected 1 arguments, but got 0**                    |

Notes:

- `.current` is still writable on `RefObject<T>` (`types/react:154-159` — `current: T`, not `readonly`). The React 18 `MutableRefObject` vs `RefObject` split is gone; do **not** import `MutableRefObject`.
- Always read `.current` behind a guard: `inputRef.current?.focus()`.
- Never read or write `.current` **during render** — this repo's `eslint-config-next` flags it. `AppStoreProvider.tsx:15-19` documents exactly this and uses `useState(() => …)` as the lazy-init escape hatch instead of a ref. Follow that pattern.

## Server vs Client Components (Next 16 App Router)

Everything under `src/app` is a **Server Component by default**. `'use client'` is an opt-in marker that must be the first line of the file; it makes that module _and everything it imports_ part of the client bundle.

|                                                        | Server Component (default)                                                                                             | Client Component (`'use client'`)                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Examples here                                          | `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/PatternCard/PatternCard.tsx`, `src/components/Hero/Hero.tsx` | `src/app/error.tsx`, `src/components/ThemeToggle/ThemeToggle.tsx`, `src/components/PreferenceToggle/PreferenceToggle.tsx`, `src/store/AppStoreProvider.tsx` |
| Hooks                                                  | ❌ none (`useState`, `useEffect`, `useRef`, `useOptimistic`, `useFormStatus`)                                          | ✅ all                                                                                                                                                      |
| `use(promise)` / `use(Context)`                        | ✅ allowed                                                                                                             | ✅ allowed                                                                                                                                                  |
| Event handlers (`onClick`, …)                          | ❌                                                                                                                     | ✅                                                                                                                                                          |
| Browser globals (`window`, `document`, `localStorage`) | ❌                                                                                                                     | ✅ (in effects / handlers, not during render — hydration)                                                                                                   |
| `async function Component()`                           | ✅ (`types/react:1061` allows `Promise<ReactNode>`)                                                                    | ❌                                                                                                                                                          |
| Zustand store (`useAppStore`, `useThemeStore`)         | ❌                                                                                                                     | ✅                                                                                                                                                          |
| Secrets / server-only modules                          | ✅                                                                                                                     | ❌ (would ship to the browser)                                                                                                                              |

**What cannot cross the boundary** — props passed from a Server Component into a Client Component must be serializable:

| Prop value                                                                              | Crosses?                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| strings, numbers, booleans, `null`, plain objects/arrays of those, `Date`, `Map`, `Set` | ✅                                                                     |
| JSX (`children`, or any `ReactNode` prop)                                               | ✅ — this is how you nest a Server subtree _inside_ a Client component |
| Promises                                                                                | ✅ — pass down, unwrap in the client with `use()`                      |
| Server Actions (`'use server'` functions)                                               | ✅                                                                     |
| Arbitrary functions, class instances, `Symbol`, `Ref` objects                           | ❌ runtime serialization error                                         |

Rules of thumb, in this codebase's style:

- Push `'use client'` **down the tree**, to the leaf that actually needs interactivity. `page.tsx` stays a Server Component and renders a client `<PreferenceToggle />`.
- A Server Component can render a Client Component. A Client Component can only render a Server Component if it arrives **as `children`** (see `AppStoreProvider` wrapping `{children}` in `layout.tsx:25`).
- Server-computed data is handed in as props, not fetched from our own route (`layout.tsx:17` calls `getInitialAppState()` directly).

## Forms & Actions

Only these are confirmed by the installed types.

### `useActionState` — from `react` (`types/react:1966-1975`)

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

### `useFormStatus` — from `react-dom` (`types/react-dom:27-43`)

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

Must be called from a component rendered **inside** the `<form>` — it reads the _parent_ form's status, so it returns `{ pending: false }` in the component that renders the `<form>` itself. Typical use: a `<SubmitButton />` child.

### `useOptimistic` — from `react` (`types/react:1930-1936`)

```ts
function useOptimistic<State>(
  passthrough: State,
): [State, (action: State | ((pending: State) => State)) => void];
function useOptimistic<State, Action>(
  passthrough: State,
  reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void];
```

The optimistic value reverts automatically when the surrounding action settles. Call the setter **inside** the action/transition, not in an event handler outside one.

### `use` — from `react` (`types/react:1962-1964`)

```ts
type Usable<T> = ReactPromise<T> | Context<T>;
function use<T>(usable: Usable<T>): T;
```

- Accepts **only a promise or a context**. `use(42)` is a type error (`TS2345: not assignable to Usable<unknown>`).
- Callable **during render only** — but unlike other hooks it _may_ be called conditionally, in loops, or after an early return.
- Do not `use()` a promise created during render; create it in a Server Component (or a cache) and pass it down as a prop.
- Reading context: `const store = use(AppStoreContext)` is a valid drop-in for `useContext`.

## Common mistakes

| Mistake                                                               | Fix                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `const ref = useRef<HTMLDivElement>()`                                | `useRef<HTMLDivElement>(null)`                                                                             |
| `import { MutableRefObject } from 'react'`                            | Use `RefObject<T>`; annotate as `RefObject<HTMLDivElement \| null>`                                        |
| Wrapping a new component in `forwardRef`                              | Declare `ref` as a plain prop: `function Field({ ref, ...rest }: { ref?: Ref<HTMLInputElement> } & Props)` |
| `import { useFormState } from 'react-dom'`                            | `import { useActionState } from 'react'` — and remember the third `isPending` element                      |
| Destructuring 2 values from `useActionState`                          | It returns `[state, action, isPending]`                                                                    |
| `useFormStatus()` in the component that renders `<form>`              | Move it into a child rendered inside the form                                                              |
| `useState`/`useEffect`/Zustand in a file without `'use client'`       | Add `'use client'`, or move the interactivity into a leaf client component                                 |
| Adding `'use client'` to `page.tsx`/`layout.tsx` to fix one button    | Keep the page a Server Component; extract the button (see `PreferenceToggle`)                              |
| Passing a callback prop from a Server Component to a Client Component | Pass a Server Action, or make the parent a Client Component                                                |
| Reading `ref.current` during render                                   | Lazy-init with `useState(() => …)` — see `src/store/AppStoreProvider.tsx:15-19`                            |
| Touching `document`/`window` during a client render                   | Do it in `useEffect` — see `PreferenceToggle.tsx:19-21`, `ThemeToggle.tsx:10-12`                           |
| `Component.defaultProps = {...}`                                      | Default parameters in the destructure                                                                      |

House style (match it): named function exports (`export function Foo`), a local `type Props = {...}`, CSS Modules imported **last** (`import styles from './Foo.module.css'`), one folder per component with a colocated `.test.tsx`.
