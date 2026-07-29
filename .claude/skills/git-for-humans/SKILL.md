---
name: git-for-humans
description: Use for ANY version control activity in this project — saving progress, undoing changes, restoring old versions, or when the user says things like "save this", "undo", "go back to how it was", "I broke something", "get the latest", "share my changes", or asks about git. The user is non-technical and must never need to understand git.
---

# Git for humans

**The user does not know git and must never need to.** You operate git entirely on their behalf. Your job: keep their work permanently safe, make every state recoverable, and speak in plain language.

## Vocabulary — never say git jargon to the user

| Never say                           | Say instead                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| commit                              | save / checkpoint / saved version                           |
| branch, HEAD, detached HEAD         | (don't mention — see Branch rules)                          |
| revert / reset / checkout           | "go back to the version from …"                             |
| staging area, index, tracked/staged | (don't mention — handle silently)                           |
| merge conflict                      | "two versions of the same file disagree — I'll sort it out" |
| repository / repo                   | project                                                     |
| push / remote / origin              | "back up online" / "send to the shared copy"                |
| pull / fetch                        | "get the latest" / "bring in changes from the shared copy"  |
| diff                                | "what changed" / "the difference"                           |
| hash / SHA                          | (don't show — refer to versions by time + description)      |

Match the user's language in all explanations. Never paste raw git output.

---

## Core loop — checkpoint automatically

1. If the project has no version history yet (`git status` fails): run `git init`, make an initial checkpoint. Tell the user in one sentence: "I've set up automatic version history for your project."
2. After every completed, verified piece of work (definition-of-done checks pass): make a checkpoint without being asked.
3. Checkpoint messages describe the change in plain words the user would recognise, in the user's language: `Add contact form to the About page` — never `refactor: extract hook` style.
4. Never leave a session with unsaved changes. Checkpoint first, then report done.
5. Never checkpoint secrets: verify `.env*` and similar are in `.gitignore` before the first checkpoint; add them if missing.

---

## Human intents — playbook

### "Save my work" / "Make a checkpoint"

1. Run `git add -A` (include everything that is not secret).
2. If some files look unrelated to the current task, ask: "I see changes to 3 files — do you want to save all of them together, or just the ones for [task name]?"
3. Commit with a plain-language message describing what was accomplished.
4. Confirm: "Saved. Your project now has [N] checkpoints; the latest is just now: '[message]'."

### "Save just this file" / "Save only some things"

1. Identify which files the user means (ask if ambiguous).
2. `git add <specific files>` only — never `git add -A` for a partial save.
3. Commit those files with a focused message.
4. If other unsaved changes remain, tell the user: "The rest of your unsaved changes are still there — I only saved [file names] this time."

### "What changed?" / "What have I done?" / "Show me what's different"

1. Run `git status` and `git diff HEAD`.
2. Translate into plain language:
   - "You've changed 2 files since the last save: the header and the contact page."
   - "One new file was added: `about.tsx`."
   - "Nothing has changed since the last save."
3. If the user wants details: describe what changed inside each file in one sentence per file, no code snippets unless asked.

### "Is my work saved?" / "Where are we?"

1. Run `git log --oneline -5` and `git status`.
2. Respond in plain language:
   - "You have 8 saved checkpoints. The latest is from today at 14:32: 'Add contact form'. There are no unsaved changes."
   - "You have unsaved changes in 3 files since 14:32. Want me to save them now?"

### "Undo what you just did" / "That was wrong, go back"

- **Not yet saved:** `git restore <touched files>`. Confirm what disappears: "I'll remove the changes made since [time]. The version from [time] will be your latest. OK?"
- **Already saved as a checkpoint:** `git revert HEAD` (creates a new checkpoint that undoes the last one — history is never deleted). Tell the user: "I've added a new saved version that cancels the last one. Everything before it is still there."

### "Go back to how it was [this morning / yesterday / before X]"

1. Find candidate checkpoints: `git log --oneline --since="..."` or search by message keyword.
2. Present 2–3 options to the user with human descriptions and timestamps — no hashes:
   - "Yesterday 09:15 — 'Initial layout'"
   - "Today 11:40 — 'Add navigation'"
3. After the user picks: create a backup first (see Safety), then `git revert --no-commit <chosen>..HEAD` + checkpoint "Restore project to the version from [time]".
4. History stays linear; the reverted versions remain reachable. Confirm: "Done. Your project is back to how it looked [time]. The newer versions are still in history — I can bring them back if you change your mind."

### "I broke something" / "Everything is broken" / "I don't know what happened"

1. **Diagnose first.** Run `git status` and `git diff HEAD`. Determine: is this unsaved changes, or a bad checkpoint?
2. **Offer the simplest fix first:**
   - Unsaved changes: "I can put these files back to the last saved version. You'd lose [N] minutes of changes to [file names]. OK?"
   - Bad checkpoint: "The last save introduced this. I can add a new checkpoint that cancels it — your history stays complete."
3. **Before discarding anything,** get explicit confirmation with a plain statement of what disappears.
4. **If the cause is unclear:** show which files changed and when, and ask the user which change they want removed.

### "Get the latest" / "Someone else updated the project" / "Sync up"

1. Save any unsaved local changes first (checkpoint or stash silently if needed).
2. `git pull --no-rebase`.
3. If it succeeds cleanly: "Got it. The project is now up to date — [N] new changes came in."
4. If there are conflicts: see Merge conflicts below.

### "Share my changes" / "Back up online" / "Send it to the team"

1. Check for a remote: `git remote -v`.
2. **No remote:** Explain in one sentence and walk through setup one step at a time: "To back up online, you'll need a free GitHub account. Do you have one?" — wait after each step.
3. **Remote exists, push succeeds:** "Done. Your latest checkpoint is now backed up online."
4. **Push rejected** (someone else pushed first):
   - `git pull --no-rebase` to bring in their changes.
   - Resolve any conflicts (see below).
   - Checkpoint the merged result: "Merged my work with [name]'s changes."
   - `git push`.
   - Tell the user: "The online copy had new changes — I've combined them with yours and sent everything up."

---

## Merge conflicts — plain-language handling

When `git pull` or merging produces conflicts:

1. Tell the user: "Two people edited the same part of [file name]. I need to sort out which version to keep."
2. For each conflicted file, decide automatically when the intent is clear (e.g., different sections were edited). If both versions touch the same lines and neither is obviously right, show the user both versions in plain language: "Your version says [X]. The other version says [Y]. Which do you want?"
3. After resolving all files: `git add <resolved files>`, then checkpoint: "Merge: combined my changes with the shared copy."
4. Never leave conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in the file. Always verify they're gone before committing.

---

## Branch rules

- One long-lived branch only: `main`. Never create feature branches, never rebase, never stash visible to the user.
- **Temporary backup branches** are the one exception — create them silently before any risky operation: `git branch backup-<YYYYMMDD>-<HHMM>`. If the user regrets an undo, restore from it without mentioning branches: "I kept a copy just in case — I can bring it back."
- Never check out old commits directly — no detached HEAD state, ever. Use `git show <commit>:<file>` to read an old file's contents without leaving the current state.

---

## Safety rails — hard rules

- **FORBIDDEN, no exceptions:** `push --force`, `reset --hard` on any commit that has been pushed, `clean -fd`, `rebase`, `filter-branch`, amending any checkpoint other than the very latest.
- **Before any operation that discards work** (`restore`, reverting many checkpoints, `reset`): create a silent backup branch first. Confirm with the user in plain language what will disappear and that it can be recovered.
- **Never discard uncommitted work without explicit confirmation.** State exactly what disappears: "This will remove today's unsaved changes to the header. The version from 14:32 stays safe. Proceed?"
- Never modify `.git` internals directly.

---

## Recovery — weird or broken git state

If `git status` produces an error, or the repo is in an unexpected state (mid-merge, mid-rebase, detached HEAD):

1. Run `git status` and read the output carefully.
2. For "You are in the middle of a merge": `git merge --abort` to cancel cleanly, then retry.
3. For detached HEAD: `git checkout main` to return to safety. Tell the user: "The project got into an unusual state — I've sorted it out."
4. For a corrupted repo: do not attempt to repair silently. Tell the user: "Something unusual happened with your project's history. Let me know and we'll fix it together."
5. Never run `git gc`, `git fsck --recover`, or any recovery command that modifies history without explaining what it does and getting confirmation.

---

## What NOT to do

- Don't teach git. If the user asks "what is a commit?", answer in one sentence of plain language and move on.
- Don't expose hashes. Refer to versions by time + description only.
- Don't create tags, submodules, git hooks, or advanced machinery.
- Don't assume the user wants a full status dump. Answer the specific question they asked.
- Don't interpret silence as approval to discard work — always ask.
