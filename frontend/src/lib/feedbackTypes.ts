/**
 * Feedback Types - TypeScript definitions for the feedback loop system
 */

// Feedback reason codes
export type FeedbackReason =
  | 'wrong_price'
  | 'wrong_item_number'
  | 'missed_asterisk'
  | 'blurry'
  | 'bad_lighting'
  | 'cropped_wrong'
  | 'other';

export const FEEDBACK_REASONS: { code: FeedbackReason; label: string }[] = [
  { code: 'wrong_price', label: 'Wrong price' },
  { code: 'wrong_item_number', label: 'Wrong item #' },
  { code: 'missed_asterisk', label: 'Missed asterisk' },
  { code: 'blurry', label: 'Blurry' },
  { code: 'bad_lighting', label: 'Bad lighting' },
  { code: 'cropped_wrong', label: 'Tag not detected' },
  { code: 'other', label: 'Other' },
];

// Reasons that suggest user can provide corrections
export const CORRECTABLE_REASONS: FeedbackReason[] = [
  'wrong_price',
  'wrong_item_number',
  'missed_asterisk',
];

// User-provided corrections
export interface FeedbackCorrections {
  correctedPrice?: number;
  correctedItemNumber?: string;
  correctedHasAsterisk?: boolean;
}

// OCR snapshot for debugging/learning
export interface OcrSnapshot {
  itemNumber: string | null;
  price: number | null;
  priceEnding: string | null;
  hasAsterisk: boolean;
  confidence: number;
  description: string | null;
}

// Main feedback record stored in IndexedDB
export interface ScanFeedback {
  id: string; // UUID
  observationId: string; // Links to observation
  isPositive: boolean; // true = 👍, false = 👎
  reasons: FeedbackReason[]; // Empty if positive
  corrections: FeedbackCorrections | null;
  otherText: string | null; // Free text if 'other' reason

  // OCR snapshots for learning
  clientOcrSnapshot: OcrSnapshot | null;
  serverOcrSnapshot: OcrSnapshot | null;

  // Image artifact reference
  artifactId: string | null; // Links to scanArtifacts if uploaded
  artifactConsent: boolean; // User opted in to upload

  // Metadata
  appVersion: string;
  pipelineVersion: string;
  warehouseId: number;
  createdAt: string; // ISO timestamp
  synced: boolean;
  serverFeedbackId: string | null; // Returned from server after sync
}

// Image artifact stored in IndexedDB
export interface ScanArtifact {
  id: string; // UUID, same as artifactId in feedback
  feedbackId: string; // Links back to feedback
  observationId: string;
  blob: Blob; // The cropped tag image
  sha256: string; // For deduplication
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  cropType: 'tag_roi' | 'full_capture'; // How the image was obtained
  createdAt: string;
  synced: boolean;
  serverArtifactId: string | null;
}

// API request payloads
export interface FeedbackApiPayload {
  feedback_id: string;
  observation_id: string;
  is_positive: boolean;
  reasons: FeedbackReason[];
  corrections: {
    corrected_price?: number;
    corrected_item_number?: string;
    corrected_has_asterisk?: boolean;
  } | null;
  other_text: string | null;
  client_ocr_snapshot: {
    item_number: string | null;
    price: number | null;
    price_ending: string | null;
    has_asterisk: boolean;
    confidence: number;
    description: string | null;
  } | null;
  server_ocr_snapshot: {
    item_number: string | null;
    price: number | null;
    price_ending: string | null;
    has_asterisk: boolean;
    confidence: number;
    description: string | null;
  } | null;
  artifact_id: string | null;
  artifact_sha256: string | null;
  app_version: string;
  pipeline_version: string;
  warehouse_id: number;
  created_at: string;
}

export interface FeedbackApiResponse {
  feedback_id: string;
  server_feedback_id: string;
  accepted: boolean;
}

export interface ArtifactApiResponse {
  artifact_id: string;
  server_artifact_id: string;
  sha256_verified: boolean;
  storage_key: string;
}

// Version constants
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
export const PIPELINE_VERSION = '2.0.0'; // OCR + preprocessing version
