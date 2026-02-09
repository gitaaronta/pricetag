'use client';

import { WifiOff, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  wasOffline: boolean;
  onDismissReconnected?: () => void;
}

export function OfflineIndicator({
  isOnline,
  wasOffline,
  onDismissReconnected
}: OfflineIndicatorProps) {
  const [showReconnected, setShowReconnected] = useState(false);

  // Show "Back online" message briefly when reconnecting
  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        onDismissReconnected?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, onDismissReconnected]);

  // Show offline banner
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
        <WifiOff size={16} />
        <span>You're offline — scans will be saved locally</span>
      </div>
    );
  }

  // Show "back online" message
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium animate-pulse">
        <Wifi size={16} />
        <span>Back online — syncing data...</span>
      </div>
    );
  }

  return null;
}
