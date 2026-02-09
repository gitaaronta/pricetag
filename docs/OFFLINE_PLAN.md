# PriceTag Offline Mode - Implementation Plan

## Goal
Enable full scanning and decision functionality without internet connectivity, with background sync when online.

---

## Current Architecture (Online-Only)

```
[Camera] → [Upload Image] → [Server OCR] → [Server Decision] → [Response]
                                ↓
                         [PostgreSQL DB]
```

**Problems for offline:**
- OCR runs on server (Tesseract + OpenCV)
- Decision engine queries database for history
- No local data persistence

---

## Proposed Offline Architecture

```
[Camera] → [Client OCR] → [Client Decision] → [Local Display]
               ↓                  ↓
         [IndexedDB] ←──── [Cached History]
               ↓
         [Background Sync] → [Server] (when online)
```

---

## Implementation Phases

### Phase 1: PWA Foundation (Week 1)

**1.1 Service Worker Setup**
- Install `next-pwa` or custom service worker
- Cache static assets (JS, CSS, fonts, icons)
- Cache API responses with stale-while-revalidate strategy

**1.2 App Manifest**
- Add `manifest.json` for installable PWA
- Configure icons, theme colors, display mode
- Enable "Add to Home Screen"

**1.3 Offline Detection**
- Add `navigator.onLine` listener
- Show offline indicator in UI
- Queue actions when offline

**Files to create/modify:**
```
frontend/
├── public/
│   ├── manifest.json
│   ├── sw.js (service worker)
│   └── icons/
├── src/
│   ├── hooks/useOnlineStatus.ts
│   └── components/OfflineIndicator.tsx
├── next.config.js (PWA config)
```

---

### Phase 2: Client-Side OCR (Week 2)

**2.1 Tesseract.js Integration**
- Install `tesseract.js` (~2MB worker)
- Pre-load English language data
- Implement same preprocessing as server (canvas-based)

**2.2 OCR Worker**
- Run OCR in Web Worker to avoid UI blocking
- Show progress during recognition
- Match server extraction patterns (item number, price, etc.)

**2.3 Fallback Strategy**
- Try client OCR first (faster for repeat scans)
- Fall back to server if confidence low
- User can force server mode

**Files to create:**
```
frontend/src/
├── workers/
│   └── ocr.worker.ts
├── lib/
│   ├── clientOcr.ts
│   └── imagePreprocess.ts
├── hooks/
│   └── useClientOcr.ts
```

**Code example:**
```typescript
// clientOcr.ts
import Tesseract from 'tesseract.js';

export async function extractPriceTag(imageBlob: Blob): Promise<OCRResult> {
  // Preprocess image (same as server)
  const processed = await preprocessImage(imageBlob);

  // Run Tesseract
  const { data } = await Tesseract.recognize(processed, 'eng', {
    tessedit_char_whitelist: '0123456789.$*ABCDEFGHIJKLMNOPQRSTUVWXYZ/., ',
  });

  // Parse with same regex as server
  return parseOcrText(data.text, data.confidence);
}
```

---

### Phase 3: Local Database (Week 2-3)

**3.1 IndexedDB Schema**
- Use `idb` library for async IndexedDB
- Store observations locally
- Cache price snapshots per warehouse/item

**Schema:**
```typescript
interface LocalDB {
  observations: {
    id: string;
    warehouseId: number;
    itemNumber: string;
    price: number;
    priceEnding: string;
    hasAsterisk: boolean;
    timestamp: string;
    synced: boolean;
  };

  priceCache: {
    key: string; // `${warehouseId}-${itemNumber}`
    currentPrice: number;
    lowestPrice60d: number;
    seenCount: number;
    lastSeen: string;
    typicalOutcome: string;
  };

  warehouses: {
    id: number;
    name: string;
    address: string;
    // ... cached warehouse data
  };
}
```

**3.2 Cache Strategy**
- On successful scan: cache observation + update price history
- On app open: refresh cache if online (background)
- Cache expiry: 7 days for price data, 30 days for warehouses

**Files to create:**
```
frontend/src/
├── lib/
│   ├── db.ts (IndexedDB wrapper)
│   ├── observationCache.ts
│   └── priceCache.ts
├── hooks/
│   └── useLocalDb.ts
```

---

### Phase 4: Client-Side Decision Engine (Week 3)

**4.1 Port Decision Logic to TypeScript**
- Same logic as Python `decision_engine.py`
- Use cached price history for comparisons
- Generate rationale, factors, scarcity locally

**4.2 Offline-Aware Decisions**
- Mark decisions as "offline" when no server verification
- Show "Based on cached data" indicator
- Confidence penalty for stale cache

**Files to create:**
```
frontend/src/
├── lib/
│   └── decisionEngine.ts
```

