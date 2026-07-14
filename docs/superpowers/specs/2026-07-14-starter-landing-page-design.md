# Starter Landing Page — Design

**Date:** 2026-07-14
**Status:** Approved, ready for implementation planning
**Supersedes the demo-page portion of:** `2026-07-14-nextjs-starter-design.md`

## Purpose

Remove the "tasks" demo feature entirely and replace the home page with a proper
**title / landing page** for the starter. The starter is the reference implementation of the
team stack; a developer clones it, runs `pnpm install && pnpm dev`, and lands on a page that
orients them — what the stack is, how to run it, and where each non-obvious pattern lives —
rather than a task-list demo they must first understand and then delete.

The three patterns the original demo carried are **kept**, made domain-neutral, and stay
live-demonstrated. They are not deleted with the tasks feature.

## What changes

### Deleted (task-shaped code)

- `src/components/TasksPanel/`
- `src/components/TaskList/`
- `src/components/AddTaskForm/`
- `src/components/TaskStats/`
- `src/components/SyncButton/`
- `src/components/DemoNote/`
- `src/lib/tasks.ts`, `src/lib/tasks.test.ts`
- `src/lib/types.ts` (task types — replaced by neutral types if any are needed)
- `src/store/tasksStore.ts`, `src/store/tasksStore.test.ts`
- `src/store/TasksStoreProvider.tsx`, `src/store/TasksStoreProvider.test.tsx`
- `src/app/api/tasks/route.ts`

### Kept, made domain-neutral

- **`src/store/appStore.ts`** — renamed from `tasksStore.ts`. Generic factory
  `createAppStore(initialState)` with `persist` + `skipHydration` + a `hasHydrated` flag.
  No task domain. Holds a small neutral **preferences** slice (see below).
- **`src/store/AppStoreProvider.tsx`** — renamed from `TasksStoreProvider.tsx`. Context,
  provider (`<AppStoreProvider initialState>`), and a `useAppStore(selector)` hook. Creates a
  **store instance per request** via the factory, rehydrates persisted state after mount.
- **`src/store/themeStore.ts`** — unchanged (client-only singleton; nothing to leak).
- **`src/components/ThemeToggle/`** — unchanged. Demonstrates the no-flash theme pattern live.
- **`src/lib/theme.ts`** — unchanged (`THEME_INIT_SCRIPT`).
- **Route handler** → renamed to **`src/app/api/health/route.ts`**, a neutral `GET` returning
  `{ status: "ok" }`. Demonstrates a route handler without inventing a fake domain.
- **`layout.tsx`** — keeps the no-flash `<head>` script. Wraps children in `AppStoreProvider`
  seeded from the server (see data flow). Metadata updated to drop "tasks" wording.

### New

- Landing-page components under `src/components/`.
- `src/lib/appState.ts` — neutral server-side source for the store's initial state
  (replaces `lib/tasks.ts` as the thing the server component reads directly).

## The three patterns, kept live

The original starter existed to defuse three traps. They survive intact:

1. **Server → client store seeding.** `layout.tsx` (server) calls `getInitialAppState()` from
   `src/lib/appState.ts` **directly** (no HTTP hop to its own route), and passes the result into
   a client `<AppStoreProvider initialState>`. The provider builds a **per-request store** via
   `createAppStore(initialState)`. First paint already has state on server and client alike. The
   factory-not-singleton rule and its rationale (SSR cross-request mutation / user-specific leak)
   are preserved in comments and pinned by a test.

2. **Zustand `persist` under SSR.** `appStore` sets `skipHydration: true`; the provider
   rehydrates explicitly after mount; `hasHydrated` is exposed. Precedence rule — **persisted
   state wins if present, else the server seed** — is preserved and pinned by a test in both
   directions.

3. **Theme flash.** Unchanged: inline `layout.tsx` script stamps `data-theme` before first
   paint; `ThemeToggle` renders both icons and lets CSS pick off `[data-theme]`; `<html>` carries
   `suppressHydrationWarning`.

### Keeping patterns 1 and 2 live, not test-only

A purely static landing page would leave the store unconsumed — patterns 1 and 2 would exist
only in code and tests, and rot silently. To avoid that, `appStore` holds one **trivial, neutral
preferences slice** consumed by **one small client component** on the landing page:

- State shape: `{ preferences: { reduceMotion: boolean }, setReduceMotion(v) }`.
- Server seed: `getInitialAppState()` returns `{ preferences: { reduceMotion: false } }`.
- One client component (`PreferenceToggle`) reads and flips `reduceMotion` **via a Zustand
  selector** (demonstrating re-render discipline) and persists it. A reload proves persistence;
  the seed proves server→client hand-off.

This is neutral (a real starter-level preference, not a fake business domain) and keeps all three
patterns demonstrated live on the page.

## Landing page

`src/app/page.tsx` — server component. Renders:

- **Hero:** "Starter" title, one-line pitch, a row of stack badges
  (Next 16 · React 19 · Zustand · CSS Modules · TypeScript). `ThemeToggle` top-right.
- **Card grid:** a reusable `PatternCard` component. Each card = title, one sentence, and the
  file path to read. Cards:
  - **SSR store seeding** → `src/store/appStore.ts`, `src/store/AppStoreProvider.tsx`
  - **No-flash theme** → `src/lib/theme.ts`, `src/app/layout.tsx`
  - **Route handler** → `src/app/api/health/route.ts`
  - **Persisted preferences** → the live `PreferenceToggle` + `src/store/appStore.ts`
  - **Scripts** → `package.json` / README
  - **Testing** → `*.test.tsx` colocated beside components
- **`PreferenceToggle`:** the one live store consumer (small, unobtrusive — e.g. in the hero or a
  card), demonstrating persist + selector.
- **Footer note:** "Delete `page.tsx` and the landing components, wire your app into
  `AppStoreProvider`, and start building."

### Components (each a folder: `.tsx` + `.module.css` + `.test.tsx`)

- `src/components/Hero/`
- `src/components/StackBadges/`
- `src/components/PatternCard/`
- `src/components/PreferenceToggle/`
- `ThemeToggle/` (kept)

## Error handling

Unchanged: `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx` stay.

## Testing

Tests ship as working examples, retargeted off tasks:

- **Store logic** (pure): set-preference, and the persisted-state-wins-over-seed precedence rule
  in both directions.
- **Component interaction** (RTL): `PreferenceToggle` flips and reflects store state;
  `PatternCard` renders its title + file path; `ThemeToggle` unchanged.

## Success criteria

1. `pnpm install && pnpm dev` shows the landing page on a clean Node 22 machine.
2. `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass with zero errors/warnings.
3. No hydration-mismatch warning on first load or reload.
4. No theme flash on reload in dark mode.
5. Flipping the preference toggle, reloading, and seeing it persist works.
6. `GET /api/health` returns `{ status: "ok" }`.
7. No remaining reference to "task"/"tasks" anywhere in `src/` (grep-clean).
8. README updated: no tasks wording; points at the landing page and the three patterns.
