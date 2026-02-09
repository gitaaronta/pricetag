'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { CameraCapture } from '@/components/CameraCapture';
import { ResultCard } from '@/components/ResultCard';
import { WarehouseSelector } from '@/components/WarehouseSelector';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { WhySheet } from '@/components/WhySheet';
import { WatchConfirmation } from '@/components/WatchConfirmation';
import { IntentToggle } from '@/components/IntentToggle';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useIntent } from '@/hooks/useIntent';
import { scanPriceTag, type ScanResult } from '@/lib/api';

type AppState = 'camera' | 'processing' | 'result' | 'error' | 'warehouse-select';

export default function Home() {
  const [state, setState] = useState<AppState>('camera');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // V2: Modals
  const [showWhySheet, setShowWhySheet] = useState(false);
  const [showWatchConfirmation, setShowWatchConfirmation] = useState(false);
  const [showIntentToggle, setShowIntentToggle] = useState(false);

  // V2: Hooks
  const { addToWatchlist, removeFromWatchlist, isWatched } = useWatchlist();
  const { intent, setIntent } = useIntent();

  // Check for stored warehouse on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('pricetag_warehouse');
    if (stored) {
      setWarehouseId(parseInt(stored, 10));
    } else {
      setState('warehouse-select');
    }
  }, []);

  const handleCapture = async (imageBlob: Blob) => {
    if (!warehouseId) {
      setState('warehouse-select');
      return;
    }

    setState('processing');
    setError(null);

    try {
      // V2: Pass intent to scan
      const scanResult = await scanPriceTag(imageBlob, warehouseId, undefined, intent);
      setResult(scanResult);
      setState('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan price tag';
      setError(message);
      setState('error');
    }
  };

  const handleWarehouseSelect = (id: number) => {
    setWarehouseId(id);
    sessionStorage.setItem('pricetag_warehouse', id.toString());
    setState('camera');
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setShowWhySheet(false);
    setShowWatchConfirmation(false);
    setState('camera');
  };

  const handleChangeWarehouse = () => {
    setState('warehouse-select');
  };

  // V2: Watch item handler
  const handleWatch = () => {
    if (!result || !warehouseId) return;

    const watched = isWatched(result.item_number, warehouseId);
    if (watched) {
      removeFromWatchlist(result.item_number, warehouseId);
    } else {
      addToWatchlist({
        itemNumber: result.item_number,
        warehouseId,
        price: result.price,
        description: result.description,
      });
      setShowWatchConfirmation(true);
    }
  };

  // Warehouse selection screen
  if (state === 'warehouse-select') {
    return (
      <WarehouseSelector
        onSelect={handleWarehouseSelect}
        currentWarehouseId={warehouseId}
      />
    );
  }

  // Show results in full screen (no camera behind)
  if (state === 'result' && result && warehouseId) {
    const watched = isWatched(result.item_number, warehouseId);

    return (
      <main className="min-h-screen bg-gray-900">
        <ResultCard
          result={result}
          onDismiss={handleReset}
          onWatch={handleWatch}
          isWatched={watched}
          onShowWhy={() => setShowWhySheet(true)}
        />

        {/* Why Sheet */}
        {showWhySheet && (
          <WhySheet result={result} onClose={() => setShowWhySheet(false)} />
        )}

        {/* Watch Confirmation */}
        {showWatchConfirmation && (
          <WatchConfirmation onClose={() => setShowWatchConfirmation(false)} />
        )}
      </main>
    );
  }

  return (
    <main className="h-screen w-screen relative overflow-hidden">
      {/* Intent toggle button (top-right) */}
      <button
        onClick={() => setShowIntentToggle(true)}
        className="absolute top-4 right-4 z-10 p-3 bg-black/50 rounded-full text-white active:bg-black/70"
        aria-label="Change intent"
      >
        <Settings size={22} />
      </button>

      {/* Camera view */}
      <CameraCapture
        onCapture={handleCapture}
        disabled={state !== 'camera'}
        onChangeWarehouse={handleChangeWarehouse}
      />

      {/* Processing overlay */}
      {state === 'processing' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <LoadingSpinner message="Reading price tag..." />
        </div>
      )}

      {/* Error overlay */}
      {state === 'error' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 p-4">
          <ErrorDisplay message={error || 'Unknown error'} onRetry={handleReset} />
        </div>
      )}

      {/* Intent Toggle Modal */}
      {showIntentToggle && (
        <IntentToggle
          intent={intent}
          onSelect={setIntent}
          onClose={() => setShowIntentToggle(false)}
        />
      )}
    </main>
  );
}
