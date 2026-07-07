import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type L from 'leaflet';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { API, ApiError } from '../api/client';
import { useLiveLocation } from '../hooks/useGeo';
import { timeAgo } from '../hooks/useGeo';
import {
  createDarkMap,
  createUserLocationMarker,
  useClusterMarkers,
} from '../components/mapUtils';
import {
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  STATUS_COLOR_VAR,
} from '../types/constants';
import type { ClusterOut, ReportOut, ReportStatus } from '../types';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

type FilterTab = '' | ReportStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: '', label: 'ALL' },
  { key: 'pending', label: 'PENDING' },
  { key: 'assigned', label: 'ASSIGNED' },
  { key: 'resolved', label: 'RESOLVED' },
];

export default function MunicipalDashboard() {
  const navigate = useNavigate();
  const { session, clearSession } = useSession();
  const { showToast } = useToast();
  const { coords } = useLiveLocation();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pollRef = useRef<number | null>(null);

  const [allClusters, setAllClusters] = useState<ClusterOut[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('');
  const [envAqi, setEnvAqi] = useState<string>('—');
  const [envPm25, setEnvPm25] = useState<string>('—');

  const [selectedCluster, setSelectedCluster] = useState<ClusterOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlace, setDetailPlace] = useState('Loading…');
  const [clusterReports, setClusterReports] = useState<ReportOut[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyPreview, setVerifyPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.role !== 'municipal') {
      navigate('/municipal/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize map + start polling
  useEffect(() => {
    if (!coords || !mapRef.current || mapInstanceRef.current) return;

    const map = createDarkMap(mapRef.current.id, coords, 13);
    mapInstanceRef.current = map;
    createUserLocationMarker(map, coords);

    loadEnvReadout(coords.latitude, coords.longitude);
    loadClusters();

    // Refresh queue + map every 20s so new citizen reports show up live
    pollRef.current = window.setInterval(loadClusters, 20000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  async function loadEnvReadout(lat: number, lng: number) {
    try {
      const matrix = await API.getGlobalMatrix(lat, lng);
      setEnvAqi(matrix.european_aqi != null ? String(matrix.european_aqi) : '—');
      setEnvPm25(matrix.ambient_pm25 != null ? `${matrix.ambient_pm25} µg/m³` : '—');
    } catch {
      /* env readout is supplementary — fail quietly */
    }
  }

  async function loadClusters() {
    try {
      const result = await API.listClusters();
      setAllClusters(result);
      setQueueError(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't load queue — check connection";
      setQueueError(msg);
    }
  }

  function openClusterDetail(cluster: ClusterOut) {
    void openDetail(cluster.id);
  }

  useClusterMarkers(mapInstanceRef.current, allClusters, openClusterDetail);

  async function openDetail(clusterId: string) {
    setDetailOpen(true);
    setDetailPlace('Loading…');
    setClusterReports([]);
    setVerifyFile(null);
    setVerifyPreview(null);
    setPhotosLoading(true);

    try {
      const cluster = await API.getCluster(clusterId);
      setSelectedCluster(cluster);

      const label = CATEGORY_LABELS[cluster.category] || cluster.category;

      API.getPlaceName(cluster.latitude, cluster.longitude)
        .then((place) => {
          setDetailPlace(
            place.display_name ? place.display_name.split(',').slice(0, 3).join(',') : `${label} report`,
          );
        })
        .catch(() => setDetailPlace(`${label} report`));

      loadClusterPhotos(clusterId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not load report details';
      showToast(msg);
      closeDetail();
    }
  }

  async function loadClusterPhotos(clusterId: string) {
    try {
      const reports = await API.getClusterReports(clusterId);
      setClusterReports(reports);
    } catch {
      setClusterReports([]);
    } finally {
      setPhotosLoading(false);
    }
  }

  function closeDetail() {
    setDetailOpen(false);
    setSelectedCluster(null);
  }

  async function updateStatus(status: ReportStatus) {
    if (!selectedCluster) return;
    try {
      await API.updateClusterStatus(selectedCluster.id, status);
      showToast(`Marked as ${status} ✅`);
      setSelectedCluster({ ...selectedCluster, status });
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not update status';
      showToast(msg);
    }
  }

  function confirmDelete() {
    if (!selectedCluster) return;
    if (!window.confirm('Delete this cluster permanently? This cannot be undone.')) return;
    void deleteCluster();
  }

  async function deleteCluster() {
    if (!selectedCluster) return;
    try {
      await API.deleteCluster(selectedCluster.id);
      showToast('Cluster deleted 🗑️');
      closeDetail();
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not delete cluster';
      showToast(msg);
    }
  }

  function handleVerifyFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVerifyFile(file);
    setVerifyPreview(URL.createObjectURL(file));
  }

  async function submitVerification() {
    if (!selectedCluster || !verifyFile) return;
    setVerifying(true);
    try {
      const result = await API.submitVerification(selectedCluster.id, verifyFile);
      showToast(
        result.verification_status === 'verified'
          ? '✅ Verified as resolved — citizens notified'
          : `Verification result: ${result.verification_status}`,
      );
      closeDetail();
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed';
      showToast(msg);
    } finally {
      setVerifying(false);
    }
  }

  function logout() {
    clearSession();
    navigate('/municipal/login');
  }

  const filtered = activeFilter ? allClusters.filter((c) => c.status === activeFilter) : allClusters;
  const sorted = [...filtered].sort((a, b) => b.severity_score - a.severity_score);
  const activeCount = allClusters.filter((c) => c.status !== 'resolved').length;

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen">
      {/* Top bar */}
      <div
        className="px-5 py-4 flex flex-col gap-3 z-20"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center text-base flex-shrink-0"
              style={{ background: 'var(--accent-live)' }}
            >
              🧹
            </div>
            <div>
              <h1 className="font-display text-base">Saaf Sarkar</h1>
              <div className="text-[11px] text-[var(--text-muted)] font-mono">
                {session?.department ? session.department.toUpperCase() : 'ALL DEPARTMENTS'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <ThemeToggle />
            <div
              className="text-xs text-[var(--text-dim)] cursor-pointer whitespace-nowrap"
              onClick={logout}
            >
              Sign out 🚪
            </div>
          </div>
        </div>

        {/* Environmental readout — its own row so it always has room and
            never competes with the brand/controls row above for space */}
        <div
          className="flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-mono w-fit"
          style={{
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span aria-hidden>🌫️</span>
          <span>
            AQI <b className="text-[var(--text-primary)]">{envAqi}</b>
          </span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span>
            PM2.5 <b className="text-[var(--text-primary)]">{envPm25}</b>
          </span>
        </div>
      </div>

      {/* Main split: map + queue */}
      <div className="relative overflow-hidden">
        <div id="municipal-map" ref={mapRef} className="absolute inset-0 z-[1]" />

        {/* Floating env readout on the map itself — transparent, no
            background chip, text-shadow for legibility over whatever
            tile colors sit underneath. The header above keeps its own
            solid pill version; this is the second, map-anchored one. */}
        <div
          className="absolute top-4 left-4 z-10 flex items-center gap-2.5 text-xs font-mono pointer-events-none"
        >
          <span style={{ color: 'var(--text-primary)', textShadow: '0 1px 3px var(--bg-base-scrim)' }}>
            AQI{' '}
            <b style={{ color: 'var(--accent-live)' }}>{envAqi}</b>
          </span>
          <span style={{ color: 'var(--text-muted)', textShadow: '0 1px 3px var(--bg-base-scrim)' }}>
            ·
          </span>
          <span style={{ color: 'var(--text-primary)', textShadow: '0 1px 3px var(--bg-base-scrim)' }}>
            PM2.5{' '}
            <b style={{ color: 'var(--accent-live)' }}>{envPm25}</b>
          </span>
        </div>

        {/* Queue panel */}
        <div
          className="absolute top-4 right-4 bottom-4 w-[380px] max-w-[calc(100vw-32px)] z-10 flex flex-col rounded-3xl overflow-hidden md:w-[380px] max-md:top-auto max-md:left-3 max-md:right-3 max-md:bottom-3 max-md:h-[42vh] max-md:w-auto"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="p-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-[15px]">Triage queue 🚦</h2>
              <span
                className="rounded-full font-mono text-xs font-semibold px-2.5 py-1"
                style={{ background: 'var(--accent-live-dim)', color: 'var(--accent-live)' }}
              >
                {activeCount} active
              </span>
            </div>
            <div className="flex gap-1.5">
              {FILTER_TABS.map((tab) => (
                <div
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className="flex-1 text-center rounded-[10px] py-2 px-1.5 text-[11px] font-semibold font-mono cursor-pointer"
                  style={{
                    background: activeFilter === tab.key ? 'var(--accent-live-dim)' : 'var(--bg-surface-raised)',
                    color: activeFilter === tab.key ? 'var(--accent-live)' : 'var(--text-muted)',
                    border: `1px solid ${activeFilter === tab.key ? 'var(--accent-live)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {tab.label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {queueError && (
              <div className="text-center py-8 px-4 text-[var(--text-muted)] text-sm">
                ⚠️ {queueError}
              </div>
            )}

            {!queueError && sorted.length === 0 && (
              <div className="text-center py-8 px-4 text-[var(--text-muted)] text-sm">
                No {activeFilter || ''} reports right now. 🌤️
              </div>
            )}

            {!queueError &&
              sorted.map((cluster) => (
                <div
                  key={cluster.id}
                  onClick={() => openDetail(cluster.id)}
                  className="rounded-3xl p-3 px-4 cursor-pointer border"
                  style={{
                    background: 'var(--bg-surface)',
                    borderColor:
                      selectedCluster?.id === cluster.id ? 'var(--border-strong)' : 'transparent',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-bold">
                      {CATEGORY_EMOJI[cluster.category]} {CATEGORY_LABELS[cluster.category]}
                    </div>
                    <div className="text-[10px] text-[var(--text-dim)] font-mono">
                      {timeAgo(cluster.created_at)}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 rounded-full font-mono text-xs font-semibold px-2.5 py-1"
                    style={{
                      color: STATUS_COLOR_VAR[cluster.status],
                      background: `color-mix(in srgb, ${STATUS_COLOR_VAR[cluster.status]} 15%, transparent)`,
                    }}
                  >
                    {cluster.status.toUpperCase()}
                  </span>
                  <div className="flex gap-3 text-[11px] text-[var(--text-muted)] mt-2 font-mono">
                    <span>📋 {cluster.report_count}</span>
                    <span>
                      📍 {cluster.latitude.toFixed(3)}, {cluster.longitude.toFixed(3)}
                    </span>
                  </div>
                  <div
                    className="h-1 rounded-full mt-2 overflow-hidden"
                    style={{ background: 'var(--bg-surface-raised)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${cluster.severity_score}%`,
                        background: STATUS_COLOR_VAR[cluster.status],
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Detail sheet */}
      {detailOpen && selectedCluster && (
        <div
          className="fixed left-0 right-0 bottom-0 z-30 flex flex-col transition-transform duration-300"
          style={{ maxHeight: '85vh', transform: 'translateY(0)' }}
        >
          <div
            className="overflow-y-auto px-5 pb-8"
            style={{
              background: 'var(--bg-sheet)',
              backdropFilter: 'blur(20px)',
              borderRadius: '24px 24px 0 0',
              borderTop: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-sheet)',
            }}
          >
            <div
              className="w-9 h-1 rounded-full mx-auto my-3 cursor-pointer"
              style={{ background: 'var(--border-strong)' }}
              onClick={closeDetail}
            />
            <div className="flex justify-between items-start py-4">
              <div>
                <span
                  className="inline-flex items-center gap-1 rounded-full font-mono text-xs font-semibold px-2.5 py-1 mb-2"
                  style={{
                    color: `var(--cat-${selectedCluster.category})`,
                    background: `color-mix(in srgb, var(--cat-${selectedCluster.category}) 15%, transparent)`,
                  }}
                >
                  {CATEGORY_EMOJI[selectedCluster.category]} {CATEGORY_LABELS[selectedCluster.category]}
                </span>
                <h2 className="font-display text-xl">{detailPlace}</h2>
                <div className="eyebrow mt-1">
                  {selectedCluster.latitude.toFixed(5)}, {selectedCluster.longitude.toFixed(5)}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-sm flex-shrink-0"
                style={{ background: 'var(--bg-surface-raised)' }}
                onClick={closeDetail}
              >
                ✕
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--bg-surface-raised)' }}>
                <div className="font-mono text-lg font-bold">{selectedCluster.severity_score}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-0.5">
                  Severity
                </div>
              </div>
              <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--bg-surface-raised)' }}>
                <div className="font-mono text-lg font-bold">{selectedCluster.report_count}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-0.5">
                  Reports
                </div>
              </div>
              <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--bg-surface-raised)' }}>
                <div className="font-mono text-lg font-bold">{selectedCluster.status.toUpperCase()}</div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mt-0.5">
                  Status
                </div>
              </div>
            </div>

            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Update status
            </div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <Button variant="secondary" className="text-xs py-2.5 px-2" onClick={() => updateStatus('pending')}>
                🟠 Pending
              </Button>
              <Button variant="secondary" className="text-xs py-2.5 px-2" onClick={() => updateStatus('assigned')}>
                🔵 Assigned
              </Button>
              <Button variant="danger" className="text-xs py-2.5 px-2" onClick={confirmDelete}>
                🗑️ Delete
              </Button>
            </div>

            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Evidence photos
            </div>
            <div className="flex gap-2 overflow-x-auto mb-5 pb-1">
              {photosLoading && (
                <div className="text-[var(--text-dim)] text-xs">Loading photos…</div>
              )}
              {!photosLoading && clusterReports.length === 0 && (
                <div className="text-[var(--text-dim)] text-xs">No photos found.</div>
              )}
              {!photosLoading &&
                clusterReports.map((r) => (
                  <img
                    key={r.id}
                    src={r.photo_url}
                    alt="Evidence"
                    className="w-[100px] h-[100px] object-cover rounded-2xl flex-shrink-0"
                    style={{ border: '1px solid var(--border-subtle)' }}
                  />
                ))}
            </div>

            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              Mark resolved — upload after-photo
            </div>
            <div
              className="rounded-2xl p-4 text-center cursor-pointer mb-4"
              style={{ border: '1.5px dashed var(--border-strong)' }}
              onClick={() => document.getElementById('verify-photo-input')?.click()}
            >
              {verifyPreview ? (
                <>
                  <img
                    src={verifyPreview}
                    className="w-full max-h-[140px] object-cover rounded-xl"
                    alt="After-cleanup preview"
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-2">Tap to change photo</p>
                </>
              ) : (
                <>
                  <div className="text-2xl mb-1.5">📸</div>
                  <p className="text-[13px] text-[var(--text-muted)]">
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
              onChange={handleVerifyFileChange}
            />

            <Button full disabled={!verifyFile || verifying} onClick={submitVerification}>
              {verifying ? (
                <>
                  <span className="spinner" /> Verifying with Gemini…
                </>
              ) : verifyFile ? (
                'Submit for verification ✅'
              ) : (
                'Upload a photo first'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}