---
name: css-modules
description: Use when writing or editing ANY CSS in this project — new component styles, .module.css files, design tokens, theming, dark mode, responsive layout, animations, or when the user asks "how should this look". Also use when deciding whether to use media queries, container queries, or intrinsic layout. This project uses plain CSS Modules with CSS custom-property design tokens; hard-coded values, SCSS patterns, and Tailwind are wrong here.
version: 1.0.0
---

# CSS Modules — house conventions

Plain CSS Modules. **No preprocessor** — no Sass/SCSS, no `@use`/`@mixin`/`$vars`, no Tailwind,
no CSS-in-JS, no `clsx`. There is no stylelint; Prettier formats `*.css` but enforces nothing
semantic — these conventions are yours to keep.

**Native CSS nesting** (`& .child`, `&:hover`) IS valid in modern browsers and compiles fine
under Turbopack. However, this codebase uses flat selectors throughout, and that is the house
style. Keep it flat: write `.toggle:hover { }` not `& { &:hover { } }`. The reason is
readability — flat selectors are grep-friendly and match what every existing module looks like.
Do not confuse "no nesting" (house rule) with "the preprocessor can't do it" (untrue).

---

## Design tokens (`src/app/globals.css`)

Every token is a CSS custom property on `:root`. **Components must read tokens, never hard-code
colours or spacing.** Tokens make theme switching and future rebranding a single-file change.

**Naming scheme: `--<category>-<role>`, kebab-case.**

### Colour tokens

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

Only colours change per theme. Every colour token must appear in **both** `:root` blocks — if
you add one and forget the dark override, text becomes invisible or backgrounds clash in dark mode.

### Spacing, radius, and typography tokens

| Token                     | Value                                           | Notes                                      |
| ------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `--radius`                | `10px`                                          | the only radius; every rounded box uses it |
| `--space-1` … `--space-5` | `4px` `8px` `16px` `24px` `40px`                | the whole spacing scale                    |
| `--font-sans`             | `var(--font-geist-sans), system-ui, sans-serif` | fed by `next/font` in `app/layout.tsx`     |

These are theme-independent and live only in the main `:root` block. Do not duplicate them in the
dark block.

**`font-size` in `rem`, unitless `line-height`.** Values in use across the codebase:
`2rem` (page heading), `1rem` (body/button), `0.9375rem`, `0.875rem` (labels, small text),
`0.8125rem`. There is no `--font-size-*` token scale — sizes are written inline as `rem`.

**The one raw-px exception:** `ThemeToggle.module.css` uses `width: 36px; height: 36px` for a
fixed icon button where the value is a control size, not a spacing step. That is acceptable when
a value is a physical constraint rather than layout rhythm.

---

## Theming mechanism (get this exactly right)

Dark mode is a **`data-theme` attribute on `<html>`**. Not a CSS class. Not a media query.
`prefers-color-scheme` is consulted exactly once — in JS — only as the first-visit default.

### The chain

1. `src/shared/lib/theme.ts` exports `THEME_INIT_SCRIPT`, injected inline `<head>` by
   `app/layout.tsx`. Runs **before first paint**: reads `localStorage['starter.theme']`
   (the Zustand persist key), falls back to `matchMedia('(prefers-color-scheme: dark)')`, then
   sets `document.documentElement.dataset.theme`. This prevents the flash-of-wrong-theme.
2. `src/shared/lib/themeStore.ts` seeds itself from `<html data-theme>` via `readInitialTheme`,
   and its `applyTheme()` writes the attribute back on every `setTheme`/`toggleTheme`.
3. `globals.css` re-declares the colour tokens under `:root[data-theme='dark']`. Components read
   `var(--color-*)` and follow automatically — no component needs to know about theming.

**Never write `@media (prefers-color-scheme: dark)` in a stylesheet.** It would ignore the
user's explicit toggle. There is zero `@media (prefers-color-scheme)` in the codebase.

### Theme-dependent visuals — CSS, not JSX

Branching JSX on theme state causes a hydration mismatch (server and client render different
HTML). Render both variants and let CSS hide one instead. Use `:global()` to reach the document
attribute from inside a module — the only valid use of `:global` in this project:

