---
name: naming-your-app
description: Use whenever the app is being named or renamed - at the start of a new app, when the user says "call it X", or when a name has come back refused. Also use before sending an app to Keshet for the first time, because the name is agreed with the builder before anything is sent. V:0.1.12
---

# Naming the app

<!--
===========================================================================
Replaces the naming half of kst.claude.core's `naming-conventions` skill for
platform purposes (core gap analysis §7.8).

That skill is 345 lines on naming files, components, and CSS classes - style,
not enforcement, and none of it fails anything. The app name is different: it
becomes an Azure resource name, and Keshet is the one that decides whether it
works.

Two things remove work from here:

1. There is no name-checking operation at Keshet, and there is no local
   validator either. This skill ships no script and a builder machine has no
   platform repo. Naming is a conversation: propose, and let the builder
   approve, ask for another, or supply their own.
2. The builder's own existing app is not a refusal. A name coming back taken
   means somebody else has it, and nothing else.

kst.auth.api is the naming authority. platform/scripts/appname.py is a
platform-side helper, is not shipped to builders, and is not authoritative.

Requirements: FR-BL-19, FR-BR-11, FR-BR-26, FR-SK-01, FR-SK-02.
===========================================================================
-->

## Agree the name with the builder

There is nothing to run and nothing to look up. The name is settled between you
and the builder, in one exchange:

**Propose a name**, and let them approve it, ask for a different one, or give
you their own. That is the whole task. Do not check it against a list of rules
as though you were the one deciding - you are not, and pretending otherwise
means telling a builder their name is fine and then having Keshet say
otherwise, or the reverse.

Keshet decides when the app is sent. If the name cannot work, the send comes
back refused with Keshet's own reasons, **nothing has been created**, and the
builder simply picks again. One round trip, nothing to undo.

## What makes a good name

Guidance for the name you propose, and for helping a builder pick one. Not
rules you enforce, and never a checklist you read out:

- **Short, lowercase, words separated by hyphens.** `sales-report`,
  `team-rota`, `leave-requests`.
- **No dots or underscores.** No spaces, and no accented characters. Hebrew
  names do not work here - this is the name underneath, not the title. The app
  can display any title they like.
- **Memorable, because it becomes the app's web address.** People will type it
  and send it to each other.
- **Short and specific beats long and complete.** This name sits in a list next
  to every other app at Keshet. `report` tells nobody anything;
  `newsroom-rota` tells them everything.

## How to have the conversation

They will offer a title, not a name: "the quarterly sales dashboard for the
commercial team". Do not refuse it - propose a name from it and let them say:

> "I'll call it `sales-dashboard` underneath - that's the name Keshet uses, and
> it's what people will see in the app's web address. What they see when they
> open it can be anything you like. Happy with that, or would you rather call
> it something else?"

Then take their answer and move on. This should take one exchange.

## Renaming later

**Assume it cannot be changed after the app is live**, and say so once, gently,
at the point of choosing:

> "Worth getting this one right - it's awkward to change once the app is
> running."

Renaming a deployed app means a new home, a new address, and a new store for its
keys. That is a platform-team operation, not a rename. If they ask for one after
deploying, do not attempt it - say it needs the platform team and pass it on.

Before the app has been sent, renaming costs nothing. Say yes freely.

## If Keshet refuses the name

Two different refusals, and the difference matters to the builder:

- **The name will not work.** Keshet's reasons come back with the refusal - show
  them as they are written, pick a new name together, send again.
- **There's already an app called that.** Somebody else has that name. Do not
  show them any rules; they did nothing wrong. "There's already an app called
  that at Keshet. What else could we call it?"

Nothing was created in either case, so there is nothing to clean up.

There is a third, rarer one: an app of that name existed before and was removed,
and the name is not free yet. That one is not theirs to fix. Say so, say the
platform team has been told, and offer to pick a different name now rather than
wait.

**A builder sending their own app again is not a refusal at all.** It is simply
the next version of that app, and it goes through. Nobody is asked anything, and
you should not raise it.

## What the name becomes

Not something to explain unless asked, but worth knowing so you can answer if
they see it somewhere.

Keshet builds everything else from the one name the builder approved: the app's
home, its web address, its key store, and its sign-in registration. The key
store's name has a string of letters and numbers on the end - that is
deliberate, so that no two apps anywhere can end up sharing one.
