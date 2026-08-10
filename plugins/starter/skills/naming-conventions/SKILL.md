---
name: naming-conventions
description: >
  Use this skill whenever you are about to name anything — a file, a component, a CSS class,
  a store, a hook, a type, a handler, a server action, or a folder. Also use it when the user
  asks "what should I call this?", "how should I name this?", "is this name right?", or "what's
  the naming convention here?". Read it before creating any new file or slice, not after —
  catching a wrong name before it is written is far cheaper than fixing it across imports.
---

# Naming conventions

Every rule is grounded in actual files from `src/` or `app/`. If you are about to create
something that does not map to any row, pick the closest analog and note the decision.

---

## 1. Files

| Kind                            | Case                                             | Example                                                                    |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| React component                 | `PascalCase.tsx`                                 | `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx`        |
| React component test            | `PascalCase.test.tsx`                            | `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.test.tsx`   |
| CSS module                      | `PascalCase.module.css` (same base as component) | `src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.module.css` |
| Store (Zustand singleton)       | `camelCase.ts`                                   | `src/shared/lib/themeStore.ts`                                             |
| Store (Zustand factory)         | `camelCase.ts`                                   | `src/entities/preferences/model/store.ts`                                  |
| Hook file                       | `camelCase.ts`                                   | `src/entities/preferences/model/useAppStore.ts`                            |
| Utility / lib                   | `camelCase.ts`                                   | `src/shared/lib/id.ts`, `src/shared/lib/theme.ts`                          |
| Utility test                    | `camelCase.test.ts`                              | `src/shared/lib/id.test.ts`                                                |
| Slice barrel                    | `index.ts` (always)                              | `src/entities/preferences/index.ts`                                        |
| Context file                    | `camelCase.ts`                                   | `src/entities/preferences/model/context.ts`                                |
| Server function / Server Action | `camelCase.ts`                                   | `src/entities/preferences/api/getInitialAppState.ts`                       |
| Next.js App Router special file | `kebab-case.tsx` (Next.js enforced)              | `app/page.tsx`, `app/not-found.tsx`                                        |
| API route                       | `route.ts` (always)                              | `app/api/health/route.ts`                                                  |
| Embed wrapper                   | `PascalCase.tsx`                                 | `src/shared/embeds/demo-embed/DemoEmbed.tsx`                               |
| Embed type declaration          | `kebab-case.d.ts`                                | `src/shared/embeds/demo-embed/demo-embed.d.ts`                             |

**Rule of thumb:** component = PascalCase; everything else = camelCase.

---

## 2. FSD slice folders

Slice folders use **kebab-case**. No exceptions.

| Layer                       | Example                                                 |
| --------------------------- | ------------------------------------------------------- |
| `src/entities/<name>/`      | `src/entities/preferences/`                             |
| `src/features/<name>/`      | `src/features/toggle-reduce-motion/`                    |
| `src/widgets/<name>/`       | `src/widgets/preferences-panel/`                        |
| `src/views/<name>/`         | `src/views/home/`                                       |
| `src/shared/embeds/<name>/` | `src/shared/embeds/demo-embed/`                         |
| `src/shared/ui/<Name>/`     | `src/shared/ui/ThemeToggle/` ← **PascalCase exception** |

`shared/ui` is the one place that uses PascalCase folder names — because each folder IS a
component, and the folder name IS the component name. Everywhere else: kebab-case.

**Why kebab-case for slices?** It matches URL conventions, is unambiguous on
case-insensitive filesystems, and makes the folder name distinct from the TypeScript
identifiers it contains — you can immediately tell a folder from an export.

---

## 3. React components

- **Named export, PascalCase.** No default exports for components.
- **Filename matches the export name exactly.**

```ts
// src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.tsx
export function ToggleReduceMotionButton() { ... }

// src/widgets/preferences-panel/ui/PreferencesPanel.tsx
export function PreferencesPanel() { ... }

// src/shared/ui/ThemeToggle/ThemeToggle.tsx
export function ThemeToggle() { ... }
```

**Multi-word acronyms:** treat every acronym as a word with only its first letter
capitalised — `HtmlParser`, not `HTMLParser`; `ApiClient`, not `APIClient`; `UrlInput`,
not `URLInput`. Exception: screaming-snake constants and HTTP method exports (see §9).

**Props type:** always `type Props = {...}`, local to the file, never exported. If a
component accepts children, use `ReactNode` from React.

