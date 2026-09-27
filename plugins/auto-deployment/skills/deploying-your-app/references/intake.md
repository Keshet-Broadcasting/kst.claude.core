# Step 0 - intake: sign in, and every question at once

You do this step yourself, in the main conversation, on every deploy: after
the opening message and before any agent runs. It is the only time in the
whole run that the builder is asked anything. Its job is to get the sign-in
started and every answer that is theirs to give, in one sitting, so the
builder can walk away while the chain runs.

Everything after this step runs without the builder: no "shall I carry on?",
no "confirm this is right", no "ready to send?". Their request to deploy is
the permission for the whole run, send included.

## 1. Start the sign-in, in the background

Run the send tooling in sign-in mode, in the background. On macOS and Linux:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/send-deploy.sh" --signin
```

On Windows:

```
powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/send-deploy.ps1" --signin
```

It first checks that Keshet answers from this network, then signs the builder in and keeps the sign-in on this machine, so
the send at the end of the chain goes through without a code. It never reads
or sends the app.

While it starts, check the project is a git repo (see the skill). Then read
its output. One of four things has happened:

| What it printed | What you do |
| :-- | :-- |
| It cannot reach Keshet (exit 3, saying it can't be reached) | Stop before anything else: "Keshet's deployment service isn't reachable from here - usually that means you're not on the Keshet VPN or the Keshet office WiFi. Connect and tell me, and I'll carry on." Any other exit 3 means Keshet's side is not answering properly: stop, tell them it's nothing they did, and give them the line after "Details for the platform team" to forward. |
| `Still signed in as ...` (exit 0) | Nothing for the builder to do. Note the name and address in brackets. |
| A web address and a short code | Put both at the top of your questions message (part 3), word for word. It keeps waiting in the background while they answer. |
| Any other failure | Carry on without it. Say nothing now; the send signs them in at the end instead. Do not retry here. |

If your environment can only run commands in the foreground, run it in the
foreground anyway: tell the builder first that a web address and a short
code will appear in the terminal window and that they should sign in with
them straight away, then ask your questions once it finishes.

## 2. Draft every answer yourself

The builder approves or corrects; they do not write. Read what you need -
the conversation, `package.json`, the main pages, any address or client
library for an outside system, and `DEPLOY_REQUEST.md` if one exists (its
answers are the builder's own earlier words) - and draft:

- **Name** - short, lower-case, words joined by hyphens, following the
  `naming-your-app` skill. The recorded name if there is one.
- **Purpose** - one or two sentences a stranger in IT can judge: what the
  app does, for whom, and with what data. "Sales dashboard" is a label, not
  a purpose.
- **Description** - one line, the way the app should read in Keshet's app
  catalogue.
- **Tags** - two to four words that file it: the team, the topic.
- **Data sources** - every system the code reads or writes, by the name
  people at Keshet know it by, each with a few words on what it holds
  ("finance system - sales figures per team"), or "none" when the code
  reaches nothing outside itself. What each one holds is what lets the
  sign-in check decide without coming back to the builder.

You do not check here whether the app is on the starter: the orchestrator's
fast conformance gate already did that before the intake, and stopped the run
if it was not. By the time you are here, the app is in Keshet's shape.

Do not launch an agent for this. It is a short read, not a check.

## 3. One message with every question

Send one message. If you have a structured question tool, make it a single
call with all the questions in it; otherwise one plain message with the
questions numbered. Nothing else follows it except the follow-ups in part 4.

Start with the sign-in code if there is one, then the questions:

> "While you answer, sign in to Keshet: open [the address] in your browser,
> type [the code], and sign in with your normal Keshet account (approve the
> phone prompt if one appears)."

**Question 1 - the app, for IT to review.** Show the drafts from part 2 and
ask for a yes or a correction:

> "This is how I'll describe the app to IT. OK as it is, or tell me what to
> change.
> Name: md-render
> What it does: ...
> Catalogue line: ...
> Tags: ...
> Connects to: nothing outside the app"

**Question 2 - who can open it.** This is the one answer you never draft
(`choosing-the-audience.md` has the rules). Ask it plainly - nobody can open
the app until they say - and offer the forms the platform accepts, none of
them marked as recommended:

- **Only me**
- **Specific people** - they list their Keshet work email addresses
- **A team group** - they name the team

If an audience is already recorded, add it as the last option, in their
words: "Keep: only dana.cohen@... ". Reading back their own earlier answer
is not choosing for them, and listing it last keeps it from looking like the
suggested one.

**Question 3 - only if needed: a key they were personally given.** When the
code needs a key, password or token that a partner or another team handed
the builder, and the app's `.env` has no value for it, ask for it here.
Check without looking at any value: `grep -cE '^NAME=.+' .env` prints 1
when the name has a value and 0 when it does not. Before writing, make sure
`.gitignore` covers `.env`. Write the answer into `.env` yourself under the
name the code reads (the `secrets-in-your-app` skill names it), and never
repeat the value back.
Never ask for a value Keshet sets on the running app, and never for one the
builder could only answer with "I have no idea" (see the skill).

There is no starter-shape question here. A project that is not on the starter
never reaches this intake - the fast conformance gate stops it first and tells
the builder to adapt it with the kst-onboarding plugin, in its own session.
The deploy chain never moves an app onto the starter.

## 4. Follow-ups, in the same sitting

Only when an answer cannot be written down as given. These are the last
questions of the run:

- **"Only me"** - the audience is the address the sign-in printed in
  brackets. If the sign-in is still waiting, remind them once to finish it;
  it is the step they need anyway. If it failed, or printed no address, ask
  for their Keshet work email.
- **Names without addresses, "everyone", a vague audience, or an address
  that looks doubtful** - handle them exactly as `choosing-the-audience.md`
  says, including its quiet sanity pass over the addresses. Nothing about
  the audience is queried after this point.
- **"Change something"** - apply the change they asked for. Ask again only
  if you cannot tell what they meant.

## 5. Record it and let them go

Write the answers into `DEPLOY_REQUEST.md` - copy the plugin's template
(`${CLAUDE_PLUGIN_ROOT}/templates/DEPLOY_REQUEST.md`) first if there is
none: `app-name`, `purpose`, `description`, `tags`, `data-sources`,
`audience-type` and `audience-members`. Leave `declared-secrets` to the
agents, and never touch the `Requester` or `Local agent sign-off` blocks.
Read the file back.

Read the background sign-in's output once more. It is signed in (it printed
`Signed in as` or `Still signed in as`), still waiting for the builder, or
it failed. Write the run record's `intake` entry: when it finished, the
audience as recorded, what each data source holds in the builder's words
(the auth agent is given this), and `signedIn` as `true`, `"waiting"` or
`false`.

Close the intake in one sentence, and start the chain straight away:

> "That's everything I need from you. The checks take a while - you can
> step away. I'll only come back to you if the code turns up something
> your answers didn't cover."

If the sign-in is still waiting, add: "Finish the sign-in in your browser
when you can - the code lasts about 15 minutes." If it failed, add instead:
"I'll need you once more at the very end, to sign in to Keshet."

## What the answers settle

- **The name and the catalogue entry.** Question 1's yes (or their
  correction) is the builder's approval. Step 7 checks the name is recorded
  and does not ask again.
- **The audience.** Question 2's answer, plus any follow-up, is the builder's
  explicit choice. Step 5 writes and checks it and does not ask again.
- **The data sources, and what each holds.** The deployment agent compares
  the names with the code, and the auth agent decides from what each holds
  whether the user's own sign-in must travel with the call.
  Only a system the code reaches that the answer did not name, or the other
  way round, comes back as a question - that is a real difference between
  what IT will read and what the app does, and it is the builder's call.

## Fail closed

A question the builder has not answered is not answered. Never fill one in
to keep the run moving. If they stop replying, run nothing and write no
`intake` entry: the next run redoes the intake, offering back whatever the
deployment request already holds. Intake questions never go into
`pending`.
