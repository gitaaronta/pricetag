'use client';

import { useState, useEffect } from 'react';

/**
 * Generate and persist a session ID for rate limiting and deduplication.
 * No user identification - just session tracking.
 */
export function useSessionId(): string {
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    let id = sessionStorage.getItem('pricetag_session');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('pricetag_session', id);
    }
    setSessionId(id);
  }, []);

  return sessionId;
}
