// The "map only appears when you tap to open it, and can be cancelled"
// component. Renders as a closed trigger button by default; tapping it
// opens a full-screen map overlay where the user taps a spot, sees a
// crosshair pin, and either confirms or cancels back to the closed state.

import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { MapRecenter } from "./MapRecenter";
import { pickerCrosshairIcon } from "./MarkerIcons";
import "leaflet/dist/leaflet.css";
import "./Map.css";

const DEFAULT_CENTER = [20.5937, 78.9629]; // India centroid — reasonable fallback before any location is known

function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * @param {object} props
 * @param {{latitude:number, longitude:number}|null} props.value - currently selected point, if any
 * @param {(lat:number, lng:number)=>void} props.onConfirm - called when the user confirms a pick
 * @param {string} props.triggerLabel - text shown on the closed trigger button
 */
export function MapPicker({ value, onConfirm, triggerLabel = "Pick location on map" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftPoint, setDraftPoint] = useState(null);

  function openMap() {
    setDraftPoint(value || null);
    setIsOpen(true);
  }

  function cancel() {
    setDraftPoint(null);
    setIsOpen(false);
  }

  function confirm() {
    if (!draftPoint) return;
    onConfirm(draftPoint.lat, draftPoint.lng);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button type="button" className="map-picker-trigger" onClick={openMap}>
        <span className="map-picker-trigger__icon" aria-hidden="true">📍</span>
        <span>
          {value
            ? `Location set: ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : triggerLabel}
        </span>
        <span className="map-picker-trigger__edit">{value ? "Change" : "Open map"}</span>
      </button>
    );
  }

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-overlay__header">
        <span className="map-picker-overlay__hint">Tap anywhere on the map to drop a pin</span>
        <button type="button" className="map-picker-overlay__cancel" onClick={cancel}>
          Cancel
        </button>
      </div>

      <div className="map-picker-overlay__map">
        <MapContainer
          center={draftPoint ? [draftPoint.lat, draftPoint.lng] : DEFAULT_CENTER}
          zoom={draftPoint ? 16 : 5}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture onPick={(lat, lng) => setDraftPoint({ lat, lng })} />
          {draftPoint && (
            <>
              <Marker position={[draftPoint.lat, draftPoint.lng]} icon={pickerCrosshairIcon()} />
              <MapRecenter latitude={draftPoint.lat} longitude={draftPoint.lng} />
            </>
          )}
        </MapContainer>
      </div>

      <div className="map-picker-overlay__footer">
        {draftPoint ? (
          <span className="map-picker-overlay__coords mono">
            {draftPoint.lat.toFixed(5)}, {draftPoint.lng.toFixed(5)}
          </span>
        ) : (
          <span className="map-picker-overlay__coords map-picker-overlay__coords--empty">
            No pin dropped yet
          </span>
        )}
        <button type="button" className="map-picker-overlay__confirm" onClick={confirm} disabled={!draftPoint}>
          Confirm location
        </button>
      </div>
    </div>
  );
}