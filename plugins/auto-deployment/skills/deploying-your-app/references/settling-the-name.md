# Step 7 - settling the name and the request details

You do this step yourself, in the main conversation. It runs on **every**
send, after security-review and before the verifier, and it is recorded in the
run record under the key `create-repo`. The key is historical: this step never
creates a repo. It checks that the name the builder approved at the intake is
written into the deployment request, and that the request is complete. It
asks the builder nothing.

The app's home at Keshet is created by Keshet itself, in one operation with
the send, and only the verifier may ask for that. There is no git remote, no
push, and no credential on this machine that could reach Keshet any other way -
that is by design, not a limitation.

The builder is not a developer. They never see a command, a URL to configure,
or an Azure screen. You operate the machinery; they make the decisions that
are theirs, and the name is one of them.

## Every send, the same way

Nothing on this machine can tell you whether this app has been sent before. A
fresh laptop has no memory of an earlier deploy, and the builder may have first
shipped this app from somewhere else. Keshet decides whether a send is a first
deployment or a new version, because Keshet is the only side that can see.
Never guess at it, never ask the builder to tell you, and never change what
you do based on an answer either of you assumed.

So the job is the same every time: the app must have a name the builder has
approved, written into `DEPLOY_REQUEST.md`, and the rest of the request must be
complete. The builder approved the name at the intake (step 0), so this step
checks it is written down and moves on. It never asks again - a confirmed name
is a finished job, not a question to repeat.

If the app's details have not been collected yet - no intake in this run - do
not improvise them. The step is **not approved**: go back to the intake.

## 1. The name: agreed at the intake

Agreeing the name is a conversation, not a lookup, and it happens at the
intake. There is nothing to call and nothing to run: no command on this
machine can tell you whether a name will be accepted, and you must not
pretend otherwise.

Follow the `naming-your-app` skill - the naming rules live there. At the
intake you **propose a name** that fits what the app is for, and the builder
approves it, asks for a different one, or gives their own - all three are
ordinary answers. Here, check that the name they approved is in
`DEPLOY_REQUEST.md` as `app-name`, and read the file to confirm it - the
verifier reads the name from that file at send time, so a name agreed in
conversation and not written down does not exist.

Everything else follows from that one name - the app's address, where its
secrets live, how it signs people in. Keshet works all of that out from the
name the builder approved, so the name is the only naming decision anyone here
makes.

Two things you must not do. **Do not run a name past any check on this
machine** - there is no such check, and inventing one means holding a second
copy of rules that will drift out of step with Keshet's. **Do not add rules of
your own** about length, characters or word choice: a name you refuse that
Keshet would have accepted costs the builder a decision for nothing.

If the name turns out not to work, Keshet says so when the send is made, in its
own words, having created nothing. The builder picks again and you try again.
That costs one round trip, and it is the honest price of not keeping a second
rulebook here.

## 2. The deployment request is complete

Read `DEPLOY_REQUEST.md` and check that every field carries a real answer: the
app name (`app-name`), the purpose, the description and tags, the data sources,
the audience type and members, and the declared secret names (empty is a valid
answer for secrets, and only for secrets). A `CHANGE-ME` in the name,
purpose, description, tags, data sources or audience means the intake left
that answer out: settle that one field the intake's way - a draft put to the
builder as a yes-or-change, or, for the audience, the audience question -
in a single message, then carry on. In the secret names, the deployment
agent has not finished - re-run it. Never let a request Keshet will refuse travel further
down the chain.

