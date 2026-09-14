# Platform note - read before using this skill

**Adopted verbatim** from `kst.claude.core` @ `c0547f5`
(`github.com/Keshet-Broadcasting/kst.claude.core`), path
`.claude/skills/implement-kst-auth-widget/`. Recording the copy-point SHA
follows FR-DP-13's precedent, so upstream drift can be diffed rather than
guessed at.

It was carried over unchanged at first. Since 0.1.7 it diverges from upstream in
one deliberate way: upstream tells the developer to obtain `azure-app-id` from
the user, while on this platform the id is created by the deploy pipeline and
injected as `KST_AZURE_APP_ID`, so the skill now forbids asking the builder and
adds a plain-HTML embed path. Diff against upstream with that in mind.

## The one thing that must be stated, and is not in the skill

**This widget manages permissions *inside* an app whose users are already
through the front door. It is not the front door.**

The platform's access control (FR-DP-04, FR-DP-05, FR-DP-06) decides **who may
open the app at all**, and it is enforced by Entra before a single line of app
code runs. That is a different layer, a different mechanism, and a different
decision.

An agent that treated this widget as the platform's access control would produce
an app that **lets everyone in and then shows them a permissions screen**. That
is the failure mode this note exists to prevent (core gap analysis §7.10).

Both layers can be present. Neither substitutes for the other:

| Layer | Who decides | When | Requirement |
| :-- | :-- | :-- | :-- |
| Front door - may this person open the app? | The audience the builder chose, enforced by Entra | Before any app code runs | FR-BL-10, FR-DP-05, FR-DP-06 |
| Inside - what may this person do in it? | This widget | After they are in | Deliverable #17, in-app half |

**Deliverable #17 must state which of the two it addresses** before the
access-manager agent is written.

**The answer: both, on one screen.** That is what Keshet demonstrated and
what Keshet expects. It does not merge the two layers - they are still enforced in
different places, by different systems, at different times - so #17 has to present
one list over two mechanisms. The requirement that falls out of that: **one write
path and one source of truth.** A screen writing independently to the Entra group
and to `kst.auth.api` will drift, and it drifts invisibly in the direction that
hurts - a person shown as having access who is refused at the door. See the
implementation gap analysis §9 item 3.

## Two constraints this skill puts on the platform

1. **React 19 or newer is required** for the host wrapper - but only for the
   *wrapper*. `<kst-auth-widget>` is an Angular Elements custom element served as
   one hosted bundle, so any page that can run a `<script>` tag can embed it
   directly, including the plain HTML front end of a `python` app. React 19
   matters because React below 19 does not set non-primitive props on custom
   elements, which breaks `getToken`; it is a React problem, not a widget one.

   *(The React 19 requirement does not rule the widget out for the `python`
   archetype, and the difference matters: embedding the widget is a live option
   for every archetype the platform supports, so #17's shape is not constrained
   by it.)*

2. **Each host app needs admin-consented delegated access** to the auth API's
   app registration - **one grant per host application**, not one per
   environment. That is a recurring per-app manual grant with the same failure
   mode as the per-app Key Vault grant: if it needs a Keshet ticket every time,
   it becomes the slowest step in the flow. Tracked as **P12** in
   MVP_requirements §3, and it must be resolved the same way D-6 resolves P11.

If P12 is not resolved, embedding this widget in #17 makes every new app wait on
a ticket. That is a reason to decide P12 before choosing the shape of #17, not
after.

## Confirmed facts taken from this skill

Already recorded in MVP_requirements §3 as confirmed - do not re-request from
Keshet:

- the widget bundle is at `https://app-stage.keshet-tv.com/widgets/kst.auth.widget.js`,
  one URL, no dev/stage/prod switch
- the auth API scope is per environment: stage (deployed apps) is
  `api://39f9ffc3-ca80-4a61-bb84-ee283b46fcf3/.default`, prod is
  `api://eb246617-67aa-485f-8744-b83e79f19064/.default`, and
  `api://061fb9ea-aac5-40c6-a1ea-b9681da5a367/.default` is the local dev API only
- the API derives the environment from `azure-app-id`, and Keshet's app
  registrations are per environment
- the widget is an Angular Elements custom element using Shadow DOM, with its
  own MSAL popup as a fallback

The fallback is worth knowing about and worth avoiding: it means a second login
prompt and every host origin registered as a SPA redirect URI, which is the
opposite of FR-DP-03's one-domain-one-login promise.

## Not yet reconciled

`kst.claude.core` has an embeds system (`pnpm embed:add`, an `embed.json`
contract, `embed-check.mjs` in lint) whose whole purpose is third-party widget
embedding - and this skill hand-writes its wrapper instead of using it. If both
are ever carried forward, that inconsistency needs resolving. For the MVP the
embeds system is deferred (gap analysis §5.1) and this skill stands alone, so
nothing needs deciding yet.
