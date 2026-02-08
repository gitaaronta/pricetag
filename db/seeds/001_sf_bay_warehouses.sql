-- SF Bay Area Costco Warehouses Seed Data
INSERT INTO warehouses (costco_id, name, address, city, state, zip_code, latitude, longitude, metro_area) VALUES
('143', 'San Francisco', '450 10th Street', 'San Francisco', 'CA', '94103', 37.7726, -122.4137, 'SF Bay Area'),
('116', 'South San Francisco', '2300 Junipero Serra Blvd', 'South San Francisco', 'CA', '94014', 37.6704, -122.4470, 'SF Bay Area'),
('119', 'Redwood City', '2250 Middlefield Road', 'Redwood City', 'CA', '94063', 37.4666, -122.2289, 'SF Bay Area'),
('129', 'Mountain View', '600 Showers Drive', 'Mountain View', 'CA', '94040', 37.4030, -122.1114, 'SF Bay Area'),
('124', 'Sunnyvale', '1709 Automation Parkway', 'Sunnyvale', 'CA', '94089', 37.4069, -122.0017, 'SF Bay Area'),
('144', 'San Jose', '1601 Coleman Avenue', 'San Jose', 'CA', '95110', 37.3544, -121.9266, 'SF Bay Area'),
('128', 'Almaden (San Jose)', '5101 Almaden Expressway', 'San Jose', 'CA', '95118', 37.2502, -121.8733, 'SF Bay Area'),
('146', 'Santa Clara', '1601 Great Mall Drive', 'Milpitas', 'CA', '95035', 37.4166, -121.8989, 'SF Bay Area'),
('117', 'Foster City', '1001 Metro Center Blvd', 'Foster City', 'CA', '94404', 37.5591, -122.2723, 'SF Bay Area'),
('474', 'San Leandro', '1900 Davis Street', 'San Leandro', 'CA', '94577', 37.7127, -122.1720, 'SF Bay Area'),
('482', 'Richmond', '4801 Central Avenue', 'Richmond', 'CA', '94804', 37.9161, -122.3564, 'SF Bay Area'),
('478', 'Concord', '2400 Monument Blvd', 'Concord', 'CA', '94520', 37.9388, -122.0232, 'SF Bay Area'),
('130', 'Danville', '3150 Fostoria Way', 'Danville', 'CA', '94526', 37.7716, -121.9197, 'SF Bay Area'),
('475', 'Livermore', '2800 Independence Drive', 'Livermore', 'CA', '94551', 37.7018, -121.7541, 'SF Bay Area'),
('118', 'Fremont', '43621 Pacific Commons Blvd', 'Fremont', 'CA', '94538', 37.4961, -121.9531, 'SF Bay Area'),
('127', 'Newark', '35601 Newark Blvd', 'Newark', 'CA', '94560', 37.5194, -122.0414, 'SF Bay Area'),
('111', 'Novato', '300 Vintage Way', 'Novato', 'CA', '94945', 38.0867, -122.5693, 'SF Bay Area'),
('468', 'Santa Rosa', '1900 Santa Rosa Avenue', 'Santa Rosa', 'CA', '95407', 38.4179, -122.7094, 'SF Bay Area'),
('476', 'Vallejo', '100 Plaza Drive', 'Vallejo', 'CA', '94591', 38.1242, -122.2175, 'SF Bay Area'),
('131', 'Hayward', '27218 Hesperian Blvd', 'Hayward', 'CA', '94545', 37.6392, -122.0893, 'SF Bay Area');

