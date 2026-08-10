---
name: secrets-in-your-app
description: Load this skill whenever the user mentions API keys, passwords, tokens, connection strings, `.env` files, or connecting the app to any other system - a database, an AI service, SharePoint, an internal API. Trigger immediately when someone is about to put a key, password, or URL directly into the code, and when they say "the API key isn't working", "it can't reach the database", or "it works on my machine but not after deploying".
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

Requirements: FR-SK-01, FR-SK-03, FR-SK-04, FR-SK-06, FR-BL-13.
===========================================================================
-->

## Where secrets live here

**Every app gets its own vault.** Not a shared one - its own, that no other app
can read, created when the app is first deployed.

The app never holds the secret and never sees a copy of it. At the moment it
needs one, it asks the vault, and the vault answers because the app's identity
is on the list of things allowed to ask. Nobody typed a password anywhere for
that to work.

What this means in practice:

| Where a secret must never be | Where it goes instead |
| :-- | :-- |
| In the code | The app's vault |
| In a `.env` file | The app's vault |
| In a config file, a comment, or a note "for now" | The app's vault |
| In the deployment request | Only its **name** goes there |

The deployment request lists secret **names** - `SHAREPOINT_CLIENT_SECRET`,
`OPENAI_API_KEY` - and never values. If you find yourself wanting to put a value
next to a name, that value is a secret and belongs in the vault.

## What to do when the app needs a secret

1. **Give it a name.** Uppercase, words separated by underscores, describing
   what it is for rather than what it is: `SHAREPOINT_CLIENT_SECRET`, not
   `KEY2`.
2. **Add the name - only the name - to the declared secrets** in the app's
   deployment settings and in `DEPLOY_REQUEST.md`.
3. **Read it in the code the ordinary way** for the language, as if it were an
   environment variable. The platform wires the name to the vault at deploy
   time, so it arrives under the name you declared.
4. **Ask the builder for the value once**, and put it straight into the vault -
   never into a file on their machine on the way there. If the vault does not
   exist yet because the app has not been deployed, tell them that, and take the
   value only when there is somewhere to put it.

If you find a secret already sitting in the code - which happens, and is not
something to make the builder feel bad about - take it out, replace it with the
declared name, and tell them plainly: "I've moved the key out of the code into
the app's secure storage. It was in a place where anyone who could see the
project could read it."

## What the platform does that you do not have to

- Creates the vault, named after the app, readable by that app alone.
- Puts each declared name in front of the app as a reference to the vault
  rather than as a plain setting, so the value is not visible to anyone who can
  merely look at the app's configuration.
- **Checks every declared secret actually resolves before the app goes live.**
  A name that has no value in the vault fails the deploy rather than producing
  an app that breaks the first time someone uses it.

That last one is why declaring a secret you have not yet put in the vault is
safe: it fails loudly, at deploy time, with a message naming the secret.

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

**Never commit a `.env` file.** Check it is ignored before the first save of the
project, and add it if it is not. One accidental save puts the secret in the
project's history permanently - removing the file afterwards does not remove it
from history, and the key has to be replaced.

## "The API key isn't working" - what to check, in order

Work down this list. Most of the time it is 1 or 2.

1. **Has the app been deployed since the secret was added?** A secret added to
   the vault reaches the app on its next deploy, not immediately.

2. **Is the name declared?** The name in the code, the name in the declared
   secrets, and the name in the vault must be the same name. A typo in any of
   the three produces exactly this symptom. Compare all three, character by
   character.

3. **Is there a value in the vault, and is it right?** Copy-paste damage is
   common - a trailing space, a line break, a smart quote where a straight one
   should be. Have the builder paste it again rather than reading it back to
   you.

4. **Is the app allowed to read its vault?** If the app's permission on its own
   vault was never granted, every secret fails at once rather than one of them.
   *This is not something the builder can fix.* Say so, and take it to the
   platform team.

5. **Is the other system refusing us?** If the value is present and correct and
   the other system still says no, the problem is on that side - the key may
   have expired, or the app may not have been given access to what it is asking
   for. That is a conversation with whoever owns that system.

Note what is **not** on this list, and used to be: there is no dev server to
restart, and no `.env.local` to be in the wrong folder. Those are the standalone
model's failure modes, not this platform's.

## If the builder asks why it works this way

One sentence, then move on: "Each app keeps its keys in its own locked box that
only it can open, so a key can't leak from one app into another and nobody has
to keep a copy of it on their laptop."

Do not explain vaults, managed identities, or references. They asked why, not
how.
