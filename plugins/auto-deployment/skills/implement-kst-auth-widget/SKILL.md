---
name: implement-kst-auth-widget
description: Use when adding, embedding, or integrating the Keshet KST auth/permissions widget (`<kst-auth-widget>`, the user/permission manager) into an app - React (typed wrapper, React 19+) or plain HTML served by any backend - e.g. "add the permissions widget", "show who has access to app X", "embed kst-auth-widget", or when the widget is already embedded and the user wants to stop it prompting a second login ("pass our MSAL token to the widget", "getToken"). Covers loading the single hosted bundle, reading the app id from the platform (never asking the builder for it), and wiring the host's token provider. Do NOT use for building the widget itself (the Angular kst.auth.widget project) or for a custom, from-scratch permissions/roles UI. V:0.1.16
---

# Implement `<kst-auth-widget>` in an app

## Overview

`<kst-auth-widget>` is a self-contained **Angular Elements web component** (Shadow DOM) that
embeds a permissions manager into any page. It ships as **one hosted script** and talks to
`kst.auth.api` on its own.

The React side has to: (1) load the script once, (2) render the custom element with the right
attributes, and (3) — when the host app already signs users in — hand the widget a token so the
user isn't asked to log in twice. This skill provides the best-practice wrapper for React 19+,
which supports custom elements natively.

**There is exactly one bundle.** One script, one URL:

```
https://app-stage.keshet-tv.com/widgets/kst.auth.widget.js
```

Do not build a dev/stage/prod URL switch, an `env` prop, or a `scriptSrc` override — there is
nothing to switch between. If the user says "we're on dev" or "point it at stage", explain what
actually happens: the API derives the environment from `azure-app-id` (Keshet app registrations
are per environment, so the dev app id resolves to the dev database). Using the dev app id *is*
using dev.

## Where `azure-app-id` comes from - never the builder

**Do not ask the builder for the app id. Ever.** They do not have it and cannot get it: the id is
the app's own Entra app registration, which the deploy pipeline *creates* on the first deploy and
then injects into the running app as the environment variable **`KST_AZURE_APP_ID`**. Before the
first deploy it does not exist; after it, the app reads it. A builder is non-technical and has no
"IT team who set up the app in Azure AD" to go to - the platform is that team.

So the rule is:

- The app reads `KST_AZURE_APP_ID` from its environment at runtime and passes it to the widget.
- Never a hard-coded GUID, never a placeholder GUID, never a prompt to the builder. The verifier
  greps for `KST_AZURE_APP_ID` and refuses to sign off an app that hard-codes the id or does not
  read it - a placeholder would silently render nothing *and* block the deploy.
- Locally the variable is usually absent. Render a short "access panel is not configured
  (KST_AZURE_APP_ID is not set)" message instead of the widget; do not invent a value.

If the builder asks "what is the app id?", the answer is: "Nothing to provide - the platform
assigns it when the app is deployed, and the app picks it up automatically."

## Supported inputs (React 19+)

| Prop         | Passed as             | Required | Type                            | Notes |
|--------------|-----------------------|----------|---------------------------------|-------|
| `azureAppId` | attribute `azure-app-id` | **yes** | string (GUID)                | The managed app's Azure AD app (client) id. Also selects the environment. Widget renders nothing without it. |
| `getToken`   | **property** `getToken`  | no, but preferred | `() => string \| Promise<string>` | Supplies the kst.auth.api bearer token. Without it the widget opens its own MSAL login popup. |
| `theme`      | attribute `theme`     | no       | `'light' \| 'dark'`             | Default `dark`. |

Keep the wrapper to these three. **Only add `selection-mode` if the user explicitly asks for a
selection mode** (e.g. "single selection", "let users pick multiple"). When they do: add a
`selectionMode?: 'single' | 'multi'` prop that maps to the `selection-mode` attribute, and declare
`'selection-mode'` in the `.d.ts`. If the user doesn't ask, leave it out — the widget uses its
default behaviour.

## `getToken` — the host supplies the token

This is the part most integrations get wrong, so it's worth understanding rather than copying.

Every call the widget makes to `kst.auth.api` needs an Azure AD bearer token whose **audience is
the auth-API's own app registration**. There are two ways to get one:

- **The host supplies it (`getToken`).** The host app has already signed the user in, so it mints
  the token and hands it over. No popup, and the host's origin does **not** have to be registered
  as a redirect URI on the widget's app registration.
- **The widget logs in itself.** The fallback when no provider is set: its own MSAL popup. That
  means a *second* login for a user who is already signed in to the host, and it requires every
  host origin — including preview and branch deploys — to be added as a SPA redirect URI on the
  widget's registration.

