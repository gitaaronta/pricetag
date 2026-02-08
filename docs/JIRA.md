# PriceTag V1 - Implementation Tasks

## Epic: Camera-First Mobile Web App

### Sprint 1: Foundation

#### PT-001: Project Scaffolding ✅
- [x] Create monorepo structure (frontend/backend/db)
- [x] Set up Docker Compose for local development
- [x] Configure Next.js 14 with TypeScript and Tailwind
- [x] Configure FastAPI with async SQLAlchemy
- [x] Create PostgreSQL schema with event-sourced design

#### PT-002: Database Schema & Seeds ✅
- [x] Create warehouses table
- [x] Create products table
- [x] Create price_observations table (immutable)
- [x] Create price_snapshots table (derived)
- [x] Create community_signals table
- [x] Seed SF Bay Area warehouses (20 locations)
- [x] Seed sample products for testing

#### PT-003: Backend API Core ✅
- [x] Health check endpoints
- [x] Warehouse list/detail endpoints
- [x] Scan endpoint (image upload)
- [x] Manual entry fallback endpoint
- [x] Rate limiting (IP-based, 30/min)

### Sprint 2: Intelligence

#### PT-004: OCR Service ✅
- [x] Tesseract integration
- [x] Price tag preprocessing (grayscale, threshold, denoise)
- [x] Item number extraction (7-digit pattern)
- [x] Price extraction with ending detection
- [x] Unit price extraction
- [x] Asterisk detection
- [x] pHash calculation for deduplication

#### PT-005: Decision Engine ✅
- [x] Price ending signal mapping
- [x] BUY NOW logic (.97, asterisk, historically low)
- [x] OK PRICE logic (.99, .49, stable)
- [x] WAIT IF YOU CAN logic (.00, trending up)
- [x] Product score calculation WITH explanation
- [x] Freshness status calculation

#### PT-006: Observation Service ✅
- [x] Create observation from OCR extraction
- [x] Create observation from manual entry
- [x] Duplicate detection (pHash)
- [x] Quarantine rules
- [x] Snapshot derivation

### Sprint 3: Frontend

#### PT-007: Camera Experience ✅
- [x] Full-screen camera view
- [x] Viewfinder overlay with guides
- [x] Capture button with pulse effect
- [x] Camera flip support
- [x] Loading state during processing

#### PT-008: Result Card ✅
- [x] Decision badge (BUY NOW / OK PRICE / WAIT)
- [x] Decision explanation
- [x] Product info (item, description, price)
- [x] Product score WITH explanation
- [x] Price signals display
- [x] Community signals (collapsed by default)
- [x] Freshness indicator

#### PT-009: Warehouse Selection ✅
- [x] ZIP code search
- [x] Warehouse list
- [x] Session persistence
- [x] Change warehouse button

### Sprint 4: Polish & Launch

#### PT-010: PWA Configuration
- [x] Web manifest
- [ ] Service worker for offline
- [ ] Icon assets (192x192, 512x512)
- [ ] Splash screens

#### PT-011: Error Handling
- [x] OCR failure state with tips
- [x] Network error handling
- [ ] Retry logic with backoff
- [ ] Offline detection

#### PT-012: Observability
- [ ] Structured logging (structlog)
- [ ] Prometheus metrics endpoint
- [ ] Request tracing
- [ ] Error reporting

#### PT-013: Testing
- [ ] Backend unit tests (pytest)
- [ ] OCR accuracy tests with sample images
- [ ] Decision engine edge case tests
- [ ] Frontend component tests
- [ ] E2E tests (Playwright)

---

## Backlog

### Future Enhancements

#### PT-100: Price History Charts
- Show 30/90 day price trends
- Visual indicators for historical context

#### PT-101: Multi-Item Scanning
- Batch scanning mode
- Shopping list integration

#### PT-102: Price Alerts
- Push notifications when prices drop
- Requires opt-in and device token

#### PT-103: Barcode Scanning
- UPC barcode support
- Faster product lookup

#### PT-104: Share Results
- Share scan result as image
- Deep link to specific product

---

## Definition of Done

- [ ] Code reviewed and merged
- [ ] Unit tests passing
- [ ] No console errors
- [ ] Mobile-tested on iOS Safari and Android Chrome
- [ ] P95 latency < 3 seconds
- [ ] Documentation updated
