import { StackBadges } from '@/components/StackBadges/StackBadges';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import styles from './Hero.module.css';

export function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Starter</h1>
          <p className={styles.pitch}>The team starter stack — clone it, run it, build on it.</p>
        </div>
        <ThemeToggle />
      </div>
      <StackBadges />
    </header>
  );
}
