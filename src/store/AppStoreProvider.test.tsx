import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_STORAGE_KEY } from './appStore';
import { AppStoreProvider, useAppStore } from './AppStoreProvider';

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

    // Persisted state wins over the server seed once the provider rehydrates on mount.
    expect(await screen.findByText('reduceMotion: true')).toBeInTheDocument();
    expect(screen.queryByText('reduceMotion: false')).not.toBeInTheDocument();
  });
});
