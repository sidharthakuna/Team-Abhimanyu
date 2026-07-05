// Leaflet divIcon factories. Using divIcon (not image markers) so the
// dot color can come straight from CSS variables and always matches
// REPORT_STATUS in services/constants.js exactly — no separate PNG
// assets to keep in sync with backend status colors.

import L from "leaflet";

const STATUS_COLOR = {
  pending: "#d9342b",
  assigned: "#e0a100",
  resolved: "#1b7a43",
};

export function statusMarkerIcon(status, isEmergency = false) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.pending;
  const pulseClass = isEmergency ? "marker-pin--pulse" : "";

  return L.divIcon({
    className: "marker-pin-wrapper",
    html: `<span class="marker-pin ${pulseClass}" style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function photoDotIcon(photoType) {
  const color = photoType === "after" ? "#1b7a43" : "#d9342b";
  return L.divIcon({
    className: "marker-pin-wrapper",
    html: `<span class="marker-pin marker-pin--ring" style="border-color:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function pickerCrosshairIcon() {
  return L.divIcon({
    className: "marker-pin-wrapper",
    html: `<span class="marker-pin marker-pin--picker"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}