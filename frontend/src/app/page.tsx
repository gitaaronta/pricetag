'use client';

import { useState, useEffect } from 'react';
import { CameraCapture } from '@/components/CameraCapture';
import { ResultCard } from '@/components/ResultCard';
import { WarehouseSelector } from '@/components/WarehouseSelector';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { scanPriceTag, type ScanResult } from '@/lib/api';

type AppState = 'camera' | 'processing' | 'result' | 'error' | 'warehouse-select';

export default function Home() {
  const [state, setState] = useState<AppState>('camera');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const scanResult = await scanPriceTag(imageBlob, warehouseId);
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
    setState('camera');
  };

  const handleChangeWarehouse = () => {
    setState('warehouse-select');
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
  if (state === 'result' && result) {
    return (
      <main className="min-h-screen bg-gray-900">
        <ResultCard result={result} onDismiss={handleReset} />
      </main>
    );
  }

  return (
    <main className="h-screen w-screen relative overflow-hidden">
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
    </main>
  );
}
