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
- `pnpm lint` — ESLint + steiger (FSD boundaries) + `embed:check`
- `pnpm build` — production build
- `pnpm test` — Vitest run

`next lint` is **removed in Next 16** — never run it; lint with `pnpm lint`.

## Definition of done

Work is not complete until `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all pass. Run them yourself and read the output before reporting done — never claim success on unverified work.

# Architecture

Feature-Sliced Design (FSD). Layer cheat sheet, top to bottom (each layer may only import from layers strictly below it; steiger enforces this):

| Layer      | Path            | Holds                                                                                                                   |
| ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `app`      | `src/app/`      | Providers (`AppStoreProvider`), global styles.                                                                          |
| `pages`    | `src/views/`    | One folder per route's content; server-side data loading lives here.                                                    |
| `widgets`  | `src/widgets/`  | Self-sufficient UI blocks composed from features/entities. Server components by default.                                |
| `features` | `src/features/` | User actions. `'use client'` goes here, at the lowest point it's needed.                                                |
| `entities` | `src/entities/` | Business state — stores, types, server-data contracts.                                                                  |
| `shared`   | `src/shared/`   | UI kit, framework-free utilities, and `shared/embeds/`.                                                                 |

Rules:

- Every slice exports its public surface from its own `index.ts`. Nothing outside the slice imports past that file.
- Next's App Router lives at root `app/` (routing only). Every route file is a thin re-export: `export { XPage as default } from '@/views/x'`.
- Third-party widgets go in `src/shared/embeds/` — scaffold with `pnpm embed:add <name>`, never hand-write.

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

# Embeds — HARD RULE, no exceptions

Any third-party widget delivered as a `<script>` + custom element MUST be installed via `pnpm embed:add <name>`. Hand-writing files in `src/shared/embeds/` is forbidden — the lint system will catch it, and it bypasses the `embed.json` contract that `embed:check` enforces.

Steps, always in this order:
1. `pnpm embed:add <name>` — scaffold the folder.
2. Fill in `embed.json` — real URLs, `allowedProps`, `forbiddenProps`.
3. Extend the generated component — add props, error state, any custom logic.

Never skip step 1. Never create the folder by hand. Read the `embeds` skill before starting.

# Skills (`.claude/skills/`)

Read the relevant skill before writing code in its domain.

- `nextjs-16` — App Router, caching, breaking changes vs 14/15.
- `react-19` — hooks, Server Actions, transitions.
- `routing` — pages, dynamic routes, route handlers.
- `server-vs-client` — when to add `'use client'`, streaming.
- `fsd` — FSD layers, where to put any new file, steiger errors.
- `feature-workflow` — end-to-end checklist for a new feature.
- `zustand-5` — store factory, provider pattern, selectors.
- `state-management-guide` — decision tree for state placement.
- `data-fetching` — RSC fetch, `use cache`, Suspense.
- `css-modules` — design tokens, theming, dark mode.
- `forms` — Server Actions, `useActionState`, zod, a11y.
- `loading-and-error` — `loading.tsx`, `error.tsx`, Suspense.
- `image-and-fonts` — `next/image`, `next/font`.
- `embeds` — `pnpm embed:add`, custom element lifecycle, `embed.json`.
- `definition-of-done` — checklist before declaring work complete.
- `env-vars` — `.env.local`, `NEXT_PUBLIC_`, zod validation.
