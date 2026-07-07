import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coords } from '../types';
import type { ClusterOut } from '../types';
import { CATEGORY_COLOR_VAR } from '../types/constants';

// Resolve CSS custom properties to actual color values, since Leaflet's
// divIcon HTML is detached from the app's stylesheet cascade at the point
// styles get read for some browser edge cases (color-mix, etc.) — using
// getComputedStyle keeps this robust regardless.
function resolveCssVar(varExpression: string): string {
  if (!varExpression.startsWith('var(')) return varExpression;
  const varName = varExpression.slice(4, -1);
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || '#9B8CBE';
}

// Reads --map-tile-url from index.css, which points at CARTO's dark_all
// or light_all basemap depending on [data-theme]. The value is wrapped in
// quotes as a CSS string literal, so strip those off before use.
function currentTileUrl(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--map-tile-url').trim();
  return raw.replace(/^["']|["']$/g, '') || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

export function createDarkMap(elementId: string, center: Coords, zoom = 15): L.Map {
  const map = L.map(elementId, {
    center: [center.latitude, center.longitude],
    zoom,
    zoomControl: false,
  });

  const tileLayer = L.tileLayer(currentTileUrl(), {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  // Live-swap tiles when the person toggles theme without remounting the
  // whole map (which would lose pan/zoom position and marker state).
  const observer = new MutationObserver(() => {
    tileLayer.setUrl(currentTileUrl());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  map.on('remove', () => observer.disconnect());

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  return map;
}

export function createUserLocationMarker(map: L.Map, coords: Coords): L.Marker {
  const icon = L.divIcon({
    className: '',
    html: '<div class="pulse-dot"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  return L.marker([coords.latitude, coords.longitude], { icon, zIndexOffset: 1000 }).addTo(map);
}

export function createComplaintDotMarker(
  map: L.Map,
  cluster: ClusterOut,
  onClick?: (cluster: ClusterOut) => void,
): L.Marker {
  const color = resolveCssVar(CATEGORY_COLOR_VAR[cluster.category] || 'var(--cat-other)');
  const severity = cluster.severity_score || 0;
  const size = 8 + Math.min(severity / 100, 1) * 8; // 8px–16px

  const icon = L.divIcon({
    className: '',
    html: `<div class="complaint-dot" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 6px ${color}88;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  const marker = L.marker([cluster.latitude, cluster.longitude], { icon }).addTo(map);
  if (onClick) marker.on('click', () => onClick(cluster));
  return marker;
}

export function flyToLocation(map: L.Map, coords: Coords, zoom = 16) {
  map.flyTo([coords.latitude, coords.longitude], zoom, { duration: 0.8 });
}

/**
 * Hook that keeps a Map<string, L.Marker> of complaint dots in sync with
 * a cluster list — adds new markers, moves existing ones, removes stale
 * ones. Mirrors the diffing logic from the original vanilla-JS app.js.
 */
export function useClusterMarkers(
  map: L.Map | null,
  clusters: ClusterOut[],
  onClick: (cluster: ClusterOut) => void,
) {
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!map) return;
    const markers = markersRef.current;
    const seenIds = new Set<string>();

    clusters.forEach((cluster) => {
      seenIds.add(cluster.id);
      const existing = markers.get(cluster.id);
      if (existing) {
        existing.setLatLng([cluster.latitude, cluster.longitude]);
        return;
      }
      const marker = createComplaintDotMarker(map, cluster, onClick);
      markers.set(cluster.id, marker);
    });

    for (const [id, marker] of markers.entries()) {
      if (!seenIds.has(id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, clusters]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
    };
  }, [map]);
}