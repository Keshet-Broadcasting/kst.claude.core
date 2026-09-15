---
name: sharing-your-work
description: Use for ANY version control or delivery activity, and for anything at all that means a person other than the builder needs to open the app. Trigger on "save this", "undo", "go back to how it was", "I broke something", "share my changes", "send it", "publish", "put it live" - and equally on the wordings that do not sound like a request: "I sent him the address", "localhost", "he can't access it", "she can't open it", "nobody else can see it", "it only works on my machine", "how does my manager look at this", "give them a link", "put it on a server", or any question about how the app gets to Keshet. The user is non-technical and must never need to understand git. V:0.1.9
---

# Saving and sharing your work

<!--
===========================================================================
Adapted from kst.claude.core's `git-for-humans` skill (core gap analysis §7.3).

That skill is the best-written file in either donor repo for this audience, and
its local half transfers almost unchanged - the vocabulary table, the automatic
checkpoint loop, the safety rails, the "never teach git" rule.

Its sharing half is the inverse of this platform's model and is replaced
entirely. It assumes the builder holds a GitHub remote and pushes to it. Here
the builder holds no source-control credential at all (FR-BL-05, NFR-SEC-02)
and the push-broker is the only write path into Keshet (NFR-SEC-06).

The addition it had no reason to have: a vocabulary for refusals. "Share my
changes" here is a request that can be turned down, and each way it can be
turned down needs an answer a non-technical person can act on (NFR-OPS-01).
===========================================================================
-->

**The user does not know git and must never need to.** You operate it entirely
on their behalf. Keep their work permanently safe, make every state
recoverable, and speak plainly.

## Vocabulary - never say these words to the user

