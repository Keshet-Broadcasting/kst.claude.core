'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/entities/preferences';
import styles from './ToggleReduceMotionButton.module.css';

export function ToggleReduceMotionButton() {
  const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);
  const setReduceMotion = useAppStore((state) => state.setReduceMotion);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={reduceMotion}
      onClick={() => setReduceMotion(!reduceMotion)}
    >
      Reduce motion: {reduceMotion ? 'on' : 'off'}
    </button>
  );
}
