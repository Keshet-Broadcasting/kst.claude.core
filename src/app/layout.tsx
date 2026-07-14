import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { getInitialAppState } from '@/lib/appState';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Starter — Next.js + React + Zustand + CSS Modules',
  description:
    'The team starter stack, with a landing page that points at the patterns worth reading.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = getInitialAppState();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={geist.variable}>
        <AppStoreProvider initialState={initialState}>{children}</AppStoreProvider>
      </body>
    </html>
  );
}
