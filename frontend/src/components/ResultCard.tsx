'use client';

import { X, ChevronDown, ChevronUp, AlertCircle, TrendingDown, Clock, Star } from 'lucide-react';
import { useState } from 'react';
import type { ScanResult, PriceSignal, CommunitySignal } from '@/lib/api';

interface ResultCardProps {
  result: ScanResult;
  onDismiss: () => void;
}

const decisionStyles = {
  BUY_NOW: {
    bg: 'bg-green-600',
    text: 'text-white',
    label: 'BUY NOW',
    icon: TrendingDown,
  },
  OK_PRICE: {
    bg: 'bg-yellow-500',
    text: 'text-black',
    label: 'OK PRICE',
    icon: Clock,
  },
  WAIT_IF_YOU_CAN: {
    bg: 'bg-red-600',
    text: 'text-white',
    label: 'WAIT IF YOU CAN',
    icon: AlertCircle,
  },
};

export function ResultCard({ result, onDismiss }: ResultCardProps) {
  const [showSignals, setShowSignals] = useState(false);
  const style = decisionStyles[result.decision as keyof typeof decisionStyles] || decisionStyles.OK_PRICE;
  const Icon = style.icon;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto">
      {/* Header with scan again button */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10 px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <h1 className="text-white font-semibold">Scan Result</h1>
        <button
          onClick={onDismiss}
          className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium active:bg-blue-700"
        >
          Scan Another
        </button>
      </div>

      <div className="px-4 py-4 pb-8">
          {/* Decision badge - the main event */}
          <div className={`${style.bg} ${style.text} rounded-2xl p-6 mb-6`}>
            <div className="flex items-center gap-3 mb-2">
              <Icon size={28} />
              <span className="text-2xl font-bold">{style.label}</span>
            </div>
            <p className="text-lg opacity-90">{result.decision_explanation}</p>
          </div>

          {/* Product info */}
          <div className="bg-gray-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-gray-400 text-sm">Item #{result.item_number}</p>
                <p className="text-white font-medium selectable">{result.description}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">${result.price.toFixed(2)}</p>
                {result.unit_price && result.unit_measure && (
                  <p className="text-gray-400 text-sm">
                    ${result.unit_price.toFixed(2)}/{result.unit_measure}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Product Score with explanation (never naked numbers) */}
          {result.product_score !== null && result.product_score_explanation && (
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="text-yellow-500" size={20} />
                <span className="text-white font-medium">Product Score: {result.product_score}/100</span>
              </div>
              <p className="text-gray-400 text-sm selectable">{result.product_score_explanation}</p>
            </div>
          )}

          {/* Price signals */}
          {result.price_signals.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <h3 className="text-white font-medium mb-3">Price Signals</h3>
              <div className="space-y-2">
                {result.price_signals.map((signal, i) => (
                  <PriceSignalItem key={i} signal={signal} />
                ))}
              </div>
            </div>
          )}

          {/* Community signals (collapsed by default) */}
          {result.community_signals.length > 0 && (
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowSignals(!showSignals)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <span className="text-gray-400 text-sm">
                  Early signals from other members ({result.community_signals.length})
                </span>
                {showSignals ? (
                  <ChevronUp className="text-gray-400" size={20} />
                ) : (
                  <ChevronDown className="text-gray-400" size={20} />
                )}
              </button>
              {showSignals && (
                <div className="px-4 pb-4 space-y-2">
                  {result.community_signals.map((signal, i) => (
                    <CommunitySignalItem key={i} signal={signal} />
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Freshness indicator */}
        <div className="mt-4 text-center">
          <FreshnessIndicator freshness={result.freshness} />
        </div>
      </div>
    </div>
  );
}

function PriceSignalItem({ signal }: { signal: PriceSignal }) {
  return (
    <div className="flex items-start gap-3 bg-gray-700/50 rounded-lg p-3">
      <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
      <div>
        <p className="text-white text-sm font-medium">{signal.label}</p>
        <p className="text-gray-400 text-xs">{signal.meaning}</p>
      </div>
    </div>
  );
}

function CommunitySignalItem({ signal }: { signal: CommunitySignal }) {
  return (
    <div className="bg-gray-700/30 rounded-lg p-3">
      <p className="text-gray-300 text-sm">{signal.message}</p>
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
        <span>{signal.reported_ago}</span>
        {signal.verification_count > 0 && (
          <span>• Confirmed by {signal.verification_count}</span>
        )}
      </div>
    </div>
  );
}

function FreshnessIndicator({ freshness }: { freshness: string }) {
  const styles = {
    fresh: { color: 'text-green-400', label: 'Fresh data (within 7 days)' },
    warm: { color: 'text-yellow-400', label: 'Data is 1-3 weeks old' },
    stale: { color: 'text-red-400', label: 'Data is over 3 weeks old' },
  };

  const style = styles[freshness as keyof typeof styles] || styles.fresh;

  return (
    <p className={`text-xs ${style.color}`}>
      {style.label}
    </p>
  );
}
