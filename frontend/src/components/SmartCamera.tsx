'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, Zap, ZapOff, Settings, RefreshCw, Layers } from 'lucide-react';
import {
  analyzeFrame,
  shouldAutoCapture,
  getCaptureQuality,
  resetStabilityTracking,
  extractTagROI,
  addToFrameBuffer,
  getBestFrame,
  getBestFrames,
  clearFrameBuffer,
  getFrameBufferSize,
  frameToBlob,
  type FrameAnalysis,
  type TagBounds,
  type BufferedFrame,
} from '@/lib/frameAnalyzer';

interface SmartCameraProps {
  onCapture: (imageBlob: Blob, analysis: FrameAnalysis) => void;
  onBurstCapture?: (blobs: Blob[], analyses: FrameAnalysis[]) => void;
  onChangeWarehouse: () => void;
  disabled?: boolean;
}

type CaptureMode = 'auto' | 'manual' | 'burst';

export function SmartCamera({ onCapture, onBurstCapture, onChangeWarehouse, disabled }: SmartCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('burst'); // Default to burst for shaky hands
  const [currentAnalysis, setCurrentAnalysis] = useState<FrameAnalysis | null>(null);
  const [autoCaptureReady, setAutoCaptureReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [bufferSize, setBufferSize] = useState(0);

  // Countdown state for auto-capture
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Frame analysis settings
  const ANALYSIS_INTERVAL = 100; // ms between frame analyses
  const AUTO_CAPTURE_DELAY = 800; // reduced from 1000ms for faster response
  const lastAnalysisRef = useRef<number>(0);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
        resetStabilityTracking();
        startFrameAnalysis();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      setError(message);
      console.error('[SmartCamera] Error:', err);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    setIsActive(false);
    setCurrentAnalysis(null);
    setCountdown(null);
  }, []);

  // Frame analysis loop
  const startFrameAnalysis = useCallback(() => {
    const analyze = () => {
      if (!videoRef.current || !analysisCanvasRef.current || !isActive) return;

      const now = Date.now();
      if (now - lastAnalysisRef.current >= ANALYSIS_INTERVAL) {
        lastAnalysisRef.current = now;

        const video = videoRef.current;
        const canvas = analysisCanvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx && video.videoWidth > 0) {
          // Resize canvas to match video (scaled down for performance)
          const scale = 0.5;
          canvas.width = video.videoWidth * scale;
          canvas.height = video.videoHeight * scale;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const analysis = analyzeFrame(canvas, ctx);
          setCurrentAnalysis(analysis);

          // Always buffer frames for burst/best-frame capture
          addToFrameBuffer(canvas, analysis);
          setBufferSize(getFrameBufferSize());

          // Check for auto-capture (only in auto mode)
          if (captureMode === 'auto' && !disabled && !isCapturing) {
            if (shouldAutoCapture(analysis)) {
              if (!autoCaptureReady) {
                setAutoCaptureReady(true);
                // Start countdown (reduced to 2 for faster capture)
                setCountdown(2);
                startCountdown(analysis);
              }
            } else {
              // Conditions no longer met, reset
              if (autoCaptureReady) {
                setAutoCaptureReady(false);
                setCountdown(null);
                if (countdownRef.current) {
                  clearTimeout(countdownRef.current);
                  countdownRef.current = null;
                }
              }
            }
          }

          // Burst mode: auto-capture when we have enough buffered frames with a tag
          if (captureMode === 'burst' && !disabled && !isCapturing) {
            const bufSize = getFrameBufferSize();
            if (bufSize >= 5 && analysis.tagDetected) {
              if (!autoCaptureReady) {
                setAutoCaptureReady(true);
                setCountdown(1); // Quick countdown
                startCountdown(analysis);
              }
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, [isActive, captureMode, disabled, isCapturing, autoCaptureReady]);

  // Start countdown for auto-capture
  const startCountdown = useCallback((analysis: FrameAnalysis) => {
    let count = 3;

    const tick = () => {
      count--;
      setCountdown(count);

      if (count <= 0) {
        // Capture!
        doCapture(analysis);
      } else {
        countdownRef.current = setTimeout(tick, AUTO_CAPTURE_DELAY / 3);
      }
    };

    countdownRef.current = setTimeout(tick, AUTO_CAPTURE_DELAY / 3);
  }, []);

  // Perform capture - uses best frame from buffer for shaky hands support
  const doCapture = useCallback(async (analysis?: FrameAnalysis) => {
    if (!videoRef.current || !canvasRef.current || isCapturing || disabled) return;

    setIsCapturing(true);
    setCountdown(null);

    try {
      // Burst mode: capture multiple frames for voting
      if (captureMode === 'burst' && onBurstCapture) {
        const bestFrames = getBestFrames(3);
        if (bestFrames.length > 0) {
          const blobs: Blob[] = [];
          const analyses: FrameAnalysis[] = [];

          for (const frame of bestFrames) {
            const blob = await frameToBlob(frame);
            blobs.push(blob);
            analyses.push(frame.analysis);
          }

          // Haptic feedback
          if ('vibrate' in navigator) {
            navigator.vibrate([50, 30, 50]); // Double vibrate for burst
          }

          onBurstCapture(blobs, analyses);
          clearFrameBuffer();
          return;
        }
      }

      // Single capture mode: use best frame from buffer
      const bestFrame = getBestFrame();
      let captureCanvas: HTMLCanvasElement;
      let finalAnalysis: FrameAnalysis;

      if (bestFrame && bestFrame.analysis.blurScore > (currentAnalysis?.blurScore || 0)) {
        // Use the best buffered frame (sharper than current)
        captureCanvas = bestFrame.canvas;
        finalAnalysis = bestFrame.analysis;
        console.log('[SmartCamera] Using best buffered frame, blur:', bestFrame.analysis.blurScore);
      } else {
        // Use current frame
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) throw new Error('Canvas context not available');

        // Full resolution capture
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        captureCanvas = canvas;
        finalAnalysis = analysis || (currentAnalysis ?? {
          blurScore: 0.5,
          isSharp: true,
          tagDetected: false,
          tagBounds: null,
          stability: 0.5,
          timestamp: Date.now(),
        });
      }

      // If tag detected, extract ROI
      if (finalAnalysis.tagBounds && finalAnalysis.tagBounds.confidence > 0.2) {
        // Scale bounds if needed
        const scale = captureCanvas.width / (analysisCanvasRef.current?.width || captureCanvas.width);
        const scaledBounds: TagBounds = {
          x: finalAnalysis.tagBounds.x * scale,
          y: finalAnalysis.tagBounds.y * scale,
          width: finalAnalysis.tagBounds.width * scale,
          height: finalAnalysis.tagBounds.height * scale,
          confidence: finalAnalysis.tagBounds.confidence,
        };

        captureCanvas = extractTagROI(captureCanvas, scaledBounds, 20);
      }

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        captureCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
          'image/jpeg',
          0.9
        );
      });

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      onCapture(blob, finalAnalysis);
      clearFrameBuffer();
    } catch (err) {
      console.error('[SmartCamera] Capture error:', err);
    } finally {
      setIsCapturing(false);
      setAutoCaptureReady(false);
      resetStabilityTracking();
    }
  }, [currentAnalysis, disabled, isCapturing, onCapture, onBurstCapture, captureMode]);

  // Manual capture
  const handleManualCapture = useCallback(() => {
    doCapture(currentAnalysis || undefined);
  }, [currentAnalysis, doCapture]);

  // Toggle capture mode (cycles: burst -> auto -> manual)
  const toggleCaptureMode = useCallback(() => {
    setCaptureMode((prev) => {
      if (prev === 'burst') return 'auto';
      if (prev === 'auto') return 'manual';
      return 'burst';
    });
    setAutoCaptureReady(false);
    setCountdown(null);
    clearFrameBuffer();
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Restart analysis when capture mode changes
  useEffect(() => {
    if (isActive) {
      resetStabilityTracking();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      startFrameAnalysis();
    }
  }, [captureMode, isActive, startFrameAnalysis]);

  // Quality indicator
  const quality = currentAnalysis ? getCaptureQuality(currentAnalysis) : 'poor';
  const qualityColors = {
    poor: 'bg-red-500',
    fair: 'bg-yellow-500',
    good: 'bg-green-500',
    excellent: 'bg-green-400',
  };

  // Blur indicator text
  const getBlurText = () => {
    if (!currentAnalysis) return 'Initializing...';
    if (currentAnalysis.blurScore < 0.2) return 'Too blurry - hold steady';
    if (currentAnalysis.blurScore < 0.35) return 'Hold steadier...';
    if (currentAnalysis.blurScore < 0.5) return 'Good - hold still';
    return 'Sharp!';
  };

  return (
    <div className="relative h-full w-full bg-black">
      {/* Hidden canvases for processing */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={analysisCanvasRef} className="hidden" />

      {/* Video preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
      />

      {/* Tag detection overlay */}
      {currentAnalysis?.tagBounds && showGuide && (
        <div
          className="absolute border-2 border-green-400 rounded-lg pointer-events-none transition-all duration-100"
          style={{
            left: `${(currentAnalysis.tagBounds.x / (analysisCanvasRef.current?.width || 1)) * 100}%`,
            top: `${(currentAnalysis.tagBounds.y / (analysisCanvasRef.current?.height || 1)) * 100}%`,
            width: `${(currentAnalysis.tagBounds.width / (analysisCanvasRef.current?.width || 1)) * 100}%`,
            height: `${(currentAnalysis.tagBounds.height / (analysisCanvasRef.current?.height || 1)) * 100}%`,
            boxShadow: quality === 'excellent' ? '0 0 20px rgba(74, 222, 128, 0.5)' : 'none',
          }}
        >
          {quality === 'excellent' && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded">
              Tag detected
            </div>
          )}
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="text-8xl font-bold text-white animate-pulse">{countdown}</div>
        </div>
      )}

      {/* Guide overlay - center frame guide */}
      {showGuide && !currentAnalysis?.tagDetected && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3/4 h-1/3 border-2 border-dashed border-white/50 rounded-lg flex items-center justify-center">
            <span className="text-white/70 text-sm bg-black/30 px-3 py-1 rounded">
              Center price tag here
            </span>
          </div>
        </div>
      )}

      {/* Top status bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
        {/* Quality indicator */}
        <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-2">
          <div className={`w-2 h-2 rounded-full ${qualityColors[quality]}`} />
          <span className="text-white text-sm">{getBlurText()}</span>
        </div>

        {/* Mode toggle */}
        <button
          onClick={toggleCaptureMode}
          className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-2 text-white"
        >
          {captureMode === 'burst' ? (
            <>
              <Layers size={16} className="text-blue-400" />
              <span className="text-sm">Burst</span>
            </>
          ) : captureMode === 'auto' ? (
            <>
              <Zap size={16} className="text-yellow-400" />
              <span className="text-sm">Auto</span>
            </>
          ) : (
            <>
              <ZapOff size={16} />
              <span className="text-sm">Manual</span>
            </>
          )}
        </button>
      </div>

      {/* Bottom bar with stats and capture button - safe area aware */}
      <div
        className="absolute bottom-0 left-0 right-0 p-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        {/* Stats bar - compact */}
        <div className="flex justify-between mb-2 px-2">
          <div className="flex items-center gap-3 text-white/70 text-xs">
            <span>Sharp: {currentAnalysis ? Math.round(currentAnalysis.blurScore * 100) : 0}%</span>
            <span>Buf: {bufferSize}</span>
            {currentAnalysis?.tagDetected && <span className="text-green-400">Tag ✓</span>}
          </div>
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="text-white/70 text-xs px-2"
          >
            {showGuide ? 'Hide' : 'Guide'}
          </button>
        </div>

        {/* Action buttons - smaller for mobile */}
        <div className="flex items-center justify-center gap-4">
          {/* Warehouse button */}
          <button
            onClick={onChangeWarehouse}
            className="p-2.5 bg-black/50 rounded-full text-white"
          >
            <Settings size={20} />
          </button>

          {/* Capture button - smaller */}
          <button
            onClick={handleManualCapture}
            disabled={disabled || isCapturing}
            className={`w-16 h-16 rounded-full flex items-center justify-center border-4 border-white/30 ${
              disabled || isCapturing
                ? 'bg-gray-500/50'
                : quality === 'excellent' || quality === 'good'
                ? 'bg-white'
                : 'bg-white/80'
            }`}
          >
            {isCapturing ? (
              <RefreshCw size={24} className="text-gray-700 animate-spin" />
            ) : captureMode === 'burst' ? (
              <Layers size={24} className="text-gray-700" />
            ) : (
              <Camera size={24} className="text-gray-700" />
            )}
          </button>

          {/* Buffer indicator for burst mode */}
          <div className="w-10 flex justify-center">
            {captureMode === 'burst' && bufferSize > 0 && (
              <span className="text-white/70 text-xs">{bufferSize}/10</span>
            )}
          </div>
        </div>

        {/* Mode-specific hints - compact */}
        <p className="text-center text-white/50 text-xs mt-2">
          {captureMode === 'burst' && !autoCaptureReady && 'Point at tag - captures best of multiple frames'}
          {captureMode === 'burst' && autoCaptureReady && <span className="text-green-400">Capturing best frames...</span>}
          {captureMode === 'auto' && !autoCaptureReady && 'Hold steady for auto-capture'}
          {captureMode === 'auto' && autoCaptureReady && <span className="text-green-400">Hold steady...</span>}
          {captureMode === 'manual' && 'Tap to capture (uses best buffered frame)'}
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="bg-red-900/80 text-white p-6 rounded-xl max-w-sm text-center">
            <p className="mb-4">{error}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-white text-red-900 rounded-lg font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
