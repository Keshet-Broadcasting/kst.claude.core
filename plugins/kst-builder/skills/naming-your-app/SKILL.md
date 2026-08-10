---
name: naming-your-app
description: Use whenever the app is being named or renamed - at the start of a new app, when the user says "call it X", or when a name has been refused. Also use before sending an app to Keshet for the first time, because a name that will not work must be caught while changing it is still free.
---

# Naming the app

<!--
===========================================================================
Replaces the naming half of kst.claude.core's `naming-conventions` skill for
platform purposes (core gap analysis §7.8).

That skill is 345 lines on naming files, components, and CSS classes - style,
not enforcement, and none of it fails anything. The platform's naming rules are
not stylistic: the app name becomes an Azure resource name, and a name that
does not fit is refused. A builder who learns that after IT has already approved
their app has wasted IT's time and their own.

The rule itself lives in platform/scripts/appname.py and nowhere else. Do not
restate it in code here - run it.

Requirements: FR-BL-19, FR-BR-11, FR-SK-01, FR-SK-02.
===========================================================================
-->

## Check the name before doing anything with it

Run the platform's own validator rather than judging by eye:

```
python3 platform/scripts/appname.py check <name>
```

If it exits non-zero, show the builder the reasons it printed **verbatim** -
they are already written for them. Do not paraphrase, and do not add a rule of
your own on top.

Do this **before** the app is sent, not as part of sending it. Keshet checks the
name too and will refuse a bad one, but by then the builder has waited for a
round trip to find out something we could have told them instantly.

## The rules, in the terms someone picks a name in

- **Lowercase letters, numbers, and hyphens between words.** `sales-report`,
  `team-rota`, `leave-requests`.
- **Start with a letter.**
- **No spaces, capitals, underscores, or accented characters.** Hebrew names do
  not work here - this is a system name, not a title. The app can display any
  title they like; this is the name underneath.
- **Up to 20 characters.** `quarterly-sales-report` is too long;
  `sales-report` is not.
- **Short and specific beats long and complete.** This name will appear in lists
  next to every other app at Keshet. `report` tells nobody anything;
  `newsroom-rota` tells them everything.

## How to have the conversation

They will offer a title, not a name: "the quarterly sales dashboard for the
commercial team". Do not refuse it - propose the name and check:

> "I'll call it `sales-dashboard` underneath - that's the name Keshet's systems
> use. What people see when they open it can be anything you like."

Then run the validator and, if it passes, move on. This should take one exchange.

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

- **The name will not work** - it broke one of the rules above. The reasons come
  back with the refusal; show them, pick a new name together, retry.
- **The name is already taken** - the name is fine, someone else has it. Do not
  show them the rules; that would suggest they did something wrong. "There's
  already an app called that at Keshet. What else could we call it?"

There is a third, rarer one: an app of that name existed before and was removed,
and the name is not free yet. That one is not theirs to fix. Say so, say the
platform team has been told, and offer to pick a different name now rather than
wait.

## What the name becomes

Not something to explain unless asked, but worth knowing so you can answer if
they see it somewhere:

```
python3 platform/scripts/appname.py derive sales-report
```

The app's home, its address, and its key store are all named from it. The key
store's name has a string of letters and numbers on the end - that is
deliberate, so that no two apps anywhere can end up sharing one.
