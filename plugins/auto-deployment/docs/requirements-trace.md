# Requirements trace

Maintainer notes and requirement IDs that used to live as HTML comments inside the agent prompts. Kept out of the prompts on purpose: every line in an agent file is paid for on every run.
Nothing here is loaded by the plugin.

## agents/secrets-manager.md

<!--
Requirements FR-BL-13, FR-SK-04, FR-SK-06, FR-SK-12, FR-BR-22, D-25. Position 2
in the chain defined by the deploying-your-app skill (the orchestrator): after deployment, before auth -
deliberately, because auth wiring often needs a secret and would otherwise
hardcode one. Output feeds the verifier (FR-BL-14) and the declared-secrets
field the security gate parses (FR-GT-08).

This agent collects values and writes them into the gitignored `.env`, which
is the one sanctioned local home for them and the exclusive source of the
deploy request's env value maps (D-25, FR-SK-12, FR-BR-22). There is no
manual IT fill, no `<NAME>_KV_URI`, and no in-app vault fetch. No value may
appear in source, config, comments, tests, logs, commit messages,
DEPLOY_REQUEST.md, or anything read back.
-->

## agents/auth.md

<!--
Requirement FR-BL-11. Position 3 in the chain defined by the deploying-your-app skill (the orchestrator):
after secrets-manager - deliberately, because auth wiring often needs a secret,
and by now every secret is declared by name and reachable as an ordinary
environment variable of that name (FR-SK-04, FR-SK-12), so nothing here ever
hardcodes one.
Output feeds the verifier (FR-BL-14). The data-sources cross-check feeds what IT
sees on the approval form (FR-GT-07).
-->

## agents/app-logging.md

<!--
===========================================================================
Requirement FR-BL-12, with FR-BL-16 (fail closed) and FR-BL-17 (plain
language) applied throughout. The logs this agent adds are the app half of
FR-OB-01, and they land in the shared workspace alongside deployment logs
and the audit stream (FR-OB-05).

FR-OB-08 requires a single correlationId to span the whole flow including the
deployed app's logs. The carrier is the environment variable
KST_CORRELATION_ID, which platform/templates/steps/app-config.yml sets on
every Container App at deploy time from the run's correlation id. The agent
therefore requires the shared logging helper to read KST_CORRELATION_ID once
at startup and emit it on every line as the property `correlationId`,
alongside the app's own per-request `requestId`. The variable is absent
locally, so the helper must not fail or go quiet without it (FR-BL-16 applies:
a helper that cannot cope with its absence is a not-approved, not a warning).

How logs actually reach the platform (read before assuming anything else):
platform/templates/steps/app-config.yml sets
APPLICATIONINSIGHTS_CONNECTION_STRING on the running app at deploy time, as a
Key Vault-backed environment variable the builder cannot see, redirect, or
suppress (FR-OB-06). Nothing in this repository holds that connection string, so
nothing running on the builder's machine can send a log to the platform or
observe one arriving. This agent's honesty rule below follows directly from
that fact.

Requirement IDs live in these comments only. Nothing the builder reads may
contain one.
===========================================================================
-->

## agents/security-review.md

<!--
Requirements: FR-BL-09, FR-BL-16, FR-BL-17.
The .env conduit: FR-SK-12, FR-BL-13, FR-SK-06, FR-BR-22, FR-SK-04. A
gitignored, untracked .env holding real values is the sanctioned state and is
NOT a finding; the findings are a tracked or committed .env, a value in any
other file, a value anywhere in history, and any mismatch between the .env key
list and declared-secrets. There are no per-secret <NAME>_KV_URI variables, no
in-app vault fetches, and no manual platform-team fill - none of these exist.
Requirement IDs appear in these instructions only. They must never appear in
anything the builder reads.
-->

## agents/deployment.md

```
<!--
===========================================================================
Requirements: FR-BL-06 (build contract), FR-BL-07 (the deployment request),
FR-VS-04 (the app spec `.kst/app-spec.md` - written by this agent, read by the
platform's Assess stage at the last deployed commit and compared against the
new code; a spec that contradicts the code fails the run, and a spec change in
the diff is itself major),
with FR-BL-16 (fail closed) and FR-BL-17 (plain language) applied
throughout. Naming follows FR-BL-19. Secret names are FR-BL-13 / FR-SK-12;
the Requester stamp is FR-BR-07 and is read as the ownership record by
FR-BR-26. azure-pipelines.yml parameters are seeded by kst.auth.api at
repo-creation time (FR-BR-04).

Platform facts this agent is written against:
  - there is no name-checking operation anywhere, at Keshet or locally, and
    no script ships with this plugin. kst.auth.api is the naming authority
    (FR-BL-19, FR-BR-11).
  - the Requester stamp is the durable ownership record, not merely a check
    that can fail (FR-BR-07, FR-BR-26).
  - azure-pipelines.yml is seeded by the service, never filled in here -
    the repository does not exist until the service creates it.
  - a CHANGE-ME left in description or tags is REQUEST_MALFORMED, a
    refusal, not a slow approval.
  - secret values live in the gitignored .env and travel in the request's
    own env maps (FR-SK-12), read by the send tooling at send time; they
    appear nowhere this agent writes.
The build contract is package.json + pnpm-lock.yaml, pnpm build,
pnpm start, GET /api/health, $PORT. The preflight below mirrors the
platform image build (platform/dockerfiles/Dockerfile.app): frozen-lockfile
install, build-script approvals from pnpm-workspace.yaml, production build,
prod-deps-only runtime. The one governed template is the thin extends
pipeline kst.auth.api seeds (src/apps/repo-template.util.ts).

Requirement IDs live in these comments only. Nothing the builder reads may
contain one.
===========================================================================
-->
```

