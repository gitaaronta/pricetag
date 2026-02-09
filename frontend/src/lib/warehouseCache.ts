/**
 * Warehouse cache - stores warehouse data for offline use
 */

import { getDB, type PriceTagDB } from './db';

type CachedWarehouse = PriceTagDB['warehouses']['value'];

const CACHE_EXPIRY_DAYS = 30;

/**
 * Save a warehouse to the cache
 */
export async function saveWarehouse(warehouse: Omit<CachedWarehouse, 'cachedAt'>): Promise<void> {
  const db = await getDB();
  await db.put('warehouses', {
    ...warehouse,
    cachedAt: new Date().toISOString(),
  });
}

/**
 * Get a warehouse from cache
 */
export async function getWarehouse(id: number): Promise<CachedWarehouse | undefined> {
  const db = await getDB();
  const warehouse = await db.get('warehouses', id);

  if (warehouse) {
    // Check if expired
    const cachedAt = new Date(warehouse.cachedAt);
    const now = new Date();
    const daysSinceCached = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCached > CACHE_EXPIRY_DAYS) {
      // Expired but still return it - better than nothing
      return warehouse;
    }
  }

  return warehouse;
}

/**
 * Get all cached warehouses
 */
export async function getAllWarehouses(): Promise<CachedWarehouse[]> {
  const db = await getDB();
  return db.getAll('warehouses');
}

/**
 * Cache multiple warehouses at once
 */
export async function cacheWarehouses(
  warehouses: Array<{ id: number; name: string; city: string; state: string }>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('warehouses', 'readwrite');
  const now = new Date().toISOString();

  await Promise.all(
    warehouses.map((w) =>
      tx.store.put({
        id: w.id,
        name: w.name,
        city: w.city,
        state: w.state,
        cachedAt: now,
      })
    )
  );

  await tx.done;
}

/**
 * Clear expired warehouse cache entries
 */
export async function pruneExpiredWarehouses(): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_EXPIRY_DAYS);

  const all = await db.getAll('warehouses');
  const toDelete = all.filter((w) => new Date(w.cachedAt) < cutoff);

  const tx = db.transaction('warehouses', 'readwrite');
  await Promise.all(toDelete.map((w) => tx.store.delete(w.id)));
  await tx.done;

  return toDelete.length;
}

/**
 * Get cached warehouse count
 */
export async function getWarehouseCount(): Promise<number> {
  const db = await getDB();
  return db.count('warehouses');
}
