@AGENTS.md

<!-- BEGIN:plugin-bootstrap -->

# Required Claude Code plugins

This project depends on the plugins enabled in `.claude/settings.json` (`enabledPlugins`). They are **not** bundled in the repo — each clone must install them once.

At the start of a session, **announce which plugins this project uses** (read them from `enabledPlugins` in `.claude/settings.json` and list them by name), then run the bootstrap script:

```bash
node scripts/setup-plugins.mjs
```

These are plugins from the official marketplace, so you don't need to wait for the user's approval before running the script — but never install silently: always list what will be set up first. The script is idempotent (safe to re-run), checks what is already present, and installs only what is missing — no separate `claude plugin list` step is needed.

Report the script's output. If it installed anything, tell the user to **restart Claude Code** so the new plugins load on the next session.
<!-- END:plugin-bootstrap -->

# Commands

This project uses **pnpm**. Real scripts live in `package.json`:

- `pnpm install` — install deps (vendors the Next docs into `node_modules/next/dist/docs/`)
- `pnpm dev` — dev server (Turbopack)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — `eslint .`
- `pnpm build` — production build
- `pnpm test` — Vitest run

`next lint` is **removed in Next 16** — never run it; lint with `pnpm lint`.

## Definition of done

Work is not complete until `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all pass. Run them yourself and read the output before reporting done — never claim success on unverified work.

# Architecture

- `src/app/` — App Router: pages, layouts, `api/*` route handlers, `error`/`loading`/`not-found`. Server Components by default; add `"use client"` only at interaction leaves.
- `src/components/<Name>/` — one component per folder (`.tsx` + `.module.css` + `.test.tsx`).
- `src/lib/` — framework-free helpers (pure functions with unit tests).
- `src/store/` — Zustand 5 stores + `AppStoreProvider` (store-per-request). **Never import a store into a Server Component** — read store state only under the provider, in Client Components.

# First session (fresh clone)

1. Announce the plugins from `enabledPlugins` in `.claude/settings.json`, then run `node scripts/setup-plugins.mjs`.
2. `pnpm install` — the vendored Next docs at `node_modules/next/dist/docs/` exist **only after** this step.
3. Verify the dev server starts: `pnpm dev`.
4. If step 1 installed anything, tell the user to **restart Claude Code**.

# Hygiene

- Never edit anything between the `nextjs-agent-rules` markers in `AGENTS.md` — `next dev` regenerates it.
- Never commit `.env*` files (already gitignored — keep it so).
- Never set `agentRules: false` in `next.config.ts`.
- Never modify `.claude/settings.json` without an explicit user request.

# Skills (`.claude/skills/`)

- `nextjs-16` — Next.js 16 App Router, caching, breaking changes vs 14/15.
- `react-19` — React 19 hooks, refs, Server/Client boundaries, Actions.
- `zustand-5` — Zustand 5 store-per-request with the App Router.
- `css-modules` — CSS Modules with custom-property design tokens and theming.
