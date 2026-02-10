'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { SmartCamera } from '@/components/SmartCamera';
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
import { useMultiFrameOcr } from '@/hooks/useMultiFrameOcr';
import { scanPriceTag, type ScanResult } from '@/lib/api';
import { buildOfflineResult, makeDecision } from '@/lib/decisionEngine';
import type { FrameAnalysis } from '@/lib/frameAnalyzer';

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

  // V3: Multi-frame OCR for better accuracy
  const { addFrame, getResult: getMultiFrameResult, reset: resetMultiFrame } = useMultiFrameOcr();
  const [frameAnalysis, setFrameAnalysis] = useState<FrameAnalysis | null>(null);

  // Check for stored warehouse on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('pricetag_warehouse');
    if (stored) {
      setWarehouseId(parseInt(stored, 10));
    } else {
      setState('warehouse-select');
    }
  }, []);

  const handleCapture = async (imageBlob: Blob, analysis?: FrameAnalysis) => {
    if (!warehouseId) {
      setState('warehouse-select');
      return;
    }

    setState('processing');
    setError(null);

    // Store frame analysis for display
    if (analysis) {
      setFrameAnalysis(analysis);
    }

    // Log capture quality from smart camera
    if (analysis) {
      console.log('[Capture] Frame analysis:', {
        blurScore: analysis.blurScore,
        isSharp: analysis.isSharp,
        tagDetected: analysis.tagDetected,
        stability: analysis.stability,
      });
    }

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

    // Online mode: hybrid approach
    // Start both client OCR and server request in parallel
    // Show client result quickly, then update with server result

    const clientOcrPromise = runOcr(imageBlob).catch(() => null);
    const serverPromise = scanPriceTag(imageBlob, warehouseId, undefined, intent).catch((err) => {
      console.log('[Hybrid] Server failed:', err);
      return null;
    });

    // Wait for whichever finishes first with a valid result
    let hasShownResult = false;

    // Give client OCR a 2 second head start for quick feedback
    const clientResult = await Promise.race([
      clientOcrPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    // Show client result immediately if valid (as preview)
    if (clientResult && clientResult.success && clientResult.itemNumber && clientResult.price !== null) {
      const cachedHistory = await getCachedHistory(warehouseId, clientResult.itemNumber);

      let previewResult = buildOfflineResult(
        `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clientResult.itemNumber,
        clientResult.price,
        clientResult.priceEnding,
        clientResult.hasAsterisk,
        clientResult.description,
        clientResult.unitPrice,
        clientResult.unitMeasure,
        clientResult.confidence,
        intent
      ) as ScanResult;

      if (cachedHistory) {
        const enhancedDecision = makeDecision(
          clientResult.price,
          clientResult.priceEnding,
          clientResult.hasAsterisk,
          intent,
          cachedHistory,
          null
        );
        previewResult = {
          ...previewResult,
          history: cachedHistory,
          decision: enhancedDecision.decision,
          decision_explanation: enhancedDecision.decisionExplanation,
          decision_rationale: enhancedDecision.decisionRationale,
          decision_factors: enhancedDecision.decisionFactors,
        };
      }

      // Show preview with indicator
      setResult({ ...previewResult, _preview: true } as ScanResult);
      setState('result');
      hasShownResult = true;
    }

    // Wait for server result
    const serverResult = await serverPromise;

    if (serverResult) {
      // Server succeeded - use authoritative result
      await saveResult(serverResult, warehouseId, true);
      await updateCacheFromServer(serverResult, warehouseId);
      setResult(serverResult);
      setState('result');
    } else if (!hasShownResult) {
      // Server failed and no client preview - try client OCR fully
      const fullClientResult = await clientOcrPromise;

      if (fullClientResult && fullClientResult.success && fullClientResult.itemNumber && fullClientResult.price !== null) {
        const cachedHistory = await getCachedHistory(warehouseId, fullClientResult.itemNumber);

        let offlineResult = buildOfflineResult(
          `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          fullClientResult.itemNumber,
          fullClientResult.price,
          fullClientResult.priceEnding,
          fullClientResult.hasAsterisk,
          fullClientResult.description,
          fullClientResult.unitPrice,
          fullClientResult.unitMeasure,
          fullClientResult.confidence,
          intent
        ) as ScanResult;

        if (cachedHistory) {
          const enhancedDecision = makeDecision(
            fullClientResult.price,
            fullClientResult.priceEnding,
            fullClientResult.hasAsterisk,
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
      } else {
        setError('Could not read price tag. Try better lighting or hold steady.');
        setState('error');
      }
    } else {
      // Had client preview but server failed - save client result as unsynced
      if (result) {
        await saveResult(result, warehouseId, false);
        await refreshPendingCount();
      }
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
    setFrameAnalysis(null);
    resetOcr();
    resetMultiFrame();
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

  // V3: Burst capture handler - runs OCR on multiple frames and uses voting
  const handleBurstCapture = async (blobs: Blob[], analyses: FrameAnalysis[]) => {
    if (!warehouseId) {
      setState('warehouse-select');
      return;
    }

    setState('processing');
    setError(null);

    // Store best frame analysis
    if (analyses.length > 0) {
      const bestAnalysis = analyses.reduce((best, curr) =>
        curr.blurScore > best.blurScore ? curr : best
      );
      setFrameAnalysis(bestAnalysis);
    }

    console.log('[Burst] Processing', blobs.length, 'frames');

    try {
      // Run OCR on all frames and collect results
      const ocrResults = await Promise.all(
        blobs.map(blob => runOcr(blob).catch(() => null))
      );

      // Filter successful results
      const validResults = ocrResults.filter(r =>
        r && r.success && r.itemNumber && r.price !== null
      );

      console.log('[Burst] Valid OCR results:', validResults.length, 'of', blobs.length);

      if (validResults.length === 0) {
        // No valid results from any frame
        setError('Could not read price tag from any frame. Try holding steadier or better lighting.');
        setState('error');
        return;
      }

      // Vote on item number (most common)
      const itemNumberCounts = new Map<string, number>();
      validResults.forEach(r => {
        if (r && r.itemNumber) {
          const count = itemNumberCounts.get(r.itemNumber) || 0;
          itemNumberCounts.set(r.itemNumber, count + 1);
        }
      });

      let bestItemNumber = '';
      let maxItemCount = 0;
      itemNumberCounts.forEach((count, itemNumber) => {
        if (count > maxItemCount) {
          maxItemCount = count;
          bestItemNumber = itemNumber;
        }
      });

      // Vote on price (most common)
      const priceCounts = new Map<string, { price: number; count: number }>();
      validResults.forEach(r => {
        if (r && r.price !== null) {
          const key = r.price.toFixed(2);
          const existing = priceCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            priceCounts.set(key, { price: r.price, count: 1 });
          }
        }
      });

      let bestPrice = 0;
      let maxPriceCount = 0;
      priceCounts.forEach(({ price, count }) => {
        if (count > maxPriceCount) {
          maxPriceCount = count;
          bestPrice = price;
        }
      });

      // Get other fields from best result
      const bestResult = validResults.find(r =>
        r && r.itemNumber === bestItemNumber && r.price === bestPrice
      ) || validResults[0];

      if (!bestResult) {
        setError('Could not read price tag. Try again.');
        setState('error');
        return;
      }

      console.log('[Burst] Voted result:', {
        itemNumber: bestItemNumber,
        price: bestPrice,
        confidence: `${maxItemCount}/${validResults.length} frames agree on item, ${maxPriceCount}/${validResults.length} on price`
      });

      // Build result
      const cachedHistory = await getCachedHistory(warehouseId, bestItemNumber);

      let scanResult = buildOfflineResult(
        `burst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        bestItemNumber,
        bestPrice,
        bestResult.priceEnding,
        bestResult.hasAsterisk,
        bestResult.description,
        bestResult.unitPrice,
        bestResult.unitMeasure,
        bestResult.confidence,
        intent
      ) as ScanResult;

      // Enhance with cached history if available
      if (cachedHistory) {
        const enhancedDecision = makeDecision(
          bestPrice,
          bestResult.priceEnding,
          bestResult.hasAsterisk,
          intent,
          cachedHistory,
          null
        );
        scanResult = {
          ...scanResult,
          history: cachedHistory,
          decision: enhancedDecision.decision,
          decision_explanation: enhancedDecision.decisionExplanation,
          decision_rationale: enhancedDecision.decisionRationale,
          decision_factors: enhancedDecision.decisionFactors,
        };
      }

      // Save to local DB
      await saveResult(scanResult, warehouseId, isOnline);
      if (!isOnline) {
        await refreshPendingCount();
      }

      setResult(scanResult);
      setState('result');

    } catch (err) {
      console.error('[Burst] Error:', err);
      const message = err instanceof Error ? err.message : 'Burst capture failed';
      setError(message);
      setState('error');
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
    <main className="fixed inset-0 overflow-hidden">
      {/* Offline indicator - floating */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <OfflineIndicator
            isOnline={isOnline}
            wasOffline={wasOffline}
            onDismissReconnected={clearWasOffline}
          />
        </div>
      </div>

      {/* Sync status + settings - floating top right */}
      <div
        className="absolute right-3 z-30 flex items-center gap-2"
        style={{ top: 'max(60px, calc(env(safe-area-inset-top) + 48px))' }}
      >
        <SyncStatus
          pendingCount={pendingCount}
          isOnline={isOnline}
          syncStatus={syncStatus}
          onSyncNow={syncNow}
        />
        <button
          onClick={() => setShowIntentToggle(true)}
          className="p-2 bg-black/50 rounded-full text-white active:bg-black/70"
          aria-label="Change intent"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Smart Camera - full screen */}
      <SmartCamera
        onCapture={handleCapture}
        onBurstCapture={handleBurstCapture}
        disabled={state !== 'camera'}
        onChangeWarehouse={handleChangeWarehouse}
      />

      {/* Processing overlay */}
      {state === 'processing' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 gap-4">
          <LoadingSpinner message={isOnline ? "Reading price tag..." : "Reading offline..."} />
          {frameAnalysis && (
            <div className="text-white/60 text-sm text-center">
              <p>Blur: {Math.round(frameAnalysis.blurScore * 100)}%</p>
              {frameAnalysis.tagDetected && <p className="text-green-400">Tag detected</p>}
            </div>
          )}
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
