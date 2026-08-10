---
name: start-with-a-repo
description: Use at the START of building, before writing or changing any code — a new app, the first conversation in a fresh copy of the starter, the user saying "let's build", "let's start", "make me an app", or ANY code change when the project has no `.git` folder yet. The project must have a local git repo and a first checkpoint from the very first change, so every later step can be undone and deploy-time agents always find history.
---

# Start with a repo

**Building never starts without version history.** If the user is about to build, or you are about to change code, and this project has no local git repo yet, set one up first. Do not wait for a deploy, and do not wait to be asked - by the time someone says "deploy", it is too late to give them checkpoints for everything that came before.

This skill is the trigger. The full playbook for operating git on the user's behalf - vocabulary, checkpoints, undo, recovery - is the `git-for-humans` skill. Read it and follow it; do not invent your own workflow here.

## The check, every time building starts

1. **Is there a repo?** Run `git status` in the project root. If it fails (no `.git` folder), run `git init`.
2. **Are secrets ignored?** Before the first checkpoint, verify `.gitignore` exists and covers `.env*` and `node_modules/`. Add whichever is missing. Never checkpoint a `.env` file.
3. **Make the first checkpoint immediately.** `git add -A` and commit with a plain message like `First version of the project`. Tell the user in one sentence: "I've set up automatic version history for your project."
4. **Keep the loop running.** From now on, checkpoint automatically after every completed, verified piece of work, exactly as `git-for-humans` describes. Never leave a session with unsaved changes.

If a repo already exists, there is nothing to set up - just confirm the `.gitignore` rules above still hold and carry on with the normal checkpoint loop.

## Why this matters

- **Undo only works if there is a version to go back to.** A checkpoint made at the start costs seconds; a missing one costs the user their morning.
- **The deploy chain expects history.** When the app is later sent to Keshet, the agents that prepare and verify it read the project's history. A project with no repo cannot show what changed or when.

Never mention git jargon to the user - the vocabulary table in `git-for-humans` applies here too.
