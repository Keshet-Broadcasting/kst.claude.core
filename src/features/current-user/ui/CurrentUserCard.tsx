'use client';

import { useEffect, useState } from 'react';
import { useApiFetch } from '@/shared/lib/auth-client';
import styles from './CurrentUserCard.module.css';

/**
 * Demonstrates the whole chain end to end: a client component that reads a protected endpoint
 * through `useApiFetch`. The token is attached by the wrapper, verified by middleware, and the
 * identity is read back in `app/api/me/route.ts`.
 *
 * This is example code — delete it once a real protected view exists.
 */
interface Me {
  displayName: string;
  username: string;
}

export function CurrentUserCard() {
  const apiFetch = useApiFetch();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void apiFetch('/api/me')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        return (await response.json()) as Me;
      })
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Request failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  if (error) return <p className={styles.status}>Could not load your profile: {error}</p>;
  if (!me) return <p className={styles.status}>Loading your profile…</p>;

  return (
    <div className={styles.card}>
      <span className={styles.name}>{me.displayName || me.username}</span>
      <span className={styles.meta}>{me.username}</span>
    </div>
  );
}
