---
name: fsd
description: >
  Use when adding ANY code or file to this project, when a user asks "where does X go?",
  when creating a new component/feature/page/store, when steiger or ESLint reports a layer
  violation or import boundary error, or when code is in the wrong folder and the build is
  failing. Always consult this skill before placing a new file anywhere in src/. If the user
  says "add a button", "create a page", "make a store", "I got a steiger error", or anything
  that involves creating or moving code — read this first. V:0.1.2
---

# Feature-Sliced Design in this project

This project uses Feature-Sliced Design (FSD). Every file has exactly one correct home.
Getting it wrong makes steiger reject the build. This skill tells you where things go and why.

## Why FSD exists (the short version)

Without structure, any file can import anything. That means a bug in a button can break the
whole data layer, and moving one file breaks ten others. FSD prevents this by drawing a
one-way boundary: **higher layers compose lower ones, never the other way**. If you put code
in the right layer, steiger ensures nothing below it can accidentally depend on it.

The practical payoff: when you need to change how a feature works, you only touch that
feature's folder. Everything above it keeps working.

---

## The one rule that governs everything

Each layer may only import from layers **below** it. Steiger enforces this at build time.
The layers, top to bottom:

```
app      (src/app/)        ← top — may import from everything below
views    (src/views/)      ← page content
widgets  (src/widgets/)    ← composed UI blocks
features (src/features/)  ← user actions, interactive components
entities (src/entities/)  ← business state, types, data contracts
shared   (src/shared/)    ← utilities, UI kit, embeds — no business logic
```

A file in `features/` can import from `entities/` and `shared/`. It cannot import from
`widgets/` or `views/`. If a file tries to import "upward", steiger will fail the build
with a layer violation error.

There is also a routing layer that sits **outside** FSD:

```
app/     (Next.js App Router, project root)  ← thin re-exports only, not src/app/
```

> **Naming alert:** `src/app/` (FSD providers layer) and `app/` (Next.js router at project
> root) are two different folders. The routing `app/` is exempt from steiger because it's the
> composition root — the one place that wires providers to pages. Never put logic there.

---

## Where does my code go? — decision tree

Work through these questions in order. Stop at the first match.

### 1. Is it a URL route — a page address the browser can navigate to?

**→ Two files, both thin.**

- `app/<route>/page.tsx` — one line, re-export the view:
  ```ts
  // app/page.tsx  (already exists — the home route)
  export { HomePage as default } from '@/views/home';
  ```
- `src/views/<name>/ui/<Name>Page.tsx` — the actual page component with server-side data
  loading. See the existing example: `src/views/home/ui/HomePage.tsx`

