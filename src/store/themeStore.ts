'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import type { Theme } from '@/lib/theme';

export { THEME_STORAGE_KEY };
export type { Theme };

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/**
 * The inline script in the root layout resolves the theme before any module evaluates,
 * so `<html data-theme>` already holds the right answer by the time this store is created.
 * Hardcoding a default here instead would clobber the OS preference on a first visit.
 */
function readInitialTheme(): Theme {
  if (typeof document === 'undefined') {
    return 'light';
  }

  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * A singleton is safe here, unlike the app store: this state is never seeded from the server,
 * so there is nothing to leak between SSR requests.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: readInitialTheme(),

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Unlike appStore's onRehydrateStorage, this one doesn't handle the error argument or
      // latch a hasHydrated flag — intentionally, not an oversight. Nothing here gates UI on
      // hydration completing: a failed rehydrate just leaves `<html data-theme>` holding the
      // value the inline anti-flash script already stamped, which is correct either way.
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);