-- Sample products for testing
INSERT INTO products (item_number, upc, description, category, subcategory, brand, unit_size) VALUES
('1234567', '00012345678901', 'Kirkland Signature Olive Oil Extra Virgin', 'Grocery', 'Oils & Vinegars', 'Kirkland Signature', '2L'),
('7654321', '00076543210987', 'Charmin Ultra Soft Toilet Paper 30 Mega Rolls', 'Household', 'Paper Products', 'Charmin', '30ct'),
('1122334', '00011223344556', 'Kirkland Signature Organic Eggs 24ct', 'Dairy & Eggs', 'Eggs', 'Kirkland Signature', '24ct'),
('9988776', '00099887766554', 'Bounty Advanced Paper Towels 12 Rolls', 'Household', 'Paper Products', 'Bounty', '12ct'),
('5566778', '00055667788990', 'Tide Pods Laundry Detergent 152ct', 'Household', 'Laundry', 'Tide', '152ct'),
('3344556', '00033445566778', 'Kirkland Signature Rotisserie Chicken', 'Deli', 'Prepared Foods', 'Kirkland Signature', 'each'),
('4455667', '00044556677889', 'Kirkland Signature Almond Butter 27oz', 'Grocery', 'Spreads', 'Kirkland Signature', '27oz'),
('6677889', '00066778899001', 'Duracell AA Batteries 40 Pack', 'Electronics', 'Batteries', 'Duracell', '40ct'),
('8899001', '00088990011223', 'Kirkland Signature Bacon 4 Pack', 'Meat', 'Pork', 'Kirkland Signature', '4lb'),
('2233445', '00022334455667', 'LaCroix Sparkling Water Variety 24 Pack', 'Beverages', 'Water', 'LaCroix', '24ct');

-- Sample price observations with Costco pricing signals
INSERT INTO price_observations (warehouse_id, product_id, raw_item_number, raw_price, raw_unit_price, raw_unit_measure, raw_description, price_ending, has_asterisk, source_type, extraction_confidence, observed_at) VALUES
(1, 1, '1234567', 16.99, 8.50, 'L', 'KS OLIVE OIL EV 2L', '.99', FALSE, 'user_scan', 0.95, NOW() - INTERVAL '2 days'),
(1, 2, '7654321', 29.99, 1.00, 'roll', 'CHARMIN ULTRA SOFT 30MR', '.99', FALSE, 'user_scan', 0.92, NOW() - INTERVAL '1 day'),
(1, 3, '1122334', 8.49, 0.35, 'egg', 'KS ORGANIC EGGS 24CT', '.49', FALSE, 'user_scan', 0.98, NOW()),
(1, 4, '9988776', 24.97, 2.08, 'roll', 'BOUNTY ADV PT 12R', '.97', FALSE, 'user_scan', 0.89, NOW() - INTERVAL '3 days'),
(1, 5, '5566778', 34.99, 0.23, 'pod', 'TIDE PODS 152CT', '.99', TRUE, 'user_scan', 0.91, NOW() - INTERVAL '5 days'),
(2, 1, '1234567', 16.99, 8.50, 'L', 'KS OLIVE OIL EV 2L', '.99', FALSE, 'user_scan', 0.94, NOW() - INTERVAL '4 days'),
(2, 6, '3344556', 4.99, NULL, NULL, 'KS ROTISSERIE CHICKEN', '.99', FALSE, 'user_scan', 0.97, NOW()),
(3, 1, '1234567', 14.97, 7.49, 'L', 'KS OLIVE OIL EV 2L', '.97', FALSE, 'user_scan', 0.93, NOW() - INTERVAL '1 day');

-- Derive initial snapshots
INSERT INTO price_snapshots (warehouse_id, product_id, current_price, current_unit_price, unit_measure, price_ending, has_asterisk, quality_score, observation_count, freshness_status, last_observed_at)
SELECT
    warehouse_id,
    product_id,
    raw_price,
    raw_unit_price,
    raw_unit_measure,
    price_ending,
    has_asterisk,
    extraction_confidence * 0.9, -- Apply source weight
    1,
    'fresh',
    observed_at
FROM price_observations
WHERE is_quarantined = FALSE
ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
    current_price = EXCLUDED.current_price,
    quality_score = EXCLUDED.quality_score,
    observation_count = price_snapshots.observation_count + 1,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = NOW();
