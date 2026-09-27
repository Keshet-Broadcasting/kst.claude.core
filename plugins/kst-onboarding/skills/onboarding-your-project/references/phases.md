# The phases, in full

You are the orchestrator, in the main conversation. Run these in order. Only
phase 0 and phase 6 involve the builder; 1 through 5 run without stopping.

Everything the builder reads is plain language. When you must run a command,
run it - do not ask the builder to.

---

## Phase 0 - intake (you ask, once)

The current working directory is the source project. Before anything, tell
the builder in a sentence or two what is about to happen:

> "I'll bring your project onto the Keshet starter - the shape the company
> builds and deploys. I make a fresh copy on that starter in a new folder
> next to this one and rebuild your app inside it. Your current project is
> left exactly as it is. I'll ask a few questions now, then work on my own
> and come back when it's ready for you to try."

Read enough of the source to ask good questions - do not do the full
inventory yet. Then ask, together, only what you cannot find yourself:

1. **What is this app for, in your words?** One or two sentences.
2. **What must absolutely be kept?** Screens, flows, look, behaviour the
   builder cares about most.
3. **Anything you want dropped or changed** while it moves?
4. **Does it have its own small backend or API** that should come along, or
   does it talk to systems that stay where they are? (A light backend can be
   rebuilt into the starter's route handlers; a heavy or separate backend
   stays external and the app keeps calling it.)

Record their answers - you will check the result against them and write them
into the report. This is the last time you ask anything until phase 6.

---

## Phase 1 - pull a fresh starter

Read `scripts/onboarding-config.json` for the clone URL, the branch, and the
folder-naming rule.

1. Work out the new folder: the source folder's name plus the configured
   suffix, as a **sibling** of the source (`../<name>-kst`). If that path
   exists, add a numeric suffix until it is free.
2. `git clone --branch <branch> --depth 1 <cloneUrl> <new folder>`.
   - Cloning the private starter uses the builder's existing GitHub access
     (git / gh are already set up on their machine). If the clone is refused
     for access, stop and tell the builder plainly that their machine needs
     access to the company starter, and to sign in to GitHub in their normal
     browser first - never open a sign-in page yourself.
3. Remove the starter's git history so the new base starts clean: delete the
   `.git` folder inside the new folder.
4. Follow the starter's `start-with-a-repo` rule in the new folder: `git
   init`, confirm `.gitignore` covers `.env*` and `node_modules`, and make a
   first checkpoint commit of the untouched starter before you change
   anything. Now there is always a version to go back to.
5. Install dependencies in the new folder with `pnpm install`, and run the
   plugin bootstrap the starter documents (`node scripts/setup-plugins.mjs`)
   so the new base carries the same plugins.

From here on, the new folder is where you write. The source folder is
read-only reference.

---

## Phase 2 - inventory the source (delegate, read-only)

Launch the `source-analyzer` agent against the source folder. It only reads;
it does not change anything. Give it the intake answers so it knows what
matters. It returns a structured inventory: every screen and route, the
navigation between them, every piece of state and where it lives, every call
to data or an external system, every notable behaviour and edge case, the
styling and theming approach, and any third-party widget. It also flags
anything it could not fully make out.

Hold this inventory. It is the specification you rebuild against, and it is
what the report is written from. If the source is large, this is where the
work of understanding it happens - keep the inventory, not the source code,
in your working context for the rebuild.

---

## Phase 3 - rebuild inside the new base

Rebuild the app in the new folder against the inventory. This is a rebuild by
behaviour, not a line-by-line code port: the source may be Angular, Vue,
plain React or anything else, and what carries over is what the app *does*,
expressed in the starter's architecture.

For every part of the build, follow the starter skill that governs it -
`fsd` for where files go, `feature-workflow` for a feature end to end,
`nextjs-16` / `react-19` / `routing` for the framework, `zustand-5` and
`state-management-guide` for state, `css-modules` for styling, `embeds` for
any third-party widget (always `pnpm embed:add`, never hand-written),
`env-vars` for configuration.

Handle the backend as the intake settled it: a light backend or simple API
becomes Next route handlers in the new base; a heavy or separate backend
stays where it is and the app keeps calling it as an external data source.

Secrets: any secret-looking value you find while rebuilding goes into the new
base's gitignored `.env`, and the code reads it as an environment variable of
a clear name. Never write a secret into source, a config file, or a commit.
Note every secret you relocated so it goes in the report; deep secret
handling is the deploy chain's job, not yours.

Work autonomously through the whole app. Do not stop to confirm individual
features - the builder confirms once, at the end.

---

## Phase 4 - verify

First the four definition-of-done checks the starter defines, from the new
folder:

```
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Read the output. Fix what fails and re-run until all four pass. Never move on
with a failing check, and never report success on unverified work. The
starter/auto-deployment `definition-of-done` skill is the authority on what
"done" means.

Then a browser smoke: start the dev server and open the key routes from the
inventory. Confirm each renders and the browser console is free of errors. A
build that compiles but shows a blank screen is not done - catch that here,
before the builder does.

If anything cannot be made to pass or render, stop and report it plainly.
Fail closed.

---

## Phase 5 - report

Write `ADAPTATION_REPORT.md` in the new base from the template at
`templates/ADAPTATION_REPORT.md`. Fill in, in plain English: what the app is,
what was carried over, what was rebuilt differently and why, what was **not**
carried over or needs the builder's attention, the secrets that were moved
into `.env`, and how to run it locally.

Then give the builder a short summary in chat - a few lines, not the whole
file: it worked, here is what moved, here is the one or two things to look
at, and here is how to try it. Point them to the full report for the rest.

---

## Phase 6 - the builder confirms, then the folder handoff

Ask the builder to run it locally and confirm it does what they need:

```
pnpm dev
```

Wait for their confirmation. The work is done only when they say it is good.
If they find something wrong, fix it in the new base and re-verify (phase 4)
before coming back.

Once they confirm, explain the folder situation plainly, and offer the
optional swap:

> "Your project now lives in the new folder, `<new folder>` - that is the one
> to work in from here. Your original folder is untouched, as a backup.
> "If you'd rather the new version take the original's place, I can put it
> there: I'll rename your old folder to `<name>-old` (I won't delete it) and
> move the new one into the original path. Want me to do that, or leave both
> folders as they are?"

- If they say leave it: you are done. Do not move anything.
- If they say swap: rename the **source** folder to `<name>-old` (never
  delete it), then move the new base into the original source path. Confirm
  the old folder still exists afterwards and tell them both final paths.
  This touches folders on disk, so do it only on their explicit yes.

Finally, point at deployment as a separate later step, in their words:

> "When you want other people to be able to open this, just say so - say
> 'deploy' or 'share it' - and I'll take it from there. It's a separate step;
> nothing is sent anywhere until you ask."

Do not start a deploy yourself.
