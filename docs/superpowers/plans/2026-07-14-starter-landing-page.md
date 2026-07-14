# Starter Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "tasks" demo feature entirely and replace the home page with a title/landing page, keeping the Zustand-under-SSR, persist, no-flash-theme, and route-handler patterns alive but domain-neutral.

**Architecture:** The tasks store becomes a generic `appStore` factory holding a neutral `preferences.reduceMotion` slice; `AppStoreProvider` seeds it per-request from `lib/appState.ts` (called directly in the server `layout.tsx`). The landing page (`page.tsx`) is a static server component rendering a hero, a `PatternCard` grid pointing at where each pattern lives, and one live client consumer (`PreferenceToggle`) that proves persist + selector + rehydration end-to-end.

**Tech Stack:** Next 16.2.10 (App Router, Turbopack), React 19.2.7, Zustand 5.0.14, CSS Modules, TypeScript 5.9.3, Vitest + React Testing Library.

## Global Constraints

- Node `>=22`; package manager pnpm (pinned via `packageManager`).
- Pinned versions, do not bump: Next 16.2.10, React 19.2.7, Zustand 5.0.14, TypeScript 5.9.3, ESLint 9.39.5.
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` must all pass with **zero errors and zero warnings**.
- **No auto-commit.** This project's policy defers commits to the user. Each task ends at a review checkpoint; do **not** run `git add`/`git commit`/`git push` unless the user explicitly asks. The "Checkpoint" step replaces the usual commit step.
- CSS: use `rem` for `font-size` only; use the spacing/size tokens (`var(--space-*)`, `px`) for everything else. Read design tokens from `src/app/globals.css`; never hard-code colours.
- No task/tasks vocabulary anywhere in `src/` when done (`grep -ri "task" src/` returns nothing).
- Keep `src/lib/id.ts` and `src/lib/id.test.ts` — they are a domain-neutral, tested utility (secure-context UUID fallback) worth shipping, and contain no task references.

---

## File Structure

**Create:**

- `src/store/appStore.ts` — generic per-request store factory (`createAppStore`), `preferences.reduceMotion` slice.
- `src/store/appStore.test.ts` — store logic + persisted-wins-over-seed + isolation tests.
- `src/store/AppStoreProvider.tsx` — context, provider, `useAppStore` selector hook.
- `src/store/AppStoreProvider.test.tsx` — provider rehydration test with an inline consumer.
- `src/lib/appState.ts` — `getInitialAppState()` neutral server-side seed.
- `src/app/api/health/route.ts` — neutral `GET` returning `{ status: 'ok' }`.
- `src/app/api/health/route.test.ts` — route handler test.
- `src/components/StackBadges/{StackBadges.tsx,StackBadges.module.css,StackBadges.test.tsx}`
- `src/components/PatternCard/{PatternCard.tsx,PatternCard.module.css,PatternCard.test.tsx}`
- `src/components/PreferenceToggle/{PreferenceToggle.tsx,PreferenceToggle.module.css,PreferenceToggle.test.tsx}`
- `src/components/Hero/{Hero.tsx,Hero.module.css,Hero.test.tsx}`

**Modify:**

- `src/app/layout.tsx` — wrap children in `AppStoreProvider` seeded from `getInitialAppState()`, update metadata.
- `src/app/page.tsx` — landing page.
- `src/app/page.module.css` — landing page styles.
- `README.md` — retarget off tasks.

**Delete:**

- `src/components/TasksPanel/`, `TaskList/`, `AddTaskForm/`, `TaskStats/`, `SyncButton/`, `DemoNote/`
- `src/lib/tasks.ts`, `src/lib/tasks.test.ts`, `src/lib/types.ts`
- `src/store/tasksStore.ts`, `src/store/tasksStore.test.ts`, `src/store/TasksStoreProvider.tsx`, `src/store/TasksStoreProvider.test.tsx`
- `src/app/api/tasks/route.ts` (and the empty `src/app/api/tasks/` dir)

**Kept unchanged:** `src/store/themeStore.ts`, `src/components/ThemeToggle/`, `src/lib/theme.ts`, `src/app/globals.css`, `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/not-found.tsx`, `src/lib/id.ts`, `src/lib/id.test.ts`.

---

### Task 1: Domain-neutral store — `appStore`

New files alongside the old `tasksStore`; nothing is deleted yet, so the project keeps building.

**Files:**

- Create: `src/store/appStore.ts`
- Test: `src/store/appStore.test.ts`

**Interfaces:**

- Produces: `APP_STORAGE_KEY: string`; `type Preferences = { reduceMotion: boolean }`; `type AppInitialState = { preferences: Preferences }`; `type AppState = { preferences: Preferences; hasHydrated: boolean; setReduceMotion: (value: boolean) => void; setHasHydrated: (value: boolean) => void }`; `createAppStore(initialState: AppInitialState)`; `type AppStore = ReturnType<typeof createAppStore>`.

- [ ] **Step 1: Write the failing test**

Create `src/store/appStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_STORAGE_KEY, createAppStore, type AppInitialState } from './appStore';

