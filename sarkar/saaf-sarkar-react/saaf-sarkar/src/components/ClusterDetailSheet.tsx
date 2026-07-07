import { Camera, Circle, CircleDot, ImageOff, Trash2, X } from 'lucide-react';
import { CATEGORY_ICON } from './Card';
import { CATEGORY_LABELS } from '../types/constants';
import { Button } from './Button';
import { ForecastChart } from './ForecastChart';
import { useForecastForCluster } from '../forecast-by-cluster/useForecast';
import type { ClusterOut, ReportOut } from '../types';

interface ClusterDetailSheetProps {
  cluster: ClusterOut;
  placeName: string;
  reports: ReportOut[];
  photosLoading: boolean;
  onClose: () => void;
  onUpdateStatus: (status: 'pending' | 'assigned') => void;
  onDelete: () => void;
  verifyPreview: string | null;
  onVerifyFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmitVerification: () => void;
  verifying: boolean;
  hasVerifyFile: boolean;
}

// Detail sheet extracted from MunicipalDashboard.tsx to keep that file
// focused on map/queue orchestration. Adds a per-cluster 24h forecast
// panel — an officer deciding where to send a cleanup crew now also sees
// whether conditions are about to get worse at that exact spot.
export function ClusterDetailSheet({
  cluster,
  placeName,
  reports,
  photosLoading,
  onClose,
  onUpdateStatus,
  onDelete,
  verifyPreview,
  onVerifyFileChange,
  onSubmitVerification,
  verifying,
  hasVerifyFile,
}: ClusterDetailSheetProps) {
  const { forecast, loading: forecastLoading } = useForecastForCluster(cluster.id, 24);
  const CategoryIcon = CATEGORY_ICON[cluster.category];

  return (
    <div className="detail-sheet-wrap">
      <div className="detail-sheet-inner">
        <div className="sheet-handle" onClick={onClose} />
        <div className="detail-head">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full font-mono text-xs font-semibold px-2.5 py-1 mb-2"
              style={{
                color: `var(--cat-${cluster.category})`,
                background: `color-mix(in srgb, var(--cat-${cluster.category}) 15%, transparent)`,
              }}
            >
              <CategoryIcon size={13} strokeWidth={2.5} />
              {CATEGORY_LABELS[cluster.category]}
            </span>
            <h2 className="font-display text-xl">{placeName}</h2>
            <div className="eyebrow mt-1">
              {cluster.latitude.toFixed(5)}, {cluster.longitude.toFixed(5)}
            </div>
          </div>
          <button className="icon-fab-sm" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>

        <div className="detail-stats-grid">
          <div className="detail-stat">
            <div className="detail-stat-value">{cluster.severity_score}</div>
            <div className="detail-stat-label">Severity</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-value">{cluster.report_count}</div>
            <div className="detail-stat-label">Reports</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-value detail-stat-value--sm">{cluster.status.toUpperCase()}</div>
            <div className="detail-stat-label">Status</div>
          </div>
        </div>

        <div className="detail-section-label">24h outlook at this location</div>
        <div className="mb-5">
          <ForecastChart forecast={forecast} loading={forecastLoading} hours={24} />
        </div>

        <div className="detail-section-label">Update status</div>
        <div className="detail-status-grid">
          <Button variant="secondary" className="text-xs py-2.5 px-2" onClick={() => onUpdateStatus('pending')}>
            <Circle size={13} strokeWidth={2.5} style={{ color: 'var(--status-pending)' }} />
            Pending
          </Button>
          <Button variant="secondary" className="text-xs py-2.5 px-2" onClick={() => onUpdateStatus('assigned')}>
            <CircleDot size={13} strokeWidth={2.5} style={{ color: 'var(--status-assigned)' }} />
            Assigned
          </Button>
          <Button variant="danger" className="text-xs py-2.5 px-2" onClick={onDelete}>
            <Trash2 size={13} strokeWidth={2.5} />
            Delete
          </Button>
        </div>

        <div className="detail-section-label">Evidence photos</div>
        <div className="evidence-row">
          {photosLoading && <div className="text-[var(--text-dim)] text-xs">Loading photos…</div>}
          {!photosLoading && reports.length === 0 && (
            <div className="evidence-empty">
              <ImageOff size={16} strokeWidth={1.75} />
              No photos found.
            </div>
          )}
          {!photosLoading &&
            reports.map((r) => (
              <img key={r.id} src={r.photo_url} alt="Evidence" className="evidence-thumb" />
            ))}
        </div>

        <div className="detail-section-label">Mark resolved — upload after-photo</div>
        <div className="verify-dropzone" onClick={() => document.getElementById('verify-photo-input')?.click()}>
          {verifyPreview ? (
            <>
              <img src={verifyPreview} className="verify-preview-img" alt="After-cleanup preview" />
              <p className="text-xs text-[var(--text-muted)] mt-2">Tap to change photo</p>
            </>
          ) : (
            <>
              <Camera size={22} strokeWidth={1.75} />
              <p className="text-[13px] text-[var(--text-muted)] mt-1.5">
                Tap to upload after-cleanup photo — Gemini compares it against the original
              </p>
            </>
          )}
        </div>
        <input
          id="verify-photo-input"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onVerifyFileChange}
        />

        <Button full disabled={!hasVerifyFile} loading={verifying} onClick={onSubmitVerification}>
          {hasVerifyFile ? 'Submit for verification' : 'Upload a photo first'}
        </Button>
      </div>
    </div>
  );
}