---
name: image-and-fonts
description: >
  Use this skill whenever the user asks about images or fonts — adding an image,
  displaying a photo, showing a logo, using a raw <img> tag, fixing layout shift
  (CLS), loading a Google font, loading a local font, swapping a font, using a
  <link> to load a font, or any time you see <img> or a <link rel="stylesheet">
  pointing to fonts.googleapis.com in the codebase. Also use it when the user
  reports that images are blurry, slow to load, or cause a page jump. Covers
  next/image and next/font — the only correct way to handle these in this project.
  Also triggers for SVG icons, dark mode images, and image format questions.
---

# Images and Fonts in Next.js

This project uses Next.js 16. Using a plain `<img>` tag or a `<link>` to load a
Google font are both wrong here — they cause layout shift, slower loads, and
console warnings. This skill explains the right approach with code you can copy
directly.

If the vendored docs are present after `pnpm install`, the authoritative reference
is `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
and `.../02-components/font.md`. What follows is a practical summary for this
project.

---

## Section 1 — Images (`next/image`)

### Why not a plain `<img>`?

A raw `<img>` tag:

- Does **not** lazy-load — the browser fetches every image on page load.
- Has no size optimization — a 4 MB PNG ships as-is to mobile users.
- Has no reserved space — the browser doesn't know the image's size before it
  loads, so text jumps down when the image arrives. This is **CLS** (Cumulative
  Layout Shift) — it hurts Core Web Vitals and user experience.
- Ships the original format — no automatic WebP or AVIF conversion.

`next/image` fixes all four automatically.

### Automatic format conversion (WebP / AVIF)

You do not need to convert images yourself. `next/image` automatically serves
the best format the visitor's browser supports:

- AVIF — best compression, supported by modern Chrome/Firefox
- WebP — smaller than JPEG/PNG, supported by all modern browsers
- Original — fallback for older browsers

This happens transparently — you upload a `.jpg` or `.png` and the right format
is served automatically.

### Basic usage — when you know the exact size

Use this when the image is a fixed size or lives in the `public/` folder:

```tsx
import Image from 'next/image';

// Explicit width/height tells the browser exactly how much space to reserve.
// No layout shift happens.
<Image src="/logo.png" alt="Company logo" width={200} height={80} />;
```

`width` and `height` are in CSS pixels (logical pixels, not the physical 2× or 3×
pixels on a retina screen — Next handles the scaling automatically).

The `alt` prop is **required**. Use a meaningful description for informative
images; use `alt=""` for purely decorative ones (so screen readers skip them).

### Fill mode — when the parent container sets the size

Use `fill` when the image should cover its container and you don't know the image's
intrinsic dimensions ahead of time (e.g., a user-uploaded photo, a hero banner that
spans the full screen width):

```tsx
import Image from 'next/image';

// The parent must have position: relative (or absolute/fixed) and a defined size.
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <Image src="/hero.jpg" alt="Hero image" fill sizes="100vw" style={{ objectFit: 'cover' }} />
</div>;
```

Key points for `fill`:

- The **parent element must have `position: relative`** (or `absolute`/`fixed`).
  If it doesn't, the image is invisible.
- Always provide a `sizes` prop — see the next section.

### The `sizes` prop — responsive images

`sizes` tells the browser what fraction of the screen the image occupies at each
breakpoint so it downloads the right-sized file. Without it, the browser downloads
the largest variant always.

```tsx
// Full-width image (hero, full-bleed banner)
sizes = '100vw';

// Half the screen width on desktop, full width on mobile
sizes = '(max-width: 768px) 100vw, 50vw';

// Three-column grid on desktop, two on tablet, one on mobile
sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

// Fixed pixel size regardless of viewport (thumbnail, avatar, logo)
sizes = '200px';
```

The rule: **describe what the image actually looks like on screen**, not how your
CSS works. The browser figures out which file to fetch.

### The `priority` prop — only for the LCP image

The browser lazy-loads images by default (it waits until they are near the viewport
before fetching). That is the right default for everything **except** the one image
that is the largest visible thing on first load — the "LCP element" (Largest
Contentful Paint). If that image lazy-loads, your performance score tanks.

```tsx
// Add priority ONLY to the image that is the largest visible thing
// above the fold. Usually that is a hero image or a page banner.
<Image
  src="/hero.jpg"
  alt="Hero banner"
  fill
  sizes="100vw"
  priority // tells Next to preload this one
  style={{ objectFit: 'cover' }}
