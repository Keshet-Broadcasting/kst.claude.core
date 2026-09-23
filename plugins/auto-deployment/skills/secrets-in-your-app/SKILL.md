---
name: secrets-in-your-app
description: Load this skill whenever the user mentions API keys, passwords, tokens, connection strings, `.env` files, or connecting the app to any other system - a database, an AI service, SharePoint, an internal API. Trigger immediately when someone is about to put a key, password, or URL directly into the code, and when they say "the API key isn't working", "it can't reach the database", or "it works on my machine but not after deploying". V:0.1.17
---

# Secrets in your app

<!--
===========================================================================
Rewrite of kst.claude.core's `env-vars` skill (core gap analysis §7.2).

That skill is well written and, for a standalone Next app, correct. For a
platform app it teaches the exact behaviour the gate refuses builds for:
secrets in `.env.local`, read through `process.env`, with a committed
`.env.example`. Shipping it unchanged would be worse than shipping nothing,
because it coaches builders confidently into the failure.

Kept from it, and kept deliberately: the security rules, which are right and
transfer verbatim, and the shape of the diagnosis flow at the end, which is the
right shape for a builder-facing troubleshooting skill. Replaced entirely: the
storage model.

Requirements: FR-SK-01, FR-SK-03, FR-SK-04, FR-SK-06, FR-SK-08, FR-SK-12,
FR-BL-13, FR-BR-22, D-25.

The storage model (D-25, FR-SK-12):

- The gitignored `.env` is the sanctioned local home for real values. The agent
  MAY take a value from the builder and write it there under the declared name.
  That file is the ONLY place on the machine a value may enter.
- `.env` is in the mandatory exclusion set (FR-BR-22): out of the pushed tree
  and out of the treeDigest. Values travel in the deploy request's own env
  value maps (name -> value), never inside `files`.
- **The send tooling reads `.env` and fills that field itself.**
  No agent reads a value to send it, exactly as no agent handles the builder's
  sign-in: an agent's inputs are written into its transcript, so a value that
  passes through one has left the machine by a second route. Agents work in
  names - they reconcile `declared-secrets` against the KEYS of `.env` and
  never open the file.
- kst.auth.api writes each value into the app's own Key Vault as a one-way
  conduit: set, never get; never stored outside the vault, never logged, never
  echoed in a refusal (FR-SK-12, FR-SK-08).
- The app reads ordinary environment variables of the declared names, the same
  locally and in production; in production the Container App defines those
  names as Key Vault-backed references resolved by the app's managed identity,
  the only identity with read access (FR-SK-04).
- There is no manual IT/platform-team fill. There is no `<NAME>_KV_URI` and no
  in-app vault fetch.

Unchanged and not to be weakened: no value in source, config, comments, tests,
logs, commit messages, DEPLOY_REQUEST.md, or anything read back to the builder.
===========================================================================
-->

## Where secrets live here

**One file on this machine holds real values: `.env`, in the project root.**
It is never saved into the project's history, and it is never sent with the
code. That is the whole point of it: a place a real key can sit while the app
is being built, that cannot travel anywhere by accident.

**Every app also gets its own vault** once it is live. Not a shared one - its
own, that no other app can read, created for it when it is first deployed. When
the app is sent, the values from `.env` go with it, separately from the code,
and are written into that vault. Writing is all that path can do: nothing in
the platform can read a value back out again. The only thing that can is the
running app itself.

So the app reads a secret the same simple way in both places - by name, as an
ordinary setting. Locally the name is filled in from `.env`. Once deployed the
same name is filled in from the vault. The code does not change, and never
contains the value.

What this means in practice:

| Where a secret must never be | Where it goes instead |
| :-- | :-- |
| In the code | `.env`, by name |
| In a config file, a comment, or a note "for now" | `.env`, by name |
| In a test fixture or example file | `.env`, by name |
| Saved into the project's history | `.env`, which is never saved |
| In the deployment request | Only its **name** goes there |

The deployment request lists secret **names** - `SHAREPOINT_CLIENT_SECRET`,
`OPENAI_API_KEY` - and never values. Those names are exactly the names in
`.env`: same spelling, same list, nothing extra on either side.

## Names that are never secrets: what Keshet sets on the app itself

Some environment variables the app reads are placed there by Keshet at deploy
time, not by the builder: `APP_NAME`, `PLATFORM_BUILD_ID`, `APPLICATIONINSIGHTS_CONNECTION_STRING`,
`KEY_VAULT_URI`, `KST_AZURE_APP_ID`, `KST_AZURE_TENANT_ID`, `KST_CORRELATION_ID`, `PORT`. They are not declared, not put in `.env`,
and not asked for - locally they are absent and the app must cope with that.
The builder cannot know their values, so never ask; if one looks required,
that is a code fix or a platform-team note, never a question.

## What to do when the app needs a secret

1. **Give it a name.** Uppercase, words separated by underscores, describing
   what it is for rather than what it is: `SHAREPOINT_CLIENT_SECRET`, not
   `KEY2`.
