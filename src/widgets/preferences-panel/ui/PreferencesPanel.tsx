import { ToggleReduceMotionButton } from '@/features/toggle-reduce-motion';
import styles from './PreferencesPanel.module.css';

export function PreferencesPanel() {
  return (
    <section className={styles.panel}>
      <p className={styles.label}>
        Live example: this preference is held in the app store and survives a reload.
      </p>
      <ToggleReduceMotionButton />
    </section>
  );
}
