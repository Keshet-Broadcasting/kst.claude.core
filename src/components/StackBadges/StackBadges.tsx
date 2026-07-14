import styles from './StackBadges.module.css';

const BADGES = ['Next 16', 'React 19', 'Zustand', 'CSS Modules', 'TypeScript'];

export function StackBadges() {
  return (
    <ul className={styles.badges}>
      {BADGES.map((badge) => (
        <li key={badge} className={styles.badge}>
          {badge}
        </li>
      ))}
    </ul>
  );
}
