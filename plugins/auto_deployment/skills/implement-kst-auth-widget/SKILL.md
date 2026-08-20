---
name: implement-kst-auth-widget
description: Use when adding, embedding, or integrating the Keshet KST auth/permissions widget (`<kst-auth-widget>`, the user/permission manager) into a React app — e.g. "add the permissions widget to our React dashboard", "show who has access to app X in React", "embed kst-auth-widget", "React wrapper for the keshet auth web component", or when the widget is already embedded and the user wants to stop it prompting a second login ("pass our MSAL token to the widget", "getToken"). Covers loading the single hosted bundle, wiring the host's token provider, and a typed React wrapper (React 19+). Do NOT use for building the widget itself (the Angular kst.auth.widget project) or for a custom, from-scratch React permissions/roles UI.
---

# Implement `<kst-auth-widget>` in React

## Overview

`<kst-auth-widget>` is a self-contained **Angular Elements web component** (Shadow DOM) that
embeds a permissions manager into any page. It ships as **one hosted script** and talks to
`kst.auth.api` on its own.

The React side has to: (1) load the script once, (2) render the custom element with the right
attributes, and (3) — when the host app already signs users in — hand the widget a token so the
user isn't asked to log in twice. This skill provides the best-practice wrapper for React 19+,
which supports custom elements natively.

**There is exactly one environment.** One bundle, one API instance, one URL:

```
https://app.keshet-tv.com/widgets/kst.auth.widget.js
```

Do not build a dev/stage/prod URL switch, an `env` prop, or a `scriptSrc` override — there is
nothing to switch between. If the user says "we're on dev" or "point it at stage", explain what
actually happens: the API derives the environment from `azure-app-id` (Keshet app registrations
are per environment, so the dev app id resolves to the dev database). Using the dev app id *is*
using dev.

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

The scope to request is a constant — one app registration fronts the API in every environment:

```
api://061fb9ea-aac5-40c6-a1ea-b9681da5a367/.default
```

Typical host wiring with `@azure/msal-react`:

```tsx
import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { KstAuthWidget } from './kst-auth-widget/KstAuthWidget';

const AUTH_API_SCOPE = 'api://061fb9ea-aac5-40c6-a1ea-b9681da5a367/.default';

export function PermissionsPage() {
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

  return (
    <KstAuthWidget
      azureAppId="00000000-0000-0000-0000-000000000000"
      getToken={getToken}
      theme="light"
    />
  );
}
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

1. **Get the `azure-app-id` from the user, ideally before starting.** The widget will not
   render without it, and it is specific to the application being managed (its Azure AD app /
   client id, a GUID). It also determines which environment's data you see. Ask up front rather
   than guessing — a placeholder like `00000000-0000-0000-0000-000000000000` will silently render
   nothing. If they don't have it yet, you can still scaffold the wrapper, but flag clearly that
   the real GUID must be filled in before the widget will work.
2. **Find out whether the host app already authenticates with Azure AD / MSAL.** Grep for
   `@azure/msal` in `package.json`. If it's there, wire `getToken` — don't leave the user with a
   double login. If it isn't, skip `getToken` and mention the widget will show its own popup.
3. **React 19 or newer.** Check `package.json`. React 19 sets unknown props on custom elements as
   attributes (and functions/objects as properties) automatically; **React ≤18 does neither** and
   needs a ref-based wrapper instead. If the target app is <19, STOP and tell the user — this
   skill's wrapper assumes 19+.
4. **TypeScript** (this skill assumes TS; for plain JS, skip the `.d.ts` step).

## Steps

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
   <KstAuthWidget azureAppId={AZURE_APP_ID} getToken={getToken} theme="light" />
   ```

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
| Adding an `env` prop or dev/stage/prod URL map | There is one bundle at `https://app.keshet-tv.com/widgets/kst.auth.widget.js`. The environment follows from `azure-app-id`. |
| Skipping `getToken` in an app that already uses MSAL | The user gets a second login popup for an identity they've already provided. Wire the provider. |
| Passing `getToken` as an attribute, or dash-cased | It's a property, camelCase: `getToken={fn}`. |
| Resolving the token once and returning the cached string | The provider is called per request precisely so the token can be renewed. Return a fresh one each call. |
| Passing `azure-app-id` as `azureAppId` on the raw element | On the raw custom element the attribute is `azure-app-id` (dash-case). The wrapper handles the mapping. |
| Rendering `<kst-auth-widget>` before the script loads | Gate on `useWidgetScript` status (`ready`) — the wrapper does this. |
| Adding `selection-mode` when the user didn't ask for it | Leave it out — it's opt-in, only add on explicit request. |
| Targeting React ≤18 with this wrapper | Attributes and properties won't be set. Use a ref-based wrapper or upgrade React. |
