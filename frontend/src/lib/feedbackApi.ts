/**
 * Feedback API Client - HTTP endpoints for submitting feedback and artifacts
 */

import type {
  ScanFeedback,
  ScanArtifact,
  FeedbackApiPayload,
  FeedbackApiResponse,
  ArtifactApiResponse,
} from './feedbackTypes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://costco.avocadopeanut.com';

/**
 * Submit feedback to the server
 */
export async function submitFeedback(feedback: ScanFeedback): Promise<FeedbackApiResponse> {
  const payload: FeedbackApiPayload = {
    feedback_id: feedback.id,
    observation_id: feedback.observationId,
    is_positive: feedback.isPositive,
    reasons: feedback.reasons,
    corrections: feedback.corrections
      ? {
          corrected_price: feedback.corrections.correctedPrice,
          corrected_item_number: feedback.corrections.correctedItemNumber,
          corrected_has_asterisk: feedback.corrections.correctedHasAsterisk,
        }
      : null,
    other_text: feedback.otherText,
    client_ocr_snapshot: feedback.clientOcrSnapshot
      ? {
          item_number: feedback.clientOcrSnapshot.itemNumber,
          price: feedback.clientOcrSnapshot.price,
          price_ending: feedback.clientOcrSnapshot.priceEnding,
          has_asterisk: feedback.clientOcrSnapshot.hasAsterisk,
          confidence: feedback.clientOcrSnapshot.confidence,
          description: feedback.clientOcrSnapshot.description,
        }
      : null,
    server_ocr_snapshot: feedback.serverOcrSnapshot
      ? {
          item_number: feedback.serverOcrSnapshot.itemNumber,
          price: feedback.serverOcrSnapshot.price,
          price_ending: feedback.serverOcrSnapshot.priceEnding,
          has_asterisk: feedback.serverOcrSnapshot.hasAsterisk,
          confidence: feedback.serverOcrSnapshot.confidence,
          description: feedback.serverOcrSnapshot.description,
        }
      : null,
    artifact_id: feedback.artifactId,
    artifact_sha256: null, // Will be set by artifact upload
    app_version: feedback.appVersion,
    pipeline_version: feedback.pipelineVersion,
    warehouse_id: feedback.warehouseId,
    created_at: feedback.createdAt,
  };

  const response = await fetch(`${API_URL}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Feedback submission failed' }));
    throw new Error(error.detail?.message || error.message || 'Failed to submit feedback');
  }

  return response.json();
}

/**
 * Upload an artifact (cropped tag image) to the server
 */
export async function uploadArtifact(artifact: ScanArtifact): Promise<ArtifactApiResponse> {
  const formData = new FormData();
  formData.append('image', artifact.blob, `artifact_${artifact.id}.jpg`);
  formData.append('artifact_id', artifact.id);
  formData.append('feedback_id', artifact.feedbackId);
  formData.append('observation_id', artifact.observationId);
  formData.append('sha256', artifact.sha256);
  formData.append('mime_type', artifact.mimeType);
  formData.append('width', artifact.width.toString());
  formData.append('height', artifact.height.toString());
  formData.append('bytes', artifact.bytes.toString());
  formData.append('crop_type', artifact.cropType);
  formData.append('created_at', artifact.createdAt);

  const response = await fetch(`${API_URL}/api/v1/feedback/artifact`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Artifact upload failed' }));
    throw new Error(error.detail?.message || error.message || 'Failed to upload artifact');
  }

  return response.json();
}

/**
 * Check if an artifact already exists on server by SHA256
 * (Optional optimization to skip duplicate uploads)
 */
export async function checkArtifactExists(sha256: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/v1/feedback/artifact/check?sha256=${sha256}`);
    if (response.ok) {
      const data = await response.json();
      return data.exists;
    }
    return false;
  } catch {
    return false;
  }
}
