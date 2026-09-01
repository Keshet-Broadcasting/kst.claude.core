import { CurrentUserCard } from '@/features/current-user';
import { AccessPanel } from '@/widgets/access-panel';
import styles from './DashboardPage.module.css';

interface DashboardPageProps {
  /** This app's Entra registration (client) id, read from KST_AZURE_APP_ID by the route. */
  azureAppId?: string;
}

/**
 * Example protected page. It renders behind `<AuthGuard>` (see `app/(protected)/layout.tsx`),
 * so a signed-out visitor is sent to Microsoft to sign in before this is shown.
 *
 * The card is example code - replace it with the app's real protected content. The access
 * panel is not: every app ships with it, so whoever owns the app can manage who may do what
 * inside it. Keep it on a protected page.
 */
export function DashboardPage({ azureAppId }: DashboardPageProps) {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.lead}>
        This page is only reachable when signed in. The card below reads a protected API through
        the token-attaching fetch wrapper.
      </p>
      <CurrentUserCard />
      <AccessPanel azureAppId={azureAppId} />
    </main>
  );
}
