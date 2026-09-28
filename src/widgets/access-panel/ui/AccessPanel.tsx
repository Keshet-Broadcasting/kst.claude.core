'use client';

import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { AUTH_ENABLED, acquireAccessToken } from '@/shared/lib/auth-client';
import { useThemeStore } from '@/shared/lib/themeStore';
import { KstAuthWidget } from '@/shared/embeds';
import styles from './AccessPanel.module.css';

interface AccessPanelProps {
  /**
   * This app's own Entra registration (client) id. The deploy pipeline injects it as
   * `KST_AZURE_APP_ID` on the Container App; the protected page reads it per request and
   * passes it down. Locally it is usually absent, and the panel says so instead of
   * rendering a widget that would silently show nothing.
   */
  azureAppId?: string;
}

/**
 * Only mounted when auth is enforced, because `useMsal` needs the `MsalProvider` that
 * `AuthProvider` mounts in that mode. Handing the widget `getToken` reuses the sign-in the
 * user already completed at the guard, so no second login popup appears.
 */
function AccessWidgetWithHostToken({ azureAppId }: { azureAppId: string }) {
  const { instance } = useMsal();
  const theme = useThemeStore((state) => state.theme);

  // The widget needs this host app's own user token - audienced to the app's own registration,
  // so the scope is built from its azure-app-id, not a shared auth-API scope. Called by the
  // widget on every request, so MSAL's silent renewal keeps the token fresh.
  const getToken = useCallback(
    () => acquireAccessToken(instance, [`api://${azureAppId}/.default`]),
    [instance, azureAppId],
  );

  return (
    <KstAuthWidget
      azureAppId={azureAppId}
      theme={theme}
      getToken={getToken}
      fallback={<p className={styles.status}>Loading the access widget…</p>}
    />
  );
}

/**
 * Only mounted when enforcement is off (local development). There is no MSAL session to
 * hand over, so the widget falls back to its own login popup when it needs one.
 */
function AccessWidgetStandalone({ azureAppId }: { azureAppId: string }) {
  const theme = useThemeStore((state) => state.theme);

  return (
    <KstAuthWidget
      azureAppId={azureAppId}
      theme={theme}
      fallback={<p className={styles.status}>Loading the access widget…</p>}
    />
  );
}

/**
 * The user-management panel: embeds Keshet's `<kst-auth-widget>` so the people who are
 * already through the front door can be managed from inside the app. This manages
 * permissions *inside* the app - it is not the front door. Who may open the app at all is
 * decided by the audience in the deploy request and enforced by Entra before any app code
 * runs; both layers belong on every app.
 */
export function AccessPanel({ azureAppId }: AccessPanelProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>Who can use this app</h2>
      {azureAppId ? (
        AUTH_ENABLED ? (
          <AccessWidgetWithHostToken azureAppId={azureAppId} />
        ) : (
          <AccessWidgetStandalone azureAppId={azureAppId} />
        )
      ) : (
        <p className={styles.status}>
          The access widget is not configured: KST_AZURE_APP_ID is not set. The deploy
          pipeline sets it automatically on the deployed app; to see the widget locally,
          export KST_AZURE_APP_ID with an app registration id before starting the server.
        </p>
      )}
    </section>
  );
}
