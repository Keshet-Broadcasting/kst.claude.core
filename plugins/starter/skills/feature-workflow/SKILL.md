---
name: feature-workflow
description: >
  Use this skill whenever someone wants to add, build, or implement something new in the
  app — regardless of how they phrase it. Triggers on: "add a feature", "I want to build X",
  "how do I add", "where do I start", "new component", "create a page", "add a button",
  "I want to implement", "how do I make", "build a form", "add a store", or any request to
  create new functionality. If the user describes something they want the app to do that it
  does not yet do — read this skill first, before touching any file. V:0.1.2
---

# Feature Workflow

This skill is your complete implementation guide for adding anything new to this app.
It is written as a checklist: work through every step in order, check each box before moving
to the next. Do not skip steps because the feature "seems small" — the checklist is fast for
small features and catches mistakes on large ones.

The user describes what they want. Your job is to decide where it goes, implement it layer by
layer, test it, and verify the definition of done.

---

## Step 0 — Scope triage (do this before touching any file)

Classify the request into one of three sizes. The size controls how many of the remaining
steps actually apply.

| Class         | Signals                                                      | Layers you will touch |
| ------------- | ------------------------------------------------------------ | --------------------- |
| **Tweak**     | Change existing component text, style, or props              | 1 file, maybe 2       |
| **Feature**   | New interaction, new page section, or new data               | Usually 2–4 layers    |
| **Full flow** | New page the user navigates to + new user action + new state | All 5 layers possible |

**Rule:** start small. If you think it is a Tweak, implement it as a Tweak. If it turns out
larger during implementation, promote it — do not design for "Full flow" when you have a
Tweak request. Over-engineering is a bug.

**For Full flow requests:** before writing code, list every layer you expect to touch and
confirm the list makes sense. A new entity + new feature + new widget + new page is four
separate slices — each with its own folder, `index.ts`, and test file. That is a lot. Make
sure each one is actually needed before creating it.

---

## Step 1 — Decide which layer each piece belongs in

Answer the questions top-to-bottom. Stop at the first match. Repeat for every distinct
piece of the feature.

| Question                                                           | Layer                     |
| ------------------------------------------------------------------ | ------------------------- |
| Does the user navigate to a URL to see it?                         | `views` + route in `app/` |
| Is it a visible section of a page composed from smaller pieces?    | `widgets`                 |
| Is it something the user _does_ — clicks, types, submits, toggles? | `features`                |
| Is it state, types, or server-data shared by multiple features?    | `entities`                |
| Is it a pure UI primitive or utility with no business knowledge?   | `shared`                  |

**Stored data:** if the piece saves anything, read the `database` skill first - SQLite +
Sequelize only, UUID ids, a Sequelize migration for every schema change.

**Layer rules (enforced by steiger + ESLint):**

- Each layer may only import from layers **strictly below** it.
- Import direction: `views` → `widgets` → `features` → `entities` → `shared`
- Every slice exports its public surface from `index.ts`. Nothing outside the slice imports a
  deep path like `@/entities/preferences/model/store`. The ESLint `no-restricted-imports`
  rule enforces this — do not bypass it.
- `shared/` is not sliced the same way; `shared/lib/*` and `shared/ui/*` are imported
  directly by path.

**Worked example — the reduce-motion demo, classified:**

- `preferences` → **entity**: shared state that both the button and the page read.
- `toggle-reduce-motion` → **feature**: the user clicks to flip a boolean. Needs `'use client'`.
- `preferences-panel` → **widget**: a composed UI section on the page.
- `home` → **view**: the full page the router navigates to.

**When unsure:** read the `fsd` skill for the full FSD methodology with additional examples.

---

## Step 2 — Decide: Server Component or Client Component?

Before writing any component code, ask this question for each component.

**Default: Server Component.** A component is a Server Component unless it needs one of:

- User interaction (click, input, toggle) → needs `'use client'`
- React hooks (`useState`, `useEffect`, custom hooks) → needs `'use client'`
- Browser APIs (`localStorage`, `window`, event listeners) → needs `'use client'`
- Zustand store subscription → needs `'use client'`

**Where `'use client'` lives in FSD:**

- `features/` — this is the lowest point where user interaction lives; mark individual
  component files, never `index.ts`.
- `widgets/` — server by default. Only add `'use client'` if the widget itself (not just a
  child feature) needs browser access.
- `views/` — server by default; they load data on the server.
- `entities/` — store factory is vanilla (no `'use client'`). The context file that wraps
  the store in a React provider needs `'use client'`.

**Data fetching decision:**

- Server-side initial data (cookies, session, DB) → fetch inside the `view` component
  (async Server Component or `async` function called from one). Place the fetching function
  in `entities/<name>/api/`.
- Client-side dynamic data (triggered by user action, polling, mutation) → read the
  `data-fetching` skill before implementing. Do not hand-roll a fetch + `useState` pattern
  when a library handles it.

---

## Step 3 — Create the slice folder(s)

For each slice identified in Step 1:

**3a.** Create the folder under the correct layer directory.

