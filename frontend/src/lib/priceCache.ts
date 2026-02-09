/**
 * Price cache - stores price history for offline decisions
 */

import { getDB, type PriceTagDB } from './db';

type PriceCacheEntry = PriceTagDB['priceCache']['value'];

// Cache expiry in days
const CACHE_EXPIRY_DAYS = 7;

/**
 * Generate cache key for warehouse/item combination
 */
function getCacheKey(warehouseId: number, itemNumber: string): string {
  return `${warehouseId}-${itemNumber}`;
}

/**
 * Save or update price cache entry
 */
export async function savePriceCache(entry: Omit<PriceCacheEntry, 'key'>): Promise<void> {
  const db = await getDB();
  const key = getCacheKey(entry.warehouseId, entry.itemNumber);

  await db.put('priceCache', {
    ...entry,
    key,
    cachedAt: new Date().toISOString(),
  });
}

/**
 * Get price cache entry for an item
 */
export async function getPriceCache(
  warehouseId: number,
  itemNumber: string
): Promise<PriceCacheEntry | undefined> {
  const db = await getDB();
  const key = getCacheKey(warehouseId, itemNumber);
  const entry = await db.get('priceCache', key);

  // Check if expired
  if (entry) {
    const cachedAt = new Date(entry.cachedAt);
    const now = new Date();
    const daysSinceCached = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCached > CACHE_EXPIRY_DAYS) {
      // Expired - could delete, but return with warning for now
      return { ...entry, typicalOutcome: 'UNKNOWN' };
    }
  }

  return entry;
}

/**
 * Update price cache from a new observation
 * Maintains running statistics
 */
export async function updatePriceCacheFromObservation(
  warehouseId: number,
  itemNumber: string,
  price: number,
  timestamp: string
): Promise<void> {
  const db = await getDB();
  const key = getCacheKey(warehouseId, itemNumber);
  const existing = await db.get('priceCache', key);

  if (existing) {
    // Update existing cache
    const updated: PriceCacheEntry = {
      ...existing,
      currentPrice: price,
      seenCount: existing.seenCount + 1,
      lastSeen: timestamp,
      cachedAt: new Date().toISOString(),
    };

    // Update lowest/highest prices
    if (existing.lowestPrice60d === null || price < existing.lowestPrice60d) {
      updated.lowestPrice60d = price;
    }
    if (existing.highestPrice60d === null || price > existing.highestPrice60d) {
      updated.highestPrice60d = price;
    }

    await db.put('priceCache', updated);
  } else {
    // Create new cache entry
    await db.put('priceCache', {
      key,
      warehouseId,
      itemNumber,
      currentPrice: price,
      lowestPrice60d: price,
      highestPrice60d: price,
      seenCount: 1,
      lastSeen: timestamp,
      typicalOutcome: 'UNKNOWN',
      cachedAt: new Date().toISOString(),
    });
  }
}

/**
 * Update price cache from server response
 * Overwrites with authoritative server data
 */
export async function updatePriceCacheFromServer(
  warehouseId: number,
  itemNumber: string,
  serverHistory: {
    lowest_observed_price_60d: number | null;
    highest_observed_price_60d: number | null;
    seen_at_price_count_60d: number | null;
    typical_outcome: 'TYPICALLY_DROPS' | 'TYPICALLY_SELLS_OUT' | 'UNKNOWN' | null;
  },
  currentPrice: number
): Promise<void> {
  const db = await getDB();
  const key = getCacheKey(warehouseId, itemNumber);

  await db.put('priceCache', {
    key,
    warehouseId,
    itemNumber,
    currentPrice,
    lowestPrice60d: serverHistory.lowest_observed_price_60d,
    highestPrice60d: serverHistory.highest_observed_price_60d,
    seenCount: serverHistory.seen_at_price_count_60d ?? 1,
    lastSeen: new Date().toISOString(),
    typicalOutcome: serverHistory.typical_outcome ?? 'UNKNOWN',
    cachedAt: new Date().toISOString(),
  });
}

/**
 * Get all cached prices for a warehouse
 */
export async function getPriceCacheForWarehouse(warehouseId: number): Promise<PriceCacheEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('priceCache', 'by-warehouse', warehouseId);
}

/**
 * Delete expired cache entries
 */
export async function pruneExpiredPriceCache(): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_EXPIRY_DAYS);

  const all = await db.getAll('priceCache');
  const toDelete = all.filter((entry) => new Date(entry.cachedAt) < cutoff);

  const tx = db.transaction('priceCache', 'readwrite');
  await Promise.all(toDelete.map((entry) => tx.store.delete(entry.key)));
  await tx.done;

  return toDelete.length;
}

/**
 * Get cache entry count
 */
export async function getPriceCacheCount(): Promise<number> {
  const db = await getDB();
  return db.count('priceCache');
}

/**
 * Calculate days since last seen
 */
export function getDaysSinceLastSeen(lastSeen: string): number {
  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  return Math.floor((now.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Convert price cache to PriceHistory format for decision engine
 */
export function cacheToPriceHistory(cache: PriceCacheEntry) {
  return {
    lowest_observed_price_60d: cache.lowestPrice60d,
    highest_observed_price_60d: cache.highestPrice60d,
    seen_at_price_count_60d: cache.seenCount,
    typical_outcome: cache.typicalOutcome,
  };
}
