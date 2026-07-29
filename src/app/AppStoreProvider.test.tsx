import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_STORAGE_KEY, useAppStore } from '@/entities/preferences';
import { AppStoreProvider } from './AppStoreProvider';

function ReduceMotionLabel() {
  const reduceMotion = useAppStore((state) => state.preferences.reduceMotion);
  return <span>reduceMotion: {String(reduceMotion)}</span>;
}

describe('AppStoreProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads persisted preferences through the provider on mount', async () => {
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: { preferences: { reduceMotion: true } }, version: 0 }),
    );

    render(
      <AppStoreProvider initialState={{ preferences: { reduceMotion: false } }}>
        <ReduceMotionLabel />
      </AppStoreProvider>,
    );

    expect(await screen.findByText('reduceMotion: true')).toBeInTheDocument();
    expect(screen.queryByText('reduceMotion: false')).not.toBeInTheDocument();
  });
});
