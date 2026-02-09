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
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Camera feed - takes remaining space */}
      <div className="flex-1 relative overflow-hidden">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          videoConstraints={videoConstraints}
          onUserMedia={() => setCameraReady(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Viewfinder overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner guides */}
          <div className="absolute top-[15%] left-[8%] w-10 h-10 border-l-4 border-t-4 border-white/80 rounded-tl-lg" />
          <div className="absolute top-[15%] right-[8%] w-10 h-10 border-r-4 border-t-4 border-white/80 rounded-tr-lg" />
          <div className="absolute top-[50%] left-[8%] w-10 h-10 border-l-4 border-b-4 border-white/80 rounded-bl-lg" />
          <div className="absolute top-[50%] right-[8%] w-10 h-10 border-r-4 border-b-4 border-white/80 rounded-br-lg" />

          {/* Instruction text */}
          <div className="absolute top-4 inset-x-0 text-center">
            <p className="text-white text-sm font-medium bg-black/60 inline-block px-4 py-2 rounded-full">
              Point at price tag
            </p>
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

      {/* Controls bar - fixed height at bottom */}
      <div className="flex-shrink-0 bg-black/95 px-6 py-6 pb-8">
        <div className="flex items-center justify-center gap-10">
          {/* Change warehouse button */}
          <button
            onClick={onChangeWarehouse}
            className="p-4 rounded-full bg-white/20 text-white active:bg-white/40"
            aria-label="Change warehouse"
          >
            <MapPin size={26} />
          </button>

          {/* Capture button */}
          <button
            onClick={capture}
            disabled={disabled || !cameraReady}
            className={`
              relative w-20 h-20 rounded-full
              ${disabled || !cameraReady ? 'opacity-40' : 'active:scale-90'}
              transition-transform
            `}
            aria-label="Capture photo"
          >
            <span className="absolute inset-0 rounded-full border-4 border-white" />
            <span className="absolute inset-2 rounded-full bg-white" />
          </button>

          {/* Flip camera button */}
          <button
            onClick={toggleCamera}
            className="p-4 rounded-full bg-white/20 text-white active:bg-white/40"
            aria-label="Flip camera"
          >
            <RotateCcw size={26} />
          </button>
        </div>
      </div>
    </div>
  );
}
