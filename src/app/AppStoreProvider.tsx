'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AppStoreContext, createAppStore } from '@/entities/preferences';
import type { AppInitialState, AppStore } from '@/entities/preferences';

type Props = {
  initialState: AppInitialState;
  children: ReactNode;
};

export function AppStoreProvider({ initialState, children }: Props) {
  // Lazy initializer: runs exactly once per component instance, giving each request/mount its
  // own store without reading a ref during render. Under Strict Mode (dev only) the initializer
  // runs twice and one store is discarded — harmless.
  const [store] = useState<AppStore>(() => createAppStore(initialState));

  useEffect(() => {
    // Read persisted state only after mount. Server HTML and the first client render both show
    // the server seed, so they match; persisted state then takes over.
    void store.persist.rehydrate();
  }, [store]);

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}
