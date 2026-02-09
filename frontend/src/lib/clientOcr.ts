/**
 * Client-side OCR using Tesseract.js
 * Extracts price tag data matching server-side patterns
 */

import Tesseract from 'tesseract.js';
import { preprocessImage } from './imagePreprocess';

export interface OCRExtraction {
  success: boolean;
  confidence: number;
  itemNumber: string | null;
  price: number | null;
  priceEnding: string | null;
  unitPrice: number | null;
  unitMeasure: string | null;
  description: string | null;
  hasAsterisk: boolean;
  error?: string;
}

// Regex patterns matching server-side OCR
const ITEM_NUMBER_PATTERN = /\b(\d{6,8})\b/g;
const PRICE_PATTERN = /\$?\s*(\d{1,4})[.,](\d{2})\b/g;
const UNIT_PRICE_PATTERN = /(\d+[.,]\d{2,4})\s*\/\s*(oz|lb|ct|ea|qt|gal|ml|L|kg|g)/gi;
const ASTERISK_PATTERN = /\*/;

// Tesseract worker (singleton for reuse)
let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Progress callback could be added here
        }
      },
    });
  }
  return workerPromise;
}

export async function extractPriceTag(
  imageBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<OCRExtraction> {
  try {
    // Preprocess image
    onProgress?.(0.1);
    const processedBlob = await preprocessImage(imageBlob);

    // Get or create worker
    onProgress?.(0.2);
    const worker = await getWorker();

    // Configure for price tag recognition
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.$*ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/., ',
    });

    // Run OCR
    onProgress?.(0.3);
    const { data } = await worker.recognize(processedBlob);
    onProgress?.(0.9);

    // Parse results
    const text = data.text;
    const confidence = data.confidence / 100; // Convert to 0-1

    // Extract fields
    const itemNumber = extractItemNumber(text);
    const { price, priceEnding } = extractPrice(text);
    const { unitPrice, unitMeasure } = extractUnitPrice(text);
    const hasAsterisk = ASTERISK_PATTERN.test(text);
    const description = extractDescription(text, itemNumber);

    // Determine success (must have item number and price)
    const success = itemNumber !== null && price !== null;

    // Adjust confidence based on what we found
    let adjustedConfidence = confidence;
    if (!itemNumber) adjustedConfidence *= 0.5;
    if (!price) adjustedConfidence *= 0.3;

    onProgress?.(1.0);

    return {
      success,
      confidence: Math.round(adjustedConfidence * 100) / 100,
      itemNumber,
      price,
      priceEnding,
      unitPrice,
      unitMeasure,
      description,
      hasAsterisk,
    };
  } catch (error) {
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
      error: error instanceof Error ? error.message : 'OCR failed',
    };
  }
}

function extractItemNumber(text: string): string | null {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state and collect all matches
  ITEM_NUMBER_PATTERN.lastIndex = 0;
  while ((match = ITEM_NUMBER_PATTERN.exec(text)) !== null) {
    matches.push(match);
  }

  // Prefer 7-digit numbers (standard Costco item numbers)
  for (const m of matches) {
    if (m[1].length === 7) {
      return m[1];
    }
  }

  // Fall back to first match
  return matches[0]?.[1] || null;
}

function extractPrice(text: string): { price: number | null; priceEnding: string | null } {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state and collect all matches
  PRICE_PATTERN.lastIndex = 0;
  while ((match = PRICE_PATTERN.exec(text)) !== null) {
    matches.push(match);
  }

  if (matches.length === 0) {
    return { price: null, priceEnding: null };
  }

  // Take the match with largest dollar amount (likely main price)
  const bestMatch = matches.reduce((best, current) => {
    const currentDollars = parseInt(current[1], 10);
    const bestDollars = parseInt(best[1], 10);
    return currentDollars > bestDollars ? current : best;
  });

  const dollars = bestMatch[1];
  const cents = bestMatch[2];
  const price = parseFloat(`${dollars}.${cents}`);
  const priceEnding = `.${cents}`;

  return { price, priceEnding };
}

function extractUnitPrice(text: string): { unitPrice: number | null; unitMeasure: string | null } {
  const match = text.match(UNIT_PRICE_PATTERN);

  if (!match) {
    return { unitPrice: null, unitMeasure: null };
  }

  const priceStr = match[1].replace(',', '.');
  const unitPrice = parseFloat(priceStr);
  const unitMeasure = match[2].toLowerCase();

  return { unitPrice, unitMeasure };
}

function extractDescription(text: string, itemNumber: string | null): string | null {
  // Get words with 3+ characters
  const words = text.match(/[A-Za-z]{3,}/g);

  if (!words) return null;

  // Filter out common non-description words and noise
  const skipWords = new Set([
    'oz', 'lb', 'ct', 'ea', 'qt', 'gal', 'ml', 'kg', 'per', 'unit',
    'price', 'item', 'each', 'total', 'sale', 'reg', 'save'
  ]);

  const descWords = words.filter(w => !skipWords.has(w.toLowerCase()) && w.length >= 3);

  // Check if it's mostly garbage (short average word length)
  if (descWords.length > 0) {
    const avgLen = descWords.reduce((sum, w) => sum + w.length, 0) / descWords.length;
    if (avgLen < 4) return null;
  }

  // Take up to 6 words
  const result = descWords.slice(0, 6).join(' ');

  // Skip if too short
  if (result.length < 8) return null;

  return result;
}

/**
 * Terminate the worker (call when done with OCR)
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
