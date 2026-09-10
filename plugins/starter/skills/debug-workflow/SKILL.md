---
name: debug-workflow
description: >
  Use this skill the moment something is broken or behaving wrong — red screen,
  blank page, "failed to compile", "cannot find module", a wall of terminal errors,
  tests that won't pass, a feature that worked yesterday, anything that doesn't look
  right. Also use it when the user says "it's broken", "something broke", "not
  working", "I see an error", "nothing loads", "it crashed", "why is it red",
  "everything is messed up", "this used to work", "something feels off", or asks
  how to debug anything in this app. Invoke before doing anything else. V:0.1.2
---

# Debug Workflow

**Something is broken. That is normal. Every broken thing has one specific cause
and one specific fix.** This skill walks you through finding it without guessing.

---

## The debugging loop

Every fix follows this four-step loop. Never skip a step — especially "confirm":

```
1. OBSERVE   — read the exact error message; collect all available evidence
2. HYPOTHESIZE — form one specific guess about the cause (not "maybe X or Y")
3. VERIFY    — test ONLY that one hypothesis; change nothing else yet
4. CONFIRM   — after fixing, run the full check suite to prove the fix held
```

If verify disproves the hypothesis, go back to step 1 with fresh eyes — do not
keep piling changes on top of a wrong guess.

---

## Step 1 — Locate where the error surfaces

Pick the symptom that best matches what you see:

