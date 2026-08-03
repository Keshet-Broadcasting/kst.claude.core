import { LogLevel, type Configuration } from '@azure/msal-browser';

/**
 * Browser-side MSAL configuration.
 *
 * Every value here reaches the browser, so it must be a `NEXT_PUBLIC_*` variable — and that is
 * fine: a client id, tenant id and scope are public identifiers, not secrets. The secret in
 * this flow is the token, and it is minted by Entra ID, never held by the app.
 *
 * Note that nothing is validated at module scope. Throwing while a module is being evaluated
 * takes the whole chunk down before React can mount, so a missing variable would show a blank
 * page and a stack trace pointing at an import — which is a miserable way to learn you forgot
 * an env var. Instead the checks live in the functions below, which are called from inside
 * `AuthProvider`'s effect where the error can be caught and rendered as a message.
 */

function publicEnv(name: string): string | undefined {
  // Next inlines NEXT_PUBLIC_* at build time, so these must be referenced literally —
  // `process.env[name]` would return undefined in the browser bundle.
  return {
    NEXT_PUBLIC_AZURE_AD_CLIENT_ID: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID,
    NEXT_PUBLIC_AZURE_AD_TENANT_ID: process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID,
    NEXT_PUBLIC_AZURE_AD_REDIRECT_URI: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI,
    NEXT_PUBLIC_API_SCOPE: process.env.NEXT_PUBLIC_API_SCOPE,
  }[name];
}

function required(name: string): string {
  const value = publicEnv(name);
  if (!value) {
    throw new Error(
      `[auth] Missing ${name}. Add it to .env.local and restart the dev server — ` +
        'NEXT_PUBLIC_* variables are inlined at build time, so a running server will not pick it up.',
    );
  }
  return value;
}

/** Built on demand so a missing variable surfaces as a rendered error, not a blank page. */
export function buildMsalConfig(): Configuration {
  return {
    auth: {
      clientId: required('NEXT_PUBLIC_AZURE_AD_CLIENT_ID'),
      authority: `https://login.microsoftonline.com/${required('NEXT_PUBLIC_AZURE_AD_TENANT_ID')}`,
      // Must be registered as a **SPA** redirect URI on the app registration — not Web.
      // A Web-platform URI makes Entra ID demand a client secret the browser cannot hold.
      redirectUri: required('NEXT_PUBLIC_AZURE_AD_REDIRECT_URI'),
      postLogoutRedirectUri: required('NEXT_PUBLIC_AZURE_AD_REDIRECT_URI'),
      // Returning the user to the page they were on after a redirect sign-in is the default
      // in msal-browser v5 (the explicit `navigateToLoginRequestUrl` flag was removed).
    },
    cache: {
      // localStorage gives silent SSO across tabs and survives a refresh; sessionStorage does
      // neither. The trade-off is that a successful XSS can read the token — which is why the
      // API validates every token independently and nothing is authorized by the client alone.
      cacheLocation: 'localStorage',
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Error,
        loggerCallback: (_level, message, containsPii) => {
          if (!containsPii) console.error(`[msal] ${message}`);
        },
      },
    },
  };
}

/**
 * Scopes for signing in. Keep this to identity scopes only: asking for API scopes at login
 * time turns a routine sign-in into a consent prompt.
 */
export const LOGIN_SCOPES = ['openid', 'profile', 'User.Read'];

/**
 * The scope that produces a token this app's API will accept — `api://<client-id>/<scope>`,
 * exposed under "Expose an API" on the app registration. The API validates the token's
 * audience against the same registration, so these two must describe the same app.
 */
export function getApiScopes(): string[] {
  return [required('NEXT_PUBLIC_API_SCOPE')];
}
