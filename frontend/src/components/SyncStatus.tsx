'use client';

import { CloudOff, RefreshCw, Check, AlertCircle, Cloud } from 'lucide-react';
import type { SyncStatus as SyncStatusType } from '@/hooks/useBackgroundSync';

interface SyncStatusProps {
  pendingCount: number;
  isOnline: boolean;
  syncStatus: SyncStatusType;
  onSyncNow?: () => void;
}

export function SyncStatus({ pendingCount, isOnline, syncStatus, onSyncNow }: SyncStatusProps) {
  // Nothing pending and not syncing - show nothing
  if (pendingCount === 0 && syncStatus === 'idle') {
    return null;
  }

  // Syncing
  if (syncStatus === 'syncing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-blue-600/80 text-white">
        <RefreshCw size={14} className="animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }

  // Success
  if (syncStatus === 'success') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-green-600/80 text-white">
        <Check size={14} />
        <span>Synced</span>
      </div>
    );
  }

  // Error
  if (syncStatus === 'error') {
    return (
      <button
        onClick={onSyncNow}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-red-600/80 text-white active:bg-red-700"
      >
        <AlertCircle size={14} />
        <span>Retry</span>
      </button>
    );
  }

  // Pending items
  if (pendingCount > 0) {
    // Offline with pending
    if (!isOnline) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-gray-700/80 text-gray-300">
          <CloudOff size={14} />
          <span>{pendingCount} pending</span>
        </div>
      );
    }

    // Online with pending - show sync button
    return (
      <button
        onClick={onSyncNow}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-blue-600/80 text-white active:bg-blue-700"
      >
        <Cloud size={14} />
        <span>{pendingCount} pending</span>
      </button>
    );
  }

  return null;
}