```css
/* ThemeToggle.module.css */
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

Apply this same pattern for any component that must show different content per theme.

---

## `data-reduce-motion` — persisted accessibility preference

`ToggleReduceMotionButton.tsx` stamps `document.documentElement.dataset.reduceMotion` and
`globals.css` neutralises motion globally:

```css
:root[data-reduce-motion='true'] *,
:root[data-reduce-motion='true'] *::before,
:root[data-reduce-motion='true'] *::after {
  transition-duration: 0.01ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
}
```

**You get this for free** on every `transition` or `@keyframes` animation you add — no per-component
motion guard needed. Do not add a `prefers-reduced-motion` media query; the project honours a
persisted preference instead.

---

## Animations and transitions

### Transitions

List properties explicitly — never `transition: all` (it re-computes every property on every
frame and causes jank on paint-expensive properties):

```css
.toggle {
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
```

Short durations (100–200ms) suit interactive controls. Reserve 300–500ms for larger reveals.

### Keyframe animations

Write `@keyframes` in the same module file that uses them. CSS Modules scopes them locally,
so generic names like `fadeIn` will not collide across files:

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip {
  animation: fadeIn 0.15s ease forwards;
}
```

Use `animation-fill-mode: forwards` when the final keyframe state must persist after the
animation ends. Avoid `will-change` unless you have a measured compositing problem — it is not
a performance default.

Both transitions and keyframes are automatically neutralised by `data-reduce-motion='true'`,
so never add a separate motion guard.

---

## File and naming conventions

- **Colocation:** `Component/Component.module.css` next to `Component/Component.tsx`.
  Route styles sit next to the route file in root `app/`: `error.module.css`,
  `loading.module.css`, `not-found.module.css` — basename matches the Next route filename.
- **Class names: camelCase, single words where possible.** No BEM, no kebab, no `__`/`--`.
  Real names in the repo: `.main`, `.top`, `.title`, `.toggle`, `.light`, `.dark`, `.panel`,
  `.label`, `.loading`. Two-word example: `.serverNote` (`views/home/ui/HomePage.module.css`).
  Names are semantic and local to the component — scoping makes short generic names safe.
- **Import is always last** in the import block and always named `styles`:
  `import styles from './Component.module.css';`
- **`composes:` is not used.** Duplicate a couple of declarations rather than introducing it.
  Cross-module `composes: ... from` causes implicit load-order dependencies that are invisible
  at the call site — avoid it entirely.

---

## Composing classes in TSX

**Prefer an attribute over a conditional class.** Express state through an ARIA or data
attribute the markup already carries, then select on it in CSS:

```tsx
// state lives in aria-pressed — no class toggling needed
<button type="button" className={styles.toggle} aria-pressed={reduceMotion} onClick={...}>
  Reduce motion: {reduceMotion ? 'on' : 'off'}
</button>
```

```css
/* CSS reads the same attribute — state and style in two places, not three */
.toggle[aria-pressed='true'] {
  color: var(--color-accent-contrast);
  background: var(--color-accent);
  border-color: var(--color-accent);
}
```

**Use `:is()` to group related selectors** without repeating the full rule:

```css
/* instead of two rules */
.button:hover,
.button:focus-visible {
  border-color: var(--color-accent);
}

/* write one */
.button:is(:hover, :focus-visible) {
  border-color: var(--color-accent);
}
```

**Use `:has()` for state-driven parent styling** — avoid JS-toggled wrapper classes:

```css
/* parent changes appearance when its child input is focused */
.field:has(input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

**Fallback: multiple classes.** Only combine class names when no attribute carries the meaning:

```tsx
// unconditional pair
<div className={`${styles.card} ${styles.featured}`} />

// conditional — filter out the falsy branch, never interpolate '' directly
<div className={[styles.card, isFeatured && styles.featured].filter(Boolean).join(' ')} />
```

Do **not** add `clsx`/`classnames` as a dependency. Do not write `style={{ }}` inline.

---

## Responsive and layout patterns

**Decision order — use the first option that solves it:**

1. **Intrinsic layout first.** `display: flex`, `max-width`, `gap`, `align-items` — no breakpoint
   needed when the element simply grows or wraps. `HomePage.module.css` and
   `PreferencesPanel.module.css` are fully responsive this way.
2. **Container queries** — when a component must adapt to its _container_ width (e.g. a card
   that appears in both a narrow sidebar and a wide main column). Modern browsers and Turbopack
   support `@container` natively:
   ```css
   .wrapper {
     container-type: inline-size;
   }

   @container (min-width: 480px) {
     .card {
       flex-direction: row;
     }
   }
   ```
   Prefer container queries over media queries for component-level breakpoints — they compose
   better and don't depend on viewport width assumptions.
3. **Media queries** — only for layout decisions that genuinely depend on viewport dimensions
   (full-page grid changes, showing/hiding navigation at a viewport threshold). Add a comment
   explaining why container queries were not sufficient.

**No `@media` rules exist in the current codebase.** Add the first one only when intrinsic
layout and container queries genuinely cannot solve the problem.

---

## Focus and accessibility

The browser default focus ring is intentionally preserved — there are no `:focus` overrides.

Rules:

- **Never `outline: none` on an interactive element.** This hides the ring for keyboard users.
- If you must restyle focus, use `:focus-visible` (not `:focus`) and `var(--color-accent)`:
  ```css
  .button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  ```
- `:focus-visible` fires only when the browser decides focus came from keyboard — mouse clicks
  do not trigger it, so sighted mouse users don't see the ring.

---

## `@layer` — leave it out of modules

`globals.css` does not use `@layer`. CSS Modules do not use `@layer`. Do not add it.

Why it matters: once you declare an `@layer` in `globals.css`, all un-layered rules (everything
in every `.module.css`) implicitly sit above every layered rule, which can produce hard-to-debug
specificity surprises. The current approach — controlling order through import order — is simple
and correct. Do not introduce layers unless a concrete specificity conflict has been diagnosed and
this is the agreed fix.

---

## Next 16 global-CSS rules

From `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` (exists only after
`pnpm install`):

- `globals.css` is imported exactly once — in `app/layout.tsx`. Keep it that way. Global CSS
  means: design tokens, `body`/reset, document-level attribute rules. Nothing else.
- Every other stylesheet must be `*.module.css`. A non-module `.css` import in a component is
  wrong here.
- **CSS order follows import order.** The CSS import goes _last_ in each file — so a component's
  own module always wins over any module it imports.
- Turbopack compiles the modules; no PostCSS config exists. The `--turbopack` flag in
  `package.json` is redundant (Turbopack is default in Next 16), but harmless.

---

## Adding a token — checklist

1. Add it to `:root { ... }` in `globals.css` with the light-mode value.
2. If it is a colour: add the dark-mode value to `:root[data-theme='dark'] { ... }` in the same
   file. If you skip step 2, dark mode will inherit the light value and probably look wrong.
3. Non-colour tokens (spacing, radius, font) go in `:root` only — do not duplicate them in the
   dark block.
4. Name it `--<category>-<role>`, kebab-case.

---

## Common mistakes

1. **SCSS syntax** — nesting with `&`, `$variables`, `@mixin`, `@include`. None of it compiles.
   Write flat selectors: `.toggle:hover { }` not `& { &:hover { } }`.
2. **Hard-coded values** — `#fff`, `16px` spacing, `border-radius: 10px`, `8px` gap.
   Use `var(--color-bg)`, `var(--space-3)`, `var(--radius)`, `var(--space-2)`.
3. **Dark mode with `@media (prefers-color-scheme: dark)`** — breaks the toggle. Add to the
   `:root[data-theme='dark']` block in `globals.css`.
4. **New colour token without the dark override** — invisible text or wrong background in dark mode.
5. **`clsx` / `classnames` dependency** or **`style={{ }}`** inline — neither exists in this repo.
6. **Toggling a class from React** for state that CSS can already read from an existing
   `aria-*` or `data-*` attribute. More critically: **branching JSX on theme** causes a hydration
   mismatch — use the `:global(:root[data-theme='dark'])` pattern instead.
7. **`outline: none`** on a focus state. Never remove the focus indicator.
8. **A bare `.css` import** (non-module) outside `app/layout.tsx`.
9. **`transition: all`** — lists every property, including paint-expensive ones. Always list
   specific properties.
10. **Adding `@layer` to a module file** — breaks the cascade ordering guarantees.
