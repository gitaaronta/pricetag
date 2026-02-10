/**
 * Feedback Cache - IndexedDB CRUD operations for feedback and artifacts
 */

import { getDB } from './db';
import { sha256Blob, generateUUID } from './cryptoUtils';
import type {
  ScanFeedback,
  ScanArtifact,
  FeedbackReason,
  FeedbackCorrections,
  OcrSnapshot,
  APP_VERSION,
  PIPELINE_VERSION,
} from './feedbackTypes';

/**
 * Create and save a new feedback record
 */
export async function saveFeedback(params: {
  observationId: string;
  isPositive: boolean;
  reasons?: FeedbackReason[];
  corrections?: FeedbackCorrections | null;
  otherText?: string | null;
  clientOcrSnapshot?: OcrSnapshot | null;
  serverOcrSnapshot?: OcrSnapshot | null;
  artifactId?: string | null;
  artifactConsent?: boolean;
  warehouseId: number;
  appVersion: string;
  pipelineVersion: string;
}): Promise<ScanFeedback> {
  const db = await getDB();

  const feedback: ScanFeedback = {
    id: generateUUID(),
    observationId: params.observationId,
    isPositive: params.isPositive,
    reasons: params.reasons || [],
    corrections: params.corrections || null,
    otherText: params.otherText || null,
    clientOcrSnapshot: params.clientOcrSnapshot || null,
    serverOcrSnapshot: params.serverOcrSnapshot || null,
    artifactId: params.artifactId || null,
    artifactConsent: params.artifactConsent || false,
    appVersion: params.appVersion,
    pipelineVersion: params.pipelineVersion,
    warehouseId: params.warehouseId,
    createdAt: new Date().toISOString(),
    synced: false,
    serverFeedbackId: null,
  };

  await db.put('scanFeedback', feedback);
  return feedback;
}

/**
 * Save an image artifact (cropped tag image)
 */
export async function saveArtifact(params: {
  feedbackId: string;
  observationId: string;
  blob: Blob;
  width: number;
  height: number;
  cropType: 'tag_roi' | 'full_capture';
}): Promise<ScanArtifact> {
  const db = await getDB();

  // Compute SHA256 for deduplication
  const sha256 = await sha256Blob(params.blob);

  // Check for duplicate by hash
  const existing = await db.getFromIndex('scanArtifacts', 'by-sha256', sha256);
  if (existing) {
    console.log('[FeedbackCache] Duplicate artifact found, reusing:', sha256.slice(0, 16));
    // Update the feedback to point to existing artifact
    const feedback = await db.get('scanFeedback', params.feedbackId);
    if (feedback) {
      feedback.artifactId = existing.id;
      await db.put('scanFeedback', feedback);
    }
    return existing;
  }

  const artifact: ScanArtifact = {
    id: generateUUID(),
    feedbackId: params.feedbackId,
    observationId: params.observationId,
    blob: params.blob,
    sha256,
    mimeType: params.blob.type || 'image/jpeg',
    width: params.width,
    height: params.height,
    bytes: params.blob.size,
    cropType: params.cropType,
    createdAt: new Date().toISOString(),
    synced: false,
    serverArtifactId: null,
  };

  await db.put('scanArtifacts', artifact);

  // Update feedback with artifact reference
  const feedback = await db.get('scanFeedback', params.feedbackId);
  if (feedback) {
    feedback.artifactId = artifact.id;
    await db.put('scanFeedback', feedback);
  }

  return artifact;
}

/**
 * Get feedback by ID
 */
export async function getFeedback(id: string): Promise<ScanFeedback | undefined> {
  const db = await getDB();
  return db.get('scanFeedback', id);
}

/**
 * Get feedback for an observation
 */
export async function getFeedbackForObservation(
  observationId: string
): Promise<ScanFeedback | undefined> {
  const db = await getDB();
  return db.getFromIndex('scanFeedback', 'by-observation', observationId);
}

/**
 * Get artifact by ID
 */
export async function getArtifact(id: string): Promise<ScanArtifact | undefined> {
  const db = await getDB();
  return db.get('scanArtifacts', id);
}

/**
 * Get all unsynced feedback
 */
export async function getUnsyncedFeedback(): Promise<ScanFeedback[]> {
  const db = await getDB();
  return db.getAllFromIndex('scanFeedback', 'by-synced', 0 as unknown as number);
}

/**
 * Get all unsynced artifacts
 */
export async function getUnsyncedArtifacts(): Promise<ScanArtifact[]> {
  const db = await getDB();
  return db.getAllFromIndex('scanArtifacts', 'by-synced', 0 as unknown as number);
}

/**
 * Mark feedback as synced
 */
export async function markFeedbackSynced(
  id: string,
  serverFeedbackId: string
): Promise<void> {
  const db = await getDB();
  const feedback = await db.get('scanFeedback', id);
  if (feedback) {
    feedback.synced = true;
    feedback.serverFeedbackId = serverFeedbackId;
    await db.put('scanFeedback', feedback);
  }
}

/**
 * Mark artifact as synced
 */
export async function markArtifactSynced(
  id: string,
  serverArtifactId: string
): Promise<void> {
  const db = await getDB();
  const artifact = await db.get('scanArtifacts', id);
  if (artifact) {
    artifact.synced = true;
    artifact.serverArtifactId = serverArtifactId;
    await db.put('scanArtifacts', artifact);
  }
}

/**
 * Get unsynced feedback count
 */
export async function getUnsyncedFeedbackCount(): Promise<number> {
  const unsynced = await getUnsyncedFeedback();
  return unsynced.length;
}

/**
 * Get unsynced artifacts count
 */
export async function getUnsyncedArtifactCount(): Promise<number> {
  const unsynced = await getUnsyncedArtifacts();
  return unsynced.length;
}

/**
 * Delete old feedback (keep last N days)
 */
export async function pruneOldFeedback(keepDays: number = 90): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);

  const all = await db.getAll('scanFeedback');
  const toDelete = all.filter(
    (fb) => new Date(fb.createdAt) < cutoff && fb.synced
  );

  const tx = db.transaction('scanFeedback', 'readwrite');
  await Promise.all(toDelete.map((fb) => tx.store.delete(fb.id)));
  await tx.done;

  return toDelete.length;
}

/**
 * Delete old artifacts (keep last N days)
 */
export async function pruneOldArtifacts(keepDays: number = 30): Promise<number> {
  const db = await getDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);

  const all = await db.getAll('scanArtifacts');
  const toDelete = all.filter(
    (a) => new Date(a.createdAt) < cutoff && a.synced
  );

  const tx = db.transaction('scanArtifacts', 'readwrite');
  await Promise.all(toDelete.map((a) => tx.store.delete(a.id)));
  await tx.done;

  return toDelete.length;
}

/**
 * Get recent feedback (for display/debugging)
 */
export async function getRecentFeedback(limit: number = 20): Promise<ScanFeedback[]> {
  const db = await getDB();
  const all = await db.getAll('scanFeedback');
  return all
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
