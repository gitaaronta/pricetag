/**
 * Sync Queue - manages pending uploads to server
 */

import { getDB, type PriceTagDB } from './db';
import { getUnsyncedObservations, markObservationsSynced } from './observationCache';

type SyncQueueEntry = PriceTagDB['syncQueue']['value'];
type Observation = PriceTagDB['observations']['value'];

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://costco.avocadopeanut.com';
const MAX_RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 10;

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Add an item to the sync queue
 */
export async function addToSyncQueue(
  type: 'observation',
  data: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  const entry: SyncQueueEntry = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    data,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttempt: null,
  };
  await db.add('syncQueue', entry);
}

/**
 * Get all pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'by-created');
}

/**
 * Remove a sync item after successful sync
 */
export async function removeSyncItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

/**
 * Update sync item after failed attempt
 */
export async function markSyncAttempt(id: string): Promise<void> {
  const db = await getDB();
  const item = await db.get('syncQueue', id);
  if (item) {
    item.attempts += 1;
    item.lastAttempt = new Date().toISOString();
    await db.put('syncQueue', item);
  }
}

/**
 * Remove items that have exceeded max retry attempts
 */
export async function pruneFailedSyncItems(): Promise<number> {
  const db = await getDB();
  const items = await db.getAll('syncQueue');
  const toRemove = items.filter((item) => item.attempts >= MAX_RETRY_ATTEMPTS);

  const tx = db.transaction('syncQueue', 'readwrite');
  await Promise.all(toRemove.map((item) => tx.store.delete(item.id)));
  await tx.done;

  return toRemove.length;
}

/**
 * Sync a single observation to the server
 */
async function syncObservation(observation: Observation): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/v1/sync/observation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        observation_id: observation.id,
        warehouse_id: observation.warehouseId,
        item_number: observation.itemNumber,
        price: observation.price,
        price_ending: observation.priceEnding,
        unit_price: observation.unitPrice,
        unit_measure: observation.unitMeasure,
        description: observation.description,
        has_asterisk: observation.hasAsterisk,
        observed_at: observation.timestamp,
        confidence: observation.confidence,
        source: 'offline_client',
      }),
    });

    if (response.ok) {
      return true;
    }

    // 4xx errors are permanent failures, don't retry
    if (response.status >= 400 && response.status < 500) {
      console.warn(`Sync failed with ${response.status}, marking as synced to prevent retries`);
      return true; // Mark as synced to prevent infinite retries
    }

    return false;
  } catch (error) {
    console.error('Sync observation failed:', error);
    return false;
  }
}

/**
 * Sync all pending observations to server
 */
export async function syncPendingObservations(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    const unsynced = await getUnsyncedObservations();

    if (unsynced.length === 0) {
      return result;
    }

    // Process in batches
    const syncedIds: string[] = [];

    for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
      const batch = unsynced.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map((obs) => syncObservation(obs))
      );

      batchResults.forEach((batchResult, index) => {
        const obs = batch[index];
        if (batchResult.status === 'fulfilled' && batchResult.value) {
          syncedIds.push(obs.id);
          result.synced++;
        } else {
          result.failed++;
          result.errors.push(`Failed to sync observation ${obs.id}`);
        }
      });
    }

    // Mark successfully synced observations
    if (syncedIds.length > 0) {
      await markObservationsSynced(syncedIds);
    }

    result.success = result.failed === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
  }

  return result;
}

/**
 * Check if Background Sync API is supported
 */
export function isBackgroundSyncSupported(): boolean {
  return 'serviceWorker' in navigator && 'SyncManager' in window;
}

/**
 * Register a background sync task
 */
export async function registerBackgroundSync(tag: string = 'sync-observations'): Promise<boolean> {
  if (!isBackgroundSyncSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag);
    return true;
  } catch (error) {
    console.error('Failed to register background sync:', error);
    return false;
  }
}

/**
 * Get sync queue count
 */
export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count('syncQueue');
}
