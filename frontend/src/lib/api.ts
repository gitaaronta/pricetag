/**
 * PriceTag API client V2 - with decision intelligence
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://costco.avocadopeanut.com';

// Types
export type Intent = 'NEED_IT' | 'BARGAIN_HUNTING' | 'BROWSING';
export type Decision = 'BUY_NOW' | 'OK_PRICE' | 'WAIT_IF_YOU_CAN';
export type ScarcityLevel = 'PLENTY' | 'LIMITED' | 'LAST_UNITS' | 'UNKNOWN';
export type ConfidenceLevel = 'LOW' | 'MED' | 'HIGH';
export type TypicalOutcome = 'TYPICALLY_DROPS' | 'TYPICALLY_SELLS_OUT' | 'UNKNOWN';

export interface PriceSignal {
  type: string;
  label: string;
  meaning: string;
}

export interface CommunitySignal {
  type: string;
  message: string;
  reported_ago: string;
  verification_count: number;
}

export interface PriceHistory {
  seen_at_price_count_60d: number | null;
  lowest_observed_price_60d: number | null;
  typical_outcome: TypicalOutcome | null;
}

export interface ScanResult {
  observation_id: string;
  item_number: string;
  description: string | null;
  price: number;
  price_ending: string | null;
  unit_price: number | null;
  unit_measure: string | null;

  // V1 Decision
  decision: Decision;
  decision_explanation: string;

  // V2 Intelligence
  decision_rationale: string;
  decision_factors: string[];
  scarcity_level: ScarcityLevel | null;
  scarcity_explanation: string | null;
  last_seen_days: number | null;
  history: PriceHistory | null;
  price_drop_likelihood: number | null;
  confidence_level: ConfidenceLevel | null;
  intent_applied: Intent | null;

  // Legacy
  product_score: number | null;
  product_score_explanation: string | null;
  price_signals: PriceSignal[];
  community_signals: CommunitySignal[];
  freshness: string;
  confidence: number;
  observed_at: string | null;
}

export interface Warehouse {
  id: number;
  costco_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  metro_area: string | null;
}

export interface WatchItemStatus {
  item_number: string;
  current_price: number | null;
  previous_price: number | null;
  price_changed: boolean;
  decision_changed: boolean;
  became_clearance: boolean;
  disappeared: boolean;
  last_seen_days: number | null;
  current_decision: Decision | null;
}

export interface WatchStatusResponse {
  warehouse_id: number;
  items: WatchItemStatus[];
  checked_at: string;
}

/**
 * Scan a price tag image
 */
export async function scanPriceTag(
  imageBlob: Blob,
  warehouseId: number,
  sessionId?: string,
  intent: Intent = 'BROWSING'
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'price_tag.jpg');
  formData.append('warehouse_id', warehouseId.toString());
  formData.append('intent', intent);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const response = await fetch(`${API_URL}/api/v1/scan/`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Scan failed' }));
    throw new Error(error.detail?.message || error.message || 'Failed to scan price tag');
  }

  return response.json();
}

/**
 * Manual price entry (fallback when OCR fails)
 */
export async function manualPriceEntry(
  warehouseId: number,
  itemNumber: string,
  price: number,
  description?: string,
  hasAsterisk?: boolean,
  intent: Intent = 'BROWSING'
): Promise<ScanResult> {
  const response = await fetch(`${API_URL}/api/v1/scan/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      item_number: itemNumber,
      price,
      description,
      has_asterisk: hasAsterisk,
      intent,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Entry failed' }));
    throw new Error(error.detail?.message || error.message || 'Failed to process entry');
  }

  return response.json();
}

/**
 * Get list of warehouses
 */
export async function getWarehouses(zipCode?: string): Promise<Warehouse[]> {
  const params = new URLSearchParams();
  if (zipCode) {
    params.append('zip_code', zipCode);
  }

  const url = `${API_URL}/api/v1/warehouses/${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to load warehouses');
  }

  const data = await response.json();
  return data.warehouses;
}

/**
 * Check status of watched items
 */
export async function checkWatchStatus(
  warehouseId: number,
  itemNumbers: string[]
): Promise<WatchStatusResponse> {
  const response = await fetch(`${API_URL}/api/v1/watch/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      item_numbers: itemNumbers,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to check watch status');
  }

  return response.json();
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
}