```ts
// src/app/AppStoreProvider.tsx
type Props = {
  initialState: AppInitialState;
  children: ReactNode;
};

export function AppStoreProvider({ initialState, children }: Props) { ... }
```

**Why `Props` not `ComponentNameProps`?** The name is file-local — it can never
conflict with another component's props type. Repeating the component name adds noise
without adding clarity inside the same file.

Slice barrel re-exports the component under the same name:

```ts
// src/features/toggle-reduce-motion/index.ts
export { ToggleReduceMotionButton } from './ui/ToggleReduceMotionButton';
```

---

## 4. Event handlers

**`onX` for props, `handleX` for internal callbacks.**

```ts
// Component that accepts a handler prop — the prop is onX
type Props = { onSave: (value: string) => void };

// Inside the component — internal function that wraps logic is handleX
function handleSave() {
  validate(value);
  onSave(value);
}

return <button onClick={handleSave}>Save</button>;
```

When you pass a store action or a hook-returned function directly (no wrapping logic),
skip `handleX` and wire directly:

```ts
// src/shared/ui/ThemeToggle/ThemeToggle.tsx
const toggleTheme = useThemeStore((state) => state.toggleTheme);
return <button onClick={toggleTheme}>...</button>;  // no wrapper needed
```

**Why `onX` / `handleX`?** `onX` follows React's own DOM event prop convention
(`onClick`, `onChange`), signalling "this is a slot for a callback." `handleX` signals
"this is where the action happens" — distinguishing a response function from a prop.

---

## 5. CSS module class names

**camelCase, single-word where possible.** No BEM, no kebab, no `__`/`--`.

```css
/* src/views/home/ui/HomePage.module.css */
.main { ... }
.top { ... }
.title { ... }
.serverNote { ... }   /* two words only when a single word is genuinely ambiguous */

/* src/features/toggle-reduce-motion/ui/ToggleReduceMotionButton.module.css */
.toggle { ... }
```

Names are local to the module, so short generic names (`.main`, `.toggle`, `.panel`) are
safe even when the same word appears in another module — CSS Modules scope them to the
component automatically.

For full CSS conventions (tokens, theming, dark mode, class composition) see the
`css-modules` skill.

---

## 6. Zustand stores

Two patterns — singleton for client-only state, factory for server-seeded state.

**Singleton** (never seeded from the server):

```ts
// src/shared/lib/themeStore.ts
export const useThemeStore = create<ThemeState>()( ... );
//            ↑ use<Name>Store — the file is <name>Store.ts
```

**Per-request factory** (server-seeded):

```ts
// src/entities/preferences/model/store.ts
export function createAppStore(initialState: AppInitialState) { ... }
export type AppStore = ReturnType<typeof createAppStore>;
//          ↑ create<Name>Store; the type is <Name>Store
```

The Context that holds the factory store: `<Name>StoreContext`
(`src/entities/preferences/model/context.ts`).

The hook that reads it: `use<Name>Store`
(`src/entities/preferences/model/useAppStore.ts`).

**Store action names** (methods on the state type): verb-prefixed camelCase —
`setReduceMotion`, `setHasHydrated`, `toggleTheme`, `setTheme`. Prefix conventions:
`setX` replaces a value; `toggleX` flips a boolean; `resetX` returns to initial.

**Zustand devtools action labels:** `'slice/actionName'` — matches the Redux DevTools
convention so the browser extension can display it sensibly:

```ts
set(newState, false, 'preferences/setReduceMotion');
set(newState, false, 'app/setHasHydrated');
```

For the full store-per-request pattern see the `zustand-5` skill.

---

## 7. Hooks

`use<Name>` prefix, camelCase after the prefix. Filename matches the export.

```ts
// src/entities/preferences/model/useAppStore.ts
export function useAppStore<T>(selector: (state: AppState) => T): T { ... }
```

When a hook lives inside a slice, export it from the slice's `index.ts` — not from a
dedicated hooks barrel.

---

## 8. TypeScript types and constants

| Kind                             | Case                           | Example                                                  |
| -------------------------------- | ------------------------------ | -------------------------------------------------------- |
| `type` / `interface`             | `PascalCase`                   | `AppState`, `Preferences`, `AppInitialState`, `AppStore` |
| `enum` (avoid; use string union) | `PascalCase`                   | —                                                        |
| String constant                  | `SCREAMING_SNAKE_CASE`         | `APP_STORAGE_KEY = 'starter.app'`                        |
| Boolean state field              | `isX` / `hasX` / `canX` prefix | `hasHydrated`, `isLoading`                               |

