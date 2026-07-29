---
name: definition-of-done
description: >
  Use this BEFORE declaring any work done, finished, complete, ready to commit, or ready
  to merge — and whenever the user says "I'm done", "can I commit?", "is this ready?",
  "it works", or "ship it". Also use it any time pnpm typecheck, pnpm lint, pnpm build,
  or pnpm test fails and you need to read the output. Work is not complete until all four
  commands pass AND new logic has test coverage. Never skip this checklist, even when the
  change looks trivial. "It works in the browser" is not enough — run the commands.
---

# Definition of Done

**You are not done until all four commands pass and new code has tests.** This is the
project's quality gate, not a suggestion. Never tell the user work is finished,
ready to commit, or ready to review until you have run every command and read the output.

---

## Step 1 — Run the four commands

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Run them as a chain. The chain stops at the first failure. Fix it, then re-run the full
chain from the beginning.

| Step | Command          | What it checks                                                                                     |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------- |
| 1    | `pnpm typecheck` | TypeScript types across the entire codebase — catches wrong types before the code ever runs.       |
| 2    | `pnpm lint`      | Three checks in one: ESLint code-quality rules, Steiger FSD layer boundaries, and embed manifests. |
| 3    | `pnpm build`     | Production build — Next.js compiles everything; any runtime-visible mistake surfaces here.         |
| 4    | `pnpm test`      | Vitest unit tests — verifies the logic behaves as written.                                         |

> **Critical:** `next lint` is **removed** in Next.js 16. Never run it. Always run
> `pnpm lint` — that is the only correct linting command in this project.

---

## Step 2 — Check test coverage for new logic

"All tests pass" does not mean "the new code is tested." Before declaring done:

- If you added or changed business logic (a store, a server action, a utility function,
  a data-transformation step): there must be at least one test that exercises it.
- If no test file exists for that slice or module, create one.
- The goal is not 100% line coverage — it is that a future regression in the new logic
  will be caught by the test suite, not discovered in production.

**A passing `pnpm test` on zero new tests is not the same as the feature being tested.**

---

## Step 3 — Minimum bars for UI changes

These do not require automated checks — verify them by reading your own code:

- **Accessibility (a11y):** Interactive elements (`<button>`, `<a>`, inputs) have
  meaningful labels. Images have `alt` text. Focus order is logical. If you added a
  custom interactive component, verify it is keyboard-operable.
- **Performance:** No `useEffect` fetching data that should be a Server Component.
  No missing `loading.tsx` on a new route that fetches data. Images use `<Image>` from
  Next.js, not a plain `<img>`.
- **Security:** No user-supplied values rendered as raw HTML (`dangerouslySetInnerHTML`).
  No secrets or API keys committed. Server Actions validate their inputs — never trust
  client-supplied data blindly.

---

## Step 4 — Communicate status to the user

Report the outcome in plain, honest language. The user is non-technical — never say
"typecheck passed" or "lint exit 0". Translate every result:

### All four commands pass, tests exist for new logic

> "Everything checks out — I ran the full quality suite and it passed. The new code is
> covered by tests. This is ready to commit / review."

### A command fails

> "Not ready yet — [plain description of what's broken, e.g. 'there's a type mismatch
> in the login form that TypeScript caught', or 'the FSD boundary rule is violated
> because a low-level module is importing from a high-level one']. I'm fixing it now."

Never say "done" and then list caveats. Either it passed or it did not.

### New logic exists but has no tests

> "The feature works, but I haven't written tests for the new [store / action / utility].
> Without tests, a future change could silently break this. Do you want me to add them
> now, or is that acceptable to defer?"

Do not silently skip tests. Ask explicitly.

### Partial work — feature not complete

> "I've finished [specific part]. What's still missing: [specific list]. I'll continue
> before declaring this ready."

---

## Reading errors

### TypeScript errors (`pnpm typecheck`)

Each error prints a file path, a line number, an error code (`TS####`), and a message.

| Code    | Plain meaning                                                      | Likely fix                                                  |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| TS2307  | Module not found — the import path or package name is wrong.       | Check the path; run `pnpm install` if a package is missing. |
| TS2345  | A value of one type was passed where a different type is expected. | Look at the type the function expects and match it.         |
| TS2339  | A property you're reading doesn't exist on that type.              | Check for a typo, or look at the type definition.           |
| TS2741  | A required property is missing from an object or component prop.   | Add the missing property.                                   |
| TS18046 | A value is `unknown` — TypeScript can't safely use it.             | Narrow the type with a type guard or an explicit cast.      |

If the error mentions `await params` or `await searchParams`, see the `nextjs-16` skill
— those are Promises in Next.js 16 and must be awaited.

---

### ESLint errors (`pnpm lint` — ESLint portion)

**`no-restricted-imports`** — you imported past a slice's public surface:

Fix: change the import to point to the slice's `index.ts` rather than an internal file.
Wrong: `@/features/auth/model`; correct: `@/features/auth`.

**`no-restricted-syntax` (script / custom-element tags)** — you used a `<script>` tag
or a hyphenated JSX element outside `src/shared/embeds/`:

Fix: use `pnpm embed:add <name>` to scaffold a proper embed; never hand-write embed
loading code.

---

### Steiger FSD boundary errors (`pnpm lint` — Steiger portion)

Steiger enforces the FSD layer graph. Each layer may only import from layers **below** it:

```
app  →  views (pages)  →  widgets  →  features  →  entities  →  shared
```

A violation example:

```
✖ entities/user/index.ts imports from features/auth/index.ts
  no-layer-importing-higher-layers
```

Fix: move the shared logic down to a layer both sides can access, or restructure the
dependency so it flows downward.

---

### Embed check errors (`pnpm lint` — embed:check portion)

```
✖ src/shared/embeds/my-widget/embed.json does not satisfy embed.schema.json
```

Fix: run `pnpm embed:check` standalone to see the exact validation message, then correct
`embed.json`. Never hand-edit an embed folder — use `pnpm embed:add <name>` to scaffold
one correctly.

---

### Build errors (`pnpm build`)

Build errors often duplicate typecheck or lint errors. New-only build errors:

- A server component importing a client-only API (`window`, `document`). Fix: add
  `'use client'` to the component, or move the code behind a dynamic import.
- A missing `default.tsx` in a parallel route slot. Fix: add the file.
- A `webpack` config key causing a Turbopack conflict. Fix: see the `nextjs-16` skill.

---

### Vitest test failures (`pnpm test`)

```
× src/features/auth/__tests__/model.test.ts > login succeeds with valid credentials
  AssertionError: expected 'error' to equal 'success'
    at model.test.ts:18:12
```

Fix the code (or, if the test expectation is wrong, fix the test), then re-run
`pnpm test` to confirm. If tests hang indefinitely: look for a missing `await` on an
async call, or an open timer/subscription not cleaned up in `afterEach`.

---

## Final checklist

- [ ] `pnpm typecheck` exits with no errors
- [ ] `pnpm lint` exits with no errors (ESLint + Steiger + embed:check)
- [ ] `pnpm build` completes successfully
- [ ] `pnpm test` shows all tests passing (zero failures, zero errors)
- [ ] New business logic has at least one test covering it
- [ ] Interactive UI elements are keyboard-accessible and labelled
- [ ] No secrets committed, no unsanitised user input rendered as HTML

All items must be satisfied. If any one is not, the work is not done — say so plainly.
