---
name: when-a-deploy-fails
description: Use when anything goes wrong AFTER the app was sent to Keshet - the security checks failed, IT rejected it, the deploy failed, a secret did not resolve, or the app deployed but nobody can open it. Trigger on "it failed", "it was rejected", "why hasn't it deployed", "IT said no", "it's been hours", or any question about the state of a sent app. Not for ordinary bugs while building - use normal debugging for those. V:0.1.16
---

# When something fails after the app was sent

<!--
===========================================================================
The branch kst.claude.core's `debug-workflow` skill does not have (core gap
analysis §7.9). That skill covers local debugging - red screens, wrong
behaviour, failing tests - and covers it well. It has no notion of a failure the
user is not supposed to fix, which is most of what happens on the far side of a
push.

Requirements: NFR-OPS-01, NFR-OPS-02, FR-GT-14, FR-BL-17.
===========================================================================
-->

## The first question is not "what broke"

It is **"is this theirs to fix?"**

Get this wrong in the reassuring direction and they wait for you to fix
something that needs a person at Keshet. Get it wrong in the other direction and
you have handed a non-technical person a problem they cannot solve and told them
it is theirs. The second is worse.

| Failure | Theirs? |
| :-- | :-- |
| A secret left in the code | **Yes** - take it out, re-run the checks, send again |
| A vulnerable dependency | **Yes** - update it, re-run, send again |
| No audience chosen, or details missing | **Yes** - ask the questions, fill them in |
| Tests failing | **Yes** - fix them |
| IT rejected it | **Yes, usually** - read their comment; it is a question about the app, not a system fault |
| A secret has no value in the vault | **Partly** - if they have the value, yes. If the app cannot read its vault at all, no |
| The security scanner itself failed to run | **No** |
| The deploy failed on Keshet's infrastructure | **No** |
| Approval has not happened yet | **No, and nothing is wrong** |

## Say where it is first

Before diagnosing anything, tell them where the app got to. A person who does
not know whether their app is halfway or nowhere cannot judge anything you say
next.

```
Sent  →  Security checks  →  IT review  →  Deploy  →  Live
```

"It got through the security checks and it's waiting for IT to review it" is a
complete answer to "what's happening", and most of the time it is the true one.

The IT review step is not always there. The first time an app is sent, a person
reads it before anything runs. After that, small changes go out on their own,
and only a big one is put in front of a person again. **Do not work this out for
yourself** - it is not yours to decide and you cannot see it from here. Say
where the app actually is, which is what Keshet tells you.

## The security checks failed

These run before IT sees anything, deliberately - so IT is never asked to review
something that was going to fail anyway.

**A secret was found in the code.** Take it out and move it where secrets
belong - the `secrets-in-your-app` skill is the authority on that, and this
skill does not restate it. Then re-run the checks and send again. Say it plainly
and without alarm: "There's a password saved in the code. I've moved it
somewhere safe, and I'll send the app again." If it was ever sent anywhere, it
must be replaced rather than merely moved - a secret that has left the machine
is a secret that has to be changed.

**A security problem was found in the code or in something it depends on.** Read
what was flagged. Usually it is a component that needs updating, which you can
do. If it is something in their own code, fix it and explain what you changed in
one sentence.

**Tests failed.** Fix them. Never send with failing tests, and never disable a
test to get past a check - that is the failure this whole platform exists to
prevent, done from the inside.

## IT rejected it

Not a system failure. Somebody read what the app does, who can use it, and what
data it reaches, and had a question or a concern. **Their comment comes back
with the rejection - show it.**

Then work out which kind it is:

- **A question** ("why does this need access to payroll?"). The answer is
  theirs, not yours. Help them write it, adjust the app if the honest answer is
  that it does not need that access, and send again.
- **A change** ("this shouldn't be open to the whole company"). Make the change
  - usually the audience - and send again.
- **A no.** Sometimes the answer is that the app should not exist in this form.
  Do not argue on their behalf, and do not try to get past it by rewording the
  request. Tell them what was said and let them take it up with IT directly.

Never re-send an unchanged app after a rejection.

## The deploy failed

Almost none of this is theirs.

**A declared secret has no value.** The app was refused rather than shipped
broken, which is the system working. If they have the value, put it in and
re-deploy. If the app has no permission to read its own vault, that is the
platform team's.

**Anything else** - the image did not build, the app would not start, the
platform could not create something. Do not attempt to diagnose Azure to a
builder. Collect what you have and hand it over:

> "The deploy didn't complete - this is something on the Keshet platform side,
> not anything you did. I've passed on the details. Your app and everything
> you've built are safe."

## The app deployed but nobody can open it

Two very different things, and the difference is the whole point of how access
works here:

- **They are not on the list.** The app is working exactly as intended and
  refusing someone it was told to refuse. Check the audience with the builder -
  adding someone is a change to the app's access settings and a re-deploy.
- **They are on the list, they get in, and then part of the app fails or shows
  nothing.** The app is working and the *data source* is refusing them. That is
  intended too: the app passes the person's own sign-in through, so someone
  without permission on the underlying data gets a clean refusal rather than
  data they should not see. The fix is with whoever owns that data, not with the
  app.

Saying "the app is fine, SharePoint is saying no to that person" is a real
answer, and it is often the right one.

## Nothing has happened for a long time

Check where it is before saying anything. If it is waiting on IT review, it is
waiting on a person, and nothing is wrong - say so, and say what you can do
about it, which is usually nothing yet. Do not invent a timescale.

If it is stuck somewhere that is not a review, treat it as a platform-team
matter rather than waiting longer.

## How to write any of these

- **Lead with where it is**, then what happened, then what happens next.
- **One sentence on the cause**, in their words. No requirement IDs, no log
  extracts, no pipeline stage names.
- **Never leave them holding something they cannot act on.** If it is not
  theirs, say who has it.
- **Never say "unknown error".** If you do not know, say what you do know and
  what you have done about the rest.
