import { useEffect } from "react";
import { useMap } from "react-leaflet";

// Leaflet's map instance doesn't re-render when React state changes —
// this component bridges that by calling flyTo/setView imperatively
// whenever the given coords change (e.g. after "use my location").
export function MapRecenter({ latitude, longitude, zoom = 16 }) {
  const map = useMap();

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    map.flyTo([latitude, longitude], zoom, { duration: 0.8 });
  }, [latitude, longitude, zoom, map]);

  return null;
}