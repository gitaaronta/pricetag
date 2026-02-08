# PriceTag V1

Camera-first, trust-first mobile web app for Costco members. Point at any shelf price tag, get an instant buy/wait decision you can trust.

## Quick Start

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access the app
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Architecture

```
pricetag/
├── frontend/          # Next.js 14 (React, TypeScript, Tailwind)
├── backend/           # FastAPI (Python 3.12)
├── db/
│   ├── migrations/    # PostgreSQL schema
│   └── seeds/         # Sample data (SF Bay Area warehouses)
└── docs/              # Documentation
```

## Core Features

### Camera-First UX
- Opens directly to camera - no splash, no login, no tutorial
- One tap to capture, instant result
- ZIP-based warehouse selection (sticky per session)

### Decision Engine
- **BUY NOW**: Clearance (.97), asterisk (discontinuing), historically low
- **OK PRICE**: Standard Costco pricing, stable prices
- **WAIT IF YOU CAN**: Regular price (.00), trending up

### Costco Price Signal Decoder
- `.97` = Manager's markdown / clearance
- `.00` = Regular price (no discount)
- `.49` = Manufacturer's discount
- `.99` = Normal Costco price
- `*` (asterisk) = Being discontinued, won't be restocked

### Trust-First Design
- Product Score always includes explanation (never naked numbers)
- Community signals labeled as "Early signals from other members" (collapsed by default)
- Freshness indicators: Fresh (≤7 days), Warm (8-21 days), Stale (>21 days)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/scan/` | POST | Scan price tag image |
| `/api/v1/scan/manual` | POST | Manual price entry |
| `/api/v1/warehouses/` | GET | List warehouses |
| `/api/v1/warehouses/{id}` | GET | Get warehouse details |
| `/health` | GET | Health check |
| `/health/db` | GET | Database health check |

## Database Schema

Event-sourced design with immutable observations and derived snapshots:

- `warehouses` - Costco locations
- `products` - Product catalog
- `price_observations` - Immutable event log
- `price_snapshots` - Materialized views for fast reads
- `community_signals` - Early/unverified member reports

## Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Database

```bash
# Run migrations
psql -U pricetag -d pricetag -f db/migrations/001_initial_schema.sql
psql -U pricetag -d pricetag -f db/seeds/001_sf_bay_warehouses.sql
```

## Performance Targets

- P95 scan latency: < 3 seconds
- Rate limit: 30 scans/minute, 200/hour per IP

## Non-Negotiables

1. **No login required** - Camera opens immediately
2. **Product Score with explanation** - Never show naked numbers
3. **"Early signals from other members"** - Not "unverified reports"
4. **Costco pricing signals** - Always decode .97, .00, .49, .99, asterisk
5. **Privacy first** - No user IDs, IP hashes only for rate limiting
