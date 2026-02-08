'use client';

import { useRef, useCallback, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera, MapPin, RotateCcw } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  disabled?: boolean;
  onChangeWarehouse: () => void;
}

export function CameraCapture({ onCapture, disabled, onChangeWarehouse }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraReady, setCameraReady] = useState(false);

  const capture = useCallback(() => {
    if (disabled || !webcamRef.current) return;

    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      // Convert base64 to blob
      fetch(imageSrc)
        .then((res) => res.blob())
        .then((blob) => onCapture(blob));
    }
  }, [onCapture, disabled]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const videoConstraints = {
    facingMode,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  return (
    <div className="relative h-full w-full bg-black">
      {/* Camera feed */}
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        screenshotQuality={0.9}
        videoConstraints={videoConstraints}
        onUserMedia={() => setCameraReady(true)}
        className="h-full w-full object-cover"
      />

      {/* Viewfinder overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Corner guides for price tag framing */}
        <div className="absolute top-1/4 left-1/6 w-16 h-16 border-l-4 border-t-4 border-white/60 rounded-tl-lg" />
        <div className="absolute top-1/4 right-1/6 w-16 h-16 border-r-4 border-t-4 border-white/60 rounded-tr-lg" />
        <div className="absolute bottom-1/3 left-1/6 w-16 h-16 border-l-4 border-b-4 border-white/60 rounded-bl-lg" />
        <div className="absolute bottom-1/3 right-1/6 w-16 h-16 border-r-4 border-b-4 border-white/60 rounded-br-lg" />

        {/* Instruction text */}
        <div className="absolute top-8 inset-x-0 text-center">
          <p className="text-white/90 text-sm font-medium bg-black/40 inline-block px-4 py-2 rounded-full">
            Point at price tag
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 inset-x-0 pb-8 pt-16 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-8">
          {/* Change warehouse button */}
          <button
            onClick={onChangeWarehouse}
            className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Change warehouse"
          >
            <MapPin size={24} />
          </button>

          {/* Capture button */}
          <button
            onClick={capture}
            disabled={disabled || !cameraReady}
            className={`
              relative w-20 h-20 rounded-full
              ${disabled ? 'opacity-50' : 'active:scale-95'}
              transition-transform
            `}
            aria-label="Capture photo"
          >
            {/* Outer ring */}
            <span className="absolute inset-0 rounded-full border-4 border-white" />
            {/* Inner circle */}
            <span className="absolute inset-2 rounded-full bg-white" />
            {/* Pulse effect when ready */}
            {cameraReady && !disabled && (
              <span className="absolute inset-0 rounded-full border-4 border-white pulse-ring" />
            )}
          </button>

          {/* Flip camera button */}
          <button
            onClick={toggleCamera}
            className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Flip camera"
          >
            <RotateCcw size={24} />
          </button>
        </div>
      </div>

      {/* Camera loading state */}
      {!cameraReady && (
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          <div className="text-center">
            <Camera className="w-12 h-12 text-white/50 mx-auto mb-4 animate-pulse" />
            <p className="text-white/70">Starting camera...</p>
          </div>
        </div>
      )}
    </div>
  );
}