| Symptom                                              | Section                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Red overlay or "Something went wrong" in the browser | [→ A: Red screen](#a-red-screen-in-the-browser)             |
| Blank / white / empty page                           | [→ B: Blank page](#b-blank-page)                            |
| Errors in the terminal where `pnpm dev` runs         | [→ C: Terminal / compile error](#c-terminal--compile-error) |
| `pnpm build` fails                                   | [→ D: Build error](#d-build-error)                          |
| Red squiggles in the editor / `pnpm typecheck` fails | [→ E: Type errors](#e-type-errors)                          |
| ESLint warnings, "structure violation", embed errors | [→ F: Lint or structure error](#f-lint-or-structure-error)  |
| "I don't know what changed or where to look"         | [→ G: Unknown starting point](#g-unknown-starting-point)    |

---

## A: Red screen in the browser

During development the full-screen overlay appears on top of the page. The user
would see `app/error.tsx` ("Something went wrong") in production.

**Read the overlay in this order:**

1. **Top line of the message** — this is the actual error (e.g. `TypeError: Cannot
read properties of undefined`). That is your hypothesis.
2. **Stack trace** — the first line that shows a file path inside `src/` is where
   the crash happened. Ignore the React/Next.js internals above it.
3. **Digest code with no message** — this means the error happened on the server
   and the browser only received a reference code. Switch to [→ C](#c-terminal--compile-error)
   and search for that digest in the terminal output to find the real message.

**Common red-screen causes in this stack:**

- `Cannot read properties of undefined (reading 'X')` — you accessed a property
  on something that was `undefined`. Check whether the value could be missing and
  add a guard, or trace back why it is undefined.
- `Objects are not valid as a React child` — you tried to render a plain object
  or a Promise instead of a string/number/JSX. Use `.toString()` or `await` the value.
- `Event handlers cannot be passed to Client Component props` — you passed a
  function from a Server Component to a Client Component. Functions are not
  serializable across the RSC boundary; move the handler into a `'use client'`
  component. See [→ RSC boundary errors](#rsc-boundary-errors).
- `A component suspended while responding to synchronous input` — a component
  inside a user-interaction handler triggered Suspense without a `<Suspense>`
  wrapper above it. See [→ Suspense errors](#suspense-errors).

---

## B: Blank page

The app silently crashed before rendering, or a component returned `null`/`undefined`.

**What to do:**

1. Open the browser developer console (Mac: **Cmd + Option + J** / Win: **F12 → Console**).
2. Find the first red line — that is the error. Treat it the same as [→ A](#a-red-screen-in-the-browser).
3. If the console is clean, check the terminal — a compile error may have
   prevented the page from loading at all.
4. If both are clean, add a temporary `console.log('rendered')` at the top of the
   page component to confirm whether the component runs at all.

---

## C: Terminal / compile error

The terminal where `pnpm dev` runs shows errors that the browser cannot explain
(server-side crashes, compile failures, module resolution failures).

**What to look for:**

- `Error:` line with a file path → open that file at that line number
- `Module not found: Can't resolve '@/...'` → see [→ Cannot find module](#cannot-find-module)
- `SyntaxError` → a typo or missing bracket in the named file
- `TypeError: X is not a function` in server output → likely called a Client-only API
  (`useState`, `useEffect`, event handlers) inside a Server Component
- `Error: async/await is not yet supported in Client Components` → you added `async`
  to a component marked `'use client'`; async components must be Server Components

**What to do:**

1. Scroll to the very first error (past warnings, past "compiling…" lines).
2. Note the filename and line number.
3. Fix that one file, save — the dev server recompiles automatically.
4. Repeat until the terminal shows "Ready" with no error output.

---

## D: Build error

`pnpm build` runs stricter checks than the dev server — it catches problems that
silently pass in development but break in production.

```bash
pnpm build
```

Read the output top to bottom. Build errors look like:

```
./src/features/counter/ui/Counter.tsx
Type error: Property 'count' does not exist on type '{}'
```

Fix the listed files, then run `pnpm build` again to confirm.

> If `pnpm build` passes but `pnpm dev` shows errors, the issue is likely a
> hot-reload glitch — see [→ Stale .next cache](#stale-next-cache).

---

## E: Type errors

TypeScript checks that you are using values the way they were defined. Red
squiggles in the editor are TypeScript talking.

To see every type error in the whole project at once:

```bash
pnpm typecheck
```

This runs `tsc --noEmit` and lists every problem with a file path and line number.

**Reading type errors:**

- `Property 'X' does not exist on type 'Y'` — you accessed a property that the
  type does not declare. Either the type is wrong (add the property) or you are
  using the wrong variable.
- `Type 'X' is not assignable to type 'Y'` — you passed a value of the wrong
  type. Check what the function/component expects and match it.
- `Cannot find module '@/X' or its corresponding type declarations` — the module
  is missing, has no `index.ts`, or the import path has a typo. See
  [→ Cannot find module](#cannot-find-module).

Fix errors in the order they appear — an error in one file can cause cascade
failures in others. Clear the first before worrying about the rest.

---

## F: Lint or structure error

`pnpm lint` runs three checks in sequence:

1. **ESLint** — code style and common bugs
2. **steiger** — FSD layer boundaries (a `features` file importing from `widgets`
   is a violation)
3. **embed:check** — validates every embed's `embed.json` against the schema

```bash
pnpm lint
```

- **ESLint errors**: fix the flagged lines; the message names the broken rule.
- **Steiger "dependency violation"**: you imported across a layer boundary —
  move the shared logic to a lower layer, or read the `fsd` skill.
- **embed:check errors**: an embed folder is missing a required field or has a
  stale schema — re-run `pnpm embed:add <name>` or check the `embeds` skill.

---

## G: Unknown starting point

When the user says "something is broken" but there is no error message visible,
start with the narrowing run:

```bash
pnpm typecheck   # → type errors
pnpm lint        # → style / FSD / embed errors
pnpm build       # → production-mode compile errors
pnpm test        # → failing unit tests
```

Run them in this order. Fix errors from the first failing command before running
the next — errors in step 1 often cause false failures in steps 2–4.

If all four pass, the problem is runtime behaviour, not a static error. In that
case: reproduce the exact user steps that cause the problem, open the browser
console while doing so, and watch for red lines or network failures.

---

## Next.js 16 + React 19 specific pitfalls

### RSC boundary errors

Server Components and Client Components run in different environments. The boundary
is enforced at runtime, not just by TypeScript.

**You cannot pass from a Server Component to a Client Component:**

- Functions (including event handlers, callbacks, promises)
- Class instances
- DOM nodes
- Anything marked `'use server'` that is not a Server Action

**You cannot use inside a Server Component:**

- React hooks (`useState`, `useEffect`, `useContext`, etc.)
- Browser APIs (`window`, `document`, `localStorage`, etc.)
- Event handlers directly on elements

**Fix:** Add `'use client'` to the component that needs these, at the lowest
possible level. Read the `server-vs-client` skill for the full boundary guide.

---

### Suspense errors

`<Suspense>` catches components that are still loading (async Server Components,
lazy imports, data fetching with `use()`). Without a boundary above them, they
throw.

**Symptoms:**

- `Error: A React component suspended while rendering, but no fallback UI was specified`
- Infinite loading spinner that never resolves
- `Error: Suspense boundary did not receive a fallback`

**Fix:** Wrap the async component or the data-fetching section in `<Suspense fallback={<Loading />}>`.
Read the `loading-and-error` skill for where to place Suspense boundaries in FSD.

---

### Async Server Component errors

Server Components can be `async` — they `await` data before rendering. This is
correct and expected.

**Common mistakes:**

- Marking an `async` component as `'use client'` — async components must be
  Server Components. Extract the async part into a separate server component.
- Forgetting `await` — the component gets a Promise instead of data and renders
  `[object Promise]`.
- Using `async` component inside a `'use client'` tree — the async component will
  be treated as a regular Client Component and may throw.

---

### Next.js 16 fetch caching

Next.js 16 changed fetch caching defaults. Fetches are **not** cached by default
(unlike Next.js 14/15 where they were).

**Symptom:** Data appears to refetch on every request when you expected it to be
cached, or cached data appears stale when you expected it to be fresh.

**Fix:** Opt in to caching explicitly:

```ts
fetch(url, { next: { revalidate: 60 } }); // cache for 60 seconds
fetch(url, { cache: 'force-cache' }); // always use cache
```

Read `node_modules/next/dist/docs/` for the current caching reference before
making fetch caching decisions — this area changed significantly between versions.

---

## Common quick fixes

### Stale `.next` cache

**Symptoms:** "Can't find module" after changing `next.config.ts`, HMR stops
reflecting changes, the app behaves as if your edits do not exist.

```bash
# Stop the dev server first (Ctrl+C), then:
rm -rf .next
pnpm dev
```

The `.next` folder is the build cache. Deleting it forces a clean rebuild. Safe
to delete at any time — it regenerates automatically on next start.

---

### Changes not appearing (HMR not updating)

**Symptom:** You saved a file but the browser looks the same.

Hard-refresh: Mac **Cmd + Shift + R** / Win **Ctrl + Shift + R**.

If that does not help, stop the dev server and restart: `pnpm dev`.

---

### Port already in use

**Symptom:** `pnpm dev` prints `Error: listen EADDRINUSE: address already in use :::3000`.

```bash
lsof -ti:3000 | xargs kill
pnpm dev
```

Or start on a different port: `pnpm dev -- --port 3001`.

---

### Cannot find module '@/...'

`@/` maps to the `src/` folder. Common causes:

1. **Typo in the path** — folder and file names are case-sensitive.
2. **Missing `index.ts`** — every FSD slice (`entities/`, `features/`, `widgets/`,
   `views/`) must export its public API from `index.ts` at the slice root.
3. **Importing past the public surface** — `@/features/counter/ui/Counter` is
   forbidden; import from `@/features/counter` (its `index.ts`) instead.

---

### Hydration mismatch

**Symptom:** `Error: Hydration failed because the server rendered HTML didn't
match the client.`

This happens when a component renders different content on the server vs. the
browser — usually because it reads a browser-only API (`window`, `localStorage`,
`Date.now()`) without being a Client Component.

**Fix:** Add `'use client'` to the component file, or wrap the browser-only code
in `useEffect` so it only runs after hydration. Read the `server-vs-client` skill.

---

## Before touching the fix — safety protocol

Breaking something else while fixing one thing is common. Prevent it:

1. **Run `pnpm typecheck && pnpm lint && pnpm test` before you change anything.**
   Capture the baseline — if a test was already failing, that is not your fault.
2. **Make one change at a time.** Verify it works, then make the next change.
3. **If you need to experiment**, keep the experiment local: do not delete working
   code until the replacement is confirmed working.
4. **After the fix**, run `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
   in full. All four must pass — that is the definition of done.

---

## Escalation path

| Attempt                     | What to do                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First hypothesis failed     | Revert the change; re-read the error message; form a new specific hypothesis                                                                            |
| Two hypotheses failed       | Run the full check suite (`typecheck`, `lint`, `build`, `test`) — the real error may be in a different layer than expected                              |
| Still stuck after the suite | Check `git diff` — something may have changed earlier that you are not accounting for                                                                   |
| Error message is cryptic    | Search for the exact error string in `node_modules/next/dist/docs/` — Next.js 16 has breaking changes not covered by general knowledge                  |
| Genuinely blocked           | Paste the **exact** error text (file name, line number, full message, stack trace) into the conversation. Do not paraphrase — the exact wording matters |

---

## Communicating findings to the user

When the user is non-technical, describe what you found in plain terms — not
technical jargon. Use this structure:

1. **What was wrong** — one sentence, plain language.
   Example: "The page was crashing because it was trying to read a value that
   didn't exist yet."
2. **What you changed** — one sentence.
   Example: "I added a check so the page waits until the value is ready."
3. **How to confirm it's fixed** — what the user should see.
   Example: "The error screen should be gone now — try refreshing the page."

Do not explain the root cause in technical terms unless the user asks. Do not
list every file you touched — summarise the outcome.
