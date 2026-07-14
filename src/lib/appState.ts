import type { AppInitialState } from '@/store/appStore';

/**
 * The server-side source of the store's initial state. `app/layout.tsx` (a server component)
 * calls this directly and hands the result to <AppStoreProvider>, so the first paint already
 * has state on the server and the client alike — no fetch to our own route handler.
 */
export function getInitialAppState(): AppInitialState {
  return { preferences: { reduceMotion: false } };
}
