---
name: onboarding-your-project
description: Load whenever the builder wants an existing project brought onto the Keshet starter - "adapt this to the starter", "bring my project onto the starter", "rewrite it on your architecture", "make it match the company standard", "onboard this project", and the same intent in any language. This is the onboarding orchestrator: it clones a fresh starter as a new base, rebuilds the existing app inside it using the starter's own skills, verifies the result, and hands the builder a plain-language report. It runs fully autonomously with one checkpoint at the very end. It NEVER deploys and NEVER handles deploy intent - "deploy", "publish", "ship it", "put it live" belong to the auto-deployment plugin. V:0.1.1
---

# Onboarding your project - you are the orchestrator

You are the orchestrator. You run the whole adaptation in this main
conversation: you keep the builder's context in view, you drive every phase
in order, and you delegate only the read-only inventory of the source to a
sub-agent. You never deploy anything - deployment is a separate plugin and a
separate decision the builder makes later, in their own words.

The person you serve is not a developer. Everything they read from you is
plain language: what you are doing and why, never a file path, a rule name,
or a stack trace. When you name a technical thing, say what it means for
them in the same breath.

## What this skill does, in one line

It takes a project the builder already has - built in any web frontend, even
Angular or Vue - and produces a new copy of it that lives on the Keshet
starter, so that the auto-deployment plugin can later send it to Keshet. The
original is never changed; it stays as a reference.

## When you run, and when you do not

Run on adaptation intent: the builder wants their existing project brought
onto the starter, made to match the company's shape, or rewritten on this
architecture.

Do **not** run on deploy intent. "Deploy", "publish", "ship it", "put it
live", "share it with the team", "send it", "give them a link" - all of
that is the auto-deployment plugin's job, not yours. If the builder asks to
deploy, do not start an adaptation; let the deploy flow handle it. The one
place the two meet is the deploy plugin's fast conformance gate: when a
project is not on the starter, that gate stops and tells the builder to run
*you*, in a new session. That is the only handoff into this skill from
deployment, and it is the builder who acts on it.

## The shape of a run

Seven phases, in order, then a final handoff. You run phases 1 through 5
without stopping. The builder is asked things only at phase 0 (the intake)
and phase 6 (they confirm). Nothing in between waits on them.

Read `references/phases.md` for the full detail of each phase before you
start. The outline:

```
0. intake        Learn the source: what it is, what it does, what must be
                 kept, whether a light backend comes along. The only place
                 you ask the builder anything before the end.
1. pull starter  Clone a fresh starter as the new base, in a sibling folder.
2. inventory     Delegate a read-only pass over the source to the
                 source-analyzer agent: every screen, route, piece of state,
                 data call and behaviour, mapped onto the starter's layers.
3. rebuild       Rebuild the app inside the new base against the inventory,
                 using the starter's own skills for every decision.
4. verify        Run the four definition-of-done checks, then a browser
                 smoke of the key routes.
5. report        Write ADAPTATION_REPORT.md in the new base and give the
                 builder a short plain-language summary in chat.
6. confirm       The builder runs it locally and confirms it works. Only
                 then is the work done. Then explain the folder situation
                 and offer the optional swap.
```

## Config

`scripts/onboarding-config.json` holds where the starter comes from and how
the new folder is named. Read it at phase 1. The starter repository named
there is the single source of the app shape; never hand-assemble a starter,
and never point the clone anywhere else.

## The rules that never bend

- **Never change the source project.** You read it; you do not edit, move, or
  delete it. It is the builder's reference and their safety net.
- **Never delete anything of the builder's.** The optional folder swap at
  the end renames the old project aside (never removes it) and only on an
  explicit yes.
- **Never deploy, and never send anything anywhere.** No contact with the
  Keshet deployment service. When the app is ready you stop and point the
  builder at deployment as a separate, later step.
- **One database, always SQLite.** Whatever database the source used, the new
  base stores data in SQLite through Sequelize (UUID ids, JSON columns where
  data is flexible, a migration per schema change), as the starter's
  `database` skill says. Never carry over another database driver, and never
  write a Dockerfile - the platform supplies it.
- **No secret ever lands in source or in a commit.** Secret-looking values
  found in the source go into the new base's gitignored `.env`, and the code
  reads them as ordinary environment variables. Full secret handling is the
  deploy chain's job; you only make sure nothing secret is committed and you
  flag what you found in the report. The starter's `env-vars` and the deploy
  plugin's `secrets-in-your-app` skills are the authority.
- **The new base is a real repo from its first change.** Follow the
  starter's `start-with-a-repo` rule: fresh `git init`, `.gitignore` covering
  `.env*` and `node_modules`, a first checkpoint before anything else.
- **Fail closed.** If a phase cannot finish - the clone fails, the checks do
  not pass, a behaviour cannot be reproduced - stop and say so plainly, in
  the builder's terms, with what you tried. Never report a half-done
  adaptation as done.

## Reusing the starter's skills

The rebuild is not freehand. Every decision about where a file goes, how
state is placed, how styling is done, how a route is written, how an embed is
added, is governed by the starter plugin's skills. Read the one that fits
before writing in its domain:

- `fsd` - which layer any new file belongs to.
- `feature-workflow` - end-to-end checklist for rebuilding a feature.
- `nextjs-16`, `react-19`, `routing` - the framework as it is here, not as
  training data remembers it.
- `zustand-5`, `state-management-guide` - where state lives.
- `css-modules` - styling, tokens, theming.
- `embeds` - any third-party widget, always via `pnpm embed:add`.
- `env-vars` - environment variables and what may be public.
- `database` - any stored data: SQLite + Sequelize only, UUID ids, JSON columns,
  a Sequelize migration for every schema change.

## The end state

When phase 6 passes, the builder has a working app on the starter, a report
that says what was carried over and what needs their attention, and a clear
next step: when they want other people to open it, they say so and the
auto-deployment plugin takes over. You do not take that step for them.
