# Step 5 - choosing the audience

You do this step yourself, in the main conversation. The question is asked
once, at the intake (step 0), together with every other question of the run;
this file holds the rules for that question and its follow-ups. Step 5 itself
runs after app-logging and before security-review: it writes the builder's
answer into the deployment request and checks it, and asks nothing. It is
recorded in the run record under the key `access-manager`. If the builder
wants to change who can use the app, or asks "who can see this", ask the
question again then, the same way.

You decide nothing here. Your whole job is to make sure the **builder** decides
one thing, out loud, in their own words: **who may open this app.**

This is one of the two decisions that must never be made for them (the other is
what data the app reaches). No default, no suggestion, no "I'll assume your
team". If the builder has not named an audience, the step is **not approved** -
an empty or assumed audience is a rejected deploy, not a permissive one.

## What this decision is - and what it is not

This is the **front door**. The platform checks every person against the list
the builder gives you here, before a single line of the app's code runs. Someone
not on the list does not see a broken page or a login error - they simply cannot
open the app at all.

It is **not** permissions inside the app. "Everyone on the list can open it, but
only managers can press the delete button" is a different mechanism, handled by
the `implement-kst-auth-widget` skill after people are already through the door.
If the builder starts describing roles, levels, or "some people can only view",
split the conversation: settle the front door here, and point the in-app half at
that skill. Never treat an in-app permissions screen as a substitute for the
front door - an app that lets everyone in and then shows them a permissions
page has no front door.

Also not this decision: what data the app can reach. A person who can open the
app but has no permission on an underlying data source gets a clean "you don't
have access to this data" from that source, because the app passes each user's
own sign-in through. So the audience does not need to be trimmed to "people who
already have the data permissions" - but it also must not be widened on the
theory that the data sources will sort it out.

## How to ask it, at the intake

Ask plainly, in words like these:

> Who should be able to open this app? Nobody can until you say - there is
> no default.

Offer the choices below, none of them marked as recommended:

- **Only me** - recorded as individuals, with the address the builder's
  Keshet sign-in printed. If that is not available, their work email is the
  one follow-up question.
- **Specific people** - they give the Keshet work email addresses.
- **A team group** - they name the team.
- **Keep: ...** - only when an audience is already recorded in the
  deployment request, shown in their words. It is their own earlier answer
  offered back, not a default: picking it is their confirmation.

If the conversation ends before they answer, nothing is recorded: the next
run's intake asks again.

Their answer has to fit one of the two forms the platform accepts:

- **Named individuals** - specific people, by their Keshet work email address,
  written exactly as the builder gives it to you.
- **Groups** - an existing Keshet team group, for example a department or a
  team that IT already maintains as a group. You record the team's plain name
  as the builder says it; IT confirms the group when they read the request.

One request uses one form or the other, not a mix. If the builder names both
("my team plus Dana from finance"), tell them that and help them pick: usually
either the group alone, or a list of individuals that includes Dana.

Rules for the conversation, none of them negotiable:

- **Never pre-fill an answer.** Not "everyone", not "your team", not the people
  mentioned earlier in the chat. You may remind them who the app seems to be
  for based on its stated purpose - "you described this as a tool for the
  newsroom schedulers" - but the naming is theirs. An audience already in
  the deployment request is offered back as the "Keep" choice, never kept
  silently. The recorded audience is whatever they most recently chose.
- **"Everyone at Keshet" must be said, not clicked.** If they answer "everyone"
  or "the whole company", do not record it yet. Reflect it back once:
  > That means every person at Keshet will be able to open this app and see
  > what it shows. Given what the app is for, is that what you want?
  If they confirm in their own words, record it as a group, using the name
  they give for the everyone-at-Keshet group - ask them what it is called if
  they have not said, and write that name down as they say it. One
  confirmation is enough - this is a deliberateness check, not an obstacle
  course.
- **Vague answers are not answers.** "The usual people", "whoever needs it",
  "you decide" - say kindly that you are not allowed to decide this one, and
  ask again with the two forms in front of them.
- **Narrower is safer, and say why.** Tell them, once, in plain terms:
  > When this request reaches IT, they read who can open the app right next to
  > what the app is for, and they reject combinations that don't make sense -
  > a small team tool open to the whole company will come back with questions.
  > The quickest path to approval is an audience no wider than the purpose
  > needs.
- **Changing their mind is fine.** If they widen or narrow the audience later,
  ask again and redo step 5. The recorded audience must always be the one
  they most recently stated.
- **One answer is enough.** Once they have chosen at the intake, step 5
  does not read it back for another yes. Asking twice is what makes the run
  slow, and it proves nothing the first answer did not.

## Individuals: a quiet sanity pass, at the intake

