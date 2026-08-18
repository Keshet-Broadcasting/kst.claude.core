import type { CSSProperties } from 'react';
import Image from 'next/image';
import styles from './HomePage.module.css';

const STARS = [
  { left: '70.1%', top: '14.8%', size: '1.2px', dur: '3.4s', delay: '1.3s' },
  { left: '95.5%', top: '72.6%', size: '1.2px', dur: '3.6s', delay: '4.6s' },
  { left: '21.2%', top: '73.6%', size: '1.6px', dur: '3.5s', delay: '2.5s' },
  { left: '95.6%', top: '25.7%', size: '2.3px', dur: '6.9s', delay: '4.5s' },
  { left: '74.7%', top: '4.7%', size: '2.8px', dur: '3.5s', delay: '1.6s' },
  { left: '83.1%', top: '6.2%', size: '1.5px', dur: '5.4s', delay: '4.9s' },
  { left: '85.1%', top: '82.5%', size: '1.8px', dur: '6.6s', delay: '4.6s' },
  { left: '57.9%', top: '68.8%', size: '2.6px', dur: '4.2s', delay: '2.5s' },
  { left: '19.7%', top: '43.8%', size: '3px', dur: '4.5s', delay: '1.3s' },
  { left: '77.7%', top: '45.6%', size: '2.4px', dur: '4.1s', delay: '0s' },
  { left: '11.4%', top: '25.6%', size: '2.9px', dur: '6.8s', delay: '2.5s' },
  { left: '28%', top: '29.3%', size: '2.8px', dur: '6.9s', delay: '4.5s' },
  { left: '66.4%', top: '27.8%', size: '1.7px', dur: '6.3s', delay: '3s' },
  { left: '9.1%', top: '25.6%', size: '1.4px', dur: '5.6s', delay: '4.5s' },
  { left: '86.3%', top: '12.9%', size: '2px', dur: '4s', delay: '1.9s' },
  { left: '94.8%', top: '43.3%', size: '2.2px', dur: '5.7s', delay: '3.3s' },
  { left: '4.4%', top: '47.1%', size: '2.8px', dur: '5.7s', delay: '2.6s' },
  { left: '14.2%', top: '61.3%', size: '1.2px', dur: '6.4s', delay: '4.5s' },
  { left: '76.1%', top: '68.4%', size: '1.4px', dur: '4.9s', delay: '3.8s' },
  { left: '45.4%', top: '37.2%', size: '2.9px', dur: '6.2s', delay: '1.1s' },
  { left: '55.4%', top: '83.4%', size: '1.7px', dur: '4.6s', delay: '2.4s' },
  { left: '48.7%', top: '77%', size: '1.5px', dur: '5.9s', delay: '2.4s' },
  { left: '78.4%', top: '20.4%', size: '1.5px', dur: '3.2s', delay: '0.9s' },
  { left: '22.8%', top: '53.1%', size: '2.8px', dur: '5.2s', delay: '4s' },
  { left: '48.3%', top: '26.4%', size: '2.6px', dur: '6.1s', delay: '4.2s' },
  { left: '58.1%', top: '28.8%', size: '2.3px', dur: '4.8s', delay: '1.1s' },
];

// Each star's position/size/timing is per-element data, so it rides in on CSS custom properties
// — the sanctioned way to feed dynamic values to a stylesheet. All static styling lives in the
// module; nothing here is a hard-coded style.
type StarVars = CSSProperties & {
  '--star-left': string;
  '--star-top': string;
  '--star-size': string;
  '--star-dur': string;
  '--star-delay': string;
};

export function HomePage() {
  return (
    <div className={styles.page}>
      {STARS.map((s, i) => (
        <div
          key={i}
          className={styles.star}
          style={
            {
              '--star-left': s.left,
              '--star-top': s.top,
              '--star-size': s.size,
              '--star-dur': s.dur,
              '--star-delay': s.delay,
            } as StarVars
          }
        />
      ))}

      <div className={styles.layout}>
        <div className={styles.imageSide}>
          <div className={styles.glow} />
          <Image
            src="/hero.jpg"
            alt="A guide and a traveler gazing at a glowing city of the future"
            width={520}
            height={520}
            priority
            className={styles.heroImage}
          />
        </div>

        <div className={styles.textSide}>
          <h1 className={styles.title}>
            Come with me —<br />
            <em className={styles.titleAccent}>I&apos;ll lead you</em> through the valley of
            adventures
          </h1>

          <p className={styles.subtitle}>
            into a world of boundless possibility.<br />
            The codebase awaits you just beyond the hill.
          </p>

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <div className={styles.dividerStar}>✳</div>
          </div>

          <p className={styles.note}>
            There is nothing to fear: every folder is a path,<br />
            every commit a step. We&apos;ll walk unhurried.
          </p>

          <div className={styles.terminal}>
            <span className={styles.prompt}>$</span> <span>pnpm dev</span>
            <span className={styles.cursor} />
          </div>
        </div>
      </div>
    </div>
  );
}
