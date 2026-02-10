'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import {
  syncPendingObservations,
  syncPendingFeedback,
  syncAll,
  registerBackgroundSync,
  type SyncResult,
} from '@/lib/syncQueue';
import { getUnsyncedCount } from '@/lib/observationCache';
import { getUnsyncedFeedbackCount, getUnsyncedArtifactCount } from '@/lib/feedbackCache';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface UseBackgroundSyncResult {
  syncStatus: SyncStatus;
  pendingCount: number;
  pendingFeedbackCount: number;
  pendingArtifactCount: number;
  lastSyncResult: SyncResult | null;
  lastSyncTime: Date | null;
  isSyncing: boolean;

  // Manual sync trigger
  syncNow: () => Promise<SyncResult>;

  // Refresh pending count
  refreshPendingCount: () => Promise<void>;
}

// Debounce time before auto-syncing after coming online (ms)
const AUTO_SYNC_DELAY = 2000;

// Minimum time between syncs (ms)
const SYNC_COOLDOWN = 30000;

export function useBackgroundSync(): UseBackgroundSyncResult {
  const { isOnline } = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
  const [pendingArtifactCount, setPendingArtifactCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const syncInProgressRef = useRef(false);
  const lastSyncRef = useRef<number>(0);

  // Refresh pending count (including feedback and artifacts)
  const refreshPendingCount = useCallback(async () => {
    try {
      const [obsCount, fbCount, artCount] = await Promise.all([
        getUnsyncedCount(),
        getUnsyncedFeedbackCount(),
        getUnsyncedArtifactCount(),
      ]);
      setPendingCount(obsCount);
      setPendingFeedbackCount(fbCount);
      setPendingArtifactCount(artCount);
    } catch (error) {
      console.error('Failed to get pending count:', error);
    }
  }, []);

  // Perform sync (observations + feedback + artifacts)
  const performSync = useCallback(async (): Promise<SyncResult> => {
    // Prevent concurrent syncs
    if (syncInProgressRef.current) {
      return { success: false, synced: 0, failed: 0, errors: ['Sync already in progress'] };
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_COOLDOWN) {
      return { success: false, synced: 0, failed: 0, errors: ['Sync cooldown active'] };
    }

    syncInProgressRef.current = true;
    setSyncStatus('syncing');

    try {
      // Use syncAll to sync observations + feedback + artifacts
      const result = await syncAll();

      setLastSyncResult(result);
      setLastSyncTime(new Date());
      lastSyncRef.current = now;

      setSyncStatus(result.success ? 'success' : 'error');

      // Refresh pending count after sync
      await refreshPendingCount();

      // Reset status after a delay
      setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);

      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        success: false,
        synced: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
      setLastSyncResult(errorResult);
      setSyncStatus('error');

      setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);

      return errorResult;
    } finally {
      syncInProgressRef.current = false;
    }
  }, [refreshPendingCount]);

  // Manual sync trigger
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (!isOnline) {
      return { success: false, synced: 0, failed: 0, errors: ['Offline'] };
    }
    return performSync();
  }, [isOnline, performSync]);

  // Initial pending count
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when coming online
  useEffect(() => {
    if (!isOnline) return;

    // Delay auto-sync to let connection stabilize
    const timer = setTimeout(async () => {
      const count = await getUnsyncedCount();
      if (count > 0) {
        // Try to register background sync first
        const registered = await registerBackgroundSync();
        if (!registered) {
          // Fall back to immediate sync
          performSync();
        }
      }
    }, AUTO_SYNC_DELAY);

    return () => clearTimeout(timer);
  }, [isOnline, performSync]);

  // Periodic sync check (every 5 minutes when online)
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(async () => {
      const count = await getUnsyncedCount();
      setPendingCount(count);

      if (count > 0 && !syncInProgressRef.current) {
        performSync();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isOnline, performSync]);

  // Listen for sync events from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        refreshPendingCount();
        setLastSyncTime(new Date());
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, [refreshPendingCount]);

  return {
    syncStatus,
    pendingCount,
    pendingFeedbackCount,
    pendingArtifactCount,
    lastSyncResult,
    lastSyncTime,
    isSyncing: syncStatus === 'syncing',
    syncNow,
    refreshPendingCount,
  };
}
