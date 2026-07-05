import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { getClusterMapMarkers, submitAfterPhoto } from "../../services/api";
import { getCategoryInfo, getStatusInfo, formatCoords } from "../../utils/categoryUtils";
import { photoDotIcon } from "../Map/MarkerIcons";
import { VerifyPanel } from "../VerifyPanel/VerifyPanel";
import { STATUS_ORDER, REPORT_STATUS } from "../../services/constants";
import "leaflet/dist/leaflet.css";
import "./ClusterDetail.css";

export function ClusterDetail({ cluster, onClose, onStatusChange, onVerified }) {
  const [markers, setMarkers] = useState([]);
  const [markersLoading, setMarkersLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const category = getCategoryInfo(cluster.category);
  const status = getStatusInfo(cluster.status);

  useEffect(() => {
    let cancelled = false;
    setMarkersLoading(true);
    getClusterMapMarkers(cluster.id)
      .then((data) => {
        if (!cancelled) setMarkers(data);
      })
      .finally(() => {
        if (!cancelled) setMarkersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cluster.id]);

  async function handleStatusChange(newStatus) {
    setStatusUpdating(true);
    try {
      await onStatusChange(cluster.id, newStatus);
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleVerify(afterPhotoFile) {
    setIsVerifying(true);
    try {
      const updatedCluster = await submitAfterPhoto(cluster.id, afterPhotoFile);
      onVerified(updatedCluster);
      // Refresh markers so the new 'after' dot appears immediately.
      const refreshed = await getClusterMapMarkers(cluster.id);
      setMarkers(refreshed);
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="cluster-detail-overlay">
      <div className="cluster-detail">
        <div className="cluster-detail__header">
          <button className="cluster-detail__close" onClick={onClose} aria-label="Close">
            ← Back
          </button>
          <span
            className="cluster-detail__status-pill"
            style={{ background: status.color + "1A", color: status.color }}
          >
            {status.label}
          </span>
        </div>

        <div className="cluster-detail__title-row">
          <span className="cluster-detail__icon">{category.icon}</span>
          <div>
            <h2 className="cluster-detail__title">{category.label}</h2>
            <p className="cluster-detail__coords mono">{formatCoords(cluster.latitude, cluster.longitude)}</p>
          </div>
        </div>

        <div className="cluster-detail__stats">
          <div className="cluster-detail__stat">
            <span className="cluster-detail__stat-num">{cluster.report_count}</span>
            <span className="cluster-detail__stat-label">Reports</span>
          </div>
          <div className="cluster-detail__stat">
            <span className="cluster-detail__stat-num">{cluster.severity_score}</span>
            <span className="cluster-detail__stat-label">Severity</span>
          </div>
          <div className="cluster-detail__stat">
            <span className="cluster-detail__stat-num cluster-detail__stat-num--sm">
              {cluster.assigned_department || "—"}
            </span>
            <span className="cluster-detail__stat-label">Department</span>
          </div>
        </div>

        {category.isEmergency && (
          <div className="cluster-detail__emergency-banner">
            ⚠️ This is an emergency-category report. It was routed immediately and was never merged with other reports.
          </div>
        )}

        {cluster.municipal_summary && (
          <p className="cluster-detail__summary">{cluster.municipal_summary}</p>
        )}

        <div className="cluster-detail__section">
          <h3 className="cluster-detail__section-title">Update status</h3>
          <div className="cluster-detail__status-buttons">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className={`cluster-detail__status-btn ${cluster.status === s ? "cluster-detail__status-btn--active" : ""}`}
                style={
                  cluster.status === s
                    ? { background: REPORT_STATUS[s].color, color: "white", borderColor: REPORT_STATUS[s].color }
                    : {}
                }
                onClick={() => handleStatusChange(s)}
                disabled={statusUpdating || cluster.status === s}
              >
                {REPORT_STATUS[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="cluster-detail__section">
          <h3 className="cluster-detail__section-title">Before / after photos</h3>
          {markersLoading ? (
            <p className="cluster-detail__loading">Loading photo pins…</p>
          ) : markers.length === 0 ? (
            <p className="cluster-detail__loading">No photos yet.</p>
          ) : (
            <div className="cluster-detail__map">
              <MapContainer
                center={[cluster.latitude, cluster.longitude]}
                zoom={16}
                style={{ height: "220px", width: "100%", borderRadius: "12px" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {markers.map((marker) => (
                  <Marker
                    key={`${marker.report_id}-${marker.photo_type}`}
                    position={[marker.latitude, marker.longitude]}
                    icon={photoDotIcon(marker.photo_type)}
                  >
                    <Popup>
                      <img src={marker.photo_url} alt={marker.photo_type} style={{ width: 160, borderRadius: 8 }} />
                      <p style={{ fontSize: 12, marginTop: 4 }}>{marker.photo_type === "before" ? "Before" : "After"}</p>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>

        <div className="cluster-detail__section">
          <VerifyPanel cluster={cluster} onVerify={handleVerify} isSubmitting={isVerifying} />
        </div>
      </div>
    </div>
  );
}