The routing `app/` is allowed to import across layers (it's the composition root). Do not
put business logic or UI components there — just the re-export.

### 2. Is it a provider, a global style, or something every page inherits?

**→ `src/app/`**

App-wide providers (context, fonts, global CSS): `src/app/`.
Example: `src/app/AppStoreProvider.tsx` wraps the whole tree in the Zustand store.
`src/app/globals.css` holds the global reset.

The `app/layout.tsx` (routing layer) imports from `src/app/` and wires it around `children`.

### 3. Is it a self-contained section of a page — a panel, a sidebar, a card

that uses features but has no URL of its own?

**→ `src/widgets/<name>/`**

Widgets compose features and entities into a visible block. They are server components by
default (no `'use client'`).

Example: `src/widgets/preferences-panel/ui/PreferencesPanel.tsx`

- imports `ToggleReduceMotionButton` from `@/features/toggle-reduce-motion`
- has its own `index.ts` that re-exports `PreferencesPanel`

> **Widgets vs. embeds:** a widget is your own UI built from features/entities. An embed is a
> third-party script loaded as a custom HTML element. If it comes from an external URL (a script
> tag), it is an embed — not a widget. See the embeds section below.

### 4. Is it something the user does — a button that fires, a form that submits,

a toggle that changes state?

**→ `src/features/<name>/`**

Features are user actions. `'use client'` belongs here (at the lowest layer that needs it).

Example: `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`

- marked `'use client'` because it needs `useState`/`useEffect`
- imports `useAppStore` from `@/entities/preferences`
- does NOT know about `PreferencesPanel` — it only knows the entity below it

If the feature calls a server action or fetches data, put that in `features/<name>/api/`.

### 5. Is it business state, a store, data types, or server-side data fetching

for the whole app?

**→ `src/entities/<name>/`**

Entities hold the "what" — types, Zustand stores, context, API functions that read
server-side state.

Example: `src/entities/preferences/`

```
model/store.ts            — Zustand store factory + types
model/context.ts          — React context for the store
model/useAppStore.ts      — typed selector hook
api/getInitialAppState.ts — server-side initial data
index.ts                  — public surface (only import this file from outside)
```

Entities have no UI and no `'use client'` in the store itself. The context file marks
`'use client'` only because `createContext` requires it.

### 6. Is it something genuinely reusable across the whole codebase with no

business logic — a button component, a utility function, a design token?

**→ `src/shared/`**

`shared` is NOT sliced like the other layers. It has sub-folders:

| Sub-folder       | Holds                                                   |
| ---------------- | ------------------------------------------------------- |
| `shared/ui/`     | Design-system components (ThemeToggle, etc.)            |
| `shared/lib/`    | Framework-free utilities (theme, id helpers)            |
| `shared/embeds/` | Third-party custom-element widgets (see embeds section) |

`shared/ui/` and `shared/lib/` are imported **by path**, not through a root barrel:

```ts
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { generateId } from '@/shared/lib/id';
```

If you find yourself importing a feature or an entity _into_ shared, stop — that is an
upward import and steiger will reject it. Move the code to a higher layer instead.

---

## "I'm not sure which layer this belongs to"

Use these heuristics when the decision tree leaves you in doubt:

| Question                                                                   | Answer points toward   |
| -------------------------------------------------------------------------- | ---------------------- |
| Does it know about a specific business concept (preferences, user, order)? | `entities/` at minimum |
| Does it respond to user input (click, submit, toggle)?                     | `features/`            |
| Does it combine multiple features into one visual block?                   | `widgets/`             |
| Could it exist in a completely different app with no changes?              | `shared/`              |
| Does it render the full content of one URL?                                | `views/`               |
| Does it load from an external `<script>` URL at runtime?                   | `shared/embeds/`       |

**When code seems to fit two layers,** always pick the lower one — then lift it if something
higher needs it. Starting too high causes steiger violations; starting too low is just a
future move.

**When a lower layer seems to need something from above,** that's a design signal: the
concept belongs in a shared location (`entities/` or `shared/`), not in the higher layer.
Extract the shared concept down, don't import up.

---

## How to create a new slice

A slice is any folder under `entities/`, `features/`, `widgets/`, or `views/`.
Every slice must have an `index.ts` that is its only public surface.

**Minimum viable slice:**

```
src/features/my-feature/
├── index.ts             ← public surface, re-exports only
└── ui/
    └── MyButton.tsx     ← implementation
```

`index.ts`:

```ts
export { MyButton } from './ui/MyButton';
```

Nothing outside the slice imports `./ui/MyButton` directly — only `@/features/my-feature`.
This is enforced by an ESLint `no-restricted-imports` rule.

**Don't create an empty slice.** Add a layer/slice only when something real goes in it.

---

## Import rules at a glance

```ts
// CORRECT — widget imports from feature (one layer down)
import { ToggleReduceMotionButton } from '@/features/toggle-reduce-motion';

// CORRECT — feature imports from entity (one layer down)
import { useAppStore } from '@/entities/preferences';

// CORRECT — anything imports from shared by path
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

// WRONG — entity imports from feature (upward)
import { ToggleReduceMotionButton } from '@/features/toggle-reduce-motion'; // ← in entities/

// WRONG — importing past the slice's index.ts
import { createAppStore } from '@/entities/preferences/model/store'; // ← use index instead
```

---

## Embeds — third-party custom elements

Embeds are NOT widgets. The key difference:

- **Widget** — your own React code, composed from features and entities, lives in `src/widgets/`
- **Embed** — a third-party component loaded via an external `<script>` URL at runtime,
  rendered as a custom HTML element (e.g. `<my-widget />`), lives in `src/shared/embeds/`

An embed lives in `src/shared/embeds/<name>/` and has a generated `embed.json` manifest.
It has no business logic and no imports from `features/` or `entities/`. It belongs in
`shared` precisely because nothing above it should care that it's not a plain component.

Use the generator — never hand-write an embed:

```bash
pnpm embed:add my-widget
```

The existing example is at `src/shared/embeds/demo-embed/`.
`pnpm embed:check` (also runs in `pnpm lint`) validates every embed.json.
The `@keshet/embeds` package provides the script-loading logic — never duplicate it in a slice.

---

## Reading steiger errors

When `pnpm lint` fails with a steiger message, it looks like:

```
src/entities/preferences/model/context.ts
  Forbidden import: 'features/toggle-reduce-motion' is in a higher layer than 'entities'
```

Read it as: "this file is importing something from a layer above it."

**Fix:** Move the import's destination to a lower layer, or move the importing file to a
higher layer. Steiger won't accept workarounds — the fix must correct the actual placement.

The root `app/` routing folder is exempt from steiger (it's the composition root). But keep it
to thin re-exports — if you find logic there, move it to `src/views/`.

---

## Common mistakes and their fixes

| Symptom                                        | Likely cause                                                 | Fix                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Steiger: "higher layer" import error           | Importing upward (e.g. entity imports a feature)             | Extract the shared concept to `shared/` or `entities/`                    |
| ESLint: "no-restricted-imports" on a deep path | Importing past `index.ts` into a slice                       | Import from the slice root (`@/entities/preferences`, not the inner file) |
| `'use client'` on an entity store              | Store itself doesn't need it; only the context file does     | Remove from store, keep only where React context or hooks require it      |
| Page logic in `app/layout.tsx`                 | That file is composition-root only                           | Move the component to `src/views/` and re-export from `app/page.tsx`      |
| Business logic in `shared/`                    | `shared` has no business concepts                            | Promote to `entities/` or `features/`                                     |
| Embed hand-written or copied                   | Only `pnpm embed:add` produces valid embed folders           | Delete the hand-written folder, run `pnpm embed:add`                      |
| Widget importing from another widget           | Widgets don't compose each other — that's what views are for | Move composition to `src/views/` or extract a shared feature              |

---

## Quick reference — real file examples

| What you want                 | Look at this file                                                   |
| ----------------------------- | ------------------------------------------------------------------- |
| Entity store                  | `src/entities/preferences/model/store.ts`                           |
| Entity public surface         | `src/entities/preferences/index.ts`                                 |
| Feature with `'use client'`   | `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx` |
| Widget composing a feature    | `src/widgets/preferences-panel/ui/PreferencesPanel.tsx`             |
| View with server data loading | `src/views/home/ui/HomePage.tsx`                                    |
| Routing thin re-export        | `app/page.tsx`                                                      |
| App provider                  | `src/app/AppStoreProvider.tsx`                                      |
| Shared UI component           | `src/shared/ui/ThemeToggle/ThemeToggle.tsx`                         |
| Shared utility                | `src/shared/lib/theme.ts`                                           |
| Embed wrapper component       | `src/shared/embeds/demo-embed/DemoEmbed.tsx`                        |
