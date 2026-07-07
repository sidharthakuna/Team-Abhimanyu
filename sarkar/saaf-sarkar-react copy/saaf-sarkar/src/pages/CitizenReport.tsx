import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { API, ApiError } from '../api/client';
import { useLiveLocation, FALLBACK_LOCATION } from '../hooks/useGeo';
import { createDarkMap, createUserLocationMarker, flyToLocation, useClusterMarkers } from '../components/mapUtils';
import { CATEGORY_LIST, CATEGORY_EMOJI, CATEGORY_LABELS } from '../types/constants';
import type { ClusterOut, IssueCategory } from '../types';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

export default function CitizenReport() {
  const navigate = useNavigate();
  const { session, clearSession } = useSession();
  const { showToast } = useToast();
  const { coords, isFallback } = useLiveLocation();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const [clusters, setClusters] = useState<ClusterOut[]>([]);
  const [locationName, setLocationName] = useState('Locating…');
  const [envAqi, setEnvAqi] = useState<string>('—');
  const [envPm25, setEnvPm25] = useState<string>('—');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IssueCategory | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect to login if no phone number captured yet
  useEffect(() => {
    if (!session || session.role !== 'citizen' || !session.phoneNumber) {
      navigate('/citizen/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize map once we have coordinates
  useEffect(() => {
    if (!coords || !mapRef.current || mapInstanceRef.current) return;

    if (isFallback) showToast('Location unavailable — showing demo area 🗺️');

    const map = createDarkMap(mapRef.current.id, coords, 16);
    mapInstanceRef.current = map;
    userMarkerRef.current = createUserLocationMarker(map, coords);

    loadClusters();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  // Keep the user marker following live position updates
  useEffect(() => {
    if (coords && userMarkerRef.current) {
      userMarkerRef.current.setLatLng([coords.latitude, coords.longitude]);
    }
    if (coords) {
      updateLocationName(coords.latitude, coords.longitude);
      loadEnvReadout(coords.latitude, coords.longitude);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.latitude, coords?.longitude]);

  async function updateLocationName(lat: number, lng: number) {
    try {
      const place = await API.getPlaceName(lat, lng);
      const name = place.display_name
        ? place.display_name.split(',').slice(0, 2).join(',')
        : 'Unknown area';
      setLocationName(name);
    } catch {
      setLocationName('Location found');
    }
  }

  async function loadEnvReadout(lat: number, lng: number) {
    try {
      const matrix = await API.getGlobalMatrix(lat, lng);
      setEnvAqi(matrix.european_aqi != null ? String(matrix.european_aqi) : '—');
      setEnvPm25(matrix.ambient_pm25 != null ? `${matrix.ambient_pm25} µg/m³` : '—');
    } catch {
      /* env readout is supplementary — fail quietly, same as the
         municipal dashboard's identical call */
    }
  }

  async function loadClusters() {
    try {
      const result = await API.listClusters();
      setClusters(result);
    } catch (err) {
      // Non-fatal — nearby dots are supplementary context, not required
      // for submitting a report, so fail quietly here.
      console.warn('Could not load nearby clusters', err);
    }
  }

  function showClusterPopup(cluster: ClusterOut) {
    if (!mapInstanceRef.current) return;
    const label = CATEGORY_LABELS[cluster.category] || cluster.category;
    L.popup()
      .setLatLng([cluster.latitude, cluster.longitude])
      .setContent(
        `<div style="font-family: var(--font-body); min-width:160px;">
          <h4 style="font-size:13px;margin:0 0 6px;font-family: var(--font-display);">${label}</h4>
          <div style="font-size:11px;color:var(--text-muted);font-family: var(--font-mono);">
            ${cluster.report_count} report${cluster.report_count === 1 ? '' : 's'} · severity ${cluster.severity_score}
          </div>
          <div style="font-size:11px;color:var(--text-muted);font-family: var(--font-mono);margin-top:4px;text-transform:uppercase;">
            ${cluster.status}
          </div>
        </div>`,
      )
      .openOn(mapInstanceRef.current);
  }

  useClusterMarkers(mapInstanceRef.current, clusters, showClusterPopup);

  function recenterOnMe() {
    if (!coords || !mapInstanceRef.current) return;
    flyToLocation(mapInstanceRef.current, coords, 16);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submitReport() {
    if (!selectedCategory) {
      showToast("Pick what kind of issue this is 🗂️");
      return;
    }
    if (!photoFile) {
      showToast('Add a photo — it helps us verify the report 📷');
      return;
    }
    const activeCoords = coords || FALLBACK_LOCATION;

    setSubmitting(true);
    try {
      await API.createReport({
        latitude: activeCoords.latitude,
        longitude: activeCoords.longitude,
        phoneNumber: session?.phoneNumber || '0000000000',
        description: description.trim() || undefined,
        photoFile,
      });
      showToast('Report submitted — thank you 🙌');
      setTimeout(() => navigate('/citizen/track'), 900);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong, try again';
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    clearSession();
    navigate('/citizen/login');
  }

  const nearbyCount = clusters.length;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div id="citizen-map" ref={mapRef} className="absolute inset-0 z-0" />

      {/* Top bar */}
      <div
        className="fixed top-0 left-0 right-0 z-10 p-4 pb-6 flex justify-between items-start pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, var(--bg-base-scrim), transparent)' }}
      >
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-mono"
          style={{
            background: 'var(--bg-sheet)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent-live)' }}
          />
          LIVE — {nearbyCount} nearby
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <div
            className="rounded-full px-3.5 py-2.5 text-xs cursor-pointer"
            style={{
              background: 'var(--bg-sheet)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
            onClick={logout}
          >
            Sign out 🚪
          </div>
          <ThemeToggle />
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg cursor-pointer border-none"
            style={{
              background: 'var(--bg-sheet)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-subtle)',
            }}
            onClick={() => navigate('/citizen/track')}
          >
            📋
          </button>
        </div>
      </div>

      {/* Second header: env readout, floating directly over the map with
          no background chip — pure text + text-shadow for legibility
          against whatever tile colors sit underneath, since there's no
          solid backing to guarantee contrast the way the pills above have. */}
      <div
        className="fixed left-4 z-10 flex items-center gap-2.5 text-xs font-mono pointer-events-none"
        style={{ top: 68 }}
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

      {/* Recenter FAB */}
      <button
        className="fixed right-4 z-10 w-12 h-12 rounded-full flex items-center justify-center text-xl cursor-pointer border-none transition-[bottom] duration-250"
        style={{
          background: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-card)',
          bottom: sheetExpanded ? 'calc(78vh + 16px)' : '160px',
        }}
        onClick={recenterOnMe}
      >
        🎯
      </button>

      {/* Bottom sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 flex flex-col transition-transform duration-300"
        style={{
          maxHeight: '78vh',
          transform: sheetExpanded ? 'translateY(0)' : 'translateY(calc(100% - 132px))',
          transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div
          className="flex flex-col overflow-hidden"
          style={{
            background: 'var(--bg-sheet)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px 24px 0 0',
            borderTop: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-sheet)',
            maxHeight: '78vh',
          }}
        >
          <div
            className="w-9 h-1 rounded-full mx-auto my-3 cursor-pointer"
            style={{ background: 'var(--border-strong)' }}
            onClick={() => setSheetExpanded((v) => !v)}
          />
          <div
            className="px-5 pb-4 flex justify-between items-center cursor-pointer"
            onClick={() => setSheetExpanded((v) => !v)}
          >
            <div>
              <h3 className="text-base font-bold mb-0.5">Spotted something? 👀</h3>
              <p className="text-xs text-[var(--text-muted)] font-mono">{locationName}</p>
            </div>
            <div
              className="rounded-full px-5 py-3 font-bold text-sm flex items-center gap-1.5"
              style={{ background: 'var(--accent-live)', color: '#0B0F0D' }}
            >
              Report ＋
            </div>
          </div>

          <div className="px-5 pb-6 overflow-y-auto">
            <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
              What's the issue?
            </label>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {CATEGORY_LIST.map((cat) => (
                <div
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className="rounded-2xl text-center cursor-pointer text-xs font-semibold py-3 px-2 transition-colors"
                  style={{
                    background:
                      selectedCategory === cat ? 'var(--accent-live-dim)' : 'var(--bg-surface-raised)',
                    border: `1.5px solid ${selectedCategory === cat ? 'var(--accent-live)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <span className="text-xl block mb-1">{CATEGORY_EMOJI[cat]}</span>
                  {CATEGORY_LABELS[cat]}
                </div>
              ))}
            </div>

            <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
              Photo evidence
            </label>
            <div
              className="rounded-2xl text-center cursor-pointer mb-5 relative overflow-hidden"
              style={{
                border: '1.5px dashed var(--border-strong)',
                padding: photoPreview ? 0 : 'var(--sp-5)',
                minHeight: photoPreview ? 140 : undefined,
              }}
              onClick={() => document.getElementById('citizen-photo-input')?.click()}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Evidence preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div>
                  <div className="text-[28px] mb-2">📷</div>
                  <p className="text-[13px] text-[var(--text-muted)]">Tap to add a photo</p>
                </div>
              )}
            </div>
            <input
              id="citizen-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />

            <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
              Location
            </label>
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5 text-sm"
              style={{ background: 'var(--bg-surface-raised)' }}
            >
              <span>📍</span>
              <div>
                <div>{locationName}</div>
                <div className="font-mono text-[var(--text-muted)] text-[11px]">
                  {coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : '—'}
                </div>
              </div>
            </div>

            <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
              Add a note (optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Overflowing bin near the bus stop, been here 3 days"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none mb-5 resize-none"
              style={{
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />

            <Button full onClick={submitReport} disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Submit report 🚀'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}