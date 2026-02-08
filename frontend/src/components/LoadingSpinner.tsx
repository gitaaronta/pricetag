'use client';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="text-center">
      {/* Animated scanning effect */}
      <div className="relative w-24 h-24 mx-auto mb-6">
        {/* Outer ring */}
        <div className="absolute inset-0 border-4 border-costco-blue/30 rounded-full" />
        {/* Spinning segment */}
        <div className="absolute inset-0 border-4 border-transparent border-t-costco-blue rounded-full animate-spin" />
        {/* Inner pulse */}
        <div className="absolute inset-4 bg-costco-blue/20 rounded-full animate-pulse" />
      </div>

      <p className="text-white text-lg font-medium">{message}</p>
      <p className="text-gray-400 text-sm mt-2">This usually takes 1-2 seconds</p>
    </div>
  );
}
