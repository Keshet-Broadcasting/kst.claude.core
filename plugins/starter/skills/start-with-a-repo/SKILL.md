---
name: start-with-a-repo
description: Use at the START of building, before writing or changing any code — a brand-new app in any folder, the first conversation in a fresh copy of the starter, the user saying "let's build", "let's start", "make me an app", or ANY code change when the project has no `.git` folder yet. Fires on every new app, whatever the folder came from. The project must have a local git repo and a first checkpoint from the very first change, so every later step can be undone and deploy-time agents always find history. If git itself is not installed on the machine, this skill installs it first.
---

# Start with a repo

**Building never starts without version history.** If the user is about to build, or you are about to change code, and this project has no local git repo yet, set one up first. Do not wait for a deploy, and do not wait to be asked - by the time someone says "deploy", it is too late to give them checkpoints for everything that came before.

This skill is the trigger. The full playbook for operating git on the user's behalf - vocabulary, checkpoints, undo, recovery - is the `sharing-your-work` skill from the kst-builder plugin. Read it and follow it; do not invent your own workflow here.

## The check, every time building starts

0. **Is git installed?** Run `git --version`. If the command is not found, install it yourself - never ask the user to. On macOS, `git --version` triggers the system's Command Line Tools installer; tell the user "a system window will ask to install some tools - click Install" and wait for it to finish (or install via Homebrew if it is present: `brew install git`). On Windows, `winget install --id Git.Git -e --source winget`. On Linux, the distro's package manager (`sudo apt-get install -y git` or `sudo dnf install -y git`). Re-run `git --version` to confirm before continuing. To the user this is one sentence: "Setting up the tool that keeps your version history - one minute."
1. **Is there a repo?** Run `git status` in the project root. If it fails (no `.git` folder), run `git init`.
2. **Are secrets ignored?** Before the first checkpoint, verify `.gitignore` exists and covers `.env*` and `node_modules/`. Add whichever is missing. Never checkpoint a `.env` file.
3. **Make the first checkpoint immediately.** `git add -A` and commit with a plain message like `First version of the project`. Tell the user in one sentence: "I've set up automatic version history for your project."
4. **Keep the loop running.** From now on, checkpoint automatically after every completed, verified piece of work, exactly as `sharing-your-work` describes. Never leave a session with unsaved changes.

If a repo already exists, there is nothing to set up - just confirm the `.gitignore` rules above still hold and carry on with the normal checkpoint loop.

## Why this matters

- **Undo only works if there is a version to go back to.** A checkpoint made at the start costs seconds; a missing one costs the user their morning.
- **The deploy chain expects history.** When the app is later sent to Keshet, the agents that prepare and verify it read the project's history. A project with no repo cannot show what changed or when.

Never mention git jargon to the user - the vocabulary table in `sharing-your-work` applies here too.
