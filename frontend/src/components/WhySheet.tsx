'use client';

import { X } from 'lucide-react';
import type { ScanResult } from '@/lib/api';

interface WhySheetProps {
  result: ScanResult;
  onClose: () => void;
}

export function WhySheet({ result, onClose }: WhySheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full bg-gray-900 rounded-t-3xl animate-slide-up max-h-[80vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="px-6 pb-8">
          <h2 className="text-xl font-bold text-white mb-6">Why this recommendation</h2>

          {/* Decision Factors */}
          {result.decision_factors && result.decision_factors.length > 0 && (
            <div className="space-y-3 mb-6">
              {result.decision_factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-blue-400 mt-1">•</span>
                  <span className="text-gray-300">{factor}</span>
                </div>
              ))}
            </div>
          )}

          {/* Additional context based on decision */}
          <div className="bg-gray-800 rounded-xl p-4 mb-6">
            <p className="text-gray-300 text-sm leading-relaxed">
              {result.decision === 'BUY_NOW' && (
                <>
                  This recommendation is based on strong buy signals.{' '}
                  {result.scarcity_level === 'LAST_UNITS' && 'Limited stock remaining suggests this item may not be available much longer. '}
                  {result.price_ending === '.97' && 'The .97 price ending indicates a manager markdown — these are typically final markdowns before the item is removed. '}
                </>
              )}
              {result.decision === 'OK_PRICE' && (
                <>
                  This is standard Costco pricing without strong buy or wait signals.
                  The price is fair for a warehouse club, though waiting could result in a better deal if you're not in a hurry.
                </>
              )}
              {result.decision === 'WAIT_IF_YOU_CAN' && (
                <>
                  Current indicators suggest a better price may be coming.{' '}
                  {result.price_ending === '.00' && 'The .00 price ending indicates regular pricing — Costco often runs promotions on these items. '}
                  {result.price_drop_likelihood && result.price_drop_likelihood > 0.5 && `There's approximately a ${Math.round(result.price_drop_likelihood * 100)}% chance of a price drop based on historical patterns.`}
                </>
              )}
            </p>
          </div>

          {/* Education tip */}
          <div className="border border-gray-700 rounded-xl p-4 mb-6">
            <p className="text-gray-400 text-sm font-medium mb-2">Costco tip</p>
            <p className="text-gray-300 text-sm">
              <strong>Discontinued ≠ clearance.</strong> A discontinued item (marked with *) won't be restocked
              but isn't necessarily discounted. Clearance items (.97 ending) are actively marked down.
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 text-white font-medium rounded-xl active:bg-gray-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
