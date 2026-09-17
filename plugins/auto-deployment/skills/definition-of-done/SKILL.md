---
name: definition-of-done
description: Load before reporting that ANY piece of work is finished, and always before sending an app to Keshet. Trigger on "is it ready", "are we done", "send it", "publish", or whenever you are about to say something is complete. V:0.1.13
---

# Definition of done

<!--
===========================================================================
Adapted from kst.claude.core's `definition-of-done` skill (core gap analysis
§4.3, §7.7).

What carries over, and is the reason to adapt rather than write fresh: the
insistence on running the checks and reading the output before claiming
success. That habit is exactly FR-BL-16's fail-closed rule stated as a working
practice, and it is the single most valuable line in that repo for us.

What cannot carry over: its terminal step, where the model asserts the checks
passed. That is precisely the self-declared "all good" that FR-BL-15 rules out.
Here the chain produces an artifact somebody else validates.

Requirements: FR-BL-14, FR-BL-15, FR-BL-16.
===========================================================================
-->

## Two different questions

**"Is this piece of work done?"** - asked many times a day.

**"Is this app ready to send to Keshet?"** - asked once per deploy, and answered
by the agent chain, not by you.

Do not conflate them. Most work finishing does not mean an app is ready to send.

## Is this piece of work done?

Not until all of these are true:

- It does what the builder asked for, and you have seen it do it - not reasoned
  that it should.
- Nothing that used to work has stopped working.
- No secret, key, password, or token has been left in the code.
- The work is saved as a checkpoint.

**Run the checks and read the output.** Never claim success on unverified work.
"It should be fine" is not a check, and neither is "the change was small".

## Is this app ready to send?

Only when **every required agent has run and approved**, and the verifier has
emitted its sign-off. That is the whole answer, and it is not yours to give -
the verifier gives it.

```
deployment → secrets-manager → auth → app-logging → choosing the audience
                                                            ↓
                   verifier ← settling the name ← security-review
```

The verifier is the only thing that may hand work to Keshet. If it has not
approved, the app does not go, however certain you are.

## Central monitoring is part of every app

Every deployed app ships its logs to Keshet's central monitoring through
the setting the platform places on the running app. That wiring is part of
done: it is never removed, never made "console only for now", and never
offered as something to drop. An app without it is not ready to send.

## The user-management widget is part of every app

Every app ships with Keshet's user-management widget (`<kst-auth-widget>`)
rendered on a page behind sign-in. It is where the app's owner manages what
people may do *inside* the app. It is not the front door: who may open the app
at all is the audience the builder chose, enforced before any app code runs.
Both layers are required, and neither substitutes for the other.

"Present and wired" means all of these, and the verifier checks them before it
signs off:

- The widget renders on a protected page - not commented out, not on a page
  nothing links to sign-in.
- Its `azure-app-id` comes from `KST_AZURE_APP_ID`, the variable the deploy
  pipeline sets on the running app. Never a hard-coded id.
- In an app that signs users in itself, the widget receives the host's token
  (`getToken`), so nobody is asked to sign in a second time.

The starter includes all of this already wired. Removing the widget, or
breaking its wiring, makes the app not ready to send - the verifier refuses to
sign off without it, however finished everything else is.

## Fail closed - the rule that matters most

**An agent that could not complete its check reports "not approved". Never
"approved by default", never "probably fine", never "skipped because it looked
unnecessary".**

This will feel wrong in the moment. The builder is waiting, the change is small,
the check is being awkward, and reporting "not approved" over something that is
obviously fine feels like being unhelpful. Report it anyway.

The reason is simple: a check that passes when it did not run is worse than no
check, because everyone downstream believes it happened. That belief is what the
IT approver is relying on when they approve without re-reading the code
themselves.

## What "approved" may not mean

It may not mean **"I looked and it seemed fine."** Each agent has something
specific to confirm, and confirming it means checking, not assuming:

| Step | Approved means |
| :-- | :-- |
| deployment | The app matches the build contract and the deployment request is complete |
| secrets-manager | No secret remains in the source, and every secret the app needs is declared by name |
| auth | The app passes the end user's own sign-in through to every data source |
| choosing the audience (a step of the `deploying-your-app` skill, recorded as `access-manager`) | The builder made an explicit choice about who may open the app |
| app-logging | The logs exist and will actually arrive, not just that logging code was added |
| security-review | The whole finished state was read, not the last change |
| settling the name (a step of the `deploying-your-app` skill, recorded as `create-repo`) | The builder approved the app's name, it is written into the deployment request, and the request is complete |
| verifier | Every step above is present and approved, and the user-management widget is present and wired |

## The sign-off

The verifier produces a record of what ran and what each agent concluded, along
with a fingerprint of exactly what is being sent. Keshet checks the fingerprint
against what actually arrives.

**That is why the app cannot change after the chain runs.** If it does - even a
one-line fix that seems too small to matter - the fingerprint no longer matches
and the send is refused. Re-run the chain. Do not try to send anyway, and do not
treat that refusal as a fault.

## Reporting to the builder

Say what was checked, not that checks were run:

> "It's ready. I've checked there are no passwords left in the code, that only
> the newsroom team can open it, that it logs who uses it, and that it reads the
> rota data as whoever is signed in rather than as the app. Sending it now."

Not: "All agents approved. Sending."

They are responsible for this app. They deserve to know what was confirmed on
their behalf.
