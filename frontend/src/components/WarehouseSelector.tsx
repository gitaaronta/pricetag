'use client';

import { useState, useEffect } from 'react';
import { MapPin, Search, Check, WifiOff, Database } from 'lucide-react';
import { getWarehouses, type Warehouse } from '@/lib/api';
import { getAllWarehouses, cacheWarehouses } from '@/lib/warehouseCache';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface WarehouseSelectorProps {
  onSelect: (id: number) => void;
  currentWarehouseId: number | null;
}

export function WarehouseSelector({ onSelect, currentWarehouseId }: WarehouseSelectorProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    loadWarehouses();
  }, []);

  const loadWarehouses = async (zip?: string) => {
    setLoading(true);
    setError(null);
    setUsingCache(false);

    // If offline, try to load from cache
    if (!navigator.onLine) {
      try {
        const cached = await getAllWarehouses();
        if (cached.length > 0) {
          // Convert cached format to Warehouse format
          setWarehouses(cached.map((w) => ({
            id: w.id,
            costco_id: '',
            name: w.name,
            address: '',
            city: w.city,
            state: w.state,
            zip_code: '',
            latitude: null,
            longitude: null,
            metro_area: null,
          })));
          setUsingCache(true);
          setLoading(false);
          return;
        }
      } catch {
        // Cache failed, will show error
      }
      setError('Offline - no cached warehouses');
      setLoading(false);
      return;
    }

    try {
      const data = await getWarehouses(zip);
      setWarehouses(data);

      // Cache warehouses for offline use
      if (data.length > 0) {
        await cacheWarehouses(data.map((w) => ({
          id: w.id,
          name: w.name,
          city: w.city,
          state: w.state,
        })));
      }
    } catch (err) {
      // Try cache as fallback
      try {
        const cached = await getAllWarehouses();
        if (cached.length > 0) {
          setWarehouses(cached.map((w) => ({
            id: w.id,
            costco_id: '',
            name: w.name,
            address: '',
            city: w.city,
            state: w.state,
            zip_code: '',
            latitude: null,
            longitude: null,
            metro_area: null,
          })));
          setUsingCache(true);
          setLoading(false);
          return;
        }
      } catch {
        // Cache also failed
      }
      setError('Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  const handleZipSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (zipCode.length >= 3) {
      loadWarehouses(zipCode);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-amber-600/90 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm rounded-lg mb-4">
          <WifiOff size={16} />
          <span>You're offline - showing cached warehouses</span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8 pt-4">
        <MapPin className="w-12 h-12 text-costco-red mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Select Your Warehouse</h1>
        <p className="text-gray-400">
          Prices vary by location. Choose your Costco.
        </p>
        {usingCache && (
          <p className="text-blue-400 text-sm mt-2 flex items-center justify-center gap-1">
            <Database size={14} />
            Using cached data
          </p>
        )}
      </div>

      {/* ZIP code search - disabled when offline */}
      <form onSubmit={handleZipSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={isOnline ? "Enter ZIP code" : "ZIP search unavailable offline"}
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            disabled={!isOnline}
            className={`w-full rounded-xl px-4 py-3 pl-12 focus:outline-none focus:ring-2 focus:ring-costco-blue
                       ${isOnline
                         ? 'bg-gray-800 text-white placeholder-gray-500'
                         : 'bg-gray-800/50 text-gray-500 placeholder-gray-600 cursor-not-allowed'}`}
          />
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isOnline ? 'text-gray-500' : 'text-gray-600'}`} size={20} />
        </div>
      </form>

      {/* Error state */}
      {error && (
        <div className="text-center py-8">
          {error === 'Offline - no cached warehouses' ? (
            <>
              <WifiOff className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400">You're offline</p>
              <p className="text-gray-500 text-sm mt-2">
                Connect to the internet to select a warehouse for the first time
              </p>
            </>
          ) : (
            <>
              <p className="text-red-400">{error}</p>
              <button
                onClick={() => loadWarehouses()}
                className="mt-4 text-costco-blue hover:underline"
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-costco-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 mt-4">Finding warehouses...</p>
        </div>
      )}

      {/* Warehouse list */}
      {!loading && !error && (
        <div className="space-y-3">
          {warehouses.map((warehouse) => (
            <button
              key={warehouse.id}
              onClick={() => onSelect(warehouse.id)}
              className={`
                w-full text-left p-4 rounded-xl transition-colors
                ${currentWarehouseId === warehouse.id
                  ? 'bg-costco-blue/20 border-2 border-costco-blue'
                  : 'bg-gray-800 border-2 border-transparent hover:border-gray-600'}
              `}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-medium">{warehouse.name}</p>
                  <p className="text-gray-400 text-sm">{warehouse.address}</p>
                  <p className="text-gray-500 text-sm">
                    {warehouse.city}, {warehouse.state} {warehouse.zip_code}
                  </p>
                </div>
                {currentWarehouseId === warehouse.id && (
                  <Check className="text-costco-blue flex-shrink-0" size={24} />
                )}
              </div>
            </button>
          ))}

          {warehouses.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-400">No warehouses found</p>
              <p className="text-gray-500 text-sm mt-2">
                Try a different ZIP code
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