**Code structure:**
```typescript
// decisionEngine.ts
export function makeDecision(
  price: number,
  priceEnding: string,
  hasAsterisk: boolean,
  cachedHistory: PriceCache | null,
  intent: Intent
): Decision {
  // Same logic as Python decision_engine.py
  // Returns verdict, rationale, factors, etc.
}
```

---

### Phase 5: Background Sync (Week 4)

**5.1 Sync Queue**
- Queue observations when offline
- Sync to server when online
- Handle conflicts (server wins for price history)

**5.2 Service Worker Background Sync**
- Use Background Sync API where supported
- Fallback to manual sync on app open

**5.3 Sync UI**
- Show pending sync count
- Manual "Sync Now" button
- Sync status indicator

**Files to create:**
```
frontend/src/
├── lib/
│   └── syncQueue.ts
├── hooks/
│   └── useBackgroundSync.ts
├── components/
│   └── SyncStatus.tsx
```

---

### Phase 6: Offline-First UX (Week 4)

**6.1 UI Indicators**
- Offline banner at top
- "Cached" badge on results
- "Pending sync" indicator

**6.2 Graceful Degradation**
- Scarcity: "Unknown (offline)" when no cache
- History: "Limited data available offline"
- Watchlist: Works fully offline

**6.3 Cache Warming**
- On first online use: pre-cache warehouse data
- Option to "Download for offline" for specific warehouse

---

## Technical Decisions

### OCR Library Choice

| Option | Size | Speed | Accuracy |
|--------|------|-------|----------|
| Tesseract.js | ~2MB | 2-4s | Good |
| Tesseract WASM | ~4MB | 1-2s | Better |
| Cloud Vision (hybrid) | 0 | 0.5s | Best |

**Recommendation:** Tesseract.js with WASM core for balance of size/speed.

### Storage Limits

| Platform | IndexedDB Limit |
|----------|-----------------|
| Chrome | 60% of disk |
| Safari | 1GB |
| Firefox | 50% of disk |

**Estimate:** ~500 observations + cache = ~5MB (well under limits)

### Sync Strategy

| Event | Action |
|-------|--------|
| App opens (online) | Sync pending, refresh cache |
| Scan completes (online) | Immediate sync |
| Scan completes (offline) | Queue for later |
| Comes back online | Background sync |

---

## File Structure Summary

```
frontend/
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── workers/
│   │   └── ocr.worker.ts
│   ├── lib/
│   │   ├── db.ts
│   │   ├── clientOcr.ts
│   │   ├── imagePreprocess.ts
│   │   ├── decisionEngine.ts
│   │   ├── observationCache.ts
│   │   ├── priceCache.ts
│   │   └── syncQueue.ts
│   ├── hooks/
│   │   ├── useOnlineStatus.ts
│   │   ├── useClientOcr.ts
│   │   ├── useLocalDb.ts
│   │   └── useBackgroundSync.ts
│   └── components/
│       ├── OfflineIndicator.tsx
│       └── SyncStatus.tsx
```

---

## Migration Path

1. **Phase 1-2**: Users can scan offline, but decisions require online
2. **Phase 3-4**: Full offline scanning with cached decisions
3. **Phase 5-6**: Seamless online/offline with background sync

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client OCR accuracy | Bad reads | Fallback to server, lower confidence threshold |
| IndexedDB not supported | No offline | Detect early, show warning |
| Storage quota exceeded | Cache fails | LRU eviction, compress data |
| Stale cache decisions | Wrong advice | Show cache age, expire after 7 days |

---

## Success Metrics

- **Offline scan success rate**: >80%
- **Client OCR accuracy**: Within 5% of server
- **Time to result (offline)**: <3s
- **Storage usage**: <10MB typical
- **Sync success rate**: >99%

---

## Open Questions

1. Should we pre-download Tesseract language data on install?
2. How much price history to cache per item?
3. Should offline mode be opt-in or automatic?
4. Do we need a "download warehouse data" feature?

---

## Implementation Status

1. [x] Phase 1: PWA Foundation - Complete
   - Service worker with caching strategies
   - App manifest for installability
   - Offline detection hooks

2. [x] Phase 2: Client-Side OCR - Complete
   - Tesseract.js integration
   - Canvas-based image preprocessing
   - Pattern matching for price tags

3. [x] Phase 3: Local Database - Complete
   - IndexedDB with idb library
   - Observation cache
   - Price history cache
   - Warehouse cache

4. [x] Phase 4: Client-Side Decision Engine - Complete
   - Ported decision logic to TypeScript
   - Uses cached history for offline decisions
   - Intent-aware recommendations

5. [x] Phase 5: Background Sync - Complete
   - Sync queue management
   - Auto-sync when coming online
   - Service worker background sync
   - Manual sync trigger

6. [x] Phase 6: Offline-First UX - Complete
   - Offline banner with pending count
   - Cached data indicators
   - Graceful degradation messages
   - Warehouse cache for offline selection