## agents/access-manager.md (now skills/deploying-your-app/references/choosing-the-audience.md)

```
<!--
===========================================================================
Requirement FR-BL-10, with FR-BL-16 (fail closed) and FR-BL-17 (plain
language) applied throughout. Runs before security-review so the review sees
the real audience (chain step 5). The audience it
records is applied by the pipeline (FR-DP-06) and enforced by Entra before
any app code runs (FR-DP-04, FR-DP-05).

Two constraints shape this agent:
  - no email-domain assumption. An agent carrying a guessed domain can talk
    a builder out of a correct address. This agent holds no directory and no
    domain list, so it must not judge a domain at all.
  - no group resolution is promised. Nothing in the builder layer or on the
    platform holds a group-directory read (FR-OB-07 records the same gap for
    recipient resolution), so nothing can turn a team name into a group
    before IT reviews the request. The plain team name is recorded as the
    builder said it, and IT confirms the group at review.

Requirement IDs live in these comments only. Nothing the builder reads may
contain one.
===========================================================================
-->
```

## agents/create-repo.md (now skills/deploying-your-app/references/settling-the-name.md)

```
<!--
Requirements: FR-BL-05, FR-BL-14, FR-BL-16, FR-BL-19, FR-BR-26.

1. FR-BL-19: there is no name-checking operation - the contract has no
   `checkName` - and there is no local validator either.
   `platform/scripts/appname.py` is a platform-side helper, is not shipped to
   builder machines, and must never be invoked from here: the plugin ships no
   scripts and a builder machine has no platform repo. The naming task is a
   conversation - propose, approve, change - and kst.auth.api is the naming
   authority that derives the repository, subdomain, vault and app-registration
   names from the one approved name (FR-BR-11).
2. FR-BR-26: the builder layer MUST NOT distinguish a first deployment from a
   later one. This agent therefore runs on every send, not "on the first send
   only" - a builder machine cannot know which it is.
3. FR-BR-28: the closed set has no `APP_EXISTS_OWNED_BY_YOU` code. The
   builder's own existing app is an ordinary successful new version, resolved
   silently server-side from the requester stamp. `NAME_TAKEN` means only
   that somebody else holds the name.

FR-BL-05's "call the push-broker to create the repo" is satisfied through the
verifier: repo creation happens inside the single deploy operation, and
FR-BL-14 makes the verifier the only agent that may invoke it.

Naming note: `create-repo` is a poor fit for what this agent does - it agrees
a name and checks a request, and it never creates a repo. The name and file
name are kept deliberately, because renaming ripples into PLAN.md,
deliverable #16 and FR-BL-05.

Requirement IDs appear in these instructions only, never in anything the
builder reads.
-->
```

## skills/deploying-your-app/SKILL.md

```
<!--
Requirements: FR-BL-02, FR-BL-03, FR-BL-04, FR-BL-14, FR-BL-16, FR-BL-17,
FR-BL-19, FR-BR-26.
Two structural rules govern this agent:

1. FR-BR-26 - the builder layer MUST NOT distinguish a first deployment from
   a later one, and MUST NOT branch on it. There is no "one extra agent, on
   the first send only" branch: create-repo is an ordinary member of the
   chain and runs every time. One deploy operation serves both paths and the
   service decides, from whether the repository already exists, which no
   builder machine can see.
2. FR-BL-19 - the contract has no `checkName` and there is no local validator
   either, so create-repo has no contact with the service at all. The
   verifier is the only component that touches it, without exception.
   `platform/scripts/appname.py` is a platform-side helper and is never
   invoked from a builder machine.

Requirement IDs appear in these instructions only. They must never appear in
anything the builder reads.
-->
```

Note (0.1.13): the deployment block says "no script ships with this plugin". That is no longer true - `scripts/preflight.mjs` and the send tooling ship with it. The naming point it made still holds: there is no name-checking script.

## skills/deploying-your-app/references/intake.md (0.1.16)

Step 0 of the chain. Every builder question of a run is asked once, before
any agent: the orchestrator drafts the name, purpose, description, tags and
data sources from the code for a yes-or-change, and asks the audience
outright. FR-BL-07 (the deployment request) and FR-BL-19 (the name is
proposed and approved) are satisfied here instead of in the deployment
agent's interview; the audience rules of choosing-the-audience.md apply
unchanged, and step 5 writes and checks the answer without asking again.

The intake also runs `send-deploy --signin` in the background, so the
builder's own sign-in (FR-BR-23) is acquired while they answer, not at the
end. The send reuses the kept sign-in, renewing it silently through the
service's `/api/apps/auth/refresh` (the device sign-in requests
`offline_access`); kst.auth.api does not check a token's age, so a sign-in
taken at the start of the run is as good at the send. A device code at the
send is only the fallback when the renewal is refused.

## scripts/tree-digest.mjs and the run-record chain (0.1.17)

The run record keeps an append-only `chain` of every step with the tree
digest before and after it. An approved result stays current while every
later change came from a later step of the same run, so the four
code-changing agents (deployment, secrets-manager, auth, app-logging) no
longer void each other. What covers their changes is what runs on the
finished tree: security-review (must come after the last change) and the
verifier's preflight re-run when the tree moved after deployment. A change
from outside the chain still voids everything before it (fail closed,
FR-BL-16). The digest is content-only (git's file set, never HEAD), so a
checkpoint commit voids nothing. The sign-off digest (`--sent`) is local
evidence only: kst.auth.api accepts `signoff` without validating it today.
