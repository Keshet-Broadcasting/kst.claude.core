export const THEME_STORAGE_KEY = 'starter.theme';

export type Theme = 'light' | 'dark';

/**
 * Runs before first paint, so a dark-theme reload never flashes white.
 * Reads the same localStorage entry the Zustand persist middleware writes.
 * Lives in a plain module (no 'use client') because the root layout is a server
 * component: a client module's exports become unusable stubs when read on the server.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = raw ? JSON.parse(raw).state.theme : null;
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;
