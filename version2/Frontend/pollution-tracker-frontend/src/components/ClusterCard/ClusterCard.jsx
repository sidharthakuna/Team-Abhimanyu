import { getCategoryInfo, getStatusInfo, formatDistanceToNow } from "../../utils/categoryUtils";
import "./ClusterCard.css";

export function ClusterCard({ cluster, onSelect }) {
  const category = getCategoryInfo(cluster.category);
  const status = getStatusInfo(cluster.status);

  return (
    <button className="cluster-card" onClick={() => onSelect(cluster)}>
      <div className="cluster-card__icon" style={{ background: category.color + "22", color: category.color }}>
        {category.icon}
      </div>

      <div className="cluster-card__body">
        <div className="cluster-card__top">
          <span className="cluster-card__category">{category.label}</span>
          {category.isEmergency && <span className="cluster-card__emergency-tag">URGENT</span>}
        </div>
        <p className="cluster-card__meta">
          {cluster.report_count} report{cluster.report_count !== 1 ? "s" : ""} · {cluster.assigned_department || "Unassigned dept."}
        </p>
        <p className="cluster-card__updated">Updated {formatDistanceToNow(cluster.updated_at)}</p>
      </div>

      <div className="cluster-card__right">
        <span className="cluster-card__severity">
          <span className="cluster-card__severity-num">{cluster.severity_score}</span>
          <span className="cluster-card__severity-label">severity</span>
        </span>
        <span className="cluster-card__status" style={{ background: status.color + "1A", color: status.color }}>
          {status.label}
        </span>
      </div>
    </button>
  );
}