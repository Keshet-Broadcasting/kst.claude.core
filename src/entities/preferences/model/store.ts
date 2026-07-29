import { createStore } from 'zustand/vanilla';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

export const APP_STORAGE_KEY = 'starter.app';

export type Preferences = {
  /** An example persisted preference. Replace with your app's real preferences. */
  reduceMotion: boolean;
};

export type AppInitialState = {
  preferences: Preferences;
};

export type AppState = {
  preferences: Preferences;
  /** False until persisted state has been read. Gate persistence-dependent UI on this. */
  hasHydrated: boolean;
  setReduceMotion: (value: boolean) => void;
  setHasHydrated: (value: boolean) => void;
};

/**
 * A factory, not a singleton. A module-level store seeded with server data would be shared
 * across every SSR request in the same process. One store per request, owned by the provider.
 */
export function createAppStore(initialState: AppInitialState) {
  const store = createStore<AppState>()(
    devtools(
      persist(
        (set) => ({
          preferences: initialState.preferences,
          hasHydrated: false,

          setReduceMotion: (value) =>
            set(
              (state) => ({ preferences: { ...state.preferences, reduceMotion: value } }),
              false,
              'preferences/setReduceMotion',
            ),

          setHasHydrated: (value) => set({ hasHydrated: value }, false, 'app/setHasHydrated'),
        }),
        {
          name: APP_STORAGE_KEY,
          storage: createJSONStorage(() => localStorage),
          skipHydration: true,
          partialize: (state) => ({ preferences: state.preferences }),
          onRehydrateStorage: () => (state, error) => {
            if (error) {
              console.error('[appStore] rehydration failed', error);
            }
            store.getState().setHasHydrated(true);
          },
        },
      ),
      { name: 'AppStore' },
    ),
  );

  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
