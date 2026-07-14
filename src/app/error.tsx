'use client';

import styles from './error.module.css';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className={styles.main}>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      {error.digest && <p>Digest: {error.digest}</p>}
      <button type="button" onClick={() => unstable_retry()}>
        Try again
      </button>
    </main>
  );
}
