'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/shared/lib/themeStore';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    void useThemeStore.persist.rehydrate();
  }, []);

  return (
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
