'use client';

import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { acquireAccessToken } from './acquire-token';
import { getApiScopes } from './msal-config';

/**
 * The token-attaching `fetch`.
 *
 * Angular attaches tokens with `MsalInterceptor` and a `protectedResourceMap`; React has no
 * HTTP interceptor, so the equivalent is one wrapper that every data call goes through. That
 * makes this the counterpart of the `protectedResourceMap` — the single place where "which
 * requests get a token, and which scope" is decided. Call `fetch` directly anywhere else and
 * the request goes out bare and comes back 401.
 *
 *   const apiFetch = useApiFetch();
 *   const response = await apiFetch('/api/items');
 */
export function useApiFetch() {
  const { instance } = useMsal();

  return useCallback(
    async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
      const token = await acquireAccessToken(instance, getApiScopes());

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(input, { ...init, headers });

      if (response.status === 401) {
        // MSAL handed over a token the API rejected — usually a scope/audience mismatch
        // between the app registration and AZURE_AD_AUDIENCE, not an expired session.
        console.error(
          `[auth] API rejected the access token for ${String(input)}. ` +
            'Check that NEXT_PUBLIC_API_SCOPE and AZURE_AD_AUDIENCE point at the same app registration.',
        );
      }

      return response;
    },
    [instance],
  );
}
