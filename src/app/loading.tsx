import styles from './loading.module.css';

// This is the route-level fallback Next shows while navigating TO this route (e.g. from a
// future second page). `page.tsx` itself is a synchronous server component and never suspends,
// so this fallback is never shown on first load of the home page.
export default function Loading() {
  return <p className={styles.loading}>Loading…</p>;
}
