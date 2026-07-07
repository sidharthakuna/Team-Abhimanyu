import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ClipboardList, MapPinned, Plus, RotateCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API, ApiError } from '../api/client';
import { timeAgo } from '../hooks/useGeo';
import { CategoryTag } from '../components/Card';
import { STATUS_COLOR_VAR } from '../types/constants';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import type { ClusterOut } from '../types';

export default function CitizenTrack() {
  const navigate = useNavigate();
  const { session, hydrated } = useAuth();

  const [clusters, setClusters] = useState<ClusterOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!session || session.role !== 'citizen') {
      navigate('/citizen/login');
      return;
    }
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session]);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      // The backend doesn't expose a "my reports by email" filter yet, so
      // this shows the live queue end-to-end. If a scoped filter lands
      // server-side (GET /api/reports/clusters?email=), swap this call.
      const result = await API.listClusters();
      setClusters(result);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Check your connection and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="track-header">
        <button className="icon-fab-sm" onClick={() => navigate('/citizen/report')} aria-label="Back to map">
          <ArrowLeft size={16} strokeWidth={2.25} />
        </button>
        <h1 className="font-display text-xl flex-1">Your reports</h1>
        <ThemeToggle />
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="empty-state">
            <AlertTriangle size={36} strokeWidth={1.5} className="empty-state-icon" />
            <h3 className="mb-2 font-semibold">Couldn't load reports</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">{error}</p>
            <Button variant="secondary" onClick={loadReports}>
              <RotateCw size={15} strokeWidth={2.25} />
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && clusters.length === 0 && (
          <div className="empty-state">
            <MapPinned size={36} strokeWidth={1.5} className="empty-state-icon" />
            <h3 className="mb-2 font-semibold">No reports yet</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              Once you report an issue, you'll see its status here as it moves from spotted to
              fixed.
            </p>
            <Button onClick={() => navigate('/citizen/report')}>
              <Plus size={16} strokeWidth={2.25} />
              Report an issue
            </Button>
          </div>
        )}

        {!loading &&
          !error &&
          clusters.map((cluster) => (
            <div key={cluster.id} className="track-card">
              <div className="track-card-rail" style={{ background: STATUS_COLOR_VAR[cluster.status] }} />
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <CategoryTag category={cluster.category} />
                  <div className="text-[11px] text-[var(--text-dim)] font-mono">
                    {timeAgo(cluster.created_at)}
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-[var(--text-muted)] mt-2">
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList size={12} strokeWidth={2.25} />
                    {cluster.report_count} report{cluster.report_count === 1 ? '' : 's'}
                  </span>
                  <span>Severity {cluster.severity_score}</span>
                </div>
              </div>
            </div>
          ))}
      </div>

      {!loading && !error && clusters.length > 0 && (
        <button className="fab-add" onClick={() => navigate('/citizen/report')} aria-label="Report an issue">
          <Plus size={26} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}