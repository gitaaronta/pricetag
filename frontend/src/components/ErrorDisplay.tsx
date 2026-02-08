'use client';

import { AlertTriangle, Camera, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  message: string;
  tips?: string[];
  onRetry: () => void;
}

export function ErrorDisplay({ message, tips, onRetry }: ErrorDisplayProps) {
  const defaultTips = [
    'Hold the camera steady',
    'Ensure the full price tag is visible',
    'Avoid glare and shadows',
    'Move closer if the text is small',
  ];

  const displayTips = tips || defaultTips;

  return (
    <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full">
      <div className="text-center mb-6">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Couldn't Read Tag</h2>
        <p className="text-gray-400">{message}</p>
      </div>

      <div className="bg-gray-700/50 rounded-xl p-4 mb-6">
        <p className="text-white text-sm font-medium mb-3">Tips for better scans:</p>
        <ul className="space-y-2">
          {displayTips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-gray-400 text-sm">
              <Camera className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onRetry}
        className="w-full bg-costco-blue text-white py-3 rounded-xl font-medium
                   flex items-center justify-center gap-2 hover:bg-costco-blue/90 transition-colors"
      >
        <RefreshCw size={20} />
        Try Again
      </button>
    </div>
  );
}
