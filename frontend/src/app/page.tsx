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
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { SyncStatus } from '@/components/SyncStatus';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useIntent } from '@/hooks/useIntent';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useClientOcr } from '@/hooks/useClientOcr';
import { useLocalDb } from '@/hooks/useLocalDb';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import { scanPriceTag, type ScanResult } from '@/lib/api';
import { buildOfflineResult, makeDecision } from '@/lib/decisionEngine';

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
  const { isOnline, wasOffline, clearWasOffline } = useOnlineStatus();
  const { runOcr, reset: resetOcr } = useClientOcr();
  const { saveResult, getCachedHistory, updateCacheFromServer } = useLocalDb();
  const { pendingCount, syncStatus, syncNow, refreshPendingCount } = useBackgroundSync();

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

    // Offline mode: use client-side OCR
    if (!isOnline) {
      try {
        const ocrResult = await runOcr(imageBlob);

        if (ocrResult.success && ocrResult.itemNumber && ocrResult.price !== null) {
          // Try to get cached history for better decision
          const cachedHistory = await getCachedHistory(warehouseId, ocrResult.itemNumber);

          // Build result with cached history if available
          let offlineResult = buildOfflineResult(
            `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            ocrResult.itemNumber,
            ocrResult.price,
            ocrResult.priceEnding,
            ocrResult.hasAsterisk,
            ocrResult.description,
            ocrResult.unitPrice,
            ocrResult.unitMeasure,
            ocrResult.confidence,
            intent
          ) as ScanResult;

          // Enhance with cached history if available
          if (cachedHistory) {
            const enhancedDecision = makeDecision(
              ocrResult.price,
              ocrResult.priceEnding,
              ocrResult.hasAsterisk,
              intent,
              cachedHistory,
              null // No scarcity data offline
            );
            offlineResult = {
              ...offlineResult,
              history: cachedHistory,
              decision: enhancedDecision.decision,
              decision_explanation: enhancedDecision.decisionExplanation,
              decision_rationale: enhancedDecision.decisionRationale,
              decision_factors: enhancedDecision.decisionFactors,
            };
          }

          // Save to local DB for later sync
          await saveResult(offlineResult, warehouseId, false);
          await refreshPendingCount();

          setResult(offlineResult);
          setState('result');
        } else {
          setError(ocrResult.error || 'Could not read price tag. Try better lighting or hold steady.');
          setState('error');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OCR failed';
        setError(message);
        setState('error');
      }
      return;
    }

    // Online mode: use server
    try {
      const scanResult = await scanPriceTag(imageBlob, warehouseId, undefined, intent);

      // Save to local DB and update price cache
      await saveResult(scanResult, warehouseId, true);
      await updateCacheFromServer(scanResult, warehouseId);

      setResult(scanResult);
      setState('result');
    } catch (err) {
      // If server fails while online, try client OCR as fallback
      try {
        const ocrResult = await runOcr(imageBlob);

        if (ocrResult.success && ocrResult.itemNumber && ocrResult.price !== null) {
          // Try to get cached history
          const cachedHistory = await getCachedHistory(warehouseId, ocrResult.itemNumber);

          let offlineResult = buildOfflineResult(
            `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            ocrResult.itemNumber,
            ocrResult.price,
            ocrResult.priceEnding,
            ocrResult.hasAsterisk,
            ocrResult.description,
            ocrResult.unitPrice,
            ocrResult.unitMeasure,
            ocrResult.confidence,
            intent
          ) as ScanResult;

          // Enhance with cached history if available
          if (cachedHistory) {
            const enhancedDecision = makeDecision(
              ocrResult.price,
              ocrResult.priceEnding,
              ocrResult.hasAsterisk,
              intent,
              cachedHistory,
              null
            );
            offlineResult = {
              ...offlineResult,
              history: cachedHistory,
              decision: enhancedDecision.decision,
              decision_explanation: enhancedDecision.decisionExplanation,
              decision_rationale: enhancedDecision.decisionRationale,
              decision_factors: enhancedDecision.decisionFactors,
            };
          }

          // Save as unsynced (server failed)
          await saveResult(offlineResult, warehouseId, false);
          await refreshPendingCount();

          setResult(offlineResult);
          setState('result');
          return;
        }
      } catch {
        // Fallback OCR also failed, show original error
      }

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
    resetOcr();
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
        {/* Offline indicator */}
        <OfflineIndicator
          isOnline={isOnline}
          wasOffline={wasOffline}
          onDismissReconnected={clearWasOffline}
          pendingCount={pendingCount}
        />

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
      {/* Offline indicator */}
      <OfflineIndicator
        isOnline={isOnline}
        wasOffline={wasOffline}
        onDismissReconnected={clearWasOffline}
      />

      {/* Top bar: sync status + settings */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <SyncStatus
          pendingCount={pendingCount}
          isOnline={isOnline}
          syncStatus={syncStatus}
          onSyncNow={syncNow}
        />
        <button
          onClick={() => setShowIntentToggle(true)}
          className="p-3 bg-black/50 rounded-full text-white active:bg-black/70"
          aria-label="Change intent"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Camera view */}
      <CameraCapture
        onCapture={handleCapture}
        disabled={state !== 'camera'}
        onChangeWarehouse={handleChangeWarehouse}
      />

      {/* Processing overlay */}
      {state === 'processing' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <LoadingSpinner message={isOnline ? "Reading price tag..." : "Reading offline..."} />
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
