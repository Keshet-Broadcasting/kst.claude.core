import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';
import { THEME_STORAGE_KEY, useThemeStore } from '@/store/themeStore';

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
    // The component renders with dataset.theme still 'light' (set in beforeEach, matching what
    // the SSR/anti-flash script produced); only the component's own useEffect rehydration should
    // flip it to the persisted value — proving that effect actually runs, not a manual call.
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
    // What the inline anti-flash script in the root layout does before first paint
    // when the OS prefers dark mode and nothing is in storage yet.
    document.documentElement.dataset.theme = 'dark';

    vi.resetModules();
    const { useThemeStore: freshThemeStore } = await import('@/store/themeStore');

    expect(freshThemeStore.getState().theme).toBe('dark');

    await freshThemeStore.persist.rehydrate();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(freshThemeStore.getState().theme).toBe('dark');
  });
});
