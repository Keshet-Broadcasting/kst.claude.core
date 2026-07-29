import type { Metadata } from 'next';
import { Geist, Cormorant_Garamond, JetBrains_Mono } from 'next/font/google';
import { getInitialAppState } from '@/entities/preferences';
import { AppStoreProvider } from '@/app';
import { THEME_INIT_SCRIPT } from '@/shared/lib/theme';
import '@/app/globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Starter — Next.js + React + Zustand + CSS Modules',
  description: 'The team starter stack, built on Feature-Sliced Design.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = getInitialAppState();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${geist.variable} ${cormorant.variable} ${jetbrainsMono.variable}`}>
        <AppStoreProvider initialState={initialState}>{children}</AppStoreProvider>
      </body>
    </html>
  );
}
