'use client';

import { useState, useEffect, useCallback } from 'react';
import { isIndexedDBSupported, getStorageEstimate } from '@/lib/db';
import {
  saveObservation,
  getUnsyncedCount,
  getRecentObservations,
  pruneOldObservations,
} from '@/lib/observationCache';
import {
  getPriceCache,
  updatePriceCacheFromObservation,
  updatePriceCacheFromServer,
  pruneExpiredPriceCache,
  cacheToPriceHistory,
} from '@/lib/priceCache';
import type { ScanResult, PriceHistory } from '@/lib/api';

export interface UseLocalDbResult {
  isSupported: boolean;
  isReady: boolean;
  unsyncedCount: number;
  storageUsed: number | null;

  // Save a scan result (from server or offline)
  saveResult: (result: ScanResult, warehouseId: number, synced: boolean) => Promise<void>;

  // Get cached price history for an item
  getCachedHistory: (warehouseId: number, itemNumber: string) => Promise<PriceHistory | null>;

  // Update cache from server response
  updateCacheFromServer: (result: ScanResult, warehouseId: number) => Promise<void>;

  // Maintenance
  pruneOldData: () => Promise<{ observations: number; priceCache: number }>;
  refreshStats: () => Promise<void>;
}

export function useLocalDb(): UseLocalDbResult {
  const [isSupported] = useState(() => isIndexedDBSupported());
  const [isReady, setIsReady] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);

  // Initialize and check stats
  useEffect(() => {
    if (!isSupported) return;

    const init = async () => {
      try {
        // Trigger DB initialization
        await getRecentObservations(1);
        setIsReady(true);

        // Get stats
        await refreshStats();
      } catch (err) {
        console.error('Failed to initialize local DB:', err);
      }
    };

    init();
  }, [isSupported]);

  const refreshStats = useCallback(async () => {
    if (!isSupported) return;

    try {
      const [count, storage] = await Promise.all([
        getUnsyncedCount(),
        getStorageEstimate(),
      ]);

      setUnsyncedCount(count);
      setStorageUsed(storage?.used ?? null);
    } catch (err) {
      console.error('Failed to refresh stats:', err);
    }
  }, [isSupported]);

  const saveResult = useCallback(
    async (result: ScanResult, warehouseId: number, synced: boolean) => {
      if (!isSupported) return;

      try {
        // Save observation
        const timestamp = result.observed_at || new Date().toISOString();
        await saveObservation({
          id: result.observation_id,
          warehouseId,
          itemNumber: result.item_number,
          price: result.price,
          priceEnding: result.price_ending,
          unitPrice: result.unit_price,
          unitMeasure: result.unit_measure,
          description: result.description,
          hasAsterisk: result.price_signals?.some((s) => s.type === 'asterisk') ?? false,
          decision: result.decision,
          timestamp,
          synced,
          confidence: result.confidence ?? 0,
        });

        // Update price cache from this observation
        await updatePriceCacheFromObservation(
          warehouseId,
          result.item_number,
          result.price,
          timestamp
        );

        // Refresh unsynced count
        const count = await getUnsyncedCount();
        setUnsyncedCount(count);
      } catch (err) {
        console.error('Failed to save result:', err);
      }
    },
    [isSupported]
  );

  const getCachedHistory = useCallback(
    async (warehouseId: number, itemNumber: string): Promise<PriceHistory | null> => {
      if (!isSupported) return null;

      try {
        const cache = await getPriceCache(warehouseId, itemNumber);
        if (!cache) return null;

        return cacheToPriceHistory(cache);
      } catch (err) {
        console.error('Failed to get cached history:', err);
        return null;
      }
    },
    [isSupported]
  );

  const updateCacheFromServer = useCallback(
    async (result: ScanResult, warehouseId: number) => {
      if (!isSupported || !result.history) return;

      try {
        await updatePriceCacheFromServer(
          warehouseId,
          result.item_number,
          {
            lowest_observed_price_60d: result.history.lowest_observed_price_60d,
            highest_observed_price_60d: result.history.highest_observed_price_60d ?? null,
            seen_at_price_count_60d: result.history.seen_at_price_count_60d,
            typical_outcome: result.history.typical_outcome as
              | 'TYPICALLY_DROPS'
              | 'TYPICALLY_SELLS_OUT'
              | 'UNKNOWN'
              | null,
          },
          result.price
        );
      } catch (err) {
        console.error('Failed to update cache from server:', err);
      }
    },
    [isSupported]
  );

  const pruneOldData = useCallback(async () => {
    if (!isSupported) return { observations: 0, priceCache: 0 };

    try {
      const [observations, priceCache] = await Promise.all([
        pruneOldObservations(90), // Keep 90 days of observations
        pruneExpiredPriceCache(), // Uses 7 day expiry
      ]);

      await refreshStats();

      return { observations, priceCache };
    } catch (err) {
      console.error('Failed to prune old data:', err);
      return { observations: 0, priceCache: 0 };
    }
  }, [isSupported, refreshStats]);

  return {
    isSupported,
    isReady,
    unsyncedCount,
    storageUsed,
    saveResult,
    getCachedHistory,
    updateCacheFromServer,
    pruneOldData,
    refreshStats,
  };
}
