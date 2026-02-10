'use client';

import { useState } from 'react';
import {
  AlertCircle,
  TrendingDown,
  Clock,
  Star,
  Info,
  Package,
  History,
  TrendingUp,
  WifiOff,
  Database,
  CloudOff,
} from 'lucide-react';
import type { ScanResult, PriceSignal } from '@/lib/api';

// Extended result type with offline/preview flags
type ExtendedScanResult = ScanResult & { _offline?: boolean; _preview?: boolean };

interface ResultCardProps {
  result: ScanResult;
  onDismiss: () => void;
  onWatch: () => void;
  isWatched: boolean;
  onShowWhy: () => void;
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

const scarcityStyles = {
  PLENTY: { emoji: '🟢', label: 'Plenty', color: 'text-green-400' },
  LIMITED: { emoji: '🟡', label: 'Limited', color: 'text-yellow-400' },
  LAST_UNITS: { emoji: '🔴', label: 'Last units', color: 'text-red-400' },
  UNKNOWN: { emoji: '⚪', label: 'Unknown', color: 'text-gray-400' },
};

export function ResultCard({ result, onDismiss, onWatch, isWatched, onShowWhy }: ResultCardProps) {
  const [showPriceInfo, setShowPriceInfo] = useState(false);
  const style = decisionStyles[result.decision] || decisionStyles.OK_PRICE;
  const Icon = style.icon;
  const scarcity = result.scarcity_level ? scarcityStyles[result.scarcity_level] : null;
  const isOffline = (result as ExtendedScanResult)._offline;
  const isPreview = (result as ExtendedScanResult)._preview;
  const hasCachedHistory = isOffline && result.history !== null;

  return (
    <div className="min-h-screen bg-gray-900 overflow-y-auto">
      {/* Offline Banner */}
      {isOffline && !isPreview && (
        <div className="bg-amber-600/90 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm">
          <WifiOff size={16} />
          <span>Offline scan - will sync when connected</span>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10 px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h1 className="text-white font-semibold">Scan Result</h1>
          {isPreview && (
            <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
              Verifying...
            </span>
          )}
          {isOffline && !isPreview && (
            <span className="text-xs bg-amber-600/30 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CloudOff size={12} />
              Offline
            </span>
          )}
          {hasCachedHistory && !isPreview && (
            <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Database size={12} />
              Cached
            </span>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium active:bg-blue-700"
        >
          Scan Another
        </button>
      </div>

      <div className="px-4 py-4 pb-8 space-y-4">
        {/* 1. Decision Badge (Top Priority) */}
        <div className={`${style.bg} ${style.text} rounded-2xl p-5`}>
          <div className="flex items-center gap-3 mb-2">
            <Icon size={28} />
            <span className="text-2xl font-bold">{style.label}</span>
          </div>
          {/* 2. Decision Rationale (WHY) */}
          <p className="text-lg opacity-90">{result.decision_rationale || result.decision_explanation}</p>
        </div>

        {/* 3. Item # + Price + Ending */}
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm">Item #{result.item_number}</p>
              <p className="text-white font-medium selectable">
                {result.description || 'Costco Product'}
              </p>
            </div>
            <div className="text-right">
              <button
                onClick={() => setShowPriceInfo(!showPriceInfo)}
                className="text-3xl font-bold text-white flex items-center gap-1"
              >
                ${result.price.toFixed(2)}
                {result.price_ending && (
                  <span className="text-sm text-gray-400 font-normal">({result.price_ending})</span>
                )}
              </button>
              {result.unit_price && result.unit_measure && (
                <p className="text-gray-400 text-sm">
                  ${result.unit_price.toFixed(2)}/{result.unit_measure}
                </p>
              )}
            </div>
          </div>
          {/* Price ending education (tap to expand) - from Costco Price Tag Decoder */}
          {showPriceInfo && result.price_ending && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-gray-400 text-sm">
                {result.price_ending === '.99' && '".99" = Regular Costco price — no urgency'}
                {result.price_ending === '.97' && '".97" = Markdown/clearance — buy if you want it'}
                {result.price_ending === '.00' && '".00" = Manager markdown (store-specific) — inspect + consider'}
                {result.price_ending === '.88' && '".88" = Special clearance/end-of-line — inspect carefully'}
                {result.price_ending === '.49' && '".49" = Vendor promo pricing — check unit price'}
                {result.price_ending === '.79' && '".79" = Vendor promo pricing — check unit price'}
                {result.price_ending === '.89' && '".89" = Vendor promo pricing — check unit price'}
              </p>
              <p className="text-gray-500 text-xs mt-1 italic">
                Note: Price endings are signals, not guarantees.
              </p>
            </div>
          )}
        </div>

        {/* 4. Scarcity Block */}
        {scarcity && result.scarcity_level !== 'UNKNOWN' ? (
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-gray-400" />
              <span className="text-gray-400 text-sm">Scarcity:</span>
              <span className={`font-medium ${scarcity.color}`}>
                {scarcity.emoji} {scarcity.label}
              </span>
            </div>
            {result.last_seen_days !== null && (
              <p className="text-gray-500 text-sm mt-1">
                Last seen: {result.last_seen_days === 0 ? 'Today' : `${result.last_seen_days} day${result.last_seen_days !== 1 ? 's' : ''} ago`}
              </p>
            )}
          </div>
        ) : isOffline ? (
          <div className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-gray-500" />
              <span className="text-gray-500 text-sm">Scarcity: Not available offline</span>
            </div>
          </div>
        ) : null}

        {/* 5. Price History Bullets */}
        {result.history ? (
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History size={18} className="text-gray-400" />
                <span className="text-white font-medium">Price History</span>
              </div>
              {hasCachedHistory && (
                <span className="text-xs text-blue-400 flex items-center gap-1">
                  <Database size={12} />
                  From cache
                </span>
              )}
            </div>
            <div className="space-y-2 text-sm">
              {result.history.seen_at_price_count_60d !== null && result.history.seen_at_price_count_60d > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-300">
                    Seen at this price: {result.history.seen_at_price_count_60d}x
                  </span>
                </div>
              )}
              {result.history.lowest_observed_price_60d !== null && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-300">
                    Lowest observed: ${result.history.lowest_observed_price_60d.toFixed(2)}
                  </span>
                </div>
              )}
              {result.history.typical_outcome && result.history.typical_outcome !== 'UNKNOWN' && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-300">
                    {result.history.typical_outcome === 'TYPICALLY_DROPS' && 'Usually drops in price'}
                    {result.history.typical_outcome === 'TYPICALLY_SELLS_OUT' && 'Usually sells out'}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : isOffline ? (
          <div className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <History size={18} className="text-gray-500" />
              <span className="text-gray-500 text-sm">No cached history for this item</span>
            </div>
            <p className="text-gray-600 text-xs mt-1">Scan again when online for full history</p>
          </div>
        ) : null}

        {/* 6. Price Drop Likelihood Meter */}
        {result.price_drop_likelihood !== null && result.confidence_level && result.confidence_level !== 'LOW' && (
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} className="text-gray-400" />
              <span className="text-white font-medium">Price Drop Likelihood</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all"
                  style={{ width: `${Math.round(result.price_drop_likelihood * 100)}%` }}
                />
              </div>
              <span className="text-white font-medium w-12 text-right">
                {Math.round(result.price_drop_likelihood * 100)}%
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Based on observed pricing patterns, not a guarantee.
            </p>
          </div>
        )}

        {/* Show "Not enough data" if low confidence - but not for offline (handled above) */}
        {!isOffline && (result.price_drop_likelihood === null || (result.confidence_level === 'LOW' && result.history === null)) ? (
          <div className="bg-gray-800/50 rounded-xl p-4 text-center">
            <p className="text-gray-500 text-sm">Not enough data yet for price predictions</p>
          </div>
        ) : null}

        {/* Price Signals */}
        {result.price_signals.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-white font-medium mb-3">Price Signals</h3>
            <div className="space-y-2">
              {result.price_signals.map((signal, i) => (
                <PriceSignalItem key={i} signal={signal} />
              ))}
            </div>
          </div>
        )}

        {/* 7. Actions: Watch + Why */}
        <div className="flex gap-3">
          <button
            onClick={onWatch}
            className={`flex-1 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 ${
              isWatched
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                : 'bg-gray-800 text-white active:bg-gray-700'
            }`}
          >
            <Star size={20} className={isWatched ? 'fill-yellow-400' : ''} />
            {isWatched ? 'Watching' : 'Watch Item'}
          </button>
          <button
            onClick={onShowWhy}
            className="flex-1 py-3 px-4 rounded-xl bg-gray-800 text-white font-medium flex items-center justify-center gap-2 active:bg-gray-700"
          >
            <Info size={20} />
            Why?
          </button>
        </div>

        {/* Freshness indicator */}
        <div className="text-center pt-2">
          {isOffline ? (
            <p className="text-xs text-amber-400">Scanned offline - pending sync</p>
          ) : (
            <FreshnessIndicator freshness={result.freshness} />
          )}
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

function FreshnessIndicator({ freshness }: { freshness: string }) {
  const styles = {
    fresh: { color: 'text-green-400', label: 'Fresh data (within 7 days)' },
    warm: { color: 'text-yellow-400', label: 'Data is 1-3 weeks old' },
    stale: { color: 'text-red-400', label: 'Data is over 3 weeks old' },
  };

  const style = styles[freshness as keyof typeof styles] || styles.fresh;

  return <p className={`text-xs ${style.color}`}>{style.label}</p>;
}
