import { Hero } from '@/components/Hero/Hero';
import { PatternCard } from '@/components/PatternCard/PatternCard';
import { PreferenceToggle } from '@/components/PreferenceToggle/PreferenceToggle';
import styles from './page.module.css';

const PATTERNS = [
  {
    title: 'Zustand under SSR',
    description:
      'A per-request store factory seeded from the server, with persist + skipHydration so there is no hydration mismatch.',
    file: 'src/store/appStore.ts',
  },
  {
    title: 'Seeding from the server',
    description:
      'layout.tsx reads getInitialAppState() directly and hands it to the provider — no fetch to our own route.',
    file: 'src/app/layout.tsx',
  },
  {
    title: 'No theme flash',
    description:
      'An inline script stamps data-theme on <html> before first paint, so a dark reload never flashes white.',
    file: 'src/lib/theme.ts',
  },
  {
    title: 'Route handler',
    description: 'A minimal GET endpoint you can curl or fetch from the client.',
    file: 'src/app/api/health/route.ts',
  },
  {
    title: 'Scripts',
    description: 'dev, build, lint, typecheck, format and test — see the README.',
    file: 'package.json',
  },
  {
    title: 'Testing',
    description: 'Vitest + React Testing Library, colocated beside each component.',
    file: '*.test.tsx',
  },
];

export default function Home() {
  return (
    <main className={styles.main}>
      <Hero />

      <section className={styles.preferences}>
        <p className={styles.preferencesLabel}>
          Live example: this preference is held in the app store and survives a reload.
        </p>
        <PreferenceToggle />
      </section>

      <ul className={styles.grid}>
        {PATTERNS.map((pattern) => (
          <li key={pattern.title}>
            <PatternCard {...pattern} />
          </li>
        ))}
      </ul>

      <footer className={styles.footer}>
        Delete <code>src/app/page.tsx</code> and the landing components, wire your app into{' '}
        <code>AppStoreProvider</code>, and start building.
      </footer>
    </main>
  );
}
