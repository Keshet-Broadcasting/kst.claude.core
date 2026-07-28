---
name: css-modules
description: Use when writing or editing any CSS in this project — component styles, .module.css files, design tokens, theming, or dark mode. This project uses plain CSS Modules with custom-property design tokens; hard-coded values and SCSS patterns are wrong here.
---

# CSS Modules — house conventions

Plain CSS Modules. **No preprocessor** — no Sass/SCSS, no nesting, no `@use`/`@mixin`/`$vars`,
no Tailwind, no CSS-in-JS, no `clsx`. There is no stylelint; Prettier (`prettier.config.mjs`)
formats `*.css` but enforces nothing semantic — these conventions are yours to keep.

## Design tokens (`src/app/globals.css`)

Every token is a CSS custom property on `:root`. **Components must read tokens, never hard-code
colours or spacing.** `README.md` (the design-tokens section) states this directly: "Stylesheets should read these tokens
rather than hard-code colours, so theme switching and future rebranding stay one-file."

Naming scheme: **kebab-case, `--<category>-<role>`**. Three categories exist today:

| Token                     | Light (`:root`) | Dark (`:root[data-theme='dark']`) |
| ------------------------- | --------------- | --------------------------------- |
| `--color-bg`              | `#ffffff`       | `#0d0f14`                         |
| `--color-surface`         | `#f6f7f9`       | `#161a22`                         |
| `--color-text`            | `#12141a`       | `#e8eaee`                         |
| `--color-muted`           | `#5c6270`       | `#9aa1ad`                         |
| `--color-accent`          | `#4f46e5`       | `#8b85f5`                         |
| `--color-accent-contrast` | `#ffffff`       | `#12141a`                         |
| `--color-border`          | `#e3e6eb`       | `#262c38`                         |
| `--color-danger`          | `#dc2626`       | `#f87171`                         |

| Token                     | Value                                           | Notes                                      |
| ------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `--radius`                | `10px`                                          | the only radius; every rounded box uses it |
| `--space-1` … `--space-5` | `4px` `8px` `16px` `24px` `40px`                | the whole spacing scale                    |
| `--font-sans`             | `var(--font-geist-sans), system-ui, sans-serif` | fed by `next/font` in `src/app/layout.tsx` |

Rules that follow from the real files:

- **Spacing** (`padding`, `margin`, `gap`) uses `var(--space-N)` — see every `.module.css`.
  Only exception: raw px for a fixed control size (`ThemeToggle.module.css`, the `width: 36px` rule).
- **Colour** always `var(--color-*)`. There is not one literal hex outside `globals.css`.
- **Adding a token** means adding it to _both_ blocks in `globals.css` — the `:root` light block
  and the `:root[data-theme='dark']` override block. Only colours are overridden in dark; radius,
  spacing and font are theme-independent and live only in `:root`.
- **`font-size` in `rem`**, unitless `line-height`. Real values in use: `2rem`, `1rem`, `0.9375rem`,
  `0.875rem`, `0.8125rem`. There is no `--font-size-*` token scale — sizes are written inline.

## Theming mechanism (get this exactly right)

Dark mode is a **`data-theme` attribute on `<html>`**. Not a class. Not `prefers-color-scheme`
in the CSS — `prefers-color-scheme` is consulted _once_, in JS, only as the first-visit default.

The chain:

1. `src/lib/theme.ts` exports `THEME_INIT_SCRIPT`, injected inline in `<head>` by
   `src/app/layout.tsx`. It runs **before first paint**: reads `localStorage['starter.theme']`
   (the Zustand persist entry), falls back to `matchMedia('(prefers-color-scheme: dark)')`, then
   sets `document.documentElement.dataset.theme`. This is the anti-flash script.
2. `src/store/themeStore.ts` seeds itself _from_ `<html data-theme>` (`readInitialTheme`), and its
   `applyTheme()` writes the attribute back on every `setTheme`/`toggleTheme`.
3. `globals.css` re-declares the colour tokens under `:root[data-theme='dark']`. Nothing else
   needs to know about theming — components just read `var(--color-*)` and follow along.

**Never write `@media (prefers-color-scheme: dark)` in a stylesheet.** It would ignore the user's
explicit toggle. There is zero `@media` in the codebase.

To branch markup on theme inside a module, select the attribute through `:global()` — the only
place `:global` appears (`ThemeToggle.module.css`), and only because `:root` lives outside the module:

```css
.dark {
  display: none;
}

:global(:root[data-theme='dark']) .light {
  display: none;
}

:global(:root[data-theme='dark']) .dark {
  display: inline;
}
```

Why both icons render and CSS picks one: branching the JSX on theme state would reintroduce a
hydration mismatch (`ThemeToggle.tsx`). **Do the same for any theme-dependent visual — swap
it in CSS, not in JSX.**

### The second attribute: `data-reduce-motion`

`PreferenceToggle.tsx` stamps `document.documentElement.dataset.reduceMotion` from the app
store, and `globals.css` (the `data-reduce-motion` block) neutralises motion globally off it:

```css
:root[data-reduce-motion='true'] *,
:root[data-reduce-motion='true'] *::before,
:root[data-reduce-motion='true'] *::after {
  transition-duration: 0.01ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
}
```

So: **document-level state → data attribute on `<html>` → plain CSS attribute selector.** That is
the house idiom for anything global. Don't reach for a class on `<body>`, and don't add a
`prefers-reduced-motion` media query — this project honours a persisted preference instead.

## File & naming conventions

- **Colocation:** `Component/Component.module.css` sits next to `Component/Component.tsx`
  (e.g. `src/components/PatternCard/PatternCard.module.css`). Route styles sit next to the route
  file: `src/app/page.module.css`, `error.module.css`, `loading.module.css`, `not-found.module.css`
  — the stylesheet basename matches the file it styles, lowercase, exactly as Next names the route file.