/>
```

A page should have **at most one** `priority` image. Do not add it defensively to
every image — that defeats the purpose.

### Progressive loading — blur placeholder

Instead of an empty space while an image loads, you can show a blurred preview.
This is especially good for above-the-fold photos.

**Static import (recommended)** — Next auto-generates the blur thumbnail:

```tsx
import Image from 'next/image';
import heroImage from '@/public/hero.jpg';

<Image
  src={heroImage}
  alt="Hero"
  fill
  sizes="100vw"
  placeholder="blur" // blurDataURL is generated automatically from the import
  priority
  style={{ objectFit: 'cover' }}
/>;
```

**Remote URL** — you must provide a `blurDataURL` yourself (a tiny base64 data URI):

```tsx
<Image
  src="https://cdn.example.com/hero.jpg"
  alt="Hero"
  fill
  sizes="100vw"
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgAB..." // generate with sqip or sharp
  style={{ objectFit: 'cover' }}
/>
```

### SVG handling

SVGs are special — how you use them depends on what you need:

**Display as a static image** (logo, illustration — no CSS styling of internals):

```tsx
import Image from 'next/image';

<Image src="/logo.svg" alt="Company logo" width={120} height={40} />;
```

**Icon you need to style with CSS** (color, stroke, size via CSS):
Import the SVG as a React component. This project uses `@svgr/webpack` — add it
to `next.config.ts` if not already there:

```tsx
// After configuring SVGR, import like this:
import LogoIcon from '@/public/logo.svg';

<LogoIcon className={styles.icon} aria-label="Company logo" />;
```

Or inline the SVG directly for one-off icons:

```tsx
<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2L2 7l10 5 10-5-10-5z" />
</svg>
```

Use `aria-hidden="true"` on decorative SVG icons; use `aria-label` on meaningful ones.

**Do NOT** use a plain `<img src="icon.svg">` for icons you need to change color on
hover — it renders as a black box and ignores CSS `color` / `fill` changes.

### Remote images

If the `src` is a URL on an external host (not your own `/public`), you must
declare the host in `next.config.ts`:

```ts
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};
```

`images.domains` is deprecated in Next 16 — use `remotePatterns`.

You can also restrict to a specific path prefix:

```ts
{
  protocol: 'https',
  hostname: 'cdn.example.com',
  pathname: '/images/**',
}
```

### Dark mode images

When you need a different image for dark mode (e.g., a logo that is dark on light
background and light on dark background), use CSS to show/hide:

```tsx
// Two <Image> components, one for each theme
import Image from 'next/image';
import styles from './Logo.module.css';

<>
  <Image className={styles.logoLight} src="/logo-dark.svg" alt="Logo" width={120} height={40} />
  <Image className={styles.logoDark} src="/logo-light.svg" alt="Logo" width={120} height={40} />
</>;
```

```css
/* Logo.module.css */
.logoDark {
  display: none;
}

@media (prefers-color-scheme: dark) {
  .logoLight {
    display: none;
  }
  .logoDark {
    display: block;
  }
}
```

If the app supports a manual theme toggle (e.g., via a `data-theme` attribute),
add overrides for that too:

```css
:root[data-theme='dark'] .logoLight {
  display: none;
}
:root[data-theme='dark'] .logoDark {
  display: block;
}
:root[data-theme='light'] .logoDark {
  display: none;
}
:root[data-theme='light'] .logoLight {
  display: block;
}
```

### Quick decision guide

| Situation                                | Use                                         |
| ---------------------------------------- | ------------------------------------------- |
| Image in `public/`, fixed CSS size       | `width` + `height` props                    |
| Image must fill its container            | `fill` + `sizes`                            |
| Unknown/dynamic image dimensions         | `fill` + `sizes`                            |
| Largest above-the-fold image             | add `priority`                              |
| Show a blur while loading                | `placeholder="blur"` (static import = auto) |
| Image from external CDN                  | `remotePatterns` in `next.config.ts`        |
| SVG logo / illustration (no CSS styling) | `<Image src="*.svg">`                       |
| SVG icon that needs color from CSS       | inline SVG or SVGR import                   |
| Different image for dark mode            | two `<Image>` components + CSS hide/show    |

---

## Section 2 — Fonts (`next/font`)

### Why not `<link>` to Google Fonts?

A `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` tag:

- Requires an extra network round-trip to Google's servers before any text renders.
  This causes **FOUT** (Flash of Unstyled Text) — text shows in the fallback font,
  then jumps to the real font.
- The request happens at runtime in the browser, which adds to CLS.
- Sends the visitor's IP to Google (a privacy consideration).

`next/font` downloads the font files at **build time**, inlines them, and ensures
zero layout shift.

### Loading a Google font

The pattern this project already uses (look at `app/layout.tsx`):

```tsx
// app/layout.tsx
import { Geist } from 'next/font/google';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
```

What is happening here:

1. `Geist(...)` downloads the font at build time and generates a CSS variable name.
2. `geist.variable` is a short auto-generated class name that sets that CSS custom
   property on the element.
3. Placing it on `<body>` makes the variable available everywhere in the app.
4. In CSS Modules (or `globals.css`), reference it as `font-family: var(--font-geist-sans)`.

**Specifying weights and styles** — if the font has multiple weights, list only what
you use (each weight is a separate download):

```tsx
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '700'], // regular, medium, bold
  style: ['normal', 'italic'], // omit italic if you don't use it
});
```

**Subsetting** — always specify the minimum subset you need. `'latin'` covers
Western European languages. Add `'latin-ext'` for Central/Eastern European characters,
`'cyrillic'` for Russian, etc. Fewer subsets = smaller download.

To add a second Google font, follow the same pattern:

```tsx
import { Geist, Inter } from 'next/font/google';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['400', '700'] });

