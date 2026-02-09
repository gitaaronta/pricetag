/**
 * Observation cache - stores scan results locally
 */

import { getDB, type PriceTagDB } from './db';

type Observation = PriceTagDB['observations']['value'];

/**
 * Save an observation to local storage
 */
export async function saveObservation(observation: Observation): Promise<void> {
  const db = await getDB();
  await db.put('observations', observation);
}

/**
 * Get an observation by ID
 */
export async function getObservation(id: string): Promise<Observation | undefined> {
  const db = await getDB();
  return db.get('observations', id);
}

/**
 * Get all observations for a warehouse
 */
export async function getObservationsByWarehouse(warehouseId: number): Promise<Observation[]> {
  const db = await getDB();
  return db.getAllFromIndex('observations', 'by-warehouse', warehouseId);
}

/**
 * Get observations for a specific item at a warehouse
 */
export async function getObservationsForItem(
  warehouseId: number,
  itemNumber: string
): Promise<Observation[]> {
  const db = await getDB();
  return db.getAllFromIndex('observations', 'by-warehouse-item', [warehouseId, itemNumber]);
}

/**
 * Get all unsynced observations
 */
export async function getUnsyncedObservations(): Promise<Observation[]> {
  const db = await getDB();
  // synced = false (stored as 0 in index due to boolean to number conversion)
  return db.getAllFromIndex('observations', 'by-synced', 0 as unknown as number);
}

/**
 * Mark an observation as synced
 */
export async function markObservationSynced(id: string): Promise<void> {
  const db = await getDB();
  const observation = await db.get('observations', id);
  if (observation) {
    observation.synced = true;
    await db.put('observations', observation);
  }
}

/**
 * Mark multiple observations as synced
 */
export async function markObservationsSynced(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('observations', 'readwrite');

  await Promise.all(
    ids.map(async (id) => {
      const observation = await tx.store.get(id);
      if (observation) {
        observation.synced = true;
        await tx.store.put(observation);
      }
    })
  );

  await tx.done;
}

/**
 * Get recent observations (last N)
 */
export async function getRecentObservations(limit: number = 50): Promise<Observation[]> {
  const db = await getDB();
  const all = await db.getAll('observations');

  // Sort by timestamp descending
  return all
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Delete old observations (keep last N days)
 */
export async function pruneOldObservations(keepDays: number = 90): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);

  const all = await db.getAll('observations');
  const toDelete = all.filter(
    (obs) => new Date(obs.timestamp) < cutoff && obs.synced
  );

  const tx = db.transaction('observations', 'readwrite');
  await Promise.all(toDelete.map((obs) => tx.store.delete(obs.id)));
  await tx.done;

  return toDelete.length;
}

/**
 * Get observation count
 */
export async function getObservationCount(): Promise<number> {
  const db = await getDB();
  return db.count('observations');
}

/**
 * Get unsynced observation count
 */
export async function getUnsyncedCount(): Promise<number> {
  const db = await getDB();
  const unsynced = await getUnsyncedObservations();
  return unsynced.length;
}