- **Class names: plain camelCase, single words where possible.** No BEM, no kebab, no `__`/`--`.
  Real names in the repo: `.main`, `.hero`, `.top`, `.title`, `.pitch`, `.card`, `.description`,
  `.file`, `.grid`, `.footer`, `.badges`, `.badge`, `.toggle`, `.light`, `.dark`, and one
  two-word case: `.preferences` / `.preferencesLabel` (`page.module.css`).
- Names are **semantic and local to the component** (`.toggle`, `.card`), never utility-ish
  (`.mt-2`, `.flex`) — scoping means short generic names are safe and `.title` legitimately exists
  in three different modules.
- **Import is always last** in the import block and always default-named `styles`:
  `import styles from './PatternCard.module.css';` (see every component).
- `composes:` is not used anywhere. Duplicate a couple of declarations rather than introducing it.

## Composing classes in TSX

**As of writing, every `className` in this repo is a single `styles.x`** — no `clsx`, no array
`.join(' ')`, no conditional class strings, no inline `style={{...}}`. That is a snapshot of the
current code, not a claim that it can never change; what follows is the _rule_ to apply.

**Rule: prefer an attribute over a class.** Conditional appearance is expressed with an
**ARIA / data attribute the markup already needs**, and CSS selects on it:

```tsx
// PreferenceToggle.tsx — state goes in aria-pressed, not in the class list
<button type="button" className={styles.toggle} aria-pressed={reduceMotion} onClick={...}>
  Reduce motion: {reduceMotion ? 'on' : 'off'}
</button>
```

```css
/* PreferenceToggle.module.css — the "active" style hangs off the same attribute */
.toggle[aria-pressed='true'] {
  color: var(--color-accent-contrast);
  background: var(--color-accent);
  border-color: var(--color-accent);
}
```

Why: the state lives in one place, it stays accessible for free, and the class list never has to
be assembled at render time.

**Fallback — only when no attribute carries the meaning.** Then, and only then, combine classes
with a template literal. Build the list with `.filter(Boolean).join(' ')` so a falsy branch does
not leave a stray space:

```tsx
// Unconditional pair
<div className={`${styles.card} ${styles.featured}`} />

// Conditional — filter out the falsy branch, don't interpolate '' directly
<div className={[styles.card, isFeatured && styles.featured].filter(Boolean).join(' ')} />
```

Do **not** add a `clsx`/`classnames` dependency, and never write inline `style={{...}}`.

## Responsive & accessibility patterns

- **No media queries exist.** Responsiveness is intrinsic: the `.grid` rule in `page.module.css` uses
  `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, `StackBadges` uses
  `flex-wrap: wrap`, `.main` uses `max-width: 880px; margin: 0 auto`. Solve layout with
  auto-fill/minmax, wrap, `max-width` + auto margins before adding the project's first `@media`.
- **Motion:** transitions are short and explicit, listing properties (never `transition: all`):
  ```css
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
  ```
  (`PreferenceToggle.module.css`.) They are globally defeated by `data-reduce-motion` — you
  get that for free, so don't hand-roll a motion guard.
- **Focus:** there are **no** `:focus`/`:focus-visible` overrides — the browser default ring is
  intentionally left intact. Do not `outline: none`. If you must restyle focus, use
  `:focus-visible` and `var(--color-accent)`, and never remove the indicator.
- Interactive affordance is `:hover { border-color: var(--color-accent); }` on both toggles.
- Lists that are visual (`.grid`, `.badges`) keep `<ul>/<li>` semantics and strip them in CSS with
  `padding: 0; margin: 0; list-style: none;`.

## Next 16 global-CSS rules

From `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` (the vendored docs exist only
**after `pnpm install`** — a freshly scaffolded app has no `node_modules` yet):

- `globals.css` is imported exactly once, in the root layout (`src/app/layout.tsx`, the
  `import './globals.css';` line). **Keep it that way.** Next permits a global import from any file in
  `app/`, but its own docs warn stylesheets are not removed on navigation, so extra global imports
  can conflict. Global CSS = tokens + `body`/reset + document-level attribute rules. Nothing else.
- Any other stylesheet must be `*.module.css`. A non-module `.css` import in a component is wrong here.
- **CSS order follows import order**, and the CSS import goes _last_ in each file — so a component's
  own module always wins over the modules of components it imports.
- Turbopack compiles the modules; no PostCSS config exists and none is needed. (Turbopack is the
  **default** in Next 16 — the `--turbopack` flag still in `package.json` is redundant. See the
  `nextjs-16` skill.)

## Common mistakes

1. Writing SCSS: nesting, `&:hover`, `$variables`, `@mixin`. **None of it compiles here.** Write
   flat selectors and repeat the class name (`.toggle:hover { ... }`).
2. Hard-coding `#fff`, `16px`, `8px`, `border-radius: 10px`. Use `var(--color-bg)`,
   `var(--space-3)`, `var(--space-2)`, `var(--radius)`.
3. Adding a dark-mode colour with `@media (prefers-color-scheme: dark)` — breaks the toggle.
   Add it to the `:root[data-theme='dark']` block in `globals.css` instead.
4. Adding a colour to `:root` and forgetting the dark override (invisible text in dark mode).
5. Introducing `clsx`/`classnames`, or `style={{ }}` inline. Neither exists in this repo.
6. Toggling a class from React for something CSS can read off an existing `aria-*`/`data-*`
   attribute — and, for theme-dependent markup specifically, branching JSX at all (hydration mismatch).
7. `outline: none` on a focus state.
8. A stray `.css` (non-module) import outside `layout.tsx`.
