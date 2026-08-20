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

# Version history from the first moment

The moment building starts, this project must be a local git repo. If there is no `.git` folder, run `git init` and make a first checkpoint before (or together with) the first code change - do not wait for a deploy, and do not wait to be asked. Before that first checkpoint, verify `.gitignore` covers `.env*` and `node_modules`, and add them if missing. From then on, checkpoint automatically after every verified piece of work, so there is always a version to go back to. This rule is unconditional; the `start-with-a-repo` skill explains the how, and the `sharing-your-work` skill (from the auto_deployment plugin) is the full playbook.

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

For everyday changes: work is not complete until `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all pass. Run them yourself and read the output before reporting done — never claim success on unverified work.

When the app is being sent to Keshet, those four commands are a subordinate step, not the finish line. Work is not done until every required deploy agent has run and approved and the verifier has emitted its sign-off - see "Sending the app to Keshet" below. An agent that could not finish its check reports **not approved**. Fail closed, every time, including when it looks obviously fine.

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

# Sending the app to Keshet

This applies when the project is a Keshet builder app (the `auto_deployment` plugin is installed). When the user says "deploy", "publish", "ship it", "put it live", or "share it with the team", the deploy chain runs - they never have to name an agent. Run the agents in this order. **The order is not a suggestion**: each one depends on the one before it having already changed the code.

```
1. deployment        prepare the app against the build contract, and collect
                     the deployment request (purpose, data sources, audience)
2. secrets-manager   find keys and tokens, take them out of the source, and put
                     them in the app's gitignored .env under declared names
3. auth              make the app pass the end user's own sign-in through to
                     every data source it touches
4. access-manager    make them choose who may open the app. No default
5. app-logging       add the logs, and check they will actually arrive
6. security-review   read the whole result for leaked secrets and mistakes
7. create-repo       agree the app's name with the user and record it
8. verifier          confirm every agent above ran and approved, then - and
                     only then - send it
```

There is no `git push` to Keshet and there is no GitHub. **The deployment service is the only way code reaches Keshet**, it can refuse, and only the verifier may hand work to it. Read the `sharing-your-work` skill (from the plugin) before sending anything, and do not improvise refusal handling.

**Never work out for yourself whether this is the app's first send or a later one.** There is one send, and Keshet decides which it is - this machine cannot know, because a fresh clone has no memory of an earlier deploy. There is also nothing to ask: no name check, no availability lookup. A name that cannot work comes back refused, with nothing created, and the user picks another.

# Hygiene

- Never edit anything between the `nextjs-agent-rules` markers in `AGENTS.md` — `next dev` regenerates it.
- Never commit `.env*` files (already gitignored — keep it so).
- Never set `agentRules: false` in `next.config.ts`.
- Never modify `.claude/settings.json` without an explicit user request.
- Never put a secret in source - not in a config file, not in a comment, not "temporarily". The platform's gate scans for this server-side and will refuse the deploy. Secret values belong in the gitignored `.env` and nowhere else; the app reads them as ordinary environment variables, the same locally and in production. The `secrets-in-your-app` skill is the authority on this.
- Never log a secret, and never put one in an error message. Log that a connection succeeded, not what it connected with.
- Never edit `azure-pipelines.yml` by hand. It is the app's only connection to the platform's security gate; editing it cannot weaken the gate - it can only stop the app deploying at all.
- Never write a `Dockerfile` expecting it to be used. The platform supplies its own and ignores yours by design.
- Never hand-edit the `Requester` or `Local agent sign-off` blocks in `DEPLOY_REQUEST.md`. Both are stamped, and both are re-checked server-side. The `Requester` block is more than a record: it is how Keshet recognises, on every later send, that this app belongs to this user - so editing it can cost them ownership of their own app, not merely fail a check.

# Embeds — HARD RULE, no exceptions

Any third-party widget delivered as a `<script>` + custom element MUST be installed via `pnpm embed:add <name>`. Hand-writing files in `src/shared/embeds/` is forbidden — the lint system will catch it, and it bypasses the `embed.json` contract that `embed:check` enforces.

Steps, always in this order:
1. `pnpm embed:add <name>` — scaffold the folder.
2. Fill in `embed.json` — real URLs, `allowedProps`, `forbiddenProps`.
3. Extend the generated component — add props, error state, any custom logic.

Never skip step 1. Never create the folder by hand. Read the `embeds` skill before starting.

# Skills

The skills below ship in the `starter` and `auto_deployment` plugins (installed by
`node scripts/setup-plugins.mjs` per AGENTS.md). Read the relevant skill before
writing code in its domain.

- `nextjs-16` — App Router, caching, breaking changes vs 14/15.
- `react-19` — hooks, Server Actions, transitions.
- `routing` — pages, dynamic routes, route handlers.
- `fsd` — FSD layers, where to put any new file, steiger errors.
- `feature-workflow` — end-to-end checklist for a new feature.
- `zustand-5` — store factory, provider pattern, selectors.
- `state-management-guide` — decision tree for state placement.
- `css-modules` — design tokens, theming, dark mode.
- `embeds` — `pnpm embed:add`, custom element lifecycle, `embed.json`.
- `definition-of-done` (auto_deployment plugin) - what "done" means before reporting work complete, and before sending to Keshet.
- `env-vars` — `.env.local`, `NEXT_PUBLIC_`, zod validation. For anything secret, the `secrets-in-your-app` skill from the auto_deployment plugin wins.
- `start-with-a-repo` - version history exists from the very first change; fires at the start of building.
- `sharing-your-work` (auto_deployment plugin) - all version control and sending to Keshet, operated on the user's behalf in plain language.
