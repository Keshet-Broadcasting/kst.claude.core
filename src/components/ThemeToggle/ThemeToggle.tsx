'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/store/themeStore';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    void useThemeStore.persist.rehydrate();
  }, []);

  return (
    // Static aria-label, no aria-pressed, and both icons aria-hidden: a deliberate tradeoff, not
    // an oversight. Branching this markup on theme state would reintroduce the hydration-mismatch
    // risk this component exists to avoid, at the cost of screen readers not hearing which theme
    // is active.
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label="Toggle color theme"
    >
      <span className={styles.light} aria-hidden="true">
        ☾
      </span>
      <span className={styles.dark} aria-hidden="true">
        ☀
      </span>
    </button>
  );
}
