'use client';

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useWidgetScript } from './useWidgetScript';

/**
 * React 19+ wrapper for the Keshet `<kst-auth-widget>` Angular-Elements web component.
 *
 * Exposes `azureAppId`, `theme` and `getToken`. Add a `selectionMode?: 'single' | 'multi'`
 * prop (mapping to the `selection-mode` attribute) ONLY if the user explicitly asks for a
 * selection mode - otherwise leave it out and let the widget use its default.
 */

/**
 * Supplies the kst.auth.api bearer token. The widget calls this on every request
 * (not once), so your MSAL handles silent renewal and no stale token is cached.
 */
export type TokenProvider = () => string | Promise<string>;

export interface KstAuthWidgetProps {
  /** Required. The application's Azure AD app (client) id (GUID). */
  azureAppId: string;
  /** Colour theme. Anything other than 'light' falls back to 'dark'. Default 'dark'. */
  theme?: 'light' | 'dark';
  /**
   * Hands the widget your already-signed-in identity. Strongly preferred when the host
   * app uses MSAL: without it the widget opens its own login popup, asking the user to
   * sign in a second time. The token must be this host app's own user token, audienced to
   * the host app's own registration (`api://{azureAppId}`) - not the auth-API's.
   */
  getToken?: TokenProvider;
  /** Optional wrapper styling (the element is Shadow-DOM isolated; only size/position it). */
  className?: string;
  style?: CSSProperties;
  /** Optional render while the script is loading. */
  fallback?: ReactNode;
}

export function KstAuthWidget({
  azureAppId,
  theme = 'dark',
  getToken,
  className,
  style,
  fallback = null,
}: KstAuthWidgetProps) {
  // There is one hosted bundle for every environment - the URL lives in the hook.
  const status = useWidgetScript();

  // React 19 assigns functions as properties, so a fresh arrow from the caller would
  // re-set `getToken` on the element every render and re-run the widget's effect.
  // Keep one stable identity and read the newest callback through a ref, so callers
  // can pass an inline arrow without thinking about it. The ref is written in an
  // effect (never during render); the widget only calls `getToken` after mount, so
  // the effect has always run by the time the value is read.
  const latest = useRef(getToken);
  useEffect(() => {
    latest.current = getToken;
  });

  const stableGetToken = useCallback<TokenProvider>(() => {
    const provider = latest.current;
    if (!provider) throw new Error('<KstAuthWidget>: getToken is no longer available.');
    return provider();
  }, []);

  // azure-app-id is required; the widget will not render without it.
  if (!azureAppId) {
    console.error('<KstAuthWidget> requires a non-empty `azureAppId`.');
    return null;
  }

  if (status === 'error') {
    return <div role="alert">Failed to load the authentication widget.</div>;
  }

  if (status !== 'ready') {
    return <>{fallback}</>;
  }

  // React 19 sets primitives as attributes and functions as properties, which is exactly
  // what the widget wants. Pass `undefined` (not the stable wrapper) when the host has no
  // provider, so the widget falls back to its own MSAL login instead of calling into nothing.
  return (
    <kst-auth-widget
      azure-app-id={azureAppId}
      theme={theme}
      getToken={getToken ? stableGetToken : undefined}
      className={className}
      style={style}
    />
  );
}
