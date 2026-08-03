import {
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { getApiScopes } from './msal-config';

/**
 * Gets an access token for a protected API. Browser-only — import it from client components.
 *
 * Call this on every request rather than caching the string yourself. `acquireTokenSilent`
 * already serves from MSAL's cache and renews in the background when the token is close to
 * expiry, so "ask again each time" is both cheap and always fresh; a token you hold onto is
 * neither.
 */
export async function acquireAccessToken(
  instance: IPublicClientApplication,
  scopes: string[] = getApiScopes(),
): Promise<string> {
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];

  if (!account) {
    // Reaching here means something rendered outside the guard — surface it as a bug rather
    // than kicking off a login from deep inside a data call.
    throw new Error(
      '[auth] No signed-in account. Render this behind <AuthGuard> so sign-in completes first.',
    );
  }

  try {
    const { accessToken } = await instance.acquireTokenSilent({ account, scopes });
    return accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Consent, MFA or an expired refresh token — only the user can resolve these, and only
      // through the login page. This navigates away and never resolves.
      await instance.acquireTokenRedirect({
        account,
        scopes,
        redirectStartPage: window.location.href,
      });
    }
    throw error;
  }
}
