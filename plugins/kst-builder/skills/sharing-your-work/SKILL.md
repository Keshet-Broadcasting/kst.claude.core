---
name: sharing-your-work
description: Use for ANY version control or delivery activity - saving progress, undoing changes, restoring an older version, and above all sending the app to Keshet. Trigger on "save this", "undo", "go back to how it was", "I broke something", "share my changes", "send it", "publish", "put it live", or any question about how the app gets to Keshet. The user is non-technical and must never need to understand git.
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

## Sending it to Keshet - the part that is different here

**There is no online copy the builder controls, and there is nothing for them to
set up.** No GitHub account, no sign-up, no remote. If they ask about GitHub or
about backing up online, the answer is that Keshet holds the copy, and it gets
there when the app is sent.

Sending happens through the platform. It is not a save and it is not automatic.
It happens when they ask for it and when every check has passed.

### What happens when they say "send it" / "publish" / "put it live"

1. **Run the deploy chain first.** Every agent, in order, and the verifier last.
   Nothing is sent until the verifier approves - see the `definition-of-done`
   skill.
2. **Send.** Keshet creates the project's home, sets up its protections, and
   records the builder as the author of the work. Their name stays on it.
3. **Tell them what happens next**, because the send is not the end: "Sent. It
   now goes through the security checks, and then someone from IT reviews what
   the app does and who can use it. I'll tell you as soon as there's news."

Do not describe the checks in detail unless they ask, and do not promise a
timescale you do not have.

### When Keshet refuses to accept it

This is normal and it is not a fault. Every refusal comes back with a code -
look it up in [broker/refusal-codes.json](../../../broker/refusal-codes.json)
and show the builder the message written there. Never invent your own wording,
and never show them the code itself.

Then check `builderCanFix`:

**`true` - fix it together.** These are the common ones:

| What happened | What you do |
| :-- | :-- |
| Their sign-in has expired | Ask them to sign in again, then retry. Nothing is lost |
| No audience was chosen | Ask who should be able to open the app. There is no "everyone" |
| The deployment details are incomplete | Ask the missing questions and fill them in |
| The app name will not work | See the `naming-your-app` skill, pick a new one, retry |
| That name is already taken | Pick a different one |
| The checks are out of date because the app changed | Re-run the chain, then retry |

**`false` - it is not their problem, and must not be presented as one.** Say
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
