---
name: git-for-humans
description: Use for ANY version control activity in this project — saving progress, undoing changes, restoring old versions, or when the user says things like "save this", "undo", "go back to how it was", "I broke something", or asks about git. The user is non-technical and must never need to understand git.
---

# Git for humans

**The user does not know git and must never need to.** You operate git entirely on their behalf. Your job: keep their work permanently safe, make every state recoverable, and speak in plain language.

## Vocabulary — never say git jargon to the user

| Never say                   | Say instead                                            |
| --------------------------- | ------------------------------------------------------ |
| commit                      | save / checkpoint ("שמירה", if the user speaks Hebrew) |
| branch, HEAD, detached HEAD | (don't mention at all)                                 |
| revert / reset / checkout   | "go back to the version from …"                        |
| merge conflict              | "two versions of the same file disagree — I'll fix it" |
| repository                  | project                                                |
| push / remote               | "back up online"                                       |

Match the user's language (Hebrew/English) in all explanations.

## Core loop — checkpoint automatically

1. If the project is not a git repo yet (`git status` fails): run `git init`, make an initial checkpoint. Don't announce the mechanics; one line: "I've set up automatic version history for your project."
2. After every completed, verified piece of work (the "definition of done" checks pass): make a checkpoint without being asked.
3. Checkpoint messages describe the change in plain words the USER would recognize, in the USER's language: `Add contact form to the About page` or `הוספת טופס יצירת קשר לעמוד אודות` — never `refactor: extract hook` style. The message is for them, not for engineers.
4. Never leave the repo with uncommitted work at the end of a session. Checkpoint first, then report.
5. One branch only: `main`. Never create long-lived branches, never rebase, never stash. (Temporary backup branches before risky operations are the one exception — see Safety.)

## Answering "what's the state of things?"

Translate `git status` / `git log` into humanspeak, in the user's language:

- "You have 12 saved versions. The latest is from today 14:32: 'Add contact form'."
- "יש לך 12 גרסאות שמורות. האחרונה מהיום 14:32: 'הוספת טופס יצירת קשר'."
- "There are unsaved changes in 3 files since your last checkpoint. Want me to save them?"

Never paste raw git output at the user.

## Undo playbook — by user intent

**"Undo what you just did"** → if not yet checkpointed: `git restore` the touched files. If checkpointed: `git revert` the checkpoint (creates a new checkpoint that undoes it — history is never rewritten).

**"Go back to how it was [this morning / yesterday / before X]"** →

1. Find the checkpoint: `git log --oneline --since=...` or by message.
2. Show the user 2–3 candidate versions with human descriptions and timestamps; let them pick.
3. Restore via `git revert --no-commit <chosen>..HEAD` + checkpoint "Restore project to the version from <time>". History stays linear and nothing is lost — the "wrong" versions remain reachable.

**"I broke something / everything is red"** →

1. First diagnose: is it uncommitted changes, or a bad checkpoint? `git status`, `git diff`.
2. Offer the simplest fix first ("I can put these 2 files back to the last saved version — you'd lose about 20 minutes of changes to them. OK?").
3. Get a plain-language yes before discarding ANY work.

**"Can I see the old version without losing the current one?"** → `git show <commit>:<file>` into a temp copy, or describe the differences. Never `git checkout <old-commit>` — no detached HEAD, ever.

## Safety rails — hard rules

- FORBIDDEN, no exceptions: `push --force`, `reset --hard` on shared history, `clean -fd`, `rebase`, `filter-branch`, amending checkpoints older than the latest.
- Before ANY operation that discards work (`restore`, `revert` of many commits, `reset`): create a backup branch first (`git branch backup-<date>-<hhmm>`), silently. If the user regrets the undo later, restore from it.
- Discarding uncommitted work always requires explicit confirmation, with a plain statement of what disappears: "This will remove today's unsaved changes to the header — the version from 14:32 stays safe. Proceed?"
- Never modify `.git` internals directly.

## Online backup (remote)

- Do not assume a remote exists. If the user asks to "back up online" / "share" and there is no remote, explain they need a (free) GitHub account and walk them through it one small step at a time, waiting after each step.
- Push with plain `git push` only. If push is rejected: `git pull --no-rebase`, resolve, checkpoint, push. Explain conflicts as "the online copy had changes yours didn't — I've combined them."

## What NOT to do

- Don't teach git. If the user asks "what is a commit?", answer in one sentence of plain language and move on.
- Don't expose hashes unless the user asks for a technical detail; refer to versions by time + description.
- Don't create tags, submodules, hooks, or any advanced machinery.
- Don't checkpoint secrets: verify `.env*` and similar are in `.gitignore` before the first checkpoint; add them if missing.