// In layout.tsx body:
<body className={`${geist.variable} ${inter.variable}`}>
```

Both CSS variables are now available throughout the app.

### Loading a local font file

For a custom font that lives in the repo (e.g., a brand font in `public/fonts/`):

```tsx
import localFont from 'next/font/local';

const brandFont = localFont({
  src: '../public/fonts/BrandFont-Regular.woff2',
  variable: '--font-brand',
});
```

Multiple weights from separate files:

```tsx
const brandFont = localFont({
  src: [
    { path: '../public/fonts/BrandFont-Regular.woff2', weight: '400' },
    { path: '../public/fonts/BrandFont-Bold.woff2', weight: '700' },
  ],
  variable: '--font-brand',
});
```

Then apply `brandFont.variable` to `<body>` in `app/layout.tsx`, exactly like the
Google font example above.

### Font display strategies

By default, `next/font` uses `font-display: swap` — text renders immediately in the
fallback font and swaps to the real font when it loads. This avoids invisible text
but may cause a brief visual jump.

You can override it with the `display` option:

```tsx
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap', // default — use fallback immediately, swap when ready
  // display: 'block',   // hide text briefly (≤3s) until font loads — avoids jump
  // display: 'optional',// use fallback if font isn't cached; no swap after that
});
```

When to use each:

- `swap` (default) — good for body text; user sees something immediately.
- `block` — use for icon fonts or cases where the fallback looks completely wrong
  and a brief invisible period is better than showing wrong characters.
- `optional` — best Core Web Vitals score; font only appears if already in cache.
  Good for fonts that are "nice to have" but not critical to the design.

### The CSS variable pattern explained

`next/font` does not inject styles globally. It returns a class that sets CSS
custom properties. You then use those properties in your styles:

```css
/* src/app/globals.css or any CSS Module */
body {
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

.heading {
  font-family: var(--font-brand), serif;
}
```

The variable is only available inside elements that have the class from
`font.variable` somewhere in their ancestor chain. Since the project puts it on
`<body>`, every element in the app can use it.

### What NOT to do

```tsx
// WRONG — loads font at runtime, causes FOUT and privacy issues
<head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />
</head>

// WRONG — uses className instead of variable, locks the font to a single hardcoded
// element and prevents reuse via CSS custom property
const inter = Inter({ className: 'my-inter' }); // avoid

// WRONG — loading the same font twice in different components; font loaders must
// run at module scope outside a component, and each unique set of options is one
// call, not one per component
function MyComponent() {
  const inter = Inter({ ... }); // WRONG — moves the call inside a component
}
```

### Quick reference

```tsx
// app/layout.tsx — full pattern
import { Geist } from 'next/font/google'; // Google font
import localFont from 'next/font/local'; // Local font

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

const brand = localFont({
  src: '../public/fonts/Brand.woff2',
  variable: '--font-brand',
  display: 'swap',
});

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${brand.variable}`}>{children}</body>
    </html>
  );
}
```

```css
/* Use anywhere in your CSS after that */
.something {
  font-family: var(--font-geist-sans), sans-serif;
}
```
