/**
 * IndexedDB wrapper for offline storage
 * Uses idb library for async/await API
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ScanFeedback,
  ScanArtifact,
  FeedbackReason,
  FeedbackCorrections,
  OcrSnapshot,
} from './feedbackTypes';

// Sync queue entry types
export type SyncQueueType = 'observation' | 'feedback' | 'artifact';

// Database schema
export interface PriceTagDB extends DBSchema {
  observations: {
    key: string;
    value: {
      id: string;
      warehouseId: number;
      itemNumber: string;
      price: number;
      priceEnding: string | null;
      unitPrice: number | null;
      unitMeasure: string | null;
      description: string | null;
      hasAsterisk: boolean;
      decision: string;
      timestamp: string;
      synced: boolean;
      confidence: number;
    };
    indexes: {
      'by-warehouse': number;
      'by-item': string;
      'by-synced': number; // 0 = unsynced, 1 = synced
      'by-warehouse-item': [number, string];
    };
  };

  priceCache: {
    key: string; // `${warehouseId}-${itemNumber}`
    value: {
      key: string;
      warehouseId: number;
      itemNumber: string;
      currentPrice: number;
      lowestPrice60d: number | null;
      highestPrice60d: number | null;
      seenCount: number;
      lastSeen: string;
      typicalOutcome: 'TYPICALLY_DROPS' | 'TYPICALLY_SELLS_OUT' | 'UNKNOWN';
      cachedAt: string;
    };
    indexes: {
      'by-warehouse': number;
      'by-cached-at': string;
    };
  };

  warehouses: {
    key: number;
    value: {
      id: number;
      name: string;
      city: string;
      state: string;
      cachedAt: string;
    };
  };

  syncQueue: {
    key: string;
    value: {
      id: string;
      type: SyncQueueType;
      data: Record<string, unknown>;
      createdAt: string;
      attempts: number;
      lastAttempt: string | null;
    };
    indexes: {
      'by-created': string;
      'by-type': SyncQueueType;
    };
  };

  // Feedback store - stores feedback metadata (small, quick to query)
  scanFeedback: {
    key: string;
    value: ScanFeedback;
    indexes: {
      'by-observation': string;
      'by-synced': number; // 0 = unsynced, 1 = synced
      'by-created': string;
    };
  };

  // Artifact store - stores image blobs separately (larger data)
  // Justification: Separating blobs from metadata allows faster queries on feedback
  // and prevents loading large blobs when just checking sync status.
  // Blob storage is acceptable for cropped tags (~50-200KB each).
  scanArtifacts: {
    key: string;
    value: ScanArtifact;
    indexes: {
      'by-feedback': string;
      'by-observation': string;
      'by-synced': number;
      'by-sha256': string; // For deduplication
    };
  };
}

const DB_NAME = 'pricetag-offline';
const DB_VERSION = 2; // Bumped for feedback stores

let dbPromise: Promise<IDBPDatabase<PriceTagDB>> | null = null;

/**
 * Get or create the database connection
 */
export function getDB(): Promise<IDBPDatabase<PriceTagDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PriceTagDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Create object stores on first open or upgrade
        if (oldVersion < 1) {
          // Observations store
          const observationsStore = db.createObjectStore('observations', {
            keyPath: 'id',
          });
          observationsStore.createIndex('by-warehouse', 'warehouseId');
          observationsStore.createIndex('by-item', 'itemNumber');
          observationsStore.createIndex('by-synced', 'synced');
          observationsStore.createIndex('by-warehouse-item', ['warehouseId', 'itemNumber']);

          // Price cache store
          const priceCacheStore = db.createObjectStore('priceCache', {
            keyPath: 'key',
          });
          priceCacheStore.createIndex('by-warehouse', 'warehouseId');
          priceCacheStore.createIndex('by-cached-at', 'cachedAt');

          // Warehouses store
          db.createObjectStore('warehouses', {
            keyPath: 'id',
          });

          // Sync queue store
          const syncQueueStore = db.createObjectStore('syncQueue', {
            keyPath: 'id',
          });
          syncQueueStore.createIndex('by-created', 'createdAt');
        }

        // Version 2: Add feedback and artifact stores
        if (oldVersion < 2) {
          // Add by-type index to existing syncQueue if upgrading
          if (db.objectStoreNames.contains('syncQueue')) {
            // Note: Can't add index to existing store in upgrade, so we handle via query
          }

          // Feedback store
          const feedbackStore = db.createObjectStore('scanFeedback', {
            keyPath: 'id',
          });
          feedbackStore.createIndex('by-observation', 'observationId');
          feedbackStore.createIndex('by-synced', 'synced');
          feedbackStore.createIndex('by-created', 'createdAt');

          // Artifact store (separate from feedback for performance)
          const artifactStore = db.createObjectStore('scanArtifacts', {
            keyPath: 'id',
          });
          artifactStore.createIndex('by-feedback', 'feedbackId');
          artifactStore.createIndex('by-observation', 'observationId');
          artifactStore.createIndex('by-synced', 'synced');
          artifactStore.createIndex('by-sha256', 'sha256');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Clear all data from the database
 */
export async function clearDatabase(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear('observations'),
    db.clear('priceCache'),
    db.clear('warehouses'),
    db.clear('syncQueue'),
    db.clear('scanFeedback'),
    db.clear('scanArtifacts'),
  ]);
}

/**
 * Get database storage estimate
 */
export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return null;
}
