/**
 * Client-side Decision Engine
 * Mirrors server-side logic for offline use
 */

import type { Intent, Decision, ScarcityLevel, ConfidenceLevel, PriceHistory } from './api';

export interface DecisionResult {
  decision: Decision;
  decisionExplanation: string;
  decisionRationale: string;
  decisionFactors: string[];
  priceSignals: Array<{ type: string; label: string; meaning: string }>;
}

// Rationale templates
const RATIONALES: Record<string, string> = {
  discontinued: "Discontinued item — no restock expected.",
  clearance: "Clearance price — manager markdown won't last long.",
  price_drop: "Price dropped significantly — good buying opportunity.",
  price_up: "Price is up from recent levels — may drop back.",
  regular_price: "Regular price with no discount — promotions likely.",
  mfr_discount: "Manufacturer discount active — limited time offer.",
  standard: "Standard Costco pricing — fair value for warehouse club.",
  good_value: "Good value based on multiple positive signals.",
  scarcity_buy: "Limited availability — buy now if you need it.",
};

// Price signal definitions
const PRICE_SIGNALS: Record<string, { type: string; label: string; meaning: string }> = {
  '.97': {
    type: 'ending_97',
    label: 'Clearance Price',
    meaning: "Manager markdown - often the lowest price you'll see",
  },
  '.00': {
    type: 'ending_00',
    label: 'Regular Price',
    meaning: 'Full price with no discount applied',
  },
  '.49': {
    type: 'ending_49',
    label: 'Manufacturer Discount',
    meaning: 'Temporary manufacturer rebate or promotion',
  },
  '.99': {
    type: 'ending_99',
    label: 'Standard Price',
    meaning: 'Normal Costco pricing',
  },
  asterisk: {
    type: 'asterisk',
    label: 'Being Discontinued',
    meaning: "Item won't be restocked - last chance to buy",
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

  // Add price signal
  if (priceEnding && PRICE_SIGNALS[priceEnding]) {
    signals.push(PRICE_SIGNALS[priceEnding]);
  }
  if (hasAsterisk) {
    signals.push(PRICE_SIGNALS.asterisk);
  }

  // Strong BUY NOW signals
  if (hasAsterisk) {
    factors.push('Item marked discontinued');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "This item is being discontinued and won't be restocked. If you want it, buy it now.",
      decisionRationale: RATIONALES.discontinued,
      decisionFactors: factors,
      priceSignals: signals,
    };
  }

  if (priceEnding === '.97') {
    factors.push('Clearance pricing (.97)');
    return {
      decision: 'BUY_NOW',
      decisionExplanation: "Clearance price - this is typically the lowest price Costco will offer. Manager markdowns like this don't last long.",
      decisionRationale: RATIONALES.clearance,
      decisionFactors: factors,
      priceSignals: signals,
    };
  }

  // Scarcity check - intent-aware
  if (scarcityLevel === 'LAST_UNITS') {
    factors.push('Inventory declining');
    if (intent === 'NEED_IT') {
      return {
        decision: 'BUY_NOW',
        decisionExplanation: 'Very limited stock remaining. Buy now if you need this item.',
        decisionRationale: RATIONALES.scarcity_buy,
        decisionFactors: factors,
        priceSignals: signals,
      };
    }
  } else if (scarcityLevel === 'LIMITED') {
    factors.push('Limited availability');
  }

  // Manufacturer discount
  if (priceEnding === '.49') {
    factors.push('Manufacturer discount active');
    if (factors.length >= 2) {
      return {
        decision: 'BUY_NOW',
        decisionExplanation: `Good value: manufacturer discount with ${factors[0].toLowerCase()}.`,
        decisionRationale: RATIONALES.mfr_discount,
        decisionFactors: factors,
        priceSignals: signals,
      };
    }
  }

  // Regular price
  if (priceEnding === '.00') {
    factors.push('Regular full price');
    if (intent === 'BARGAIN_HUNTING') {
      return {
        decision: 'WAIT_IF_YOU_CAN',
        decisionExplanation: 'Regular price with no discount. As a bargain hunter, wait for clearance.',
        decisionRationale: RATIONALES.regular_price,
        decisionFactors: factors,
        priceSignals: signals,
      };
    }
    return {
      decision: 'WAIT_IF_YOU_CAN',
      decisionExplanation: "Regular price with no discount. Costco often runs promotions - consider waiting for a better price unless you need it now.",
      decisionRationale: RATIONALES.regular_price,
      decisionFactors: factors,
      priceSignals: signals,
    };
  }

  // Multiple positive signals
  if (factors.length >= 2) {
    return {
      decision: 'BUY_NOW',
      decisionExplanation: `Good value: ${factors.slice(0, 2).map(f => f.toLowerCase()).join(', ')}.`,
      decisionRationale: RATIONALES.good_value,
      decisionFactors: factors,
      priceSignals: signals,
    };
  }

  // Single positive signal
  if (factors.length === 1) {
    return {
      decision: 'OK_PRICE',
      decisionExplanation: `Fair value: ${factors[0].toLowerCase()}.`,
      decisionRationale: RATIONALES.standard,
      decisionFactors: factors,
      priceSignals: signals,
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
