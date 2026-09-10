---
name: embeds
description: >
  Use this skill whenever the user mentions embeds, third-party widgets, external scripts,
  custom elements, web components, `pnpm embed:add`, `embed:check`, or receives a lint error
  about a hyphenated JSX tag or a `<script>` tag outside `@keshet/embeds`. Also trigger when
  someone asks how to integrate an external player, chat widget, map widget, or any library
  that loads via a `<script>` tag. Never hand-write embed folders — always follow this workflow. V:0.1.2
---

# Embeds

This project loads third-party widgets (chat boxes, video players, maps, etc.) as
[custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) —
HTML tags with hyphens like `<my-chat-widget>` that a vendor's JavaScript file registers in
the browser. The project has a strict scaffolding system for these. **Hand-writing or copying
embed folders breaks lint.** Always use the workflow below.

---

## When to use an embed vs. a React component

Use an embed when a vendor delivers their widget as a JavaScript file you load from a CDN
and the widget renders as a custom element (`<vendor-widget />`). This is common for:
chat widgets, video players, map widgets, support tools, and marketing overlays.

**Do NOT use an embed when:**

- The vendor ships a React package (e.g. `@vendor/react-widget`). Import it directly as a
  regular React component.
- The widget is purely visual and has no external dependency — build it as a native React
  component instead.
- You only need a few lines of the vendor's API (e.g. an analytics call). Use a plain
  `useEffect` in a feature slice.

The rule of thumb: if there is no `<script>` tag involved, there is no embed.

---

## Step 1 — Scaffold a new embed

```bash
pnpm embed:add <name>
```

`<name>` must be lowercase kebab-case with at least one hyphen — that is a requirement of the
Custom Elements spec, not just this project. Good names: `my-chat-widget`, `video-player`,
`analytics-map`. Bad names: `chatwidget`, `VideoPlayer`.

What the command creates inside `src/shared/embeds/<name>/`:

| File          | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `<Name>.tsx`  | React wrapper component you use in your app         |
| `index.ts`    | Public export (`export { <Name> } from './<Name>'`) |
| `<name>.d.ts` | TypeScript declaration so `<name>` works as JSX     |
| `embed.json`  | Manifest — URLs and prop rules (edit this next)     |

It also appends one line to `src/shared/embeds/index.ts` so the component is reachable from
the rest of the app.

---

## Step 2 — Fill in `embed.json`

After scaffolding, open `src/shared/embeds/<name>/embed.json`. It looks like this (the
`demo-embed` example shipped with the template):

```json
{
  "tagName": "demo-embed",
  "urls": {
    "development": "/demo-embed.js",
    "staging": "/demo-embed.js",
    "production": "/demo-embed.js"
  },
  "allowedProps": [],
  "forbiddenProps": [],
  "templateVersion": "1.0.0"
}
```

### What each field means

**`tagName`** — The custom element's HTML tag name, e.g. `"my-chat-widget"`. Must match
what the vendor's script registers. If the vendor says `<my-chat-widget>`, that is the value.

**`urls`** — Where to load the vendor's JavaScript file in each environment. Set each to the
real URL the vendor gave you:

- `development` — used when `NODE_ENV === 'development'` (local dev server)
- `staging` — used on your staging / preview deployment
- `production` — used in live production

If the vendor provides a single CDN URL for all environments, put the same URL in all three.
If you are building a local fake (like the `demo-embed` sample), point all three at a file in
`public/`.

**`allowedProps`** — Props the wrapper is explicitly permitted to pass to the custom element.
Leave empty `[]` if the generated wrapper passes no props. Add prop names here when you
extend the wrapper to accept configuration (see "Passing data" below).

**`forbiddenProps`** — Props the custom element accepts but that your wrapper must never use
(perhaps because they leak user data or conflict with your platform). `embed:check` will fail
the build if any of these appear in the wrapper source.

**`templateVersion`** — Do not edit this. It lets `embed:check` detect when the scaffolding
template has been updated and your embed needs to be regenerated.

---

## Script loading lifecycle

Understanding the lifecycle helps you write correct wrappers and avoid race conditions.

1. **React renders on the server** — Next.js server-renders the page. Custom elements only
   exist in browsers, so the wrapper renders `null` on the server. This is why every wrapper
   must be `'use client'`.

2. **Browser mounts the component** — `useEffect` fires. `loadEmbedScript` injects a
   `<script>` tag into `document.head` (deduped — only one tag per URL, even if multiple
   components mount).

3. **Browser parses and executes the script** — The vendor's JavaScript runs and calls
   `customElements.define('my-widget', MyWidgetClass)`. This upgrades any existing
   `<my-widget>` elements already in the DOM, and any new ones created after.

4. **`loadEmbedScript` resolves** — The promise resolves once the custom element name is
   registered. The wrapper sets `ready = true` and re-renders with the actual element.

5. **Unmount before script loads** — The wrapper's cleanup function sets `cancelled = true`
   so a stale promise does not call `setReady(true)` after unmount. Always keep this pattern.

---

## SSR / hydration considerations

Custom elements are a browser API — they do not exist in Node.js where Next.js renders pages
on the server. Two rules follow from this:

**Every embed wrapper must be `'use client'`.**
The `useEffect` + `useState` pattern in the generated wrapper handles this: it renders
`null` on the server, loads the script in the browser, then swaps in the real element.
Do not attempt to render the custom element tag in a server component — it will either
produce a hydration mismatch or throw.

**The `<name>.d.ts` file extends React's JSX namespace, not the global one.**
React 19 moved JSX types into the `react` module scope. The generated declaration does
`declare module 'react' { namespace JSX { ... } }` — do not change this to a
`declare global { namespace JSX { ... } }` block, which no longer works with this project's
`"jsx": "react-jsx"` tsconfig setting.