Do this pass while the builder is still answering the intake, and put any
query into its follow-ups. Step 5 never queries an address.

**An individual is recorded as an email address, never as a name.** If the
builder says "Roman Neganov", that is a person, not an address - Keshet's gate
needs the address, and a name written into the request is refused or, worse,
matches nobody. Ask, in their words: "What's Roman's Keshet email address?"
That is a question they can answer. Never write an entry without an `@` into
`audience-members`, and never guess the address from the name.

Look at each address before recording it. You cannot check the company
directory from here and must not claim to have. You also do not know what
Keshet's email addresses look like - there is no list of company domains on
this machine, and guessing at one is how a builder gets talked out of an
address that was right all along. **Never "correct" the part of an address
after the `@`, and never tell a builder a domain looks wrong.**

What you can still catch, because it needs no directory:

- one address in the list built differently from all the others, when the rest
  clearly share a pattern - worth asking about, not worth changing.
- the same person's name spelled two ways in one breath.
- an obviously personal address - gmail, hotmail, and their kind - which is
  probably not how that person signs in at work.

Query anything doubtful in plain words, and let the builder settle it: "you
wrote dana.c@... and earlier said Dana Kohen - same person, and is that the
address she uses at work?" A wrong address here means a real person locked out
on launch day, discovered only when they complain. So does an address you
"fixed" for them.

## Groups: say what you actually know

Write down the team's plain name exactly as the builder said it. Do not look
it up, do not tidy it into something that sounds more official, and do not
claim it has been found - nothing here can see Keshet's list of groups, so
"I've located that group" would be a guess dressed up as a fact.

Tell the builder plainly what happens next:

> I've written down the newsroom schedulers as the group who can open it. IT
> checks that group when they review the request - if it turns out there's no
> such group, it comes back to us and you pick again. Nothing you've built is
> affected either way.

Never quietly turn a group into a list of individuals because you are unsure
the group exists. The builder chose a team on purpose: a team keeps working
when someone joins or leaves it, and a list of names does not.

## Recording the choice

The choice goes into `DEPLOY_REQUEST.md`, in the audience section, using the
file's exact existing schema - two `field: value` lines inside the existing
code block:

```
audience-type: individuals
audience-members: dana.cohen@example.com, yossi.levi@example.com
```

or

```
audience-type: entra-groups
audience-members: newsroom-schedulers
```

The addresses above only show the shape. Write the addresses the builder
actually gave you, character for character.

- `audience-type` is exactly `individuals` or `entra-groups` - nothing else.
- `audience-members` is a comma-separated list: email addresses for
  individuals, group names for groups. At least one entry, always.
- Replace the `CHANGE-ME` placeholders; do not add fields, rename fields, or
  reformat the block. The pipeline parses these lines and refuses a malformed
  file.
- In this step, write **only** the audience fields. Never edit the Requester or
  Local agent sign-off blocks - they are stamped by the platform, and the
  Requester block in particular is how Keshet knows this app belongs to this
  builder on every later deploy. Editing it can cost them ownership of their
  own app, so leave it exactly as you found it even if it looks wrong.

To the builder, call it "the deployment request" or "who can open the app" -
never quote field names or file paths at them.

After writing, read the section back: the type is one of the two allowed
words, the members line is non-empty and matches the type (emails for
individuals, group names for groups), and no `CHANGE-ME` remains anywhere in
the audience section. If anything fails that read-back and you cannot correct
it, the step is not approved.

Then tell the builder in one sentence what you recorded - a statement, not a
question:

> Done - when the app goes live, it will open only for the newsroom-schedulers
> group. Anyone else who tries the link won't get in.

## Fail closed

The step is **not approved** whenever any of these is true, and you say which
in plain words:

- The builder has not named an audience, or gave only a vague one.
- The builder said "everyone" and has not confirmed it deliberately.
- The audience section still contains a placeholder, is empty, or does not
  match the schema after your edit.
- You could not read or write the deployment request at all.
- Anything else stopped you completing the step. An unfinished check is a
  failed check, never a shrug and a pass.

Not approved halts the chain before security-review. That is by design: the
review must see the real audience, not a placeholder.

## The run-record entry

Write the entry under `access-manager`. `whatWasChecked` is one line: the
audience conversation, the write into the deployment request, the read-back,
and anything that could not be checked and why (anything unchecked means
not-approved). `findings` always records the audience as written - the type
and the members, exactly as they went into the deployment request, or "none
recorded" with the reason - and whether the builder explicitly confirmed an
"everyone" choice; plus one entry per problem, in the builder's language.

Approved means, and only means: the builder explicitly chose this audience at
this run's intake (or when they changed it later), it is recorded in the
deployment request in valid form, and the read-back passed.
