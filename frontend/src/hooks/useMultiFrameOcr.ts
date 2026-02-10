/**
 * Multi-frame OCR with voting
 *
 * Collects OCR results from multiple frames and uses consensus voting
 * to determine the most likely correct values for item number and price.
 */

import { useState, useRef, useCallback } from 'react';
import { extractPriceTag, type OCRExtraction } from '@/lib/clientOcr';

export interface MultiFrameResult {
  itemNumber: string | null;
  itemNumberConfidence: number;
  price: number | null;
  priceConfidence: number;
  priceEnding: string | null;
  hasAsterisk: boolean;
  description: string | null;
  frameCount: number;
  overallConfidence: number;
}

interface FrameResult {
  extraction: OCRExtraction;
  timestamp: number;
}

const MAX_FRAMES = 5;
const FRAME_TIMEOUT = 3000; // ms, discard frames older than this
const MIN_CONSENSUS = 0.6; // 60% agreement needed

export function useMultiFrameOcr() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [hasResult, setHasResult] = useState(false);

  const framesRef = useRef<FrameResult[]>([]);
  const resultsRef = useRef<MultiFrameResult | null>(null);

  /**
   * Add a frame for OCR processing
   */
  const addFrame = useCallback(async (imageBlob: Blob): Promise<boolean> => {
    setIsProcessing(true);

    try {
      // Run OCR on this frame
      const extraction = await extractPriceTag(imageBlob);

      // Only keep successful extractions
      if (!extraction.success) {
        setIsProcessing(false);
        return false;
      }

      // Add to frame buffer
      const now = Date.now();
      framesRef.current.push({
        extraction,
        timestamp: now,
      });

      // Remove old frames
      framesRef.current = framesRef.current.filter(
        (f) => now - f.timestamp < FRAME_TIMEOUT
      );

      // Keep max frames
      if (framesRef.current.length > MAX_FRAMES) {
        framesRef.current = framesRef.current.slice(-MAX_FRAMES);
      }

      setFrameCount(framesRef.current.length);

      // Calculate consensus result
      const result = calculateConsensus(framesRef.current);
      resultsRef.current = result;

      // Check if we have a confident result
      const hasConfidentResult =
        result.itemNumberConfidence >= MIN_CONSENSUS ||
        result.priceConfidence >= MIN_CONSENSUS;

      setHasResult(hasConfidentResult);
      setIsProcessing(false);

      return hasConfidentResult;
    } catch (error) {
      console.error('[MultiFrameOCR] Error:', error);
      setIsProcessing(false);
      return false;
    }
  }, []);

  /**
   * Get the current consensus result
   */
  const getResult = useCallback((): MultiFrameResult | null => {
    return resultsRef.current;
  }, []);

  /**
   * Reset all frames and results
   */
  const reset = useCallback(() => {
    framesRef.current = [];
    resultsRef.current = null;
    setFrameCount(0);
    setHasResult(false);
    setIsProcessing(false);
  }, []);

  /**
   * Check if enough frames have been collected
   */
  const hasEnoughFrames = useCallback((): boolean => {
    return framesRef.current.length >= 2;
  }, []);

  return {
    addFrame,
    getResult,
    reset,
    hasEnoughFrames,
    isProcessing,
    frameCount,
    hasResult,
  };
}

/**
 * Calculate consensus from multiple frame results
 */
function calculateConsensus(frames: FrameResult[]): MultiFrameResult {
  if (frames.length === 0) {
    return {
      itemNumber: null,
      itemNumberConfidence: 0,
      price: null,
      priceConfidence: 0,
      priceEnding: null,
      hasAsterisk: false,
      description: null,
      frameCount: 0,
      overallConfidence: 0,
    };
  }

  // Vote on item number
  const itemNumberVotes = new Map<string, number>();
  for (const frame of frames) {
    if (frame.extraction.itemNumber) {
      const current = itemNumberVotes.get(frame.extraction.itemNumber) || 0;
      // Weight by OCR confidence
      itemNumberVotes.set(
        frame.extraction.itemNumber,
        current + frame.extraction.confidence
      );
    }
  }

  let bestItemNumber: string | null = null;
  let bestItemNumberScore = 0;
  itemNumberVotes.forEach((score, itemNumber) => {
    if (score > bestItemNumberScore) {
      bestItemNumberScore = score;
      bestItemNumber = itemNumber;
    }
  });

  // Vote on price (group by cents to handle small variations)
  const priceVotes = new Map<string, { price: number; weight: number }>();
  for (const frame of frames) {
    if (frame.extraction.price !== null) {
      // Round to 2 decimal places for grouping
      const priceKey = frame.extraction.price.toFixed(2);
      const current = priceVotes.get(priceKey);
      if (current) {
        current.weight += frame.extraction.confidence;
      } else {
        priceVotes.set(priceKey, {
          price: frame.extraction.price,
          weight: frame.extraction.confidence,
        });
      }
    }
  }

  let bestPrice: number | null = null;
  let bestPriceScore = 0;
  priceVotes.forEach((data) => {
    if (data.weight > bestPriceScore) {
      bestPriceScore = data.weight;
      bestPrice = data.price;
    }
  });

  // Calculate confidence as percentage of frames agreeing
  const totalConfidence = frames.reduce((sum, f) => sum + f.extraction.confidence, 0);
  const itemNumberConfidence = totalConfidence > 0 ? bestItemNumberScore / totalConfidence : 0;
  const priceConfidence = totalConfidence > 0 ? bestPriceScore / totalConfidence : 0;

  // Get price ending from best price match
  let priceEnding: string | null = null;
  if (bestPrice !== null) {
    const cents = Math.round((bestPrice % 1) * 100);
    priceEnding = `.${cents.toString().padStart(2, '0')}`;
  }

  // Vote on asterisk (majority wins)
  let asteriskCount = 0;
  for (const frame of frames) {
    if (frame.extraction.hasAsterisk) asteriskCount++;
  }
  const hasAsterisk = asteriskCount > frames.length / 2;

  // Get most common description (simple mode)
  const descriptionVotes = new Map<string, number>();
  for (const frame of frames) {
    if (frame.extraction.description) {
      const current = descriptionVotes.get(frame.extraction.description) || 0;
      descriptionVotes.set(frame.extraction.description, current + 1);
    }
  }

  let bestDescription: string | null = null;
  let bestDescriptionCount = 0;
  descriptionVotes.forEach((count, desc) => {
    if (count > bestDescriptionCount) {
      bestDescriptionCount = count;
      bestDescription = desc;
    }
  });

  // Overall confidence combines both
  const overallConfidence = (itemNumberConfidence + priceConfidence) / 2;

  return {
    itemNumber: bestItemNumber,
    itemNumberConfidence,
    price: bestPrice,
    priceConfidence,
    priceEnding,
    hasAsterisk,
    description: bestDescription,
    frameCount: frames.length,
    overallConfidence,
  };
}

/**
 * Helper to extract OCR result from blob with regional focus
 * This runs OCR on specific regions of the image for better accuracy
 */
export async function extractWithRegionalFocus(
  imageBlob: Blob
): Promise<OCRExtraction> {
  // For now, use full image OCR
  // Future: split image into regions (price area, item number area)
  // and run targeted OCR on each region
  return extractPriceTag(imageBlob);
}