---

## Passing data into a custom element

Custom elements receive data the same way regular HTML elements do: **attributes** (strings)
and **child content** (slots). They do not accept React props natively.

### String attributes

Add the prop name to `allowedProps` in `embed.json`, then pass it as a JSX attribute:

```tsx
// embed.json: "allowedProps": ["locale", "theme"]

export function MyChatWidget({ locale, theme }: { locale: string; theme: string }) {
  // ...
  return <my-chat-widget locale={locale} theme={theme} />;
}
```

HTML attributes are always strings. Booleans become `"true"` / `"false"` string values.

### Complex/object data

Attributes cannot carry objects or arrays. Use `JSON.stringify` and let the custom element
parse it on its end. Check the vendor's docs for which attribute name they expect:

```tsx
return <my-chat-widget config={JSON.stringify({ userId, locale })} />;
```

### Slot content (children)

If the vendor supports slots, pass children as normal JSX children:

```tsx
return <my-chat-widget>{children}</my-chat-widget>;
```

### Imperative methods via `ref`

Some custom elements expose methods (e.g. `widget.open()`). Use React 19's `ref` callback
or `useRef` to get a handle on the DOM node, then call the method imperatively:

```tsx
const ref = useRef<HTMLElement>(null);
// later: ref.current?.['open']?.()
return <my-chat-widget ref={ref} />;
```

---

## Error handling when the script fails to load

The generated wrapper renders `null` while loading and shows the element when ready.
It has **no error state by default**. If the vendor's CDN is down or the URL is wrong,
the component silently renders nothing.

Add an error state when your design requires a fallback:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { loadEmbedScript, resolveEmbedUrl } from '@keshet/embeds';
import manifest from './embed.json';

export function MyChatWidget() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const src = resolveEmbedUrl(manifest.urls, process.env.NODE_ENV);

    void loadEmbedScript({ src, tagName: manifest.tagName })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p>Chat is temporarily unavailable.</p>;
  if (!ready) return null; // or a <Skeleton /> placeholder
  return <my-chat-widget />;
}
```

`loadEmbedScript` rejects when the script element fires an `error` event — typically a
404, a network failure, or a CORS block. Log the error to your monitoring service in the
`catch` block if you need visibility.

---

## Step 3 — Use the component

Import the generated component from the `shared/embeds` public API:

```tsx
import { MyChatWidget } from '@/shared/embeds';
```

Use it like any React component:

```tsx
export function SupportSection() {
  return (
    <aside>
      <MyChatWidget />
    </aside>
  );
}
```

The wrapper handles script loading, deduplication, and the custom-element registration
wait. You do not need to think about any of that at the call site.

---

## Why you cannot hand-write embed folders

Two ESLint rules enforce the boundary:

1. **`<script>` tags in app code are forbidden.** The script-loading logic lives only in
   `@keshet/embeds`. Copying it into a slice causes a lint error pointing to this rule.

2. **Hyphenated JSX tags are only allowed inside `src/shared/embeds/`.**
   Writing `<my-chat-widget />` anywhere else in the codebase fails lint. This is the error
   you see when someone tries to use a custom element without scaffolding it properly.

The generated wrapper component is the safe escape hatch — it lives inside
`src/shared/embeds/`, so it can use the hyphenated tag. Everything outside just imports the
wrapper.

---

## Validating embeds (`embed:check`)

```bash
pnpm embed:check
```

This runs automatically as part of `pnpm lint`. It checks every folder under
`src/shared/embeds/` and fails if:

- `index.ts` is missing
- `embed.json` is missing or does not match the schema
- `templateVersion` is out of date (the template has been updated — regenerate the embed)
- A prop listed in `forbiddenProps` actually appears in the wrapper source

Fix the reported issues, then re-run `pnpm lint` to confirm.

---

## Where embeds live in the architecture (FSD)

Embeds live at `src/shared/embeds/` — the `shared` layer of the
[Feature-Sliced Design](https://feature-sliced.design) architecture.

- They are **not** a `widgets` slice. Widgets are your own UI composed from features and
  entities. An embed is a third-party black-box — it has no business logic and knows nothing
  about your app's state.
- The `shared` layer is at the bottom of the FSD graph, so any layer above it
  (`entities`, `features`, `widgets`, `views`) can import from `src/shared/embeds/` freely.
- If an embed were placed in `features` or `widgets`, it would gain an import that violates
  FSD boundaries, and steiger (the FSD linter) would flag it. Embeds belong in `shared`
  because they are infrastructure, not application logic.

---

## Removing the demo embed

The `demo-embed` folder ships with the template to prove the tooling works. Delete it before
starting real work:

1. Delete the folder: `src/shared/embeds/demo-embed/`
2. Remove its line from `src/shared/embeds/index.ts`:
   ```ts
   export { DemoEmbed } from './demo-embed'; // ← delete this line
   ```
3. Run `pnpm lint` to confirm nothing references it elsewhere.

---

## Quick reference

| Task                        | Command                 |
| --------------------------- | ----------------------- |
| Scaffold a new embed        | `pnpm embed:add <name>` |
| Validate all embeds         | `pnpm embed:check`      |
| Validate embeds + full lint | `pnpm lint`             |

| File to edit after scaffolding        | What to change                                   |
| ------------------------------------- | ------------------------------------------------ |
| `src/shared/embeds/<name>/embed.json` | Real `urls`, `allowedProps`, `forbiddenProps`    |
| `src/shared/embeds/<name>/<Name>.tsx` | Add error state, extend to accept and pass props |