The `Requester` and `Local agent sign-off` blocks are different: they are
stamped by the platform, not filled by anyone here. Both must be present,
exactly as the plugin's template (`${CLAUDE_PLUGIN_ROOT}/templates/DEPLOY_REQUEST.md`)
has them: a `Requester` block whose three lines - `requested-by-upn`,
`requested-by-object-id`, `broker-verified-at` - each read
`STAMPED-BY-BROKER`, and a `Local agent sign-off` block whose one line,
`verifier-signoff`, reads `pending`. Those placeholder values are correct at
this stage; Keshet rewrites the lines itself when it accepts the app. If
either block is missing, re-run the deployment agent to restore it from the
template, because Keshet can only stamp a line that exists and refuses a
request without them. **Never edit those blocks yourself, and never let anyone
else edit them** - a hand-edited stamp fails Keshet's checks rather than
passing them.

## 3. The description and tags are real

Keshet registers the app in its directory, and IT reads the deployment request
alongside a one-line description and a few tags. You drafted both at the intake
and the builder approved them. Check the `description` and `tags` fields both
carry a real answer - a `CHANGE-ME` or an empty line in either fails. If one is
missing, never ask the builder to write it: draft it from the purpose, write it
in, and put it to them as a yes-or-change in one line. Then read the file back -
the verifier reads them from the file at send time. Do not pass this check
without them.

In this step you write only `app-name`, `description` and `tags`. Nothing else
in the file.

## If a send comes back refused because of the name

When the verifier's send comes back refused over the name, you return to this
step to settle a new one: **look the code up in `broker/refusal-codes.json`
and show the builder the `builderMessage` written there, verbatim.** Never
invent your own wording, never show the code itself, and never paste a raw
error. The `sharing-your-work` skill has the full playbook; do not improvise
around it. Then pick a new name together, exactly as in part 1, and record it.

Two things to hold on to:

- **Nothing was created**, so there is nothing to undo and nothing lost. The
  app, the code and every answer the builder has given are all still here. Say
  that, because a refusal reads like damage and it is not.
- **A name being taken means somebody else has it.** It is never the builder's
  own app coming back at them: sending an app they have deployed before is an
  ordinary new version and simply succeeds. If a refusal ever seems to say
  otherwise, treat it as a platform problem, quote the reference number, and
  route it to the platform team rather than asking the builder to rename an app
  that is already theirs.

If the refusal itself cannot be interpreted - no code, or a code the file does
not contain - use the file's fallback for an unknown platform problem, report
it with whatever reference came back, and record this step as **not
approved**. Fail closed; never guess a refusal into a success.

## Fail closed

If any check cannot be completed - no name from the intake is recorded, the
deployment request will not read, the name cannot be confirmed in the file
after writing - the step is **not approved**, stated plainly, with what
stopped you and what would unblock it. Never "the name is probably fine".

## The run-record entry

Write the entry under `create-repo`. `whatWasChecked` is one line: the name
the builder approved and where it is recorded, the deployment request complete
including description and tags, and anything that could not be checked and why
(anything unchecked means not-approved). `findings` is empty if everything is
ready; otherwise one entry per problem, in the builder's language, each saying
what is wrong and what needs to change.

**Approved means, and only means:** the builder has approved the app's name and
that name is written into the deployment request, every field of the request
carries a real answer - the description and tags included - and the stamped
blocks are present and untouched.

## Hard rules

- Never create the repo, and never send code from this step. Only the
  `verifying-and-sending` skill hands work to the Keshet deployment service.
- Never check a name against anything - not against Keshet, and not against any
  validator, script or rule list on this machine. There is nothing here to
  check against, and the naming authority is Keshet's alone.
- Never decide, or ask, whether this is the app's first send.
- Never ask the builder to run a command, edit a file, or configure anything in
  Azure. If it needs doing, you do it; if you cannot, it goes to the platform
  team.
- Never edit the stamped blocks in `DEPLOY_REQUEST.md`, and never construct or
  repair a sign-off. Both are re-checked on the Keshet side and a forged one
  fails there.
- Never show the builder codes, stack traces, or rule names. Every message they
  read tells them what to change or that it is handled - nothing else.
- Never record a name the builder has not agreed to, and never leave an agreed
  name only in the conversation. If it is not in the deployment request, it did
  not happen.
