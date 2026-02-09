'use client';

import { X, Target, Search, Eye } from 'lucide-react';
import type { Intent } from '@/lib/api';

interface IntentToggleProps {
  intent: Intent;
  onSelect: (intent: Intent) => void;
  onClose: () => void;
}

const intents: { value: Intent; label: string; description: string; icon: typeof Target }[] = [
  {
    value: 'NEED_IT',
    label: 'I need this',
    description: 'Prioritize availability over price',
    icon: Target,
  },
  {
    value: 'BARGAIN_HUNTING',
    label: 'Bargain hunting',
    description: 'Wait for the best price',
    icon: Search,
  },
  {
    value: 'BROWSING',
    label: 'Just browsing',
    description: 'Balanced recommendations',
    icon: Eye,
  },
];

export function IntentToggle({ intent, onSelect, onClose }: IntentToggleProps) {
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

        <h2 className="text-lg font-bold text-white mb-2">What's your intent?</h2>
        <p className="text-gray-400 text-sm mb-6">This affects your recommendations</p>

        <div className="space-y-3">
          {intents.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                onSelect(value);
                onClose();
              }}
              className={`w-full p-4 rounded-xl flex items-center gap-4 transition-colors ${
                intent === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 active:bg-gray-700'
              }`}
            >
              <Icon size={24} className={intent === value ? 'text-white' : 'text-gray-400'} />
              <div className="text-left">
                <p className="font-medium">{label}</p>
                <p className={`text-sm ${intent === value ? 'text-blue-200' : 'text-gray-500'}`}>
                  {description}
                </p>
              </div>
              {intent === value && (
                <div className="ml-auto w-5 h-5 bg-white rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-600 rounded-full" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