2. **Add the name - only the name - to the declared secrets** in the app's
   deployment settings and in `DEPLOY_REQUEST.md`.
3. **Read it in the code the ordinary way** for the language, as an ordinary
   environment variable of that name. Nothing else: no vault address in the
   code, no fetching, no caching. The name arrives filled in, locally and in
   production alike.
4. **Ask the builder for the value and put it in `.env` under that name.**
   This applies only to a value the builder was personally given - a partner
   key, a password from another team. This is the one place a real value
   belongs, and writing it there is your job, not theirs. Confirm it by name only - "I've saved your SharePoint key
   into the app's private settings file" - and never repeat the value back,
   not even the first few characters.

   If the builder does not have the value to hand, say so plainly and leave
   the name declared with nothing behind it. That is safe to build against,
   but it is not safe to send: a declared name with no value gets all the way
   through the deploy and fails at the last step, after the app has been
   built. Better to catch it here.

If you find a secret already sitting in the code - which happens, and is not
something to make the builder feel bad about - take it out, put it in `.env`
under a declared name, replace the code with a read of that name, and tell
them plainly: "I've moved the key out of the code into the app's private
settings file. It was in a place where anyone who could see the project could
read it."

## What the platform does that you do not have to

- Creates the vault, named after the app, readable by that app alone.
- Takes the values sent alongside the code and writes them into that vault.
  This is a one-way door: the platform can put a value in and can never take
  one out.
- Puts each declared name in front of the app as a reference to the vault
  rather than as a plain setting, so the value is not visible to anyone who can
  merely look at the app's configuration.
- **Checks every declared secret actually resolves before the app goes live.**
  A name with nothing behind it fails the deploy rather than producing an app
  that breaks the first time someone uses it.

That last one is the safety net, not a step to route around. It fails loudly,
naming the secret - but it fails late, once the app has already been built, so
the cheaper place to notice a missing value is here, on this machine.

## Security rules - these do not bend

**Never log a secret.** Not while debugging, not temporarily. Logs are kept for
a long time and are visible to more people than you would expect.

```
BAD   log("Connecting with key " + apiKey)
BAD   log(everything_in_the_environment)
GOOD  log("Connected to SharePoint")
```

**Never put a secret in an error message the user sees.** The detail goes to the
log; the person gets a sentence.

```
BAD   throw new Error("Failed to connect: " + connectionString)
GOOD  log_error(err); show("Couldn't reach SharePoint - trying again shortly.")
```

**Never return configuration from the app.** A page or endpoint that echoes the
app's settings back is one of the most common ways a key gets out.

**Never commit a `.env` file.** This is the rule the whole model rests on:
`.env` holds real values, so it must be ignored before the first save of the
project. Check it, and add it if it is not there. One accidental save puts the
secret in the project's history permanently - removing the file afterwards does
not remove it from history, and the key has to be replaced.

**`.env` is the only file a value may enter.** Not a second copy "for testing",
not an example file with the real key filled in, not a note. One file, one
place, ignored by version control, excluded from everything that gets sent.

## "The API key isn't working" - what to check, in order

Work down this list. Most of the time it is 1 or 2.

First, which one is broken - the local run or the deployed app? The answers
differ, and asking saves most of this list.

1. **Has the app been restarted since the value changed?** Locally, the app
   reads `.env` when it starts, so a value edited while it is running has not
   reached it. Restart it. Deployed, the same is true one step up: a value
   changed on this machine reaches the live app on its next deploy, not
   immediately.

2. **Is the name the same in all three places?** The name in the code, the key
   in `.env`, and the name in the declared secrets must match exactly. A typo in
   any of the three produces exactly this symptom. Compare all three, character
   by character.

3. **Is the value in `.env`, and is it in `.env`?** It has to be that file, in
   the project root - not a second file someone made alongside it, and not a
   variant name. Only `.env` is read locally, and only `.env` is sent.

4. **Is the value itself intact?** Copy-paste damage is the most common cause
   there is: a trailing space, a line break in the middle, a smart quote where
   a straight one should be, half a key. The fix is the builder pasting it
   again, freshly, and you writing it into `.env` again - never read back aloud
   to compare, by you or by them.

5. **Is the app allowed to read its vault?** Deployed only. If the app's
   permission on its own vault was never granted, every secret fails at once
   rather than one of them. *This is not something the builder can fix.* Say
   so, and take it to the platform team.

6. **Is the other system refusing us?** If the value is present and correct and
   the other system still says no, the problem is on that side - the key may
   have expired, or the app may not have been given access to what it is asking
   for. That is a conversation with whoever owns that system.

## If the builder asks why it works this way

One sentence, then move on: "Your keys stay in one private file that never
leaves your machine with the code, and once the app is live they live in a
locked box only that app can open - so a key can't end up in the project where
anyone could read it, and can't leak from one app into another."

Do not explain vaults, managed identities, or references. They asked why, not
how.
