import { useState } from "react";
import { Header } from "../../components/Header/Header";
import { Legend } from "../../components/Legend/Legend";
import { ClusterMapView } from "../../components/Map/ClusterMapView";
import { ClusterCard } from "../../components/ClusterCard/ClusterCard";
import { ClusterDetail } from "../../components/ClusterDetail/ClusterDetail";
import { Toast } from "../../components/Toast/Toast";
import { useClusters } from "../../hooks/useClusters";
import { updateClusterStatus } from "../../services/api";
import { STATUS_ORDER, REPORT_STATUS } from "../../services/constants";
import "./MunicipalDashboard.css";

export function MunicipalDashboard({ username, onSwitchRole, onLogout }) {
  const [statusFilter, setStatusFilter] = useState(""); // "" = all
  const { clusters, loading, error, refetch } = useClusters(statusFilter);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [toast, setToast] = useState(null);

  // Sorted by severity descending is already what the backend returns
  // (see list_clusters' docstring) — no client-side re-sort needed.

  async function handleStatusChange(clusterId, newStatus) {
    try {
      const updated = await updateClusterStatus(clusterId, newStatus);
      setSelectedCluster(updated);
      setToast({ message: `Marked as ${REPORT_STATUS[newStatus].label}.`, tone: "success" });
      refetch();
    } catch (err) {
      setToast({ message: err.message || "Couldn't update status.", tone: "error" });
    }
  }

  function handleVerified(updatedCluster) {
    setSelectedCluster(updatedCluster);
    setToast({
      message:
        updatedCluster.verification_status === "verified"
          ? "Verified as resolved! Great work."
          : "Comparison complete — not yet verified as resolved.",
      tone: updatedCluster.verification_status === "verified" ? "success" : "info",
    });
    refetch();
  }

  return (
    <div className="municipal-page">
      <Header role="municipal" username={username} onSwitchRole={onSwitchRole} onLogout={onLogout} />

      <div className="municipal-page__content">
        <div className="municipal-page__intro">
          <h1 className="municipal-page__heading">Active reports</h1>
          <p className="municipal-page__sub">Ranked by severity. Signed in as <strong>{username}</strong>.</p>
        </div>

        <div className="municipal-page__filters">
          <button
            className={`municipal-page__filter ${statusFilter === "" ? "municipal-page__filter--active" : ""}`}
            onClick={() => setStatusFilter("")}
          >
            All
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              className={`municipal-page__filter ${statusFilter === s ? "municipal-page__filter--active" : ""}`}
              onClick={() => setStatusFilter(s)}
              style={statusFilter === s ? { background: REPORT_STATUS[s].color, borderColor: REPORT_STATUS[s].color } : {}}
            >
              {REPORT_STATUS[s].label}
            </button>
          ))}
        </div>

        <ClusterMapView clusters={clusters} onSelectCluster={setSelectedCluster} />

        <div className="municipal-page__legend-slot">
          <Legend />
        </div>

        {loading ? (
          <p className="municipal-page__loading">Loading reports…</p>
        ) : error ? (
          <p className="municipal-page__error">{error}</p>
        ) : clusters.length === 0 ? (
          <div className="municipal-page__empty">
            <span aria-hidden="true">✨</span>
            <p>Nothing here right now.</p>
          </div>
        ) : (
          <div className="municipal-page__list">
            {clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} onSelect={setSelectedCluster} />
            ))}
          </div>
        )}
      </div>

      {selectedCluster && (
        <ClusterDetail
          cluster={selectedCluster}
          onClose={() => setSelectedCluster(null)}
          onStatusChange={handleStatusChange}
          onVerified={handleVerified}
        />
      )}

      <Toast message={toast?.message} tone={toast?.tone} onDismiss={() => setToast(null)} />
    </div>
  );
}