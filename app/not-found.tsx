import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <h1>Not found</h1>
      <Link href="/">Back to the home page</Link>
    </main>
  );
}
