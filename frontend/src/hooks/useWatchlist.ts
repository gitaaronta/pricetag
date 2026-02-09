'use client';

import { useState, useEffect, useCallback } from 'react';

export interface WatchedItem {
  itemNumber: string;
  warehouseId: number;
  price: number;
  description: string | null;
  addedAt: string;
}

const STORAGE_KEY = 'pricetag_watchlist';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
    setLoaded(true);
  }, []);

  // Save to localStorage when watchlist changes
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    }
  }, [watchlist, loaded]);

  const addToWatchlist = useCallback((item: Omit<WatchedItem, 'addedAt'>) => {
    setWatchlist((prev) => {
      // Check if already exists
      const exists = prev.some(
        (w) => w.itemNumber === item.itemNumber && w.warehouseId === item.warehouseId
      );
      if (exists) return prev;

      return [
        ...prev,
        {
          ...item,
          addedAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeFromWatchlist = useCallback((itemNumber: string, warehouseId: number) => {
    setWatchlist((prev) =>
      prev.filter((w) => !(w.itemNumber === itemNumber && w.warehouseId === warehouseId))
    );
  }, []);

  const isWatched = useCallback(
    (itemNumber: string, warehouseId: number) => {
      return watchlist.some(
        (w) => w.itemNumber === itemNumber && w.warehouseId === warehouseId
      );
    },
    [watchlist]
  );

  const getWatchedItemNumbers = useCallback(
    (warehouseId: number) => {
      return watchlist
        .filter((w) => w.warehouseId === warehouseId)
        .map((w) => w.itemNumber);
    },
    [watchlist]
  );

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isWatched,
    getWatchedItemNumbers,
    loaded,
  };
}