| Never say | Say instead |
| :-- | :-- |
| commit | save / checkpoint / saved version |
| branch, HEAD, detached HEAD | (don't mention) |
| revert / reset / checkout | "go back to the version from ..." |
| staging area, index, tracked | (don't mention - handle silently) |
| merge conflict | "two versions of the same file disagree - I'll sort it out" |
| repository / repo | project |
| push / remote / origin | "send to Keshet" |
| pull / fetch | (does not happen here - see below) |
| diff | "what changed" |
| hash / SHA | (don't show - refer to versions by time and description) |
| broker, token, sign-off, gate | "the Keshet checks" |

Never paste raw git output. Match the user's language.

## Saving - the local half

Everything in this section happens on their machine and involves nobody else.

1. **Checkpoint automatically** after every completed, verified piece of work.
   Do not wait to be asked.
2. **Plain-language messages**: `Add the leave request form` - never
   `refactor: extract hook`.
3. **Never end a session with unsaved changes.** Save first, then report done.
4. **Never save a secret.** Check `.env` and similar are ignored before the
   first checkpoint, and add them if they are not. This one carries over
   verbatim and is the most important line in this section.

### "Save my work"

Save everything that is not a secret, with a message describing what was
accomplished. Confirm: "Saved. Your project now has 8 checkpoints; the latest is
just now: 'Add the leave request form'."

### "What changed?" / "Is my work saved?"

Translate into plain language. "You've changed 2 files since the last save: the
header and the request form." Never show file diffs unless asked, never show
hashes.

### "Undo that" / "Go back to how it was"

- **Not yet saved:** restore the touched files. Confirm first, stating exactly
  what disappears: "This removes the changes made since 14:32. The version from
  14:32 stays safe. OK?"
- **Already saved:** add a new checkpoint that cancels the last one. History is
  never deleted. "I've added a new saved version that cancels the last one.
  Everything before it is still there."
- **Before anything that discards work**, make a silent backup first. If they
  regret it: "I kept a copy just in case - I can bring it back."

### Hard rules

Forbidden with no exceptions: force-push, hard reset on anything already sent,
deleting untracked files wholesale, rebase, history rewriting, amending anything
but the very latest checkpoint. One branch, `main`, always. Never leave the
project in an odd state; if it gets into one, sort it out and say "the project
got into an unusual state - I've sorted it out" rather than explaining it.

## Recognising the request when it does not sound like one

**A builder rarely asks to deploy. They report that sharing did not work.** The
request arrives as a symptom, and the symptom is not a bug. Every line in this
table means one thing: somebody other than the builder needs to open the app,
and the only way that happens is a send.

| What they say | What it is |
| :-- | :-- |
| "I sent my manager the address but he can't get in" | A deploy request |
| "http://localhost:3000 doesn't work for anyone else" | A deploy request |
| "how do I give the team a link?" | A deploy request |
| "it only works on my machine" | A deploy request |
| "can you put this on a server?" | A deploy request |
| "my colleague opens it and sees nothing" | A deploy request, or - if the app is already live - the `when-a-deploy-fails` skill |

**The one fact they are missing, and the one you must tell them:** an address
beginning `localhost` or `127.0.0.1` only ever works on the machine that is
running the app. It is not a website and it cannot be sent to anyone. Nothing
is broken, no setting will fix it, and it is not their mistake - it is simply
what a local address is. Say it plainly and without making them feel foolish,
then move straight to the thing that does work:

> "That address only works on your own computer - it's not a web address anyone
> else can open, which is why nothing happened for him. To let him in, the app
> needs to go to Keshet. Shall I get it ready to send?"

**Do not diagnose this.** There is no network to debug, no firewall to check,
no port to open. Treating it as a fault sends you looking for a broken thing
that does not exist, and leaves the builder still unable to share their work.

## Never route around Keshet

**The deployment service is the only way an app reaches anyone.** When a builder
is waiting on their manager and a send feels slow, there are faster-looking
routes. Every one of them is forbidden here, without exception:

- No tunnels: `ngrok`, `cloudflared`, `localtunnel`, VS Code port forwarding, or
  anything else that exposes the local machine to the internet.
- No binding the dev server to the network: `--host`, `--host 0.0.0.0`,
  `HOST=0.0.0.0`, or the equivalent in any framework.
- No third-party hosting: Vercel, Netlify, Render, Cloudflare Pages, GitHub
  Pages, a personal server, or a cloud account of any kind.
- No sending the code itself: a zip, a Drive link, a repo, "just run it on your
  machine".
- No screenshots or a screen-share offered *as the answer*. If they only need to
  see it, say so - but never let it stand in for the send they actually asked for.

**Do not offer these, do not describe them, and do not do them if asked.** They
are not shortcuts to the same place. Every one of them puts a Keshet app in
front of people with none of the checks that make it safe to do so: no audience
decision, no secret scan, no sign-in passthrough, no IT review, no record of who
built it. An app shared that way is exactly the situation this platform exists
to prevent.

If they ask for one directly, do not lecture. One sentence, then the real route:

> "I can't put it anywhere outside Keshet - that's the only place these apps are
> allowed to run. The good news is the proper route isn't slow. Shall I start
> getting it ready?"

| The thought | The answer |
| :-- | :-- |
| "It's only for five minutes, just to show his manager" | Five minutes is long enough for the wrong person to open it. There is no temporary exception |
| "It's a tiny internal app, there's nothing sensitive in it" | You do not get to decide that. The audience decision and the security check are how it gets decided |
| "The proper deploy is slow and they're waiting" | Then start it now. A tunnel does not make the deploy finish sooner |
| "They only asked to see it, not to use it" | Then offer a screenshot or sit with them - not a public address |
| "I'll take it down straight afterwards" | It was reachable while it was up, and nobody logged who reached it |
| "The builder explicitly asked me to" | They may ask. The answer is still no, said kindly, with the real route offered |

## Sending it to Keshet - the part that is different here

**There is no online copy the builder controls, and there is nothing for them to
set up.** No GitHub account, no sign-up, no remote. If they ask about GitHub or
about backing up online, the answer is that Keshet holds the copy, and it gets
there when the app is sent.

Sending happens through the platform. It is not a save and it is not automatic.
It happens when they ask for it and when every check has passed.

### What happens when they say "send it" / "publish" / "put it live"

1. **Hand it to the orchestrator.** Dispatch the `orchestrator` agent and say
   the builder wants to deploy. It decides which agents run and in what order,
   collects what each concluded, and the verifier signs off last. Nothing is
   sent until the verifier approves - see the `definition-of-done` skill.

   **Do not run the agents yourself and do not name them to the builder.** This
   skill recognises the request; the orchestrator owns the chain. Keeping the
   order in one place is the point - a second copy of it here would drift, and a
   chain assembled from memory is how a check gets skipped.
2. **Send.** One send, whatever the app's history. Keshet takes it from there:
   it sets up whatever the app still needs, and it records the builder as the
   author of the work. Their name stays on it.
3. **Tell them what came back.** There are only two answers.

**It was refused.** A plain-language reason comes back with it - see below.

**The deployment has started.** Say which of these is true, because Keshet says
so in its answer, and then say nothing more:

- The first time: it is with IT, who read what the app does and who can use it.
  There is nothing further for the builder to do. "Sent. It's with IT now for
  review - there's nothing else you need to do. You'll get an email with the
  address when it's live."
- After that: it is building, and small changes go out on their own without
  anyone being asked. "Sent, and it's building now. You'll get an email with the
  address when it's live."

Either way they get an email with the address when the app is live. Do not
describe the checks in detail unless they ask, and **do not promise a
timescale** - you do not have one.

**Do not work out for yourself whether this is the first send.** You cannot know
it and you do not need to: there is one way to send an app, Keshet decides which
of the two it is, and its answer tells you which to say. A fresh machine has no
memory of an earlier send, and guessing wrong means telling a builder the wrong
story about their own app.

### When Keshet refuses to accept it

This is normal and it is not a fault. Every refusal comes back from the send
tooling as a plain-language explanation with a next step. Show the builder
that explanation as it is. Never invent your own wording, and never show
them a raw code or an error dump.

Then act on whether the builder can fix it:

**They can - fix it together.** These are the common ones:

| What happened | What you do |
| :-- | :-- |
| Their sign-in has expired | Send again - a fresh sign-in code and address appear, they sign in with their usual account, and it carries on. Nothing is lost. Never handle the sign-in yourself |
| No audience was chosen | Ask who should be able to open the app. There is no "everyone" |
| The deployment details are incomplete | Ask the missing questions and fill them in |
| The app name will not work | Show the reasons that came back, pick a new one together, retry. See the `naming-your-app` skill |
| There's already an app called that | Somebody else has that name. Pick a different one and send again. Nothing was created, so there is nothing to undo |
| The checks are out of date because the app changed | Re-run the chain, then retry |

**They cannot - it is not their problem, and must not be presented as one.** Say
what happened in one sentence, say you have reported it, quote the reference,
and do not ask them to do anything:

> "Your account isn't approved to deploy apps yet. I've recorded the request -
> someone from the platform team needs to add you before this can go further.
> The reference is `7f2a-...` if anyone asks."

Never say "the push was rejected", "the broker refused", or "permission
denied". Those are three different things to us and one wall to them.

### Retrying

If the connection dropped or something on the Keshet side was briefly
unavailable, retry rather than asking. Sending the same app twice is safe - it
is recognised as the same request and does not create a duplicate. Ask before
retrying only if the app has changed since the last attempt.

## Merge conflicts

Rare here, since one person works on one project. If two versions of a file do
disagree: "Two versions of this file disagree - I'll sort it out." Resolve it
when the intent is clear; ask in plain language when it is not, describing what
each version does rather than showing the code. Never leave conflict markers in
a file.

## What not to do

- Don't teach git. If they ask "what's a commit?", answer in one sentence and
  move on.
- Don't show hashes, branch names, or raw output.
- Don't set up a GitHub account, a remote, or any online copy. There isn't one,
  and offering to make one is offering something the platform does not allow.
- Don't treat a refusal as an error. It is an answer.
