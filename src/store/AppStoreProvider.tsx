'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppInitialState, type AppState, type AppStore } from './appStore';

const AppStoreContext = createContext<AppStore | null>(null);

type Props = {
  initialState: AppInitialState;
  children: ReactNode;
};

export function AppStoreProvider({ initialState, children }: Props) {
  // Lazy initializer: runs exactly once per component instance, giving each request/mount its
  // own store without reading a ref during render (this project's eslint-config-next lint rules
  // flag ref.current reads in render, so useState replaces the ref used in Zustand's own docs).
  // Under Strict Mode (dev only) the initializer runs twice and one store is discarded — harmless.
  const [store] = useState<AppStore>(() => createAppStore(initialState));

  useEffect(() => {
    // Read persisted state only after mount. Server HTML and the first client render both show
    // the server seed, so they match; persisted state then takes over.
    void store.persist.rehydrate();
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error('useAppStore must be used inside <AppStoreProvider>');
  }

  return useStore(store, selector);
}