So: **if the host app uses MSAL, wire up `getToken`.** Only fall back to the widget's own login
for hosts that have no Azure AD session of their own.

The scope to request is the auth-API app registration of the environment the app talks to.
Deployed apps talk to stage:

```
api://39f9ffc3-ca80-4a61-bb84-ee283b46fcf3/.default   # stage (deployed apps)
api://eb246617-67aa-485f-8744-b83e79f19064/.default   # prod
api://061fb9ea-aac5-40c6-a1ea-b9681da5a367/.default   # local dev API only
```

A token minted for the wrong audience is rejected by the API, and requesting an unconsented
scope makes MSAL's redirect flow fail outright - so this GUID must match the deployed API.

Typical host wiring with `@azure/msal-react`:

```tsx
import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { KstAuthWidget } from './kst-auth-widget/KstAuthWidget';

const AUTH_API_SCOPE = 'api://39f9ffc3-ca80-4a61-bb84-ee283b46fcf3/.default'; // stage auth API

// Set by the deploy pipeline on the running app. Read it server-side (Next.js: in the
// server component and pass it down as a prop); never hard-code it.
export function PermissionsPage({ azureAppId }: { azureAppId: string | undefined }) {
  const { instance, accounts } = useMsal();

  // Called on every widget request, so silent renewal is handled by MSAL and the
  // widget never holds a stale token. Keep the identity stable with useCallback.
  const getToken = useCallback(async () => {
    const account = instance.getActiveAccount() ?? accounts[0];
    const result = await instance.acquireTokenSilent({
      account,
      scopes: [AUTH_API_SCOPE],
    });
    return result.accessToken;
  }, [instance, accounts]);

  if (!azureAppId) {
    return <p>The access panel is not configured: KST_AZURE_APP_ID is not set.</p>;
  }

  return <KstAuthWidget azureAppId={azureAppId} getToken={getToken} theme="light" />;
}

// e.g. app/(protected)/access/page.tsx (server component):
//   <PermissionsPage azureAppId={process.env.KST_AZURE_APP_ID} />
```

Two properties of the contract that shape the code:

- **It's called per request, not once.** Don't fetch a token up front and pass a closure over a
  captured string — return a fresh one each call (`acquireTokenSilent` is cached by MSAL, so this
  is cheap) and renewal takes care of itself.
- **Once set, it's the only source.** The widget will not fall back to its own popup if the
  provider throws; the request simply fails. That's deliberate — a host that took over
  authentication doesn't want a login popup appearing behind its back. So surface provider errors
  where the developer will see them.

**Azure AD prerequisite:** the host's app registration needs **delegated** access to the auth-API's
app registration, admin-consented, or `acquireTokenSilent` fails with a consent error. This is one
grant per host application, **not** one per environment — the API is a single deployment with a
single audience. Flag this to the user; it usually needs someone with tenant admin rights.

## Prerequisites — check first

1. **Confirm the app reads `KST_AZURE_APP_ID` from its environment** and passes it to the widget
   (see "Where `azure-app-id` comes from"). Do not ask the builder for an id and do not scaffold
   with a placeholder GUID - both fail the verifier. If the app has no server-side way to read an
   environment variable yet (a static page), add one (see the plain HTML section).
2. **Find out whether the host app already authenticates with Azure AD / MSAL.** Grep for
   `@azure/msal` in `package.json`. If it's there, wire `getToken` — don't leave the user with a
   double login. If it isn't, skip `getToken` and mention the widget will show its own popup.
3. **Is it React at all?** If the app is plain HTML (any backend - Python, Node, static files
   behind a small server), skip the React wrapper entirely and follow "Plain HTML apps" below.
4. **React 19 or newer** (React apps only). Check `package.json`. React 19 sets unknown props on
   custom elements as attributes (and functions/objects as properties) automatically; **React ≤18
   does neither** and needs a ref-based wrapper instead. If the target app is <19, STOP and tell
   the user - this skill's wrapper assumes 19+.
5. **TypeScript** (the React wrapper assumes TS; for plain JS, skip the `.d.ts` step).

## Steps - React app

1. Copy the three reference files into the app (e.g. `src/kst-auth-widget/`):
   - [`KstAuthWidget.tsx`](references/KstAuthWidget.tsx) — the typed React wrapper.
   - [`useWidgetScript.ts`](references/useWidgetScript.ts) — dedup script-loader hook, and the
     single source of truth for the bundle URL.
   - [`kst-auth-widget.d.ts`](references/kst-auth-widget.d.ts) — JSX typing for the element.
2. Ensure the `.d.ts` is picked up (it is if it lives under a folder covered by `tsconfig`'s
   `include`; otherwise add it).
