import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';
import { THEME_STORAGE_KEY, useThemeStore } from '@/shared/lib/themeStore';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'light';
    useThemeStore.setState({ theme: 'light' });
  });

  it('writes the theme onto the html element when clicked', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /toggle color theme/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('persists the chosen theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /toggle color theme/i }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toContain('dark');
  });

  it('loads the persisted theme through its mount effect, overriding the light default', async () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'dark' }, version: 0 }),
    );
    render(<ThemeToggle />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});

describe('theme store rehydration (no beforeEach — must control the DOM before the module loads)', () => {
  it('keeps the OS-derived theme on a first visit when nothing is persisted', async () => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';

    vi.resetModules();
    const { useThemeStore: freshThemeStore } = await import('@/shared/lib/themeStore');

    expect(freshThemeStore.getState().theme).toBe('dark');
    await freshThemeStore.persist.rehydrate();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(freshThemeStore.getState().theme).toBe('dark');
  });
});
