import Image from 'next/image';
import styles from './HomePage.module.css';

const STARS = [
  { left: '70.1%', top: '14.8%', size: '1.2px', dur: '3.4s', delay: '1.3s' },
  { left: '95.5%', top: '72.6%', size: '1.2px', dur: '3.6s', delay: '4.6s' },
  { left: '21.2%', top: '73.6%', size: '1.6px', dur: '3.5s', delay: '2.5s' },
  { left: '95.6%', top: '25.7%', size: '2.3px', dur: '6.9s', delay: '4.5s' },
  { left: '74.7%', top:  '4.7%', size: '2.8px', dur: '3.5s', delay: '1.6s' },
  { left: '83.1%', top:  '6.2%', size: '1.5px', dur: '5.4s', delay: '4.9s' },
  { left: '85.1%', top: '82.5%', size: '1.8px', dur: '6.6s', delay: '4.6s' },
  { left: '57.9%', top: '68.8%', size: '2.6px', dur: '4.2s', delay: '2.5s' },
  { left: '19.7%', top: '43.8%', size:   '3px', dur: '4.5s', delay: '1.3s' },
  { left: '77.7%', top: '45.6%', size: '2.4px', dur: '4.1s', delay:   '0s' },
  { left: '11.4%', top: '25.6%', size: '2.9px', dur: '6.8s', delay: '2.5s' },
  { left:   '28%', top: '29.3%', size: '2.8px', dur: '6.9s', delay: '4.5s' },
  { left: '66.4%', top: '27.8%', size: '1.7px', dur: '6.3s', delay:   '3s' },
  { left:  '9.1%', top: '25.6%', size: '1.4px', dur: '5.6s', delay: '4.5s' },
  { left: '86.3%', top: '12.9%', size:   '2px', dur:   '4s', delay: '1.9s' },
  { left: '94.8%', top: '43.3%', size: '2.2px', dur: '5.7s', delay: '3.3s' },
  { left:  '4.4%', top: '47.1%', size: '2.8px', dur: '5.7s', delay: '2.6s' },
  { left: '14.2%', top: '61.3%', size: '1.2px', dur: '6.4s', delay: '4.5s' },
  { left: '76.1%', top: '68.4%', size: '1.4px', dur: '4.9s', delay: '3.8s' },
  { left: '45.4%', top: '37.2%', size: '2.9px', dur: '6.2s', delay: '1.1s' },
  { left: '55.4%', top: '83.4%', size: '1.7px', dur: '4.6s', delay: '2.4s' },
  { left: '48.7%', top:   '77%', size: '1.5px', dur: '5.9s', delay: '2.4s' },
  { left: '78.4%', top: '20.4%', size: '1.5px', dur: '3.2s', delay: '0.9s' },
  { left: '22.8%', top: '53.1%', size: '2.8px', dur: '5.2s', delay:   '4s' },
  { left: '48.3%', top: '26.4%', size: '2.6px', dur: '6.1s', delay: '4.2s' },
  { left: '58.1%', top: '28.8%', size: '2.3px', dur: '4.8s', delay: '1.1s' },
];

export function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'rgb(5, 4, 3)',
        color: 'rgb(242, 231, 216)',
        fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Stars */}
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: 'rgb(242, 224, 192)',
            opacity: 0.3,
            animation: `${s.dur} ease-in-out ${s.delay} infinite normal none running twinkle`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Main layout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(32px, 5vw, 96px)',
          flexWrap: 'wrap',
          padding: '48px clamp(20px, 4vw, 80px)',
          maxWidth: '1400px',
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Image side */}
        <div
          style={{
            position: 'relative',
            flex: '0 1 auto',
            animation: '1.4s ease 0s 1 normal both running floatUp',
          }}
        >
          {/* Glow */}
          <div
            style={{
              position: 'absolute',
              inset: '-14%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 190, 110, 0.22) 0%, transparent 65%)',
              animation: '5s ease-in-out 0s infinite normal none running glowPulse',
              pointerEvents: 'none',
            }}
          />
          <Image
            src="/hero.jpg"
            alt="A guide and a traveler gazing at a glowing city of the future"
            width={520}
            height={520}
            priority
            className={styles.heroImage}
          />
        </div>

        {/* Text side */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            maxWidth: '480px',
            minWidth: '300px',
            flex: '1 1 320px',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 'clamp(36px, 3.6vw, 56px)',
              lineHeight: 1.06,
              letterSpacing: '0.01em',
              textWrap: 'balance',
              animation: '1.2s ease 0.15s 1 normal both running floatUp',
              color: 'rgb(246, 236, 220)',
            }}
          >
            Come with me —<br />
            <em style={{ fontWeight: 400, color: 'rgb(232, 160, 76)' }}>I&apos;ll lead you</em>{' '}
            through the valley of adventures
          </h1>

          <p
            style={{
              margin: '22px 0 0',
              fontSize: 'clamp(19px, 1.6vw, 23px)',
              fontStyle: 'italic',
              fontWeight: 400,
              color: 'rgba(242, 231, 216, 0.62)',
              lineHeight: 1.38,
              animation: '1.2s ease 0.3s 1 normal both running floatUp',
            }}
          >
            into a world of boundless possibility.<br />
            The codebase awaits you just beyond the hill.
          </p>

          {/* Divider */}
          <div
            style={{
              margin: '34px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              animation: '1.3s ease 0.45s 1 normal both running floatUp',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '1px',
                background: 'linear-gradient(90deg, rgba(232, 160, 76, 0.5), transparent)',
              }}
            />
            <div style={{ fontSize: '18px', color: 'rgb(232, 160, 76)' }}>✳</div>
          </div>

          <p
            style={{
              margin: '26px 0 0',
              fontSize: '19px',
              fontStyle: 'italic',
              color: 'rgba(242, 231, 216, 0.55)',
              lineHeight: 1.45,
              animation: '1.3s ease 0.55s 1 normal both running floatUp',
            }}
          >
            There is nothing to fear: every folder is a path,<br />
            every commit a step. We&apos;ll walk unhurried.
          </p>

          {/* Terminal */}
          <div
            style={{
              marginTop: '36px',
              fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", monospace',
              fontSize: '13px',
              color: 'rgba(242, 231, 216, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              animation: '1.3s ease 0.7s 1 normal both running floatUp',
            }}
          >
            <span style={{ color: 'rgba(232, 160, 76, 0.6)' }}>$</span>{' '}
            <span>pnpm dev</span>
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '15px',
                background: 'rgba(232, 160, 76, 0.7)',
                animation: '1.1s step-end 0s infinite normal none running blink',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
