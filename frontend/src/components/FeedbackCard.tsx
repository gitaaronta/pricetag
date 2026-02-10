'use client';

import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Check, X, Upload } from 'lucide-react';
import {
  FEEDBACK_REASONS,
  CORRECTABLE_REASONS,
  APP_VERSION,
  PIPELINE_VERSION,
  type FeedbackReason,
  type FeedbackCorrections,
  type OcrSnapshot,
} from '@/lib/feedbackTypes';
import { saveFeedback, saveArtifact } from '@/lib/feedbackCache';

interface FeedbackCardProps {
  observationId: string;
  warehouseId: number;
  // OCR snapshots for learning
  clientOcrSnapshot?: OcrSnapshot | null;
  serverOcrSnapshot?: OcrSnapshot | null;
  // The captured image blob (for artifact upload if opted in)
  capturedImageBlob?: Blob | null;
  capturedImageDimensions?: { width: number; height: number } | null;
  // Whether user already submitted feedback for this observation
  feedbackSubmitted?: boolean;
  // Callback when feedback is submitted
  onFeedbackSubmitted?: (isPositive: boolean) => void;
}

type FeedbackStep = 'initial' | 'reasons' | 'corrections' | 'submitted';

export function FeedbackCard({
  observationId,
  warehouseId,
  clientOcrSnapshot,
  serverOcrSnapshot,
  capturedImageBlob,
  capturedImageDimensions,
  feedbackSubmitted: initialFeedbackSubmitted,
  onFeedbackSubmitted,
}: FeedbackCardProps) {
  const [step, setStep] = useState<FeedbackStep>(initialFeedbackSubmitted ? 'submitted' : 'initial');
  const [isPositive, setIsPositive] = useState<boolean | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<FeedbackReason[]>([]);
  const [otherText, setOtherText] = useState('');
  const [corrections, setCorrections] = useState<FeedbackCorrections>({});
  const [uploadConsent, setUploadConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if any correctable reason is selected
  const showCorrections = selectedReasons.some((r) => CORRECTABLE_REASONS.includes(r));

  // Handle thumbs up
  const handleThumbsUp = useCallback(async () => {
    setIsPositive(true);
    setIsSubmitting(true);

    try {
      await saveFeedback({
        observationId,
        isPositive: true,
        reasons: [],
        corrections: null,
        otherText: null,
        clientOcrSnapshot,
        serverOcrSnapshot,
        artifactConsent: false,
        warehouseId,
        appVersion: APP_VERSION,
        pipelineVersion: PIPELINE_VERSION,
      });

      setStep('submitted');
      onFeedbackSubmitted?.(true);
    } catch (error) {
      console.error('Failed to save feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [observationId, warehouseId, clientOcrSnapshot, serverOcrSnapshot, onFeedbackSubmitted]);

  // Handle thumbs down - show reasons
  const handleThumbsDown = useCallback(() => {
    setIsPositive(false);
    setStep('reasons');
  }, []);

  // Toggle reason selection
  const toggleReason = useCallback((reason: FeedbackReason) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  }, []);

  // Submit negative feedback with reasons
  const handleSubmitNegative = useCallback(async () => {
    if (selectedReasons.length === 0) return;

    setIsSubmitting(true);

    try {
      // Save feedback
      const feedback = await saveFeedback({
        observationId,
        isPositive: false,
        reasons: selectedReasons,
        corrections: showCorrections ? corrections : null,
        otherText: selectedReasons.includes('other') ? otherText : null,
        clientOcrSnapshot,
        serverOcrSnapshot,
        artifactConsent: uploadConsent,
        warehouseId,
        appVersion: APP_VERSION,
        pipelineVersion: PIPELINE_VERSION,
      });

      // Save artifact if consent given and image available
      if (uploadConsent && capturedImageBlob && capturedImageDimensions) {
        await saveArtifact({
          feedbackId: feedback.id,
          observationId,
          blob: capturedImageBlob,
          width: capturedImageDimensions.width,
          height: capturedImageDimensions.height,
          cropType: 'tag_roi', // Assume it's already cropped
        });
      }

      setStep('submitted');
      onFeedbackSubmitted?.(false);
    } catch (error) {
      console.error('Failed to save feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    observationId,
    warehouseId,
    selectedReasons,
    corrections,
    otherText,
    uploadConsent,
    capturedImageBlob,
    capturedImageDimensions,
    clientOcrSnapshot,
    serverOcrSnapshot,
    showCorrections,
    onFeedbackSubmitted,
  ]);

  // Already submitted
  if (step === 'submitted') {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-green-400">
          <Check size={20} />
          <span className="text-sm">Thanks for your feedback!</span>
        </div>
      </div>
    );
  }

  // Initial thumbs up/down
  if (step === 'initial') {
    return (
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-gray-300 text-sm text-center mb-3">Was this scan accurate?</p>
        <div className="flex justify-center gap-4">
          <button
            onClick={handleThumbsUp}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-green-600/20 text-green-400 rounded-xl active:bg-green-600/30 disabled:opacity-50"
          >
            <ThumbsUp size={24} />
            <span className="font-medium">Yes</span>
          </button>
          <button
            onClick={handleThumbsDown}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 bg-red-600/20 text-red-400 rounded-xl active:bg-red-600/30 disabled:opacity-50"
          >
            <ThumbsDown size={24} />
            <span className="font-medium">No</span>
          </button>
        </div>
      </div>
    );
  }

  // Reasons selection
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-300 text-sm">What went wrong?</p>
        <button
          onClick={() => setStep('initial')}
          className="text-gray-500 p-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* Reason chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FEEDBACK_REASONS.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => toggleReason(code)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              selectedReasons.includes(code)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 active:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Other text input */}
      {selectedReasons.includes('other') && (
        <div className="mb-4">
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Please describe the issue..."
            className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={200}
          />
        </div>
      )}

      {/* Corrections section (only if correctable reasons selected) */}
      {showCorrections && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded-lg space-y-3">
          <p className="text-gray-400 text-xs">Optional: Provide corrections</p>

          {selectedReasons.includes('wrong_price') && (
            <div>
              <label className="text-gray-400 text-xs block mb-1">Correct price</label>
              <input
                type="number"
                step="0.01"
                value={corrections.correctedPrice || ''}
                onChange={(e) =>
                  setCorrections((prev) => ({
                    ...prev,
                    correctedPrice: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
                placeholder="e.g., 12.99"
                className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {selectedReasons.includes('wrong_item_number') && (
            <div>
              <label className="text-gray-400 text-xs block mb-1">Correct item #</label>
              <input
                type="text"
                value={corrections.correctedItemNumber || ''}
                onChange={(e) =>
                  setCorrections((prev) => ({
                    ...prev,
                    correctedItemNumber: e.target.value || undefined,
                  }))
                }
                placeholder="e.g., 1234567"
                className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {selectedReasons.includes('missed_asterisk') && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasAsterisk"
                checked={corrections.correctedHasAsterisk || false}
                onChange={(e) =>
                  setCorrections((prev) => ({
                    ...prev,
                    correctedHasAsterisk: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="hasAsterisk" className="text-gray-300 text-sm">
                Tag has asterisk (*)
              </label>
            </div>
          )}
        </div>
      )}

      {/* Upload consent toggle */}
      {capturedImageBlob && (
        <div className="mb-4 flex items-start gap-2">
          <input
            type="checkbox"
            id="uploadConsent"
            checked={uploadConsent}
            onChange={(e) => setUploadConsent(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="uploadConsent" className="text-gray-400 text-xs">
            <span className="flex items-center gap-1">
              <Upload size={12} />
              Help improve scanning by uploading the tag image
            </span>
            <span className="text-gray-500 block mt-0.5">
              Only the cropped tag is uploaded, not the full shelf photo
            </span>
          </label>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmitNegative}
        disabled={selectedReasons.length === 0 || isSubmitting}
        className={`w-full py-3 rounded-xl font-medium transition-colors ${
          selectedReasons.length === 0 || isSubmitting
            ? 'bg-gray-700 text-gray-500'
            : 'bg-blue-600 text-white active:bg-blue-700'
        }`}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
}