const seed: AppInitialState = { preferences: { reduceMotion: false } };

function persist(preferences: { reduceMotion: boolean }) {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ state: { preferences }, version: 0 }));
}

describe('createAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts from the server seed', () => {
    const store = createAppStore(seed);

    expect(store.getState().preferences.reduceMotion).toBe(false);
  });

  it('sets a preference', () => {
    const store = createAppStore(seed);

    store.getState().setReduceMotion(true);

    expect(store.getState().preferences.reduceMotion).toBe(true);
  });

  it('lets persisted state win over the server seed on rehydration', async () => {
    persist({ reduceMotion: true });

    const store = createAppStore(seed);
    expect(store.getState().preferences.reduceMotion).toBe(false);

    await store.persist.rehydrate();

    expect(store.getState().preferences.reduceMotion).toBe(true);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('keeps the server seed when nothing is persisted', async () => {
    const store = createAppStore(seed);

    await store.persist.rehydrate();

    expect(store.getState().preferences.reduceMotion).toBe(false);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('creates independent stores — one request cannot leak into another', () => {
    const storeA = createAppStore({ preferences: { reduceMotion: false } });
    const storeB = createAppStore({ preferences: { reduceMotion: false } });

    storeA.getState().setReduceMotion(true);

    expect(storeA.getState().preferences.reduceMotion).toBe(true);
    expect(storeB.getState().preferences.reduceMotion).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/store/appStore.test.ts`
Expected: FAIL — cannot resolve `./appStore`.

- [ ] **Step 3: Write minimal implementation**

Create `src/store/appStore.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

export const APP_STORAGE_KEY = 'starter.app';

export type Preferences = {
  /** An example persisted preference. Replace with your app's real preferences. */
  reduceMotion: boolean;
};

export type AppInitialState = {
  preferences: Preferences;
};

export type AppState = {
  preferences: Preferences;
  /** False until persisted state has been read. Gate persistence-dependent UI on this. */
  hasHydrated: boolean;
  setReduceMotion: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
};

/**
 * A factory, not a singleton. A module-level store seeded with server data would be shared
 * across every SSR request in the same process. One store per request, owned by the provider.
 */
export function createAppStore(initialState: AppInitialState) {
  return createStore<AppState>()(
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
          // Zustand guards this getter internally, so naming the bare `localStorage` global here
          // is safe even though the factory also runs during server render, where it doesn't exist.
          storage: createJSONStorage(() => localStorage),
          // Never touch localStorage during render — that is the classic SSR hydration mismatch.
          // The provider rehydrates explicitly after mount instead.
          skipHydration: true,
          partialize: (state) => ({ preferences: state.preferences }),
          onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
        },
      ),
      { name: 'AppStore' },
    ),
  );
}

export type AppStore = ReturnType<typeof createAppStore>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/store/appStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Checkpoint** — Stop for review. Do not commit (project defers commits to the user).

---

### Task 2: Domain-neutral provider — `AppStoreProvider`

New files; old `TasksStoreProvider` still present. The provider test uses an inline consumer so it does not depend on any landing component.

**Files:**

- Create: `src/store/AppStoreProvider.tsx`
- Test: `src/store/AppStoreProvider.test.tsx`

**Interfaces:**

- Consumes: `createAppStore`, `AppInitialState`, `AppState`, `AppStore` from Task 1.
- Produces: `AppStoreProvider({ initialState, children }: { initialState: AppInitialState; children: ReactNode })`; `useAppStore<T>(selector: (state: AppState) => T): T`.

- [ ] **Step 1: Write the failing test**

Create `src/store/AppStoreProvider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_STORAGE_KEY } from './appStore';
import { AppStoreProvider, useAppStore } from './AppStoreProvider';

function ReduceMotionLabel() {
  const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);

  return <span>reduceMotion: {String(reduceMotion)}</span>;
}

describe('AppStoreProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads persisted preferences through the provider on mount', async () => {
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: { preferences: { reduceMotion: true } }, version: 0 }),
    );

    render(
      <AppStoreProvider initialState={{ preferences: { reduceMotion: false } }}>
        <ReduceMotionLabel />
      </AppStoreProvider>,
    );

    // Persisted state wins over the server seed once the provider rehydrates on mount.
    // (With synchronous localStorage, rehydration completes inside RTL's act() flush on
    // mount, so the intermediate seed value is not observable synchronously — assert the
    // final state, as the original tasks-provider test did.)
    expect(await screen.findByText('reduceMotion: true')).toBeInTheDocument();
    expect(screen.queryByText('reduceMotion: false')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/store/AppStoreProvider.test.tsx`
Expected: FAIL — cannot resolve `./AppStoreProvider`.

- [ ] **Step 3: Write minimal implementation**

Create `src/store/AppStoreProvider.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppInitialState, type AppState, type AppStore } from './appStore';

const AppStoreContext = createContext<AppStore | null>(null);

type Props = {
  initialState: AppInitialState;
  children: ReactNode;
};

export function AppStoreProvider({ initialState, children }: Props) {
  // Lazy initializer: runs exactly once per component instance, giving each request/mount its
  // own store without reading a ref during render (this project's eslint-config-next lint rules
  // flag ref.current reads in render, so useState replaces the ref used in Zustand's own docs).
  // Under Strict Mode (dev only) the initializer runs twice and one store is discarded — harmless.
  const [store] = useState<AppStore>(() => createAppStore(initialState));

  useEffect(() => {
    // Read persisted state only after mount. Server HTML and the first client render both show
    // the server seed, so they match; persisted state then takes over.
    void store.persist.rehydrate();
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error('useAppStore must be used inside <AppStoreProvider>');
  }

  return useStore(store, selector);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/store/AppStoreProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — Stop for review. Do not commit.

---

### Task 3: Neutral server seed + `/api/health` route handler

**Files:**

- Create: `src/lib/appState.ts`
- Create: `src/app/api/health/route.ts`
- Test: `src/app/api/health/route.test.ts`

**Interfaces:**

- Consumes: `AppInitialState` from Task 1.
- Produces: `getInitialAppState(): AppInitialState`; `GET(): Response` at `/api/health`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/health/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
  it('returns an ok status payload', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/health/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write minimal implementations**

Create `src/lib/appState.ts`:

```ts
import type { AppInitialState } from '@/store/appStore';

/**
 * The server-side source of the store's initial state. `app/layout.tsx` (a server component)
 * calls this directly and hands the result to <AppStoreProvider>, so the first paint already
 * has state on the server and the client alike — no fetch to our own route handler.
 */
export function getInitialAppState(): AppInitialState {
  return { preferences: { reduceMotion: false } };
}
```

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server';

/** A minimal route handler kept as a live example. Curl it: `curl localhost:3000/api/health`. */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/health/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — Stop for review. Do not commit.

---

### Task 4: Landing-page components

All new files; nothing is deleted yet. `StackBadges` and `PatternCard` are server components; `PreferenceToggle` is the one live client consumer; `Hero` composes the static header.

**Files:**

- Create: `src/components/StackBadges/StackBadges.tsx`, `StackBadges.module.css`, `StackBadges.test.tsx`
- Create: `src/components/PatternCard/PatternCard.tsx`, `PatternCard.module.css`, `PatternCard.test.tsx`
- Create: `src/components/PreferenceToggle/PreferenceToggle.tsx`, `PreferenceToggle.module.css`, `PreferenceToggle.test.tsx`
- Create: `src/components/Hero/Hero.tsx`, `Hero.module.css`, `Hero.test.tsx`

**Interfaces:**

- Consumes: `useAppStore` from Task 2 (in `PreferenceToggle`); existing `ThemeToggle` (in `Hero`).
- Produces: `StackBadges()`; `PatternCard({ title, description, file }: { title: string; description: string; file: string })`; `PreferenceToggle()`; `Hero()`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/StackBadges/StackBadges.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StackBadges } from './StackBadges';

describe('StackBadges', () => {
  it('renders every stack badge', () => {
    render(<StackBadges />);

    for (const label of ['Next 16', 'React 19', 'Zustand', 'CSS Modules', 'TypeScript']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
```

Create `src/components/PatternCard/PatternCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PatternCard } from './PatternCard';

describe('PatternCard', () => {
  it('renders its title, description and file path', () => {
    render(
      <PatternCard
        title="No theme flash"
        description="Stamps data-theme early."
        file="src/lib/theme.ts"
      />,
    );

    expect(screen.getByRole('heading', { name: 'No theme flash' })).toBeInTheDocument();
    expect(screen.getByText('Stamps data-theme early.')).toBeInTheDocument();
    expect(screen.getByText('src/lib/theme.ts')).toBeInTheDocument();
  });
});
```

Create `src/components/PreferenceToggle/PreferenceToggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { PreferenceToggle } from './PreferenceToggle';

function renderToggle() {
  return render(
    <AppStoreProvider initialState={{ preferences: { reduceMotion: false } }}>
      <PreferenceToggle />
    </AppStoreProvider>,
  );
}

describe('PreferenceToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reflects and flips the reduceMotion preference through the store', async () => {
    const user = userEvent.setup();
    renderToggle();

    const off = screen.getByRole('button', { name: /reduce motion: off/i });
    expect(off).toHaveAttribute('aria-pressed', 'false');

    await user.click(off);

    const on = screen.getByRole('button', { name: /reduce motion: on/i });
    expect(on).toHaveAttribute('aria-pressed', 'true');
  });
});
```

Create `src/components/Hero/Hero.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders the starter title and pitch', () => {
    render(<Hero />);

    expect(screen.getByRole('heading', { level: 1, name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByText(/team starter stack/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/StackBadges src/components/PatternCard src/components/PreferenceToggle src/components/Hero`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 3: Write minimal implementations**

Create `src/components/StackBadges/StackBadges.tsx`:

```tsx
import styles from './StackBadges.module.css';

const BADGES = ['Next 16', 'React 19', 'Zustand', 'CSS Modules', 'TypeScript'];

export function StackBadges() {
  return (
    <ul className={styles.badges}>
      {BADGES.map((badge) => (
        <li key={badge} className={styles.badge}>
          {badge}
        </li>
      ))}
    </ul>
  );
}
```

Create `src/components/StackBadges/StackBadges.module.css`:

```css
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.badge {
  padding: var(--space-1) var(--space-2);
  font-size: 0.8125rem;
  color: var(--color-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
```

Create `src/components/PatternCard/PatternCard.tsx`:

```tsx
import styles from './PatternCard.module.css';

type Props = {
  title: string;
  description: string;
  file: string;
};

export function PatternCard({ title, description, file }: Props) {
  return (
    <article className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <code className={styles.file}>{file}</code>
    </article>
  );
}
```

Create `src/components/PatternCard/PatternCard.module.css`:

```css
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.title {
  margin: 0;
  font-size: 1rem;
}

.description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-muted);
}

.file {
  margin-top: auto;
  font-size: 0.8125rem;
  color: var(--color-accent);
  word-break: break-all;
}
```

Create `src/components/PreferenceToggle/PreferenceToggle.tsx`:

```tsx
'use client';

import { useAppStore } from '@/store/AppStoreProvider';
import styles from './PreferenceToggle.module.css';

/**
 * The one live consumer of the app store on the landing page. It subscribes with a selector
 * (not the whole store) and its value survives a reload via persist — proving the SSR-seed →
 * rehydration → persist chain end to end. Delete it along with the rest of the demo page.
 */
export function PreferenceToggle() {
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

Create `src/components/PreferenceToggle/PreferenceToggle.module.css`:

```css
.toggle {
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: var(--color-text);
  cursor: pointer;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.toggle:hover {
  border-color: var(--color-accent);
}

.toggle[aria-pressed='true'] {
  color: var(--color-accent-contrast);
  background: var(--color-accent);
  border-color: var(--color-accent);
}
```

Create `src/components/Hero/Hero.tsx`:

```tsx
import { StackBadges } from '@/components/StackBadges/StackBadges';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Starter</h1>
          <p className={styles.pitch}>The team starter stack — clone it, run it, build on it.</p>
        </div>
        <ThemeToggle />
      </div>
      <StackBadges />
    </header>
  );
}
```

Create `src/components/Hero/Hero.module.css`:

```css
.hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.title {
  margin: 0;
  font-size: 2rem;
}

.pitch {
  margin: var(--space-1) 0 0;
  font-size: 0.9375rem;
  color: var(--color-muted);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/components/StackBadges src/components/PatternCard src/components/PreferenceToggle src/components/Hero`
Expected: PASS (4 files).

- [ ] **Step 5: Checkpoint** — Stop for review. Do not commit.

---

### Task 5: Swap the home page and delete the tasks feature

This task makes the app coherent again: `layout.tsx` and `page.tsx` switch to the new store and landing components, and every task-shaped file is removed. After this task the whole suite and build pass.

**Files:**

- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.module.css`
- Delete: all files listed under "Delete" in the File Structure section.

**Interfaces:**

- Consumes: `getInitialAppState` (Task 3), `AppStoreProvider` (Task 2), `Hero`, `PatternCard`, `PreferenceToggle` (Task 4), existing `THEME_INIT_SCRIPT` from `src/lib/theme.ts`.

- [ ] **Step 1: Rewrite `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { getInitialAppState } from '@/lib/appState';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Starter — Next.js + React + Zustand + CSS Modules',
  description:
    'The team starter stack, with a landing page that points at the patterns worth reading.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = getInitialAppState();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={geist.variable}>
        <AppStoreProvider initialState={initialState}>{children}</AppStoreProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/page.tsx`**

```tsx
import { Hero } from '@/components/Hero/Hero';
import { PatternCard } from '@/components/PatternCard/PatternCard';
import { PreferenceToggle } from '@/components/PreferenceToggle/PreferenceToggle';
import styles from './page.module.css';

const PATTERNS = [
  {
    title: 'Zustand under SSR',
    description:
      'A per-request store factory seeded from the server, with persist + skipHydration so there is no hydration mismatch.',
    file: 'src/store/appStore.ts',
  },
  {
    title: 'Seeding from the server',
    description:
      'layout.tsx reads getInitialAppState() directly and hands it to the provider — no fetch to our own route.',
    file: 'src/store/AppStoreProvider.tsx',
  },
  {
    title: 'No theme flash',
    description:
      'An inline script stamps data-theme on <html> before first paint, so a dark reload never flashes white.',
    file: 'src/lib/theme.ts',
  },
  {
    title: 'Route handler',
    description: 'A minimal GET endpoint you can curl or fetch from the client.',
    file: 'src/app/api/health/route.ts',
  },
  {
    title: 'Scripts',
    description: 'dev, build, lint, typecheck, format and test — see the README.',
    file: 'package.json',
  },
  {
    title: 'Testing',
    description: 'Vitest + React Testing Library, colocated beside each component.',
    file: '*.test.tsx',
  },
];

export default function Home() {
  return (
    <main className={styles.main}>
      <Hero />

      <section className={styles.preferences}>
        <p className={styles.preferencesLabel}>
          Live example: this preference is held in the app store and survives a reload.
        </p>
        <PreferenceToggle />
      </section>

      <ul className={styles.grid}>
        {PATTERNS.map((pattern) => (
          <li key={pattern.title}>
            <PatternCard {...pattern} />
          </li>
        ))}
      </ul>

      <footer className={styles.footer}>
        Delete <code>src/app/page.tsx</code> and the landing components, wire your app into{' '}
        <code>AppStoreProvider</code>, and start building.
      </footer>
    </main>
  );
}
```

- [ ] **Step 3: Rewrite `src/app/page.module.css`**

```css
.main {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 880px;
  padding: var(--space-5) var(--space-3);
  margin: 0 auto;
}

.preferences {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preferencesLabel {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
  padding: 0;
  margin: 0;
  list-style: none;
}

.footer {
  padding-top: var(--space-3);
  font-size: 0.875rem;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
}
```

- [ ] **Step 4: Delete the tasks feature**

Run:

```bash
git rm -r \
  src/components/TasksPanel \
  src/components/TaskList \
  src/components/AddTaskForm \
  src/components/TaskStats \
  src/components/SyncButton \
  src/components/DemoNote \
  src/lib/tasks.ts src/lib/tasks.test.ts src/lib/types.ts \
  src/store/tasksStore.ts src/store/tasksStore.test.ts \
  src/store/TasksStoreProvider.tsx src/store/TasksStoreProvider.test.tsx \
  src/app/api/tasks/route.ts
```

(If the tree is not staged, use `rm -r` with the same paths.) `git rm` here only stages deletions in the working tree; it does not create a commit — the no-auto-commit policy still holds.

- [ ] **Step 5: Verify the full suite, types, lint and build all pass**

Run each, expect zero errors and zero warnings:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all green. If `pnpm build` or `pnpm lint` reports an unresolved `@/...` import or a leftover reference, a deletion or a rewrite was missed — fix before continuing.

- [ ] **Step 6: Confirm no task vocabulary remains in source**

Run: `grep -rin "task" src/`
Expected: no output.

- [ ] **Step 7: Checkpoint** — Stop for review. Do not commit.

---

### Task 6: Rewrite the README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` with the following**

````markdown
# Starter

Next.js · React · Zustand · CSS Modules. Clone it, run it, build on it.

This is a template, not an app. `src/app/page.tsx` is a landing page that names the stack and
points at the handful of patterns worth reading before you start. Delete the page and the
landing components (`Hero`, `StackBadges`, `PatternCard`, `PreferenceToggle`), wire your own UI
into `AppStoreProvider`, and build.

## Requirements

Node >= 22, pnpm (via `corepack enable`).

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script              | Purpose                    |
| ------------------- | -------------------------- |
| `pnpm dev`          | Dev server (Turbopack)     |
| `pnpm build`        | Production build           |
| `pnpm start`        | Serve the production build |
| `pnpm lint`         | ESLint                     |
| `pnpm typecheck`    | `tsc --noEmit`             |
| `pnpm format`       | Prettier (write)           |
| `pnpm format:check` | Prettier (check only)      |
| `pnpm test`         | Vitest                     |
| `pnpm test:watch`   | Vitest, watch mode         |

## The patterns worth reading

### Zustand under SSR

`src/store/appStore.ts`, `src/store/AppStoreProvider.tsx`

The app store is a per-request **factory** (`createAppStore(initialState)`), not a module
singleton. A singleton seeded with server data would be mutated during SSR inside a module
shared by every request in the process — harmless when the seed is constant, a real cross-user
leak the moment it is user-specific. The provider creates one store per component instance
instead.

`persist` uses `skipHydration: true`, and the provider rehydrates from `localStorage` in a
mount effect (`useEffect`), never during render — reading `localStorage` while rendering is the
classic hydration-mismatch bug, since the server has no `localStorage` to read at all.

Precedence: **persisted state wins; otherwise the server seed stands.** `src/store/appStore.test.ts`
pins this in both directions, and another test pins cross-instance isolation.

The store carries one neutral example preference (`preferences.reduceMotion`), consumed live on
the landing page by `PreferenceToggle` so the seed → rehydrate → persist chain is visible.
Replace `Preferences` with your app's real state.

The theme store (`src/store/themeStore.ts`) _is_ a module singleton, deliberately — its state is
never seeded from the server, so there is nothing to leak between requests. The starter shows
both patterns side by side so the "why" for each is obvious from the diff between them.

### Seeding client state from the server

`src/lib/appState.ts`, `src/app/layout.tsx`

`layout.tsx` is a server component. It calls `getInitialAppState()` **directly** and hands the
result to a client `<AppStoreProvider>`, so the first paint already has state on the server and
the client alike — no fetch from a server component to our own route handler.

### No theme flash

`src/lib/theme.ts`, `src/app/layout.tsx`

An inline script in `<head>` stamps `data-theme` on `<html>` before first paint, so a dark-theme
reload never flashes white. Two subtleties here were real bugs caught in review:

- The theme constants and the script source live in `src/lib/theme.ts`, a **plain module with no
  `'use client'` directive**. The root layout is a server component, and in RSC a client
  module's exports become unusable stubs when imported from server code — importing the storage
  key from the `'use client'` theme store instead of this plain module silently corrupted the
  inline script into a syntax error and killed the anti-flash feature outright.
  `src/lib/theme.test.ts` guards this import boundary.
- `themeStore` reads its initial theme from `<html data-theme>` rather than hardcoding `'light'`,
  because by the time any module evaluates, the inline script has already resolved the right
  value. Hardcoding a default here clobbered the OS preference (`prefers-color-scheme`) on a
  first visit.

`ThemeToggle` renders **both** icons and lets CSS pick the visible one off `[data-theme]`, so the
button has no hydration-dependent branch in its markup and cannot flicker.

### A route handler

`src/app/api/health/route.ts`

A minimal `GET` returning `{ status: "ok" }`, kept as a live example of an App Router route
handler. `curl http://localhost:3000/api/health`.

## Design tokens

Tokens (colors, spacing, etc.) live in `src/app/globals.css`. Stylesheets should read these
tokens rather than hard-code colours, so theme switching and future rebranding stay one-file
changes.

## Versions

Pinned: **Next 16.2.10, React 19.2.7, Zustand 5.0.14, TypeScript 5.9.3, ESLint 9.39.5.**

TypeScript 7 and ESLint 10 are both published and both install and typecheck fine on their own.
They are deliberately **not** adopted here: `eslint-config-next@16.2.10` pulls in
`typescript-eslint@8.64.0`, which does not yet support the TypeScript 7 compiler API and makes
ESLint crash outright when TypeScript 7 is installed alongside it. This is a decision, not an
oversight — revisit the pin once `typescript-eslint` ships TypeScript 7 support.
````

- [ ] **Step 2: Verify formatting and that the README has no task references**

Run: `pnpm format:check` (expect pass, or run `pnpm format` then re-check) and `grep -rin "task" README.md` (expect no output).

- [ ] **Step 3: Final full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green, zero warnings.

- [ ] **Step 4: Checkpoint** — Stop for review. Do not commit.

---

## Self-Review

**Spec coverage:**

- Delete task-shaped code → Task 5 (deletion list matches spec exactly). ✓
- Keep store domain-neutral (`appStore`, factory, persist/skipHydration/hasHydrated) → Task 1. ✓
- Rename provider → `AppStoreProvider` + `useAppStore` → Task 2. ✓
- themeStore / ThemeToggle / theme.ts / layout script kept → untouched (layout script preserved in Task 5). ✓
- Route handler → `/api/health` neutral GET → Task 3. ✓
- Neutral server seed `lib/appState.ts` → Task 3. ✓
- Three patterns kept live; patterns 1–2 live via `PreferenceToggle` → Tasks 1, 2, 4, 5. ✓
- Landing page: Hero, StackBadges, PatternCard grid, PreferenceToggle, footer note → Tasks 4, 5. ✓
- Tests: store precedence both directions + isolation, component interaction → Tasks 1, 2, 4. ✓
- Success criteria (build/lint/typecheck/test green, no hydration warning, no flash, persist works, /api/health, grep-clean, README) → Tasks 5, 6. ✓

**Placeholder scan:** No TBD/TODO; every code and test step carries complete content. ✓

**Type consistency:** `AppInitialState = { preferences: Preferences }`, `Preferences = { reduceMotion: boolean }`, `AppState` fields (`preferences`, `hasHydrated`, `setReduceMotion`, `setHasHydrated`), `createAppStore(initialState)`, `AppStoreProvider({ initialState })`, `useAppStore(selector)`, `getInitialAppState()`, `PatternCard({ title, description, file })` — all consistent across Tasks 1–5. ✓
