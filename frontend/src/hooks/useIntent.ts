'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Intent } from '@/lib/api';

const STORAGE_KEY = 'pricetag_intent';
const DEFAULT_INTENT: Intent = 'BROWSING';

export function useIntent() {
  const [intent, setIntentState] = useState<Intent>(DEFAULT_INTENT);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['NEED_IT', 'BARGAIN_HUNTING', 'BROWSING'].includes(stored)) {
        setIntentState(stored as Intent);
      }
    } catch {
      // Ignore errors
    }
    setLoaded(true);
  }, []);

  const setIntent = useCallback((newIntent: Intent) => {
    setIntentState(newIntent);
    try {
      localStorage.setItem(STORAGE_KEY, newIntent);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    intent,
    setIntent,
    loaded,
  };
}
