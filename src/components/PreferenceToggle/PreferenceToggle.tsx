'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/AppStoreProvider';
import styles from './PreferenceToggle.module.css';

/**
 * The one live consumer of the app store on the landing page. It subscribes with a selector
 * (not the whole store) and its value survives a reload via persist — proving the SSR-seed →
 * rehydration → persist chain end to end. Delete it along with the rest of the landing page.
 */
export function PreferenceToggle() {
  const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);
  const setReduceMotion = useAppStore((state) => state.setReduceMotion);

  // Mirrors themeStore's applyTheme idiom: stamp the preference onto <html> as a data attribute
  // so plain CSS can act on it. Runs whenever the value changes, so it also applies after
  // rehydration (not just on click) — see globals.css for the rule this attribute drives.
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
