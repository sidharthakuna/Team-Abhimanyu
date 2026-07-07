import { useEffect, useState } from 'react';
import { API } from '../api/client';
import type { ForecastResult } from '../types';

interface UseForecastResult {
  forecast: ForecastResult | null;
  loading: boolean;
}

// Fetches the hourly PM2.5/AQI forecast for a fixed lat/long. Re-fetches
// only when the coordinates change meaningfully (not on every sub-meter
// GPS jitter) since /forecast hits Open-Meteo upstream on every call.
export function useForecastAt(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  hours = 24,
): UseForecastResult {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Round to ~100m precision so GPS jitter doesn't re-trigger fetches —
  // the forecast grid itself is coarser than this anyway (CAMS is
  // ~45km resolution globally, per weather.py's own comments).
  const roundedLat = latitude != null ? Math.round(latitude * 1000) / 1000 : null;
  const roundedLng = longitude != null ? Math.round(longitude * 1000) / 1000 : null;

  useEffect(() => {
    if (roundedLat == null || roundedLng == null) return;
    let cancelled = false;
    setLoading(true);
    API.getForecast(roundedLat, roundedLng, hours)
      .then((result) => {
        if (!cancelled) setForecast(result);
      })
      .catch(() => {
        if (!cancelled) setForecast({ points: [], is_live: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedLat, roundedLng, hours]);

  return { forecast, loading };
}

// Same as above but scoped to an existing cluster — used in the
// municipal detail sheet where the frontend already has a cluster_id
// and shouldn't need to also know its lat/long.
export function useForecastForCluster(clusterId: string | null, hours = 24): UseForecastResult {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clusterId) return;
    let cancelled = false;
    setLoading(true);
    API.getForecastForCluster(clusterId, hours)
      .then((result) => {
        if (!cancelled) setForecast(result);
      })
      .catch(() => {
        if (!cancelled) setForecast({ points: [], is_live: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId, hours]);

  return { forecast, loading };
}