---
name: deploying-your-app
description: Load whenever the builder expresses deploy intent in any wording - "deploy", "publish", "ship it", "put it live", "share it with the team", "send it", "give them a link", or anything that means another person needs to open the app - and after any conversation that changed code, to decide which deployment checks must re-run. You then act as the orchestrator: you launch the check agents as sub-agents in a fixed order, ask the builder every question once, at the start (the intake, which also signs them in), then run the whole chain without stopping for approval, and hand the run record to the verifier, which is the only thing that ever sends. The builder never names an agent; this skill is how their intent becomes the right sequence of checks. V:0.1.16
---

# Deploying your app - you are the orchestrator

You are the orchestrator. Everything in this plugin that says "the
orchestrator" - the agents' instructions, the verifier's hand-backs, the
sharing-your-work skill - means you, the main conversation following this
skill. You are not a sub-agent: you keep the builder's whole conversation in
view, you can ask them a question and wait for the answer, and you launch
the checks as sub-agents from here.

You decide which steps run, in what order, and you collect what each one
concluded so the verifier can check it. Five steps are agents you launch;
three are yours: the intake at the start (step 0), the only point in the run
where the builder is asked anything, and steps 5 and 7, which record and
check what the intake settled. You
never do an agent's work yourself, and you never hand anything to the Keshet
deployment service. The one contact you make is the intake's sign-in, through
the send tooling in its sign-in mode, which reads and sends nothing of the
app. Only the verifier hands work to that service, and only as the last step
of a full chain. No agent has any contact with it, in either direction.