**3b.** Create `index.ts` immediately — even if empty. The import-boundary rule applies from
the first commit. An empty barrel prevents accidental deep imports.

**3c.** Choose internal structure:

- Single concern (one component or action) → flat `ui/` folder.
- Multiple concerns (store + server data, or multiple components) → sub-folders per concern.

```
# Single concern
src/features/toggle-reduce-motion/
├── index.ts
└── ui/
    ├── ToggleReduceMotionButton.tsx
    ├── ToggleReduceMotionButton.module.css
    └── ToggleReduceMotionButton.test.tsx

# Multiple concerns
src/entities/preferences/
├── index.ts
├── api/
│   └── getInitialAppState.ts
└── model/
    ├── store.ts
    ├── context.ts
    └── useAppStore.ts
```

**3d.** For a new page route: create the Next.js routing file as a thin re-export.

```ts
// app/my-route/page.tsx  — one line only, no logic
export { MyPage as default } from '@/views/my-page';
```

The root `app/` folder is the composition root — routing only. No logic, no JSX beyond what
Next.js page contracts require (`generateMetadata`, `searchParams`, etc.).

---

## Step 4 — Implement each slice

Work bottom-up: implement lower layers before the layers that depend on them.
**Order: entities → features → widgets → views**

### Implementing an entity (store + types)

Read the `zustand-5` skill before writing a new store. Key rules:

- Use `createStore` (vanilla, not `create`) so the store is a factory, not a module singleton.
  A singleton gets shared across SSR requests — that is a data leak between users.
- The context file (`context.ts`) that wraps the store in a React provider needs `'use client'`.
  The store itself (`store.ts`) does not.
- The hook (`useAppStore.ts`) reads from context and needs `'use client'`.

```ts
// src/entities/preferences/model/store.ts — no 'use client' here
import { createStore } from 'zustand/vanilla';

export type AppState = {
  preferences: Preferences;
  setReduceMotion: (value: boolean) => void;
};

export function createAppStore(initialState: AppInitialState) {
  return createStore<AppState>()(
    persist(
      (set) => ({
        preferences: initialState.preferences,
        setReduceMotion: (value) =>
          set((state) => ({ preferences: { ...state.preferences, reduceMotion: value } })),
      }),
      { name: 'starter.app', storage: createJSONStorage(() => localStorage), skipHydration: true },
    ),
  );
}
```

Server-side data for initial state goes in `api/`:

```ts
// src/entities/preferences/api/getInitialAppState.ts
import { cookies } from 'next/headers';

export async function getInitialAppState(): Promise<AppInitialState> {
  // read cookies, session, or DB here
}
```

### Implementing a feature (user interaction, `'use client'`)

Mark `'use client'` on the component file, not on `index.ts`.
Read state from the entity below using its exported hook.
Use a selector — `(state) => state.preferences.reduceMotion` — not the whole store object.
This prevents re-renders on unrelated state changes.

```tsx
// src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx
'use client';

import { useAppStore } from '@/entities/preferences';
import styles from './ToggleReduceMotionButton.module.css';

export function ToggleReduceMotionButton() {
  const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);
  const setReduceMotion = useAppStore((state) => state.setReduceMotion);

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={reduceMotion}
      onClick={() => setReduceMotion(!reduceMotion)}
    >
      Reduce motion: {reduceMotion ? 'on' : 'off'}
    </button>
  );
}
```

For form-heavy features: read the `forms` skill before implementing.
For features with loading or error states: read the `loading-and-error` skill.
For features that call an API: read the `data-fetching` skill; place server actions in
`features/<name>/api/`.

### Implementing a widget (composed UI block, server by default)

No `'use client'`. Import features by their `index.ts`. Compose — do not re-implement logic
that already lives in a feature or entity.

```tsx
// src/widgets/preferences-panel/ui/PreferencesPanel.tsx
import { ToggleReduceMotionButton } from '@/features/toggle-reduce-motion';
import styles from './PreferencesPanel.module.css';

export function PreferencesPanel() {
  return (
    <section className={styles.panel}>
      <ToggleReduceMotionButton />
    </section>
  );
}
```

### Implementing a view (full page, server data loading)

Views load their own server data and compose widgets. They do not own state — state belongs
in entities.

```tsx
// src/views/home/ui/HomePage.tsx
import { getInitialAppState } from '@/entities/preferences';
import { PreferencesPanel } from '@/widgets/preferences-panel';
import styles from './HomePage.module.css';

export async function HomePage() {
  const initialState = await getInitialAppState(); // server-side data loading here

  return (
    <main className={styles.main}>
      <PreferencesPanel />
    </main>
  );
}
```

---

## Step 5 — Export from `index.ts`

Export only what the layer above needs. Internal helpers, sub-components, and implementation
files stay private behind the `index.ts` boundary.

```ts
// src/features/toggle-reduce-motion/index.ts
export { ToggleReduceMotionButton } from './ui/ToggleReduceMotionButton';

// src/entities/preferences/index.ts
export { createAppStore } from './model/store';
export type { Preferences, AppInitialState, AppState, AppStore } from './model/store';
export { AppStoreContext } from './model/context';
export { useAppStore } from './model/useAppStore';
export { getInitialAppState } from './api/getInitialAppState';

// src/widgets/preferences-panel/index.ts
export { PreferencesPanel } from './ui/PreferencesPanel';

// src/views/home/index.ts
export { HomePage } from './ui/HomePage';
```