3. Wire `getToken` from the host's existing auth, unless the host has none (see above).
4. Render it:

   ```tsx
   <KstAuthWidget azureAppId={azureAppId} getToken={getToken} theme="light" />
   ```

   where `azureAppId` was read from `process.env.KST_AZURE_APP_ID` on the server.

## Steps - plain HTML app

The widget is a custom element, so any page that can run a `<script>` tag can host it. The only
work is getting `KST_AZURE_APP_ID` from the server's environment into the page - it must not be
typed into the HTML.

1. **Have the server inject the id.** Whatever serves the page reads the variable and writes it
   into the HTML at request time. Two common shapes:
   - Template rendering (Flask/Jinja, FastAPI templates, Express views):
     `<kst-auth-widget azure-app-id="{{ azure_app_id }}" theme="light"></kst-auth-widget>`
     with `azure_app_id = os.environ.get("KST_AZURE_APP_ID")` passed to the template.
   - A tiny config endpoint, when the HTML is a static file: the server exposes
     `GET /config` returning `{"azureAppId": "<env value>"}` and the page fetches it before
     creating the element.
2. **Load the bundle once**, on the page behind sign-in:

   ```html
   <script src="https://app-stage.keshet-tv.com/widgets/kst.auth.widget.js" defer></script>
   ```

3. **Render the element only when the id is present.** If the injected value is empty, show
   "The access panel is not configured: KST_AZURE_APP_ID is not set." instead.
4. **Token:** if the page already signs users in with MSAL (`@azure/msal-browser`), set the
   provider as a *property* after the element exists, never as an attribute:

   ```js
   const el = document.querySelector('kst-auth-widget');
   el.getToken = async () => {
     const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
     const r = await msal.acquireTokenSilent({ account, scopes: [AUTH_API_SCOPE] });
     return r.accessToken;
   };
   ```

   If the page has no MSAL session of its own, leave `getToken` unset; the widget uses its own
   login popup (see the fallback caveats in Gotchas).

## Gotchas

- **`getToken` is a property, not an attribute.** A function can't travel through HTML. React 19
  assigns non-primitive values as properties, so the JSX prop works — but on a raw element you'd
  have to write `el.getToken = fn`. Never `get-token="..."`.
- **Have the provider ready at first render.** If you pass `undefined` while MSAL initializes and
  supply the function a moment later, the widget may already have started requesting and opened its
  popup. Either gate rendering of the widget on your auth being ready, or pass a stable function
  that awaits initialization internally.
- **Unstable function identity churns the property.** An inline arrow is a new value every render,
  which re-sets the element property each time. The wrapper defends against this with a ref, but
  `useCallback` in the host is still the clearer habit.
- **Shadow DOM:** the widget's styles are isolated. Host CSS won't leak in and can't restyle its
  internals — only size/position the element from outside.
- **Required `azureAppId`:** the wrapper renders nothing until `azureAppId` is set and the script
  is `ready`.
- **Load once:** `useWidgetScript` dedupes the `<script>` and waits on
  `customElements.whenDefined` — safe under React StrictMode double-mount and multiple widgets.
- **MSAL popup (fallback path only):** with no `getToken`, the host page must not block popups, and
  the host origin must be registered as a SPA redirect URI on the widget's registration.
- **`selection-mode` is opt-in:** don't add it unless the user explicitly asks (see Supported inputs).

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Asking the builder for the app id, or scaffolding with a placeholder GUID | The builder does not have it and cannot get it. Read `KST_AZURE_APP_ID` from the environment; the pipeline sets it on first deploy. |
| Adding an `env` prop or dev/stage/prod URL map | There is one bundle at `https://app-stage.keshet-tv.com/widgets/kst.auth.widget.js`. The environment follows from `azure-app-id`. |
| Skipping `getToken` in an app that already uses MSAL | The user gets a second login popup for an identity they've already provided. Wire the provider. |
| Passing `getToken` as an attribute, or dash-cased | It's a property, camelCase: `getToken={fn}`. |
| Resolving the token once and returning the cached string | The provider is called per request precisely so the token can be renewed. Return a fresh one each call. |
| Passing `azure-app-id` as `azureAppId` on the raw element | On the raw custom element the attribute is `azure-app-id` (dash-case). The wrapper handles the mapping. |
| Rendering `<kst-auth-widget>` before the script loads | Gate on `useWidgetScript` status (`ready`) — the wrapper does this. |
| Adding `selection-mode` when the user didn't ask for it | Leave it out — it's opt-in, only add on explicit request. |
| Targeting React ≤18 with this wrapper | Attributes and properties won't be set. Use a ref-based wrapper or upgrade React. |
