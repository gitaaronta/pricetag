-- PriceTag V1 Event-Sourced Database Schema
-- Immutable observations → derived snapshots

-- Warehouses (seed data, rarely changes)
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    costco_id VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10) NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    metro_area VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_warehouses_zip ON warehouses(zip_code);
CREATE INDEX idx_warehouses_metro ON warehouses(metro_area);

-- Products (canonical product records)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    item_number VARCHAR(20) UNIQUE NOT NULL,
    upc VARCHAR(14),
    description TEXT NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    brand VARCHAR(100),
    unit_size VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_item_number ON products(item_number);
CREATE INDEX idx_products_upc ON products(upc);
CREATE INDEX idx_products_category ON products(category);

-- Price Observations (immutable event log)
CREATE TABLE price_observations (
    id BIGSERIAL PRIMARY KEY,
    observation_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    product_id INTEGER REFERENCES products(id),

    -- Raw extracted data
    raw_item_number VARCHAR(20),
    raw_price DECIMAL(10, 2) NOT NULL,
    raw_unit_price DECIMAL(10, 4),
    raw_unit_measure VARCHAR(20),
    raw_description TEXT,

    -- Costco pricing signals
    price_ending VARCHAR(3), -- '.97', '.00', '.99', '.49', etc.
    has_asterisk BOOLEAN DEFAULT FALSE,

    -- Quality metadata
    source_type VARCHAR(20) NOT NULL DEFAULT 'user_scan', -- user_scan, manual, api
    extraction_confidence DECIMAL(3, 2) NOT NULL, -- 0.00 to 1.00
    image_phash VARCHAR(64),

    -- Quarantine status
    is_quarantined BOOLEAN DEFAULT FALSE,
    quarantine_reason VARCHAR(100),

    -- Timestamps
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Session tracking (no user IDs)
    session_id UUID,
    client_ip_hash VARCHAR(64)
);

CREATE INDEX idx_observations_warehouse ON price_observations(warehouse_id);
CREATE INDEX idx_observations_product ON price_observations(product_id);
CREATE INDEX idx_observations_item_number ON price_observations(raw_item_number);
CREATE INDEX idx_observations_observed_at ON price_observations(observed_at DESC);
CREATE INDEX idx_observations_phash ON price_observations(image_phash);
CREATE INDEX idx_observations_quarantine ON price_observations(is_quarantined) WHERE is_quarantined = TRUE;

-- Price Snapshots (derived, materialized views for fast reads)
CREATE TABLE price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    product_id INTEGER NOT NULL REFERENCES products(id),

    -- Current best price estimate
    current_price DECIMAL(10, 2) NOT NULL,
    current_unit_price DECIMAL(10, 4),
    unit_measure VARCHAR(20),

    -- Price signals
    price_ending VARCHAR(3),
    has_asterisk BOOLEAN DEFAULT FALSE,

    -- Quality scoring
    quality_score DECIMAL(4, 3) NOT NULL, -- 0.000 to 1.000
    observation_count INTEGER NOT NULL DEFAULT 1,

    -- Freshness
    freshness_status VARCHAR(10) NOT NULL DEFAULT 'fresh', -- fresh, warm, stale
    last_observed_at TIMESTAMPTZ NOT NULL,

    -- Historical context
    price_30d_ago DECIMAL(10, 2),
    price_90d_ago DECIMAL(10, 2),
    price_trend VARCHAR(10), -- rising, falling, stable

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(warehouse_id, product_id)
);

CREATE INDEX idx_snapshots_warehouse_product ON price_snapshots(warehouse_id, product_id);
CREATE INDEX idx_snapshots_freshness ON price_snapshots(freshness_status);
CREATE INDEX idx_snapshots_quality ON price_snapshots(quality_score DESC);

-- Community Signals (early/unverified reports, collapsed by default)
CREATE TABLE community_signals (
    id BIGSERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    product_id INTEGER REFERENCES products(id),
    raw_item_number VARCHAR(20),

    signal_type VARCHAR(50) NOT NULL, -- 'price_drop', 'clearance', 'out_of_stock', 'new_item'
    signal_value TEXT,

    -- Verification status
    verification_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,

    -- Quality
    source_quality DECIMAL(3, 2) DEFAULT 0.50,

    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    session_id UUID
);

CREATE INDEX idx_signals_warehouse ON community_signals(warehouse_id);
CREATE INDEX idx_signals_product ON community_signals(product_id);
CREATE INDEX idx_signals_expires ON community_signals(expires_at);

-- Rate Limiting (IP-based)
CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    ip_hash VARCHAR(64) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(ip_hash, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_ip ON rate_limits(ip_hash);

-- Audit Log (for debugging, not user-facing)
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
