---
name: server-vs-client
description: >
  Use this skill whenever you are about to add 'use client' or 'use server' to any
  file, whenever a hook (useState, useEffect, useAppStore, etc.) is not working or
  causes an error in a component, whenever you see "cannot use hooks", "hooks can only
  be called", "you're importing a component that needs useEffect", or any error about
  Server Components. Also use it when deciding where interactivity belongs in the FSD
  layer structure, when a page or layout is failing because of a hook import, when
  deciding how to pass data from a server component to a client component, or when
  writing a form or mutation. Load this skill BEFORE placing or moving 'use client'
  or 'use server'.
---

# Server vs. Client Components

You are acting as a React Server Components architect. Your job is to put
`'use client'` on the **smallest possible leaf** that actually needs it, and
keep everything above it as a Server Component.

---

## Why the boundary exists — the mental model

Think of a page as two zones:

- **Server zone**: code that runs on the server and is never sent to the browser. This is where data lives, secrets live, and expensive dependencies stay. The user's browser downloads _zero_ JavaScript for components in this zone.
- **Client zone**: code that runs in the browser. Required for interactivity (clicks, state, animations). Everything here is downloaded by the user.

`'use client'` is the door between the two zones. You place it on a component to say "everything in this file and its imports runs in the browser."

**Why keep that door as small as possible:**

- **Performance**: every kilobyte of client JS costs the user download + parse time. Server Components send zero JS.
- **Security**: API keys, database credentials, internal queries never leave the server if you keep them in Server Components.
- **Simplicity**: Server Components can be `async` and fetch data directly — no `useEffect`, no loading states needed.

---

## Decision tree — run this before touching any component

```
Does this component need any of the following?
  - useState / useReducer / useContext / useAppStore / any Zustand hook
  - useEffect / useLayoutEffect / useRef / useMemo / useCallback
  - onClick / onChange / onSubmit / any event handler
  - window / document / localStorage / navigator / any browser API
  - a third-party library that only works in the browser

YES → it must be a Client Component.
       Add 'use client' as the very first line of the file.
       Then ask: can I extract just the interactive part into a smaller component
                 and keep its parent as a Server Component? Usually yes — do that.

NO  → leave it as a Server Component (no directive needed).
       It can: be async, fetch data, call DB, read env secrets, import
               server-only packages. Zero JavaScript sent to the browser.
```

If you are unsure: omit `'use client'` and see if the build passes. The
compiler will tell you when it is required.

---

## What each side can and cannot do

|                                               | Server Component | Client Component                    |
| --------------------------------------------- | ---------------- | ----------------------------------- |
| `async` / `await` data fetching               | ✅               | ❌ (use Server Action or `use()`)   |
| Database / filesystem access                  | ✅               | ❌                                  |
| Environment secrets (`process.env.SECRET`)    | ✅               | ❌ (never safe)                     |
| `useState`, `useEffect`, hooks                | ❌               | ✅                                  |
| Event handlers (`onClick`, etc.)              | ❌               | ✅                                  |
| `window`, `document`, browser APIs            | ❌               | ✅                                  |
| Import `'server-only'` packages               | ✅               | ❌                                  |
| Render a Client Component as a child          | ✅               | ✅                                  |
| Render a Server Component directly inside JSX | ✅               | ❌ (but see `children` trick below) |
| Send JavaScript to the browser                | ❌               | ✅                                  |

---

## Where `'use client'` belongs in this project (FSD)

| FSD layer    | Path            | Rule                                                                                                                                                          |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features`   | `src/features/` | **`'use client'` lives here** — user actions and interactivity happen here.                                                                                   |
| `widgets`    | `src/widgets/`  | Server Components by default. They compose features but stay server-side themselves.                                                                          |
| `views`      | `src/views/`    | Server Components. Data loading and page structure only.                                                                                                      |
| `entities`   | `src/entities/` | Server-safe by default. Zustand stores are imported from features, not from here.                                                                             |
| `shared`     | `src/shared/`   | Mostly server-safe. Client only for cross-cutting UI pieces (e.g. `ThemeToggle`).                                                                             |
| `app`        | `src/app/`      | The provider (`AppStoreProvider`) is `'use client'` — it wraps `{children}` so its subtree can still be server-rendered.                                      |
| Next routing | `app/`          | `layout.tsx`, `page.tsx` etc. are Server Components. Never put `'use client'` here to fix a hook in a child — extract the child into `src/features/` instead. |

---

## How to push the boundary down (the core technique)

When you find yourself about to add `'use client'` to a widget or page:

1. Identify the single element that needs interactivity (a button, an input, a toggle).
2. Extract it into its own file under `src/features/<name>/ui/`.
3. Put `'use client'` only on that new file.
4. The original widget or page stays a Server Component and just renders the new feature component.

**Before** (wrong — the whole widget becomes a Client Component):

```tsx
// src/widgets/my-panel/ui/MyPanel.tsx
'use client';
import { useState } from 'react';
export function MyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && <Details />}
    </div>
  );
}
```

**After** (correct — only the interactive leaf is a Client Component):

```tsx
// src/features/toggle-panel/ui/TogglePanelButton.tsx
'use client';
import { useState } from 'react';
export function TogglePanelButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && <Details />}
    </>
  );
}

