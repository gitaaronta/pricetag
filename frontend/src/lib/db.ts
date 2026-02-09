/**
 * IndexedDB wrapper for offline storage
 * Uses idb library for async/await API
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

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
      type: 'observation';
      data: Record<string, unknown>;
      createdAt: string;
      attempts: number;
      lastAttempt: string | null;
    };
    indexes: {
      'by-created': string;
    };
  };
}

const DB_NAME = 'pricetag-offline';
const DB_VERSION = 1;

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
