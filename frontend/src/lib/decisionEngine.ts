/**
 * Client-side Decision Engine
 * Based on Costco Price Tag Decoder v1.1
 *
 * Key principle: "Instant Savings = rules, Everything else = signals"
 * Price endings are probabilistic signals, not official guarantees.
 */

import type { Intent, Decision, ScarcityLevel, ConfidenceLevel, PriceHistory } from './api';

export interface DecisionResult {
  decision: Decision;
  decisionExplanation: string;
  decisionRationale: string;
  decisionFactors: string[];
  priceSignals: Array<{ type: string; label: string; meaning: string }>;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Urgency levels based on PDF matrix
type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

function calculateUrgency(priceEnding: string | null, hasAsterisk: boolean): UrgencyLevel {
  const isMarkdown = priceEnding === '.97' || priceEnding === '.00' || priceEnding === '.88';

  if (isMarkdown && hasAsterisk) return 'HIGH';
  if (isMarkdown) return 'MEDIUM';
  if (hasAsterisk) return 'MEDIUM';
  return 'LOW';
}

// Rationale templates - updated with accurate Costco info
const RATIONALES: Record<string, string> = {
  // Asterisk (The "Death Star")
  asterisk_markdown: "Clearance + not restocking — buy now or accept it's gone.",
  asterisk_only: "Not scheduled to reorder — this may be your last chance.",

  // Price endings (signals, not rules)
  clearance_97: "Markdown/clearance (.97) — buy if you want it.",
  manager_markdown: "Manager markdown (.00) — store-specific deal, inspect + consider.",
  special_clearance: "Special clearance (.88) — end-of-line, inspect carefully.",
  vendor_promo: "Vendor promo pricing — check unit price for value.",
  regular_price: "Regular Costco price (.99) — no urgency, promos likely.",

  // Other
  scarcity_buy: "Limited availability — buy now if you need it.",
  standard: "Standard Costco pricing — fair warehouse club value.",
  good_value: "Good value based on multiple positive signals.",
};

// Price signal definitions - from Costco Price Tag Decoder v1.1
const PRICE_SIGNALS: Record<string, { type: string; label: string; meaning: string }> = {
  '.99': {
    type: 'ending_99',
    label: 'Regular Price',
    meaning: 'Standard Costco pricing — no urgency',
  },
  '.97': {
    type: 'ending_97',
    label: 'Markdown / Clearance',
    meaning: 'Manager markdown — buy if you want it',
  },
  '.00': {
    type: 'ending_00',
    label: 'Manager Markdown',
    meaning: 'Store-specific deal — inspect and consider buying',
  },
  '.88': {
    type: 'ending_88',
    label: 'Special Clearance',
    meaning: 'End-of-line clearance — inspect carefully',
  },
  '.49': {
    type: 'ending_49',
    label: 'Vendor Promo',
    meaning: 'Vendor promo or special pricing — check unit price',
  },
  '.79': {
    type: 'ending_79',
    label: 'Vendor Promo',
    meaning: 'Vendor promo or special pricing — check unit price',
  },
  '.89': {
    type: 'ending_89',
    label: 'Vendor Promo',
    meaning: 'Vendor promo or special pricing — check unit price',
  },
  asterisk: {
    type: 'asterisk',
    label: 'Not Restocking',
    meaning: 'Item not scheduled to reorder after current stock — may be your last chance',
  },
};

export function makeDecision(
  price: number,
  priceEnding: string | null,
  hasAsterisk: boolean,
  intent: Intent = 'BROWSING',
  cachedHistory?: PriceHistory | null,
  scarcityLevel?: ScarcityLevel | null
): DecisionResult {
  const factors: string[] = [];
  const signals: Array<{ type: string; label: string; meaning: string }> = [];

  // Calculate urgency using PDF matrix
  const urgency = calculateUrgency(priceEnding, hasAsterisk);

  // Add price signals
  if (priceEnding && PRICE_SIGNALS[priceEnding]) {
    signals.push(PRICE_SIGNALS[priceEnding]);
  }
  if (hasAsterisk) {
    signals.push(PRICE_SIGNALS.asterisk);
  }

  // === HIGH URGENCY: Markdown + Asterisk ===
  if (hasAsterisk && (priceEnding === '.97' || priceEnding === '.00' || priceEnding === '.88')) {
    factors.push('Clearance price');
    factors.push('Not restocking after current stock');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Clearance + not restocking. Buy now or accept it's gone.",
      decisionRationale: RATIONALES.asterisk_markdown,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'HIGH',
    };
  }

