/**
 * PriceTag API client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://avocadopeanut.com';

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

export interface ScanResult {
  observation_id: string;
  item_number: string;
  description: string;
  price: number;
  unit_price: number | null;
  unit_measure: string | null;
  decision: 'BUY_NOW' | 'OK_PRICE' | 'WAIT_IF_YOU_CAN';
  decision_explanation: string;
  product_score: number | null;
  product_score_explanation: string | null;
  price_signals: PriceSignal[];
  community_signals: CommunitySignal[];
  freshness: string;
  confidence: number;
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

/**
 * Scan a price tag image
 */
export async function scanPriceTag(
  imageBlob: Blob,
  warehouseId: number,
  sessionId?: string
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append('image', imageBlob, 'price_tag.jpg');
  formData.append('warehouse_id', warehouseId.toString());
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
  hasAsterisk?: boolean
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
 * Health check
 */
export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
}
