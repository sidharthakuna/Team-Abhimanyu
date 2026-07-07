import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { API, ApiError } from '../api/client';
import { timeAgo } from '../hooks/useGeo';
import { CategoryTag } from '../components/Card';
import { STATUS_COLOR_VAR } from '../types/constants';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import type { ClusterOut } from '../types';

export default function CitizenTrack() {
  const navigate = useNavigate();
  const { session } = useSession();

  const [clusters, setClusters] = useState<ClusterOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.role !== 'citizen') {
      navigate('/citizen/login');
      return;
    }
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      // The backend doesn't expose a "my reports by phone" filter yet, so
      // this shows the live queue end-to-end. Once a phone-scoped filter
      // lands server-side (GET /api/reports/clusters?phone=), swap this
      // for that call.
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
      <div
        className="px-5 py-5 pb-4 flex items-center gap-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer border-none"
          style={{ background: 'var(--bg-surface)' }}
          onClick={() => navigate('/citizen/report')}
        >
          ←
        </button>
        <h1 className="font-display text-xl flex-1">Your reports 📋</h1>
        <ThemeToggle />
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-4xl mb-4 opacity-60">⚠️</div>
            <h3 className="mb-2 font-semibold">Couldn't load reports</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">{error}</p>
            <Button variant="secondary" onClick={loadReports}>
              Try again 🔄
            </Button>
          </div>
        )}

        {!loading && !error && clusters.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-4xl mb-4 opacity-60">🗺️</div>
            <h3 className="mb-2 font-semibold">No reports yet</h3>
            <p className="text-[var(--text-muted)] text-sm mb-5">
              Once you report an issue, you'll see its status here as it moves from spotted to
              fixed. ✨
            </p>
            <Button onClick={() => navigate('/citizen/report')}>Report an issue 📸</Button>
          </div>
        )}

        {!loading &&
          !error &&
          clusters.map((cluster) => (
            <div
              key={cluster.id}
              className="rounded-3xl border flex items-start gap-3 p-4"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                className="w-[3px] self-stretch rounded-full flex-shrink-0"
                style={{ background: STATUS_COLOR_VAR[cluster.status] }}
              />
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <CategoryTag category={cluster.category} />
                  <div className="text-[11px] text-[var(--text-dim)] font-mono">
                    {timeAgo(cluster.created_at)}
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-[var(--text-muted)] mt-2">
                  <span>
                    📋 {cluster.report_count} report{cluster.report_count === 1 ? '' : 's'}
                  </span>
                  <span>⚡ severity {cluster.severity_score}</span>
                </div>
              </div>
            </div>
          ))}
      </div>

      {!loading && !error && clusters.length > 0 && (
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center text-2xl cursor-pointer border-none z-10"
          style={{
            background: 'var(--accent-live)',
            color: '#0B0F0D',
            boxShadow: 'var(--shadow-card)',
          }}
          onClick={() => navigate('/citizen/report')}
        >
          ＋
        </button>
      )}
    </div>
  );
}