  // === MEDIUM URGENCY: Asterisk only ===
  if (hasAsterisk) {
    factors.push('Not scheduled for reorder');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Item not scheduled to be restocked after current inventory. If you like it, this may be your last chance.",
      decisionRationale: RATIONALES.asterisk_only,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'MEDIUM',
    };
  }

  // === MEDIUM URGENCY: Markdown prices ===
  if (priceEnding === '.97') {
    factors.push('Markdown/clearance (.97)');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Markdown price (.97) — buy if you want it. This signals clearance pricing.",
      decisionRationale: RATIONALES.clearance_97,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'MEDIUM',
    };
  }

  if (priceEnding === '.00') {
    factors.push('Manager markdown (.00)');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Manager markdown (.00) — store-specific deal. Inspect the item and consider buying.",
      decisionRationale: RATIONALES.manager_markdown,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'MEDIUM',
    };
  }

  if (priceEnding === '.88') {
    factors.push('Special clearance (.88)');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Special clearance (.88) — end-of-line pricing. Inspect carefully before buying.",
      decisionRationale: RATIONALES.special_clearance,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'MEDIUM',
    };
  }

  // === Scarcity check (intent-aware) ===
  if (scarcityLevel === 'LAST_UNITS') {
    factors.push('Very limited stock');
    if (intent === 'NEED_IT') {
      return {
        decision: 'BUY_NOW',
        decisionExplanation: 'Very limited stock remaining. Buy now if you need this item.',
        decisionRationale: RATIONALES.scarcity_buy,
        decisionFactors: factors,
        priceSignals: signals,
        urgency: 'MEDIUM',
      };
    }
  } else if (scarcityLevel === 'LIMITED') {
    factors.push('Limited availability');
  }

  // === Vendor promo pricing (.49, .79, .89) ===
  if (priceEnding === '.49' || priceEnding === '.79' || priceEnding === '.89') {
    factors.push(`Vendor promo (${priceEnding})`);
    return {
      decision: 'OK_PRICE',
      decisionExplanation: `Vendor promo or special pricing (${priceEnding}). Check the unit price to verify value.`,
      decisionRationale: RATIONALES.vendor_promo,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'LOW',
    };
  }

  // === LOW URGENCY: Regular price (.99) ===
  if (priceEnding === '.99') {
    factors.push('Regular price (.99)');
    if (intent === 'BARGAIN_HUNTING') {
      return {
        decision: 'WAIT_IF_YOU_CAN',
        decisionExplanation: 'Regular Costco price — no urgency. As a bargain hunter, wait for markdown or promo.',
        decisionRationale: RATIONALES.regular_price,
        decisionFactors: factors,
        priceSignals: signals,
        urgency: 'LOW',
      };
    }
    return {
      decision: 'OK_PRICE',
      decisionExplanation: "Regular Costco price (.99) — no urgency. Promotions are likely in the future.",
      decisionRationale: RATIONALES.regular_price,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'LOW',
    };
  }

  // === Multiple positive signals ===
  if (factors.length >= 2) {
    return {
      decision: 'BUY_NOW',
      decisionExplanation: `Good value: ${factors.slice(0, 2).map(f => f.toLowerCase()).join(', ')}.`,
      decisionRationale: RATIONALES.good_value,
      decisionFactors: factors,
      priceSignals: signals,
      urgency,
    };
  }

  // === Single signal or default ===
  if (factors.length === 1) {
    return {
      decision: 'OK_PRICE',
      decisionExplanation: `Fair value: ${factors[0].toLowerCase()}.`,
      decisionRationale: RATIONALES.standard,
      decisionFactors: factors,
      priceSignals: signals,
      urgency: 'LOW',
    };
  }

  // Default - standard pricing
  factors.push('Standard pricing');
  return {
    decision: 'OK_PRICE',
    decisionExplanation: 'Standard Costco pricing. Fair value for a warehouse club.',
    decisionRationale: RATIONALES.standard,
    decisionFactors: factors,
    priceSignals: signals,
    urgency: 'LOW',
  };
}

/**
 * Build a minimal ScanResult from client-side OCR + decision
 */
export function buildOfflineResult(
  observationId: string,
  itemNumber: string,
  price: number,
  priceEnding: string | null,
  hasAsterisk: boolean,
  description: string | null,
  unitPrice: number | null,
  unitMeasure: string | null,
  confidence: number,
  intent: Intent
) {
  const decision = makeDecision(price, priceEnding, hasAsterisk, intent);

  return {
    observation_id: observationId,
    item_number: itemNumber,
    description: description || 'Costco Product',
    price,
    price_ending: priceEnding,
    unit_price: unitPrice,
    unit_measure: unitMeasure,
    decision: decision.decision,
    decision_explanation: decision.decisionExplanation,
    decision_rationale: decision.decisionRationale,
    decision_factors: decision.decisionFactors,
    scarcity_level: null as ScarcityLevel | null,
    scarcity_explanation: null as string | null,
    last_seen_days: null as number | null,
    history: null as PriceHistory | null,
    price_drop_likelihood: null as number | null,
    confidence_level: null as ConfidenceLevel | null,
    intent_applied: intent,
    product_score: null as number | null,
    product_score_explanation: null as string | null,
    price_signals: decision.priceSignals,
    community_signals: [],
    freshness: 'fresh',
    confidence,
    observed_at: new Date().toISOString(),
    // Mark as offline scan
    _offline: true,
  };
}
