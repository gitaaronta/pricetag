'use client';

import { Star, X } from 'lucide-react';

interface WatchConfirmationProps {
  onClose: () => void;
}

export function WatchConfirmation({ onClose }: WatchConfirmationProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-2xl p-6 max-w-sm w-full animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
            <Star size={24} className="text-yellow-400 fill-yellow-400" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-white text-center mb-4">
          Item added to Watchlist
        </h2>

        <p className="text-gray-400 text-sm mb-4">We'll notify you if:</p>

        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 text-gray-300 text-sm">
            <span className="text-green-400">•</span>
            <span>Price drops</span>
          </div>
          <div className="flex items-center gap-2 text-gray-300 text-sm">
            <span className="text-green-400">•</span>
            <span>Goes clearance (.97)</span>
          </div>
          <div className="flex items-center gap-2 text-gray-300 text-sm">
            <span className="text-green-400">•</span>
            <span>Item disappears</span>
          </div>
        </div>

        <p className="text-gray-500 text-xs text-center mb-4">
          No account needed. Stored locally on your device.
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl active:bg-blue-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