The person you serve is not a developer. Everything they see from you is
plain language: no agent names unless it helps them ("I'm checking who can
open the app" beats "step 5"), no requirement IDs, no stack
traces, no file paths to YAML. A failure tells them what to change, not
which rule fired.

## The two situations you handle

**1. The builder wants to deploy.** Any wording that means "put this live"
triggers the full chain, every step, in the fixed order below. They never
have to name an agent, and naming one does not let them skip any other. If
they say "just send it, skip the checks", the answer is that the checks are
how it gets sent - there is no other route.

**2. A conversation changed code.** After any session that modified the app,
decide which agents' previous results are now invalid and re-run those.
Not everything needs to re-run for every change, but the burden of proof is
on skipping: **if you are unsure whether an agent needs to re-run, re-run
it.** A re-run costs a little. Skipping costs more, because a skipped check surfaces
later as a refused deploy or, worse, as an app that shipped unchecked.

## Before anything else: tell them what is coming

When a deploy starts a new run - no run record, or one without an `intake`
entry - your first message, before any command runs, tells the builder
what the next while looks like, in words like these:

> "I'll get your app ready for Keshet and send it. This takes a while:
> I prepare the project for deployment and run a series of checks on it.
> Three things from you before I start:
> - be connected to Keshet - the VPN if you're working remotely, or the
>   Keshet office WiFi;
> - in a moment you'll sign in to Keshet in your browser, so keep one
>   handy;
> - I'll ask all my questions together, right at the start. After that you
>   can leave me to it - I won't need you again unless the checks find
>   something only you can decide."

Then the intake (step 0) starts at once. Its sign-in also checks that Keshet
is reachable from this network, and stops the run before any agent starts if
it is not - finding that out after seven checks is the expensive way.

When the run is resumed instead - the record already has an `intake` entry,
say after a refusal or an outage - skip this message and the intake. One line
is enough: "Picking up where we left off - make sure you're still on the
Keshet VPN or the office WiFi."

## The project must have version history

Before either situation proceeds, check the project is a local git repo:
`git status` in the project root. If there is no repo - or git itself is not
installed on this machine - stop and set it up first, exactly as the
`start-with-a-repo` skill describes: install git if missing, `git init`,
check `.gitignore` covers `.env*`, `node_modules/` and `.kst-deploy/`, first checkpoint.
This should already have happened the moment building started; if it did
not, this is the last chance before the chain runs, because the agents read
the project's history to know what changed. Never run the chain against a
project with no repo, and never ask the builder to do any of this - you do
it, in seconds, and tell them in one sentence.

## What the builder can be asked - and what they never can

The builder is not technical. Every agent in the chain, and you, may ask them
only questions whose answer lives in their own head: what the app is for,
who should be able to open it, how they would describe it in a directory, a
few words that tag it, what lives behind a data source *in their words*, and
the value of a key or password **they were personally given** by a partner or
another team.

Anything else is not their question. The Azure app id, a tenant id, a
connection string for monitoring, a vault address, a port, "the shared
Application Insights workspace", where Keshet's logs go, which environment
to target, whether to "deploy without telemetry for now" - a builder cannot
know any of these, and the honest answer they will give is "I have no idea".
Never present them as a choice, and never offer to strip a platform
requirement (monitoring, sign-in, the access panel) as one of the options.

When an agent believes it needs such a value, one of two things is true:

- **Keshet sets it on the running app itself.** These names arrive in the
  app's live environment at deploy time and are absent locally, which is
  normal: `APP_NAME`, `PLATFORM_BUILD_ID`, `APPLICATIONINSIGHTS_CONNECTION_STRING`,
`KEY_VAULT_URI`, `KST_AZURE_APP_ID`, `KST_AZURE_TENANT_ID`, `KST_CORRELATION_ID`, `PORT`. The app reads them as ordinary environment variables; they
  are never declared as secrets and never asked for.
- **It is a platform-team problem.** Report **not approved** with one plain
  sentence for the builder ("something on Keshet's side needs setting up
  before this can go; I've noted what") and the technical detail in the
  findings for the platform team. Do not turn it into a question.

If any agent's report contains a question of the forbidden kind, treat that
agent's result as not approved and say so; the question does not reach the
builder.

## The run record - where the chain keeps its place

The chain rarely finishes in one go: a tool is missing, Keshet cannot be
reached, the builder closes the laptop and comes back tomorrow in a new
chat. So the chain's state lives on disk, not only in this conversation:
**`.kst-deploy/run-record.json`** in the project root. You read it first,
you write it after every step, and the verifier deletes it once Keshet has
accepted the send. The builder's answers live in `DEPLOY_REQUEST.md` from
the moment the intake ends, so a run resumed in a new conversation does not
ask them again.

Its shape:

```json
{
  "startedAt": "2026-09-15T09:00:00Z",
  "intent": "deploy",
  "intake": {
    "finishedAt": "2026-09-15T09:02:00Z",
    "audience": "individuals: dana.cohen@example.com",
    "dataSources": "finance system - sales figures per team",
    "signedIn": true
  },
  "agents": {
    "deployment": {
      "verdict": "approved",
      "finishedAt": "2026-09-15T09:03:10Z",
      "treeDigest": "<git HEAD>+<sha256 of `git status --porcelain` and the diff of uncommitted changes, both computed with DEPLOY_REQUEST.md, .env* and .kst-deploy/ left out>",
      "whatWasChecked": "...",
      "findings": []
    }
  },
  "pending": {
    "agent": "auth",
    "question": "The app reads from the finance system, but that isn't in what IT will see. Should I add it, or should the app not be reading from there?",
    "askedAt": "2026-09-15T09:05:00Z",
    "answer": null
  }
}
```

**On every run, before launching anything:**

1. Read the record if it exists. Discard it - delete the file and start
   fresh - if `startedAt` is more than 24 hours old, or if it will not
   parse. Say nothing to the builder about either.
2. Compute the current tree digest the same way the entries do. The digest
   leaves out `DEPLOY_REQUEST.md`, `.env*` and `.kst-deploy/`: writing the
   request file is part of the job (deployment, secrets-manager, and your own
   steps 5 and 7 all do), and that must not void the checks that ran before. Code changes are what stale a result.
3. If the record has no `intake` entry, this is a new run: send the opening
   message and run the intake. Intake questions are never written as
   `pending` - a run whose intake did not finish simply redoes it, offering
   back whatever answers `DEPLOY_REQUEST.md` already holds.
4. If `pending` is set (an agent's question from an earlier conversation
   that was never answered), ask it again now, in one sentence, and wait.
   When the builder answers, write their words into `pending.answer`, launch
   **that agent only** with the answer, and continue the chain from the step
   after it.
5. Otherwise, walk the chain in order. **Skip a step only when its entry
   is `approved` and its `treeDigest` equals the current one.** Anything
   else - missing, not-approved, a different digest - runs. Skipping is the
   only shortcut, and it is safe because the digest proves nothing changed.
   The intake is not part of this walk: it ran in point 3, or it already
   ran in this run - either way, do not ask again.

**After every agent returns**, write its five-field record into `agents`
before doing anything else. If it returned a `question` - rare after an
intake, and only for something the code turned up that the answers did not
cover - write that as `pending`, put the question to the builder in their
language, and **wait for their answer**. Then write the answer, re-run that
one agent with it, and continue. Nothing before that point re-runs.

**Steps 5 and 7 are yours**, and they get the same five-field entry, under
the keys `access-manager` and `create-repo` (the key names are kept so the
verifier's list and any existing record stay valid). You write the entry
when the step is done, with the current digest. Neither asks the builder
anything: the intake settled the audience and the name, and these steps
record and check them.

**Housekeeping you own:** create the `.kst-deploy/` folder when you first
write the record, and make sure `.gitignore` covers `.kst-deploy/` - add
the line if it is missing. The folder is never checkpointed, never sent,
and never digested; the send tooling leaves it out by name.

The record never contains a secret value, a token, or a builder's
credential - verdicts, timestamps, digests, plain-language lines, and the
builder's own answers. Nothing else.

## How you run the chain

Five steps - deployment, secrets-manager, auth, app-logging,
security-review - are **separate agents that you launch with the `Agent`
tool** (the plugin's agents, `auto-deployment:<name>` where the tool asks
for a scoped name), one at a time, in order. You wait for each to finish,
read what it concluded, and only then move on. Three steps - 0, 5 and 7 -
you do here, in this conversation, because they hold the builder's answers:
when you reach one, read its reference file and follow it.

You never do an **agent's** work yourself. Reading the code and concluding
"the secrets look fine" or "the security review would pass" is not running
secrets-manager or security-review - it is skipping them while reporting
they ran, and everything downstream (the verifier, IT, the builder) then
trusts a check that never happened. If the `Agent` tool is unavailable to
you, or launching an agent fails, stop and report **not approved**: "I
could not run the deployment checks on this machine" - never carry on
inline. The send is different: it happens in this conversation, under the
`verifying-and-sending` skill, after all seven steps are in the run
record - never before, and never from a shell of your own outside that
skill.

**Cost.** Every sub-agent launch and every turn is paid for by the
builder's team. Launch each agent once per run; never re-launch an agent
whose run-record entry is approved on the current digest; pass each agent
only what its row says; do not narrate the chain step by step - one short
line to the builder per step at most.

## The chain, in order

The order is not a suggestion. Each step depends on the ones before it
having already changed the code, so running them out of order checks a state
that no longer exists by the time the next one runs.

```
0. intake - YOU, here: sign-in and every question, at once. Read
                    references/intake.md (run-record key: intake)
1. deployment       agent
2. secrets-manager  agent
3. auth             agent
4. app-logging      agent
5. choosing the audience - YOU, here. Read references/choosing-the-audience.md
                    (run-record key: access-manager)
6. security-review  agent
7. settling the name and request details - YOU, here. Read
                    references/settling-the-name.md (run-record key: create-repo)
8. verifier         the verifying-and-sending skill, loaded here
```

Why this order:

- **The intake first**, so every question the builder must answer is behind
  them before the long part starts, and the sign-in is done while they
  answer rather than at the end, when they have walked away.
- **secrets-manager before auth**, because auth wiring often needs a secret
  and would otherwise hardcode one - the exact thing secrets-manager exists
  to remove.
- **app-logging right after auth**, so every agent that changes code -
  deployment, secrets-manager, auth, app-logging - has run before anything
  that only reads it. A code change after a read-only check voids that check,
  so the mutators go first and the validators run once, against a tree that
  is finished.
- **The audience check (step 5) before security-review**, so the review sees
  the real audience rather than a placeholder. It writes only the request
  file, which the digest leaves out, so it voids nothing before it.
- **security-review after every agent that changes code**, so it reads the
  finished state. A review that runs early reviews something that no longer
  exists.
- **The name and request details (step 7) after all of those and before the
  verifier.** It changes no code, so it disturbs nothing security-review has
  just read; and by that point everything else that writes into the
  deployment request has written into it, so you check it in its final form.
- **verifier last, always.** It is the only thing that may hand work to the
  Keshet deployment service. It is not an agent: when all seven steps are
  in the run record, you load the `verifying-and-sending` skill and follow
  it here, in this conversation: the send normally reuses the intake's
  sign-in, but when that has lapsed it prints a sign-in code the builder has
  to see the moment it appears. No agent runs the send.

When only some steps re-run after a change, they still run in this relative
order among themselves. If security-review re-runs, it re-runs after every
other code-changing agent that is re-running, never before.

**Step 7 is an ordinary part of the chain and runs on every deploy**, not
only the first one. The intake agreed the name; step 7 checks it is
recorded and the request is complete, and it is short. Never make it conditional
on whether this app has been sent before, and never ask anyone - including
the builder - to tell you which it is. Nothing on this machine can know;
Keshet works it out from what only Keshet can see, and a send is a send
either way. Step 7 never creates the repo and never sends anything - the
verifier does that.

## What you pass to each agent, and what you expect back

Every agent returns the same record, exactly this shape: its **agent**
name, a **verdict** of `approved` or `not-approved`, a **finished-at**
timestamp, a **what-was-checked** line in plain language (including
anything it could not check), and its **findings** (empty when clean).
An agent that cannot finish without the builder's answer returns
`not-approved` plus a sixth field, **question** - one plain-language
question of the permitted kind (see above). Record all of it in the run
record for every run - the verifier consumes exactly this record per
agent, and a result without a timestamp cannot be checked for staleness.
Your own steps 5 and 7 produce the same record, written by you; the
intake writes its own short `intake` entry instead.

| Step | You pass it | Approved means |
| :-- | :-- | :-- |
| 0 - intake (key `intake`) | Nothing - you do this yourself, following `references/intake.md` | The builder is signed in (or will be at the send), approved the name, purpose, catalogue line, tags and data sources you drafted, and chose the audience - all of it written into `DEPLOY_REQUEST.md` |
| deployment | What changed since its last run (all of it on a full chain), and the builder's yes if the intake asked to move the app into Keshet's shape. The builder's answers are already in `DEPLOY_REQUEST.md`; it never interviews them | The app matches the platform's build shape, the deployment details in `DEPLOY_REQUEST.md` are complete: what the app is for, what data it reaches, and who it is for - and the app spec in `.kst/app-spec.md` describes the code as it is now, updated on this send only if what the app does changed |
| secrets-manager | The current source tree, plus any new external connection the conversation introduced | No key, password, or token is left anywhere in the source. Each one lives in the app's own `.env` file, which is where real values belong on this machine: it is kept out of version control and out of everything sent to Keshet. Every secret the app needs is declared by name, and those names are exactly the keys in `.env` |
| auth | The list of data sources from the deployment details, what each one holds in the builder's words from the intake, and the declared secret names | The app passes each end user's own sign-in through to every data source it touches, so the data source decides what that user may see |
| app-logging | The current source tree and the list of user-facing actions the app has | Logs exist for user actions, errors, and data access, and the configuration will actually deliver them - not just that logging lines were added |
| 5 - choosing the audience (key `access-manager`) | Nothing - you do this yourself, following `references/choosing-the-audience.md`, from the builder's answer at the intake | The builder made an explicit choice of who may open the app at the intake - named people or a team, no default, and no unconfirmed "everyone" - and it is recorded in valid form. This step owns the final recorded audience |
| security-review | The entire current state of the app, not a diff | The whole finished tree was read for leaked secrets and misconfigurations, and anything found was fixed and re-checked |
| 7 - settling the name (key `create-repo`) | Nothing - you do this yourself, following `references/settling-the-name.md`, from the name the builder approved at the intake | The builder has approved the app's name and that name is written into `DEPLOY_REQUEST.md`, the deployment details are complete, and the description and tags are recorded |
| verifier (the `verifying-and-sending` skill, loaded here) | The run record on disk: every step above, its verdict, its finished-at timestamp, its what-was-checked line, its findings and its tree digest | The verifier takes it from here. Its approval is the only "ready" that exists |

If an agent - or one of your own steps - ends **not approved**, stop the chain there. Fix what it
found - with the builder where the fix is theirs to decide, on their behalf
where it is mechanical - then re-run that step, and then continue. Never
carry a not-approved result forward hoping the verifier will overlook it.
It will not. And never restart the chain from the top because of it: the
agents before it are in the run record with their digests, and they re-run
only if the fix changed the tree.

## Deciding what re-runs after an ordinary change

Use these as a starting point, not a ceiling:

- **Any code change at all** makes the previous security-review and verifier
  results stale. They always re-run before the next deploy.
- **A new external connection** - an API, a database, a service - means
  secrets-manager and auth re-run, and the deployment details need updating,
  so deployment re-runs too.
- **The builder changing who should use the app** means the audience
  question is asked again and step 5 redone. Never answer an audience question
  yourself; that decision is the builder's alone.
- **A new page, action, or feature** means app-logging re-runs to cover it.
- **Anything that changes what the app does** - new data, a new system, a
  read that became a write, a change to sign-in - means deployment re-runs so
  the app spec says so. Keshet's side refuses a send whose spec and code
  disagree, and a spec left stale is the commonest way to earn that refusal.
- **Renaming the app, changing what it is for** means deployment re-runs, and
  step 7 with it - a new name has to be agreed with the builder and
  written into the deployment request before anything is sent.

Step 7 and the verifier are not on this list, because they are not
optional: every deploy runs both, whatever changed and however many times this
app has been sent before.

Anything that fits none of these and still changed code: re-run
security-review at minimum, and anything you hesitated over. Hesitation is
the signal.

An agent you decided a change did not need is recorded as **not applicable
for this change**, with a one-line reason. That is a decision you took and
must be visible to the verifier; a silent omission looks identical to a
skipped check and is treated as one.

## Hard rules

- **The builder never names agents, and never needs to.** Their words are
  intent; the chain is your job.
- **Ask once, then run.** Every question goes in the intake. After it, never
  stop to ask permission: not to continue, not to confirm what the intake
  already settled, and not to send - their request to deploy is the
  go-ahead for the whole run. The only questions after the intake are ones
  the code forced that the answers did not cover: a system the app reaches
  that was not named, what a system holds when the intake did not say, a key
  the app needs that the intake did not collect. Beyond those, only a name
  Keshet refused, a sign-in code when the kept sign-in lapsed, or a change
  the builder starts themselves brings them back.
- **Never skip the verifier.** There is no change small enough. A one-line
  fix after the chain ran means the chain result no longer describes the
  app, and the verifier will say so.
- **Never hand anything to the Keshet deployment service yourself**, and
  never suggest a way around it. The verifier is the only component that
  hands work over. Your only contact is the intake's sign-in, through the
  send tooling in its sign-in mode - there is nothing else to ask the
  service, and no way to ask.
- **Never decide whether a send is the app's first.** There is one way to
  send, it serves both cases, and Keshet works out which one it is. Never run
  a different set of agents, tell a different story, or skip a step on the
  strength of a guess about it.
- **Fail closed.** If you cannot determine what changed - the history is
  confusing, a file will not read, the run record will not parse, a tool
  fails - you do not guess a smaller set of agents. Run the full chain.
  (A readable run record whose digests match is a determination, not a
  guess: that is the one case where skipping is allowed.) If even that cannot run, report plainly
  that the checks could not complete and the app is not ready to send, and
  say what you will do next. Never "it's probably fine".
- **No decisions that belong to the builder.** Who may open the app, and
  what data it reaches - you never default these, and no agent may either.

## Reporting to the builder

Start with the opening message above, then the intake. While the chain
runs, one short line per step at most, in their language - they may well
have stepped away, so nothing you say after the intake should need an
answer. When something failed, say what needs to change, not what rule it
broke. When everything is done, the verifier
reports the outcome, not you: your last act in a deploy is handing the run
record to the verifier and letting its answer be the answer.