// src/widgets/my-panel/ui/MyPanel.tsx
// No 'use client' — purely server
import { TogglePanelButton } from '@/features/toggle-panel';
export function MyPanel() {
  return (
    <div>
      <TogglePanelButton />
    </div>
  );
}
```

### The live example in this codebase

`ToggleReduceMotionButton` (`src/features/toggle-reduce-motion/ui/`) is the reference: `'use client'` there, `PreferencesPanel` widget stays server-side and just renders it.

---

## Passing data across the boundary

A Server Component can pass data **down** to a Client Component via props — with one constraint: **props that cross the boundary must be serializable** (JSON-safe). React serializes them at the server/client seam.

**Serializable (safe to pass as props):**

- strings, numbers, booleans, null, undefined
- plain objects and arrays of the above
- `Date` objects
- Server Actions (functions marked `'use server'` — see below)

**Not serializable (will throw):**

- plain functions (callbacks like `onClick={() => ...}`)
- class instances
- React elements that contain non-serializable data
- `Map`, `Set`, `Symbol`, `BigInt` (unless your React version handles them)

```tsx
// ✅ OK — plain data crosses the boundary
<ClientCounter initialCount={42} label="Clicks" />

// ❌ Error — plain function is not serializable
<ClientButton onClick={() => doSomething()} />

// ✅ OK — Server Action crosses the boundary (it's a reference, not a closure)
<ClientForm action={submitAction} />
```

### Passing Server Components through `children`

A Client Component **cannot** import and render a Server Component directly. But it
**can** receive server-rendered content through `children` — this is how `AppStoreProvider`
works in `app/layout.tsx`: it wraps `{children}`, and those children are server-rendered.

```tsx
// ✅ OK — server content passed through children
// app/layout.tsx (Server Component)
<AppStoreProvider>
  {' '}
  {/* Client Component */}
  <PageContent /> {/* Server Component — passed as children */}
</AppStoreProvider>
```

---

## Server Actions (`'use server'`)

A Server Action is a function that **runs on the server** but can be called from a Client Component — for example, a form submit or a button mutation.

Mark a function with `'use server'` to make it a Server Action:

```tsx
// src/features/submit-feedback/api/submitFeedback.ts
'use server';

export async function submitFeedback(formData: FormData) {
  // Runs on the server — can access DB, secrets, etc.
  const message = formData.get('message');
  await db.feedback.create({ data: { message } });
}
```

Then use it from a Client Component:

```tsx
// src/features/submit-feedback/ui/FeedbackForm.tsx
'use client';
import { submitFeedback } from '../api/submitFeedback';

export function FeedbackForm() {
  return (
    <form action={submitFeedback}>
      <input name="message" />
      <button type="submit">Send</button>
    </form>
  );
}
```

Or from a Server Component's `<form action>` directly (no `'use client'` needed on the form):

```tsx
// src/widgets/feedback-widget/ui/FeedbackWidget.tsx
// No 'use client'
import { submitFeedback } from '@/features/submit-feedback';

export function FeedbackWidget() {
  return (
    <form action={submitFeedback}>
      <input name="message" />
      <button type="submit">Send</button>
    </form>
  );
}
```

**`'use server'` file placement in FSD:** Server Actions live in `src/features/<name>/api/`. They are server-only and should never be imported by Client Components for direct call (pass them as props or use them in Server Components or forms).

---

## Suspense and streaming

Server Components support streaming: React sends the shell of the page immediately, then streams in slow parts as they finish. Wrap a slow Server Component in `<Suspense>` to unblock the rest of the page while it loads:

```tsx
// src/views/dashboard/ui/DashboardPage.tsx
import { Suspense } from 'react';
import { HeavyChart } from '@/widgets/heavy-chart';
import { ChartSkeleton } from '@/shared/ui';

export async function DashboardPage() {
  const fastData = await getFastData(); // doesn't block streaming
  return (
    <div>
      <Summary data={fastData} />
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart /> {/* streams in after its own slow fetch */}
      </Suspense>
    </div>
  );
}
```

`<Suspense>` requires nothing from `'use client'` — it works entirely in the server layer. Client Components can also suspend (e.g. via `use(promise)`) — see the `react-19` skill.

---

## Common mistakes

| What went wrong                                                    | What to do instead                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `'use client'` on `app/layout.tsx` or `app/page.tsx`               | Keep routing files as Server Components. Extract the interactive piece into `src/features/`.                       |
| `'use client'` on a widget (`src/widgets/`)                        | The widget should stay server-side. Move the hook/handler into a feature component.                                |
| `useState` / Zustand hook in a file without `'use client'`         | Add `'use client'` to that file (if it's already a leaf), or extract a smaller client component.                   |
| `'use client'` spreading upward — parent after parent gets marked  | Apply the "push the boundary down" technique. Only the leaf needs it.                                              |
| Passing a callback function as a prop from a Server Component      | Functions are not serializable. Pass a Server Action instead, or make the parent a Client Component.               |
| Reading `process.env.SECRET` in a Client Component                 | Only read secrets in Server Components or Server Actions — they are exposed in client bundles otherwise.           |
| DB query inside a `useEffect`                                      | Move the query to a Server Component or a Server Action. `useEffect` runs in the browser; the DB is on the server. |
| `window` / `document` accessed in a Client Component's render body | Wrap in `useEffect` — browser globals aren't available during SSR.                                                 |

---

## What this skill does NOT cover

React 19-specific APIs (`useActionState`, `useOptimistic`, `use()`, the new `ref`
prop, Server Action error handling): read the **`react-19` skill** for those.
This skill is about where the server/client boundary sits and how to place it correctly in FSD.
