'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { THEME_STORAGE_KEY } from './theme';
import type { Theme } from './theme';

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
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    },
  ),
);
