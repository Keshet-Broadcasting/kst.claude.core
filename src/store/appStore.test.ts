import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_STORAGE_KEY, createAppStore, type AppInitialState } from './appStore';

const seed: AppInitialState = { preferences: { reduceMotion: false } };

function persist(preferences: { reduceMotion: boolean }) {
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ state: { preferences }, version: 0 }));
}

describe('createAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts from the server seed', () => {
    const store = createAppStore(seed);

    expect(store.getState().preferences.reduceMotion).toBe(false);
  });

  it('sets a preference', () => {
    const store = createAppStore(seed);

    store.getState().setReduceMotion(true);

    expect(store.getState().preferences.reduceMotion).toBe(true);
  });

  it('lets persisted state win over the server seed on rehydration', async () => {
    persist({ reduceMotion: true });

    const store = createAppStore(seed);
    expect(store.getState().preferences.reduceMotion).toBe(false);

    await store.persist.rehydrate();

    expect(store.getState().preferences.reduceMotion).toBe(true);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('keeps the server seed when nothing is persisted', async () => {
    const store = createAppStore(seed);

    await store.persist.rehydrate();

    expect(store.getState().preferences.reduceMotion).toBe(false);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it('latches hasHydrated even when persisted storage is corrupt', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(APP_STORAGE_KEY, '{not json');

    const store = createAppStore(seed);
    await store.persist.rehydrate();

    expect(store.getState().hasHydrated).toBe(true);
    // The seed value survived: corrupt storage means nothing was there to override it.
    expect(store.getState().preferences.reduceMotion).toBe(false);

    consoleError.mockRestore();
  });

  it('creates independent stores — one request cannot leak into another', () => {
    const storeA = createAppStore({ preferences: { reduceMotion: false } });
    const storeB = createAppStore({ preferences: { reduceMotion: false } });

    storeA.getState().setReduceMotion(true);

    expect(storeA.getState().preferences.reduceMotion).toBe(true);
    expect(storeB.getState().preferences.reduceMotion).toBe(false);
  });
});
