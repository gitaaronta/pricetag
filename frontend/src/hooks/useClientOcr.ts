'use client';

import { useState, useCallback } from 'react';
import { extractPriceTag, type OCRExtraction } from '@/lib/clientOcr';

export type OcrStatus = 'idle' | 'preprocessing' | 'recognizing' | 'done' | 'error';

export interface UseClientOcrResult {
  status: OcrStatus;
  progress: number;
  extraction: OCRExtraction | null;
  error: string | null;
  runOcr: (imageBlob: Blob) => Promise<OCRExtraction>;
  reset: () => void;
}

export function useClientOcr(): UseClientOcrResult {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [extraction, setExtraction] = useState<OCRExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOcr = useCallback(async (imageBlob: Blob): Promise<OCRExtraction> => {
    setStatus('preprocessing');
    setProgress(0);
    setError(null);

    try {
      const result = await extractPriceTag(imageBlob, (p) => {
        setProgress(p);
        if (p < 0.3) {
          setStatus('preprocessing');
        } else if (p < 0.9) {
          setStatus('recognizing');
        }
      });

      setExtraction(result);
      setStatus(result.success ? 'done' : 'error');

      if (!result.success) {
        setError(result.error || 'Could not read price tag');
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OCR failed';
      setError(message);
      setStatus('error');

      return {
        success: false,
        confidence: 0,
        itemNumber: null,
        price: null,
        priceEnding: null,
        unitPrice: null,
        unitMeasure: null,
        description: null,
        hasAsterisk: false,
        error: message,
      };
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setExtraction(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    extraction,
    error,
    runOcr,
    reset,
  };
}
