import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coords } from '../types';

// Demo-city fallback — mirrors DEFAULT_LATITUDE/LONGITUDE in the
// analytics router, used only if geolocation is denied/unavailable.
export const FALLBACK_LOCATION: Coords = { latitude: 17.6868, longitude: 83.2185 };

// Distinguishes *why* we ended up on the fallback, so the UI can tell
// the person "location access is blocked" vs "we tried, it timed out"
// instead of just quietly showing Vizag with no explanation.
export type GeoFallbackReason =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported'
  | null;

function reasonFromError(err: GeolocationPositionError): GeoFallbackReason {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'permission_denied';
    case err.POSITION_UNAVAILABLE:
      return 'position_unavailable';
    case err.TIMEOUT:
      return 'timeout';
    default:
      return 'position_unavailable';
  }
}

// SWAPPED: single getCurrentPosition call, no retry — this is the
// teammate's simpler acquisition pattern (CitizenPortal.jsx), used
// here in place of the old getCurrentPositionWithRetry(). Matches the
// options teammate's code used: enableHighAccuracy true, 15s timeout.
//
// NOTE: kept a console.error on failure (not shown to the citizen —
// this is a devtools-only breadcrumb) since a silent fallback to Vizag
// with no visible reason is exactly what makes a real permission/HTTPS
// issue look like "the code doesn't work" instead of "the browser
// denied this for a specific, fixable reason." Costs nothing, changes
// no UI, and turns the next debugging pass into a 5-second console
// check instead of another round of manual retries.
function getCurrentPositionOnce(): Promise<Coords> {
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
      (err) => {
        console.error(
          `[useGeo] getCurrentPosition failed — code ${err.code} (${err.message}). ` +
            `Code 1 = permission denied (often an insecure http:// origin on a non-localhost ` +
            `host), code 2 = position unavailable, code 3 = timeout.`,
        );
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

export function useLiveLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<GeoFallbackReason>(null);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentPositionOnce()
      .then((c) => {
        if (cancelled) return;
        setCoords(c);
        setIsFallback(false);
        setFallbackReason(null);
        setLoading(false);

        // Same continuous tracking as before — unchanged from the
        // original useGeo.ts, this part wasn't the problem.
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
      .catch((err: GeolocationPositionError | Error) => {
        if (cancelled) return;
        setCoords(FALLBACK_LOCATION);
        setIsFallback(true);
        setFallbackReason('code' in err ? reasonFromError(err) : 'unsupported');
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

  return { coords, isFallback, fallbackReason, loading, recenter };
}

// Unchanged — still gives a citizen an actual, actionable sentence
// instead of "Location unavailable."
export function describeFallbackReason(reason: GeoFallbackReason): string {
  switch (reason) {
    case 'permission_denied':
      return 'Location access is blocked for this site — enable it in your browser settings, then reload.';
    case 'timeout':
      return "Location took too long to respond — showing Vizag for now. Tap the target button to retry.";
    case 'position_unavailable':
      return "Couldn't determine your position — showing Vizag for now. Tap the target button to retry.";
    case 'unsupported':
      return 'This browser doesn\'t support location access.';
    default:
      return 'Location unavailable — showing demo area.';
  }
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