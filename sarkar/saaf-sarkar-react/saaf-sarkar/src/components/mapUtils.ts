import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coords } from '../types';
import type { ClusterOut } from '../types';
import { CATEGORY_COLOR_VAR, aqiColorVar } from '../types/constants';

function resolveCssVar(varExpression: string): string {
  if (!varExpression.startsWith('var(')) return varExpression;
  const varName = varExpression.slice(4, -1);
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || '#9B8CBE';
}

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

// NEW: the "picked report location" marker — deliberately a different
// shape/color from the live-location pulse-dot so a citizen can tell at
// a glance "this pin is where my report will be filed" vs "that dot is
// where I'm physically standing right now." Uses a drop-pin shape with
// a crosshair-style ring, in the live accent color so it still reads as
// "this is active/selected" rather than a static cluster marker.
export function createPickedLocationMarker(map: L.Map, coords: Coords): L.Marker {
  const icon = L.divIcon({
    className: '',
    html: `
      <div class="picked-pin">
        <div class="picked-pin-ring"></div>
        <div class="picked-pin-drop"></div>
      </div>
    `,
    iconSize: [34, 44],
    iconAnchor: [17, 40], // anchor at the drop's point, not the center
  });
  return L.marker([coords.latitude, coords.longitude], { icon, zIndexOffset: 1100 }).addTo(map);
}

// Signature element: each complaint marker is a severity RING, not a flat
// dot — the ring's stroke-width and glow scale with severity_score, so a
// hotspot visually radiates outward on the map itself rather than only
// showing a number in a sidebar card. This directly answers the brief's
// "hidden pollution hotspots" framing: severity is spatial, not just
// tabular.
export function createComplaintDotMarker(
  map: L.Map,
  cluster: ClusterOut,
  onClick?: (cluster: ClusterOut) => void,
): L.Marker {
  const color = resolveCssVar(CATEGORY_COLOR_VAR[cluster.category] || 'var(--cat-other)');
  const severity = cluster.severity_score || 0;
  const coreSize = 10 + Math.min(severity / 100, 1) * 6; // 10px-16px core
  const ringSize = coreSize + 10 + Math.min(severity / 100, 1) * 14; // grows faster than core
  const ringOpacity = 0.25 + Math.min(severity / 100, 1) * 0.35;

  const icon = L.divIcon({
    className: '',
    html: `
      <div class="severity-marker" style="width:${ringSize}px;height:${ringSize}px;">
        <div class="severity-ring" style="border-color:${color};opacity:${ringOpacity};"></div>
        <div class="severity-core" style="width:${coreSize}px;height:${coreSize}px;background:${color};box-shadow:0 0 8px ${color}aa;"></div>
      </div>
    `,
    iconSize: [ringSize, ringSize],
    iconAnchor: [ringSize / 2, ringSize / 2],
  });

  const marker = L.marker([cluster.latitude, cluster.longitude], { icon }).addTo(map);
  if (onClick) marker.on('click', () => onClick(cluster));
  return marker;
}

// Small standalone marker for a raw AQI reading at a point (used to show
// "here's the live air quality right where you're standing" distinct
// from citizen-reported clusters).
export function createAqiPulseMarker(map: L.Map, coords: Coords, aqi: number | null): L.Marker {
  const color = resolveCssVar(aqiColorVar(aqi));
  const icon = L.divIcon({
    className: '',
    html: `<div class="aqi-pulse" style="border-color:${color};"><span style="background:${color};"></span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  return L.marker([coords.latitude, coords.longitude], { icon, zIndexOffset: 500 }).addTo(map);
}

export function flyToLocation(map: L.Map, coords: Coords, zoom = 16) {
  map.flyTo([coords.latitude, coords.longitude], zoom, { duration: 0.8 });
}

// NEW: registers a click/tap handler on the map that reports back the
// lat/long of wherever the citizen tapped. Returns an unsubscribe
// function so the caller (CitizenReport.tsx) can clean it up in a
// useEffect the normal React way, matching the pattern used everywhere
// else in this file (map.on / map.off pairs).
//
// Deliberately takes a *stable* callback via a ref internally rather
// than requiring the caller to memoize with useCallback — re-registering
// a Leaflet click handler on every render (because an inline arrow
// function changed identity) would leak listeners over time, and this
// is exactly the kind of subtle bug that's easy to introduce here.
export function useMapTapToPick(map: L.Map | null, onPick: (coords: Coords) => void) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onPickRef.current({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map]);
}

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

// NEW: manages the single "picked location" marker's lifecycle — create
// once, then just move it on subsequent picks rather than remove/recreate
// (removing and re-adding on every tap would cause a visible flicker).
// Mirrors the pattern of useUserLocationMarker-style hooks elsewhere in
// this file, but as a ref-based marker manager since there's only ever
// at most one of these markers at a time (unlike the Map<id, marker> used
// for clusters above).
export function usePickedLocationMarker(map: L.Map | null, pickedCoords: Coords | null) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    if (pickedCoords == null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([pickedCoords.latitude, pickedCoords.longitude]);
    } else {
      markerRef.current = createPickedLocationMarker(map, pickedCoords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pickedCoords?.latitude, pickedCoords?.longitude]);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map]);
}