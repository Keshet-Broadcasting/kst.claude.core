'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import {
  EventType,
  PublicClientApplication,
  type AuthenticationResult,
} from '@azure/msal-browser';
import { buildMsalConfig } from '@/shared/lib/auth-client';

/**
 * Boots MSAL and puts it in React context.
 *
 * Three things make this different from the plain `<MsalProvider instance={pca}>` you see in
 * Vite samples, and all three come from Next rendering components on the server first:
 *
 *  1. The instance is created inside `useEffect`, not at module scope. `PublicClientApplication`
 *     reaches for `window` and browser storage in its constructor, so building it during SSR
 *     throws — and a module-scope instance is constructed the moment the module is imported,
 *     which on the server is during render.
 *  2. `initialize()` is awaited before anything renders. MSAL v3+ refuses every other call
 *     until it resolves, so children asking for a token too early would fail.
 *  3. `handleRedirectPromise()` runs once on load to consume the `#code=...` fragment Entra ID
 *     appends when it sends the user back. Skip it and sign-in appears to do nothing.
 *
 * Setting the *active account* is on us either way: MSAL tracks accounts, but not which one
 * subsequent silent calls should use.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<PublicClientApplication | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Building MSAL — including reading its config — happens inside the promise chain rather
    // than in the effect body, so `setError`/`setInstance` are only ever called from async
    // callbacks (never synchronously during the effect, which React discourages). A missing
    // env var throws in `buildMsalConfig`, is caught below, and becomes a rendered message
    // instead of a module-evaluation crash that renders nothing at all.
    let pca: PublicClientApplication | null = null;

    Promise.resolve()
      .then(() => {
        pca = new PublicClientApplication(buildMsalConfig());
        return pca.initialize();
      })
      .then(() => pca!.handleRedirectPromise())
      .then((result) => {
        if (cancelled) return;
        const instance = pca!;

        const account =
          result?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0];
        if (account) instance.setActiveAccount(account);

        // Keeps the active account correct for later sign-ins and account switches, which
        // otherwise leave silent token calls pointed at the previous user.
        instance.addEventCallback((event) => {
          if (
            (event.eventType === EventType.LOGIN_SUCCESS ||
              event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) &&
            (event.payload as AuthenticationResult)?.account
          ) {
            instance.setActiveAccount((event.payload as AuthenticationResult).account);
          }
        });

        setInstance(instance);
      })
      .catch((bootError: unknown) => {
        if (cancelled) return;
        // If `pca` is still null the failure was in config/construction — surface its message
        // (it names the missing env var). A later failure is an init problem: stay generic.
        console.error('[auth] MSAL could not start', bootError);
        setError(
          pca
            ? 'Sign-in is unavailable. Please refresh and try again.'
            : bootError instanceof Error
              ? bootError.message
              : 'MSAL configuration is invalid.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div role="alert">{error}</div>;
  }

  // Rendering children before MSAL is ready would let them fire unauthenticated requests and
  // flash signed-out UI at a user who is, in fact, signed in.
  if (!instance) return null;

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}