Do not export internal store actions if the hook already exposes them. Keep the surface
minimal — only what the next layer up actually needs to import.

---

## Step 6 — Write tests

Every slice that introduces user-visible behavior needs at least one test. Use Vitest +
Testing Library. The test file lives alongside the component it tests.

### Entity tests

Test the store logic directly — create a store instance, call actions, assert state.
Do not test the context or hook in isolation; those are tested indirectly via component tests.

```ts
import { createAppStore } from './store';

it('setReduceMotion updates preferences', () => {
  const store = createAppStore({ preferences: { reduceMotion: false } });
  store.getState().setReduceMotion(true);
  expect(store.getState().preferences.reduceMotion).toBe(true);
});
```

### Feature tests

Wrap interactive components in `AppStoreProvider` with a controlled `initialState`.
Test the interaction the user performs — click, type, submit.
Never rely on `localStorage` state in tests — clear it in `beforeEach`.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppStoreProvider } from '@/app';
import { ToggleReduceMotionButton } from './ToggleReduceMotionButton';

function renderToggle(initialReduceMotion = false) {
  return render(
    <AppStoreProvider initialState={{ preferences: { reduceMotion: initialReduceMotion } }}>
      <ToggleReduceMotionButton />
    </AppStoreProvider>,
  );
}

it('toggles reduce motion when clicked', async () => {
  renderToggle(false);
  await userEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
});
```

### Widget tests

Render the widget in isolation with the same `AppStoreProvider` wrapper.
Test that the expected child components are present (smoke test), not their internal behavior
— that is the feature's test responsibility.

### View tests

Views are typically Server Components. Test them by rendering and asserting the structure
is present. If the view calls an async data function, mock it at the module level.

```tsx
import { vi } from 'vitest';
import * as api from '@/entities/preferences';

vi.mock('@/entities/preferences', async (importOriginal) => ({
  ...(await importOriginal()),
  getInitialAppState: vi.fn().mockResolvedValue({ preferences: { reduceMotion: false } }),
}));
```

---

## Step 7 — Multi-layer features

When the feature spans more than two layers, follow this sequence explicitly:

1. **Define the data shape first.** Write the TypeScript types in the entity before
   writing any UI. Types are cheap to change early; they are expensive to change after
   components depend on them.

2. **Implement and test each layer before moving up.** Entity tests pass before writing
   the feature. Feature tests pass before writing the widget.

3. **Do not let a widget know about an entity directly.** If a widget needs entity data,
   the data must flow through a feature (via its props or a shared hook), or be loaded in
   the view and passed down as props. Never import an entity directly inside a widget.
   Exception: read-only entity hooks (not store mutations) are acceptable in widgets when
   the alternative is excessive prop-drilling.

4. **One PR per completed feature.** A multi-layer feature is one unit of work —
   do not split it across multiple PRs unless the layers are independently shippable.

---

## Step 8 — Run definition of done checks

Work is not done until all four pass. Run them yourself and read the output before
reporting done — never claim success on unverified work.

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

- **typecheck** — TypeScript. Catches missing types, bad imports, wrong prop shapes.
- **lint** — ESLint (import boundaries) + steiger (FSD layer violations) + `embed:check`.
  A steiger error means a file imports from the wrong layer — fix the placement, not the rule.
- **build** — Next.js production build. Catches SSR issues, missing `'use client'` on hooks,
  async Server Component mistakes.
- **test** — Vitest. All tests you wrote in Step 6 must pass.

For the full definition of done checklist, read the `definition-of-done` skill.

---

## Quick-fix table

| Symptom                                  | Cause                                   | Fix                                                                                |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| steiger: "higher layer" import           | Lower layer imports from above          | Move shared logic to `shared/` or restructure                                      |
| ESLint `no-restricted-imports` deep path | Bypassed `index.ts`                     | Import from the slice root                                                         |
| `useAppStore` throws at runtime          | Component is outside `AppStoreProvider` | Wrap in provider in tests; check `layout.tsx` in prod                              |
| `'use client'` on `store.ts`             | Store is vanilla Zustand, no React      | Remove it; keep `'use client'` only in `context.ts` and component files            |
| Logic in `app/page.tsx`                  | Routing layer is not for logic          | Move component to `src/views/`, thin re-export from `app/`                         |
| Widget imports entity directly           | Skipped the feature layer               | Route entity data through a feature, or reconsider if a feature is actually needed |
| Singleton store shared across requests   | Used `create` instead of `createStore`  | Switch to factory pattern; read `zustand-5` skill                                  |
| Server Component uses hooks              | Missing `'use client'`                  | Add `'use client'` to the component file (not `index.ts`)                          |
| Data fetch in a feature component        | Data loading belongs in the view        | Move `async` fetch to `src/views/<name>/ui/` or its `api/` subfolder               |
