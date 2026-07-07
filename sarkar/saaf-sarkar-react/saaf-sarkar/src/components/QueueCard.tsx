import { ClipboardList, MapPin } from 'lucide-react';
import { CATEGORY_ICON } from './Card';
import { CATEGORY_LABELS, STATUS_COLOR_VAR } from '../types/constants';
import { timeAgo } from '../hooks/useGeo';
import type { ClusterOut } from '../types';

interface QueueCardProps {
  cluster: ClusterOut;
  selected: boolean;
  onClick: () => void;
}

export function QueueCard({ cluster, selected, onClick }: QueueCardProps) {
  const Icon = CATEGORY_ICON[cluster.category];
  const statusColor = STATUS_COLOR_VAR[cluster.status];

  return (
    <div
      onClick={onClick}
      className="queue-card"
      style={{ borderColor: selected ? 'var(--border-strong)' : 'transparent' }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-bold inline-flex items-center gap-1.5">
          <Icon size={15} strokeWidth={2.25} />
          {CATEGORY_LABELS[cluster.category]}
        </div>
        <div className="text-[10px] text-[var(--text-dim)] font-mono">{timeAgo(cluster.created_at)}</div>
      </div>
      <span
        className="inline-flex items-center gap-1 rounded-full font-mono text-xs font-semibold px-2.5 py-1"
        style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 15%, transparent)` }}
      >
        {cluster.status.toUpperCase()}
      </span>
      <div className="flex gap-3 text-[11px] text-[var(--text-muted)] mt-2 font-mono">
        <span className="inline-flex items-center gap-1">
          <ClipboardList size={11} strokeWidth={2.25} />
          {cluster.report_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin size={11} strokeWidth={2.25} />
          {cluster.latitude.toFixed(3)}, {cluster.longitude.toFixed(3)}
        </span>
      </div>
      <div className="severity-bar-track">
        <div className="severity-bar-fill" style={{ width: `${cluster.severity_score}%`, background: statusColor }} />
      </div>
    </div>
  );
}