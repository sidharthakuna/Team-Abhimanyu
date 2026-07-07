import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type L from 'leaflet';
import { Layers, LogOut, Wind } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API, ApiError } from '../api/client';
import { useLiveLocation } from '../hooks/useGeo';
import { createDarkMap, createUserLocationMarker, useClusterMarkers } from '../components/mapUtils';
import type { ClusterOut, ReportOut, ReportStatus } from '../types';
import { ThemeToggle } from '../components/ThemeToggle';
import { AqiReadout } from '../components/AqiReadout';
import { QueueCard } from '../components/QueueCard';
import { ClusterDetailSheet } from '../components/ClusterDetailSheet';

type FilterTab = '' | ReportStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: '', label: 'ALL' },
  { key: 'pending', label: 'PENDING' },
  { key: 'assigned', label: 'ASSIGNED' },
  { key: 'resolved', label: 'RESOLVED' },
];

export default function MunicipalDashboard() {
  const navigate = useNavigate();
  const { session, hydrated, logout } = useAuth();
  const { showToast } = useToast();
  const { coords } = useLiveLocation();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pollRef = useRef<number | null>(null);

  const [allClusters, setAllClusters] = useState<ClusterOut[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('');
  const [envAqi, setEnvAqi] = useState<number | null>(null);
  const [envPm25, setEnvPm25] = useState<number | null>(null);

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
    if (!hydrated) return;
    if (!session || session.role !== 'municipal') {
      navigate('/municipal/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session]);

  useEffect(() => {
    if (!coords || !mapRef.current || mapInstanceRef.current) return;

    const map = createDarkMap(mapRef.current.id, coords, 13);
    mapInstanceRef.current = map;
    createUserLocationMarker(map, coords);

    loadEnvReadout(coords.latitude, coords.longitude);
    loadClusters();

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
      setEnvAqi(matrix.european_aqi);
      setEnvPm25(matrix.ambient_pm25);
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

      API.getPlaceName(cluster.latitude, cluster.longitude)
        .then((place) => {
          setDetailPlace(place.display_name ? place.display_name.split(',').slice(0, 3).join(',') : 'Report location');
        })
        .catch(() => setDetailPlace('Report location'));

      loadClusterPhotos(clusterId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not load report details';
      showToast(msg, 'error');
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
      showToast(`Marked as ${status}`, 'success');
      setSelectedCluster({ ...selectedCluster, status });
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not update status';
      showToast(msg, 'error');
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
      showToast('Cluster deleted', 'success');
      closeDetail();
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not delete cluster';
      showToast(msg, 'error');
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
          ? 'Verified as resolved — citizens notified'
          : `Verification result: ${result.verification_status}`,
        'success',
      );
      closeDetail();
      await loadClusters();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Verification failed';
      showToast(msg, 'error');
    } finally {
      setVerifying(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/municipal/login');
  }

  const filtered = activeFilter ? allClusters.filter((c) => c.status === activeFilter) : allClusters;
  const sorted = [...filtered].sort((a, b) => b.severity_score - a.severity_score);
  const activeCount = allClusters.filter((c) => c.status !== 'resolved').length;

  return (
    <div className="grid grid-rows-[auto_1fr] h-screen">
      <div className="municipal-topbar">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="brand-mark-sm">
              <Wind size={17} strokeWidth={2.25} />
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
            <button className="chip-btn" onClick={handleLogout}>
              <LogOut size={14} strokeWidth={2.25} />
              Sign out
            </button>
          </div>
        </div>

        <AqiReadout aqi={envAqi} pm25={envPm25} variant="pill" />
      </div>

      <div className="relative overflow-hidden">
        <div id="municipal-map" ref={mapRef} className="absolute inset-0 z-[1]" />

        <div className="municipal-map-overlay">
          <AqiReadout aqi={envAqi} pm25={envPm25} variant="overlay" />
        </div>

        <div className="queue-panel">
          <div className="queue-panel-head">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-[15px] inline-flex items-center gap-1.5">
                <Layers size={15} strokeWidth={2.25} />
                Triage queue
              </h2>
              <span className="active-count-badge">{activeCount} active</span>
            </div>
            <div className="filter-tabs">
              {FILTER_TABS.map((tab) => (
                <div
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`filter-tab ${activeFilter === tab.key ? 'filter-tab--active' : ''}`}
                >
                  {tab.label}
                </div>
              ))}
            </div>
          </div>

          <div className="queue-panel-list">
            {queueError && <div className="queue-empty">{queueError}</div>}

            {!queueError && sorted.length === 0 && (
              <div className="queue-empty">No {activeFilter || ''} reports right now.</div>
            )}

            {!queueError &&
              sorted.map((cluster) => (
                <QueueCard
                  key={cluster.id}
                  cluster={cluster}
                  selected={selectedCluster?.id === cluster.id}
                  onClick={() => openDetail(cluster.id)}
                />
              ))}
          </div>
        </div>
      </div>

      {detailOpen && selectedCluster && (
        <ClusterDetailSheet
          cluster={selectedCluster}
          placeName={detailPlace}
          reports={clusterReports}
          photosLoading={photosLoading}
          onClose={closeDetail}
          onUpdateStatus={updateStatus}
          onDelete={confirmDelete}
          verifyPreview={verifyPreview}
          onVerifyFileChange={handleVerifyFileChange}
          onSubmitVerification={submitVerification}
          verifying={verifying}
          hasVerifyFile={!!verifyFile}
        />
      )}
    </div>
  );
}