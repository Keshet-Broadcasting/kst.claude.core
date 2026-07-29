'use client';

import { useContext } from 'react';
import { useStore } from 'zustand';
import { AppStoreContext } from './context';
import type { AppState } from './store';

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error('useAppStore must be used inside <AppStoreProvider>');
  }

  return useStore(store, selector);
}
