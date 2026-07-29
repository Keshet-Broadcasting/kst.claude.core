import type { AppInitialState } from '../model/store';

export function getInitialAppState(): AppInitialState {
  return { preferences: { reduceMotion: false } };
}
