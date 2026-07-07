import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coords } from '../types';

// Demo-city fallback — mirrors DEFAULT_LATITUDE/LONGITUDE in the
// analytics router, used only if geolocation is denied/unavailable.
export const FALLBACK_LOCATION: Coords = { latitude: 17.6868, longitude: 83.2185 };

export function getCurrentPosition(options: PositionOptions = {}): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options },
    );
  });
}

/**
 * Hook: resolves the user's current position once on mount, falling back
 * to FALLBACK_LOCATION if permission is denied or geolocation errors out.
 * Also starts a live watch so the position updates as the person moves.
 */
export function useLiveLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentPosition()
      .then((c) => {
        if (cancelled) return;
        setCoords(c);
        setLoading(false);

        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
          () => {
            /* live-watch errors are non-fatal — keep last known position */
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCoords(FALLBACK_LOCATION);
        setIsFallback(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const recenter = useCallback(() => coords, [coords]);

  return { coords, isFallback, loading, recenter };
}

export function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
