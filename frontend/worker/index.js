/**
 * Custom service worker additions for PriceTag
 * This file is merged with the generated service worker by next-pwa
 */

// Background Sync handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-observations') {
    event.waitUntil(syncObservations());
  }
});

// Sync observations to server
async function syncObservations() {
  try {
    // Open IndexedDB
    const db = await openDatabase();

    // Get unsynced observations
    const tx = db.transaction('observations', 'readonly');
    const store = tx.objectStore('observations');
    const index = store.index('by-synced');
    const observations = await getAllFromIndex(index, 0);

    if (observations.length === 0) {
      return;
    }

    const API_URL = 'https://costco.avocadopeanut.com';
    const syncedIds = [];

    for (const obs of observations) {
      try {
        const response = await fetch(`${API_URL}/api/v1/sync/observation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            observation_id: obs.id,
            warehouse_id: obs.warehouseId,
            item_number: obs.itemNumber,
            price: obs.price,
            price_ending: obs.priceEnding,
            unit_price: obs.unitPrice,
            unit_measure: obs.unitMeasure,
            description: obs.description,
            has_asterisk: obs.hasAsterisk,
            observed_at: obs.timestamp,
            confidence: obs.confidence,
            source: 'background_sync',
          }),
        });

        if (response.ok || (response.status >= 400 && response.status < 500)) {
          syncedIds.push(obs.id);
        }
      } catch (error) {
        console.error('Failed to sync observation:', obs.id, error);
      }
    }

    // Mark synced observations
    if (syncedIds.length > 0) {
      const writeTx = db.transaction('observations', 'readwrite');
      const writeStore = writeTx.objectStore('observations');

      for (const id of syncedIds) {
        const obs = await getFromStore(writeStore, id);
        if (obs) {
          obs.synced = true;
          await putToStore(writeStore, obs);
        }
      }
    }

    // Notify the app
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        synced: syncedIds.length,
      });
    });
  } catch (error) {
    console.error('Background sync failed:', error);
    throw error; // This will cause the sync to retry
  }
}

// IndexedDB helpers for service worker context
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pricetag-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getAllFromIndex(index, query) {
  return new Promise((resolve, reject) => {
    const request = index.getAll(query);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getFromStore(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function putToStore(store, value) {
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