```ts
// src/entities/preferences/model/store.ts
export const APP_STORAGE_KEY = 'starter.app';
export type Preferences = { reduceMotion: boolean };
export type AppState = { preferences: Preferences; hasHydrated: boolean; ... };
```

**Acronyms in type names:** same rule as components — first letter only:
`HtmlAttributes`, `ApiResponse`, `UrlParams`.

---

## 9. Next.js App Router special files

Next.js requires these filenames — do not rename them.

| File                | Description       |
| ------------------- | ----------------- |
| `app/page.tsx`      | Route entry point |
| `app/layout.tsx`    | Shared shell      |
| `app/loading.tsx`   | Suspense fallback |
| `app/error.tsx`     | Error boundary    |
| `app/not-found.tsx` | 404 handler       |

Every route file is a thin re-export:

```ts
// app/page.tsx
export { HomePage as default } from '@/views/home';
```

**Why default export here only?** Next.js requires a default export from route files.
These files live outside the FSD graph (steiger ignores `app/`) and contain no logic —
they are the one allowed place to bridge `src/app` providers to `src/views` content.

---

## 10. API route handlers

Route files export HTTP method names as **SCREAMING_CASE named exports**. File is always
`route.ts`, located at `app/api/<path>/route.ts`.

```ts
// app/api/health/route.ts
export function GET() { ... }
export function POST() { ... }
export function DELETE() { ... }
```

**Why uppercase?** Next.js matches the export name to the HTTP method verbatim. Using
anything other than the exact uppercase verb (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`,
`HEAD`, `OPTIONS`) will be silently ignored.

---

## 11. Server Actions

Server Actions live in `src/features/<name>/api/` or `src/entities/<name>/api/` and are
named as `verbNoun` camelCase. The file opens with `'use server'`.

```ts
// src/features/update-preferences/api/updatePreferences.ts
'use server';

export async function updatePreferences(prefs: Preferences) { ... }
```

Verb conventions: `get` / `create` / `update` / `delete` / `submit`. The noun matches
the entity being acted on. Plain server helper functions (no `'use server'`) in the same
`api/` folder follow the same pattern — see `getInitialAppState.ts`.

---

## 12. Test files

Tests are **colocated** with the file they test. The test file shares the exact same base
name with `.test` inserted before the extension.

| Source                         | Test                                |
| ------------------------------ | ----------------------------------- |
| `ToggleReduceMotionButton.tsx` | `ToggleReduceMotionButton.test.tsx` |
| `store.ts`                     | `store.test.ts`                     |
| `id.ts`                        | `id.test.ts`                        |

No `__tests__` folder. Tests live next to the code they cover.

---

## Quick-reference cheat sheet

| What you are naming                              | Convention                                          |
| ------------------------------------------------ | --------------------------------------------------- |
| React component (file + export)                  | `PascalCase`                                        |
| Slice folder (`entities/features/widgets/views`) | `kebab-case`                                        |
| `shared/ui/<Component>` folder                   | `PascalCase`                                        |
| `shared/embeds/<embed>` folder                   | `kebab-case`                                        |
| CSS module class                                 | `camelCase`                                         |
| Component props type                             | `type Props = {...}` (file-local, not exported)     |
| Handler prop on a component                      | `onX`                                               |
| Internal callback in a component                 | `handleX`                                           |
| Utility / lib file                               | `camelCase.ts`                                      |
| Store file (singleton)                           | `camelCase.ts`, export `use<Name>Store`             |
| Store file (factory)                             | `camelCase.ts`, export `create<Name>Store`          |
| Store action                                     | `setX` / `toggleX` / `resetX` (camelCase verb)      |
| Zustand devtools label                           | `'slice/actionName'`                                |
| Hook file                                        | `camelCase.ts`, export `use<Name>`                  |
| Type / interface                                 | `PascalCase` (acronyms: `Api`, `Html`, `Url`)       |
| String constant                                  | `SCREAMING_SNAKE_CASE`                              |
| Boolean field                                    | `isX` / `hasX` / `canX` prefix                      |
| Next.js route files                              | `page.tsx`, `layout.tsx`, etc. (framework-mandated) |
| API route handler export                         | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` (uppercase) |
| Server Action                                    | `verbNoun` camelCase, in `features/<name>/api/`     |
| Test file                                        | same base name + `.test` (colocated)                |
| Slice barrel                                     | always `index.ts`                                   |
