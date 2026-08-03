import { CurrentUserCard } from '@/features/current-user';
import styles from './DashboardPage.module.css';

/**
 * Example protected page. It renders behind `<AuthGuard>` (see `app/(protected)/layout.tsx`),
 * so a signed-out visitor is sent to Microsoft to sign in before this is shown.
 *
 * This is example code — replace it with the app's real protected content.
 */
export function DashboardPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.lead}>
        This page is only reachable when signed in. The card below reads a protected API through
        the token-attaching fetch wrapper.
      </p>
      <CurrentUserCard />
    </main>
  );
}
