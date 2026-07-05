// Municipal dashboard map: closed by default (per the same "map only
// appears on tap" requirement as MapPicker), opens to show every
// cluster as a status-colored pin, tapping a pin selects that cluster
// for the detail panel.

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { statusMarkerIcon } from "./MarkerIcons";
import { getCategoryInfo } from "../../utils/categoryUtils";
import "leaflet/dist/leaflet.css";
import "./Map.css";

const DEFAULT_CENTER = [20.5937, 78.9629];

export function ClusterMapView({ clusters, onSelectCluster, triggerLabel = "View reports on map" }) {
  const [isOpen, setIsOpen] = useState(false);

  const center =
    clusters.length > 0 ? [clusters[0].latitude, clusters[0].longitude] : DEFAULT_CENTER;

  if (!isOpen) {
    return (
      <button type="button" className="map-picker-trigger map-picker-trigger--municipal" onClick={() => setIsOpen(true)}>
        <span className="map-picker-trigger__icon" aria-hidden="true">🗺️</span>
        <span>{triggerLabel}</span>
        <span className="map-picker-trigger__edit">{clusters.length} active</span>
      </button>
    );
  }

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-overlay__header">
        <span className="map-picker-overlay__hint">Tap a pin to view that report's details</span>
        <button type="button" className="map-picker-overlay__cancel" onClick={() => setIsOpen(false)}>
          Close map
        </button>
      </div>

      <div className="map-picker-overlay__map">
        <MapContainer center={center} zoom={clusters.length > 0 ? 13 : 5} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {clusters.map((cluster) => {
            const category = getCategoryInfo(cluster.category);
            return (
              <Marker
                key={cluster.id}
                position={[cluster.latitude, cluster.longitude]}
                icon={statusMarkerIcon(cluster.status, category.isEmergency)}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>
                      {category.icon} {category.label}
                    </strong>
                    <p>{cluster.report_count} report(s) · severity {cluster.severity_score}</p>
                    <button
                      className="map-popup__button"
                      onClick={() => {
                        onSelectCluster(cluster);
                        setIsOpen(false);
                      }}
                    >
                      Open details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}