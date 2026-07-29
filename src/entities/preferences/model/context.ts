'use client';

import { createContext } from 'react';
import type { AppStore } from './store';

export const AppStoreContext = createContext<AppStore | null>(null);
