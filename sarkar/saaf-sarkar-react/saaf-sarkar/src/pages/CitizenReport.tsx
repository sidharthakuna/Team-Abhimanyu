import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { ClipboardList, LogOut, Radio, Target } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API, ApiError } from '../api/client';
import { useLiveLocation, FALLBACK_LOCATION, describeFallbackReason } from '../hooks/useGeo';
import { useForecastAt } from '../forecast-by-cluster/useForecast';
import {
  createDarkMap,
  createUserLocationMarker,
  flyToLocation,
  useClusterMarkers,
  useMapTapToPick,
  usePickedLocationMarker,
} from '../components/mapUtils';
import { CATEGORY_LABELS } from '../types/constants';
import type { ClusterOut, Coords, IssueCategory } from '../types';
import { ThemeToggle } from '../components/ThemeToggle';
import { AqiReadout } from '../components/AqiReadout';
import { ForecastChart } from '../components/ForecastChart';
import { ReportSheet } from '../components/ReportSheet';

export default function CitizenReport() {
  const navigate = useNavigate();
  const { session, hydrated, authHeader, logout } = useAuth();
  const { showToast } = useToast();
  const { coords: liveCoords, isFallback, fallbackReason } = useLiveLocation();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // hasCenteredOnLoad guards the ONE-TIME auto-fly-to-live-location that
  // happens right when the map first mounts. Without this guard, every
  // subsequent liveCoords update (GPS ticks every few seconds via
  // watchPosition in useGeo.ts) would also trigger a flyTo, yanking the
  // map out from under a citizen who has since panned around or tapped
  // somewhere else. We want "center on me once when the page opens,"
  // not "keep recentering forever."
  const hasCenteredOnLoad = useRef(false);

  // BUG FIX: the first getCurrentPosition() fix is frequently a rough,
  // low-accuracy read (Wi-Fi/IP triangulation) that resolves fast, with
  // a much better GPS-locked fix arriving a few seconds later via
  // watchPosition. The map used to center ONCE on whichever fix existed
  // at mount time and never again — so a citizen would see the pulse
  // dot correctly tracking their real position while the map itself
  // stayed centered on that first, wrong guess, drifting apart from the
  // dot exactly like the screenshot showed.
  //
  // hasDoneAccuracyRecenter tracks whether we've already done this
  // one-time "accuracy improved, recenter once more" jump, so we don't
  // recenter forever as accuracy fluctuates tick to tick (a citizen
  // panning away to look at a hotspot elsewhere would otherwise get
  // yanked back mid-pan).
  const hasDoneAccuracyRecenter = useRef(false);
  const bestAccuracySoFar = useRef<number | null>(null);

  const [clusters, setClusters] = useState<ClusterOut[]>([]);

  // pickedCoords is the actual "where should this report be filed"
  // location. null means "nothing picked yet — fall back to live GPS."
  // Set by: (a) tapping the map, or cleared back to null by the
  // "Use my current location" button, which re-syncs it to live GPS
  // explicitly rather than just clearing it (see useCurrentLocation()
  // below) so the pin visibly snaps back rather than disappearing.
  const [pickedCoords, setPickedCoords] = useState<Coords | null>(null);

  // The coordinates actually used for: the report submission, the
  // address field, and the env/forecast readouts. This is the single
  // source of truth the rest of the page reads from — everything else
  // computes off of this, not off liveCoords or pickedCoords directly.
  const activeCoords = pickedCoords ?? liveCoords ?? null;

  const [locationName, setLocationName] = useState('Locating…');
  // Tracks whether the citizen has hand-edited the address field. Once
  // true, we stop auto-overwriting it on every location change — the
  // whole point of "auto-filled but editable" is that editing wins.
  const [addressEdited, setAddressEdited] = useState(false);

  const [envAqi, setEnvAqi] = useState<number | null>(null);
  const [envPm25, setEnvPm25] = useState<number | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IssueCategory | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForecast, setShowForecast] = useState(false);

  const { forecast, loading: forecastLoading } = useForecastAt(
    activeCoords?.latitude,
    activeCoords?.longitude,
    24,
  );

  // Only redirect once we've actually checked localStorage for a
  // persisted token — otherwise a valid returning session gets bounced
  // to /login for a frame before hydration finishes.
  useEffect(() => {
    if (!hydrated) return;
    if (!session || session.role !== 'citizen') {
      navigate('/citizen/login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session]);

  // BUG FIX: this used to show a single generic "Location unavailable —
  // showing demo area" toast, unconditionally, with no way to tell a
  // citizen WHY — a blocked permission and a one-off timeout look
  // identical in the old message, even though one needs a browser
  // settings change and the other might just need a retry. This now
  // reads the actual failure reason from useLiveLocation's
  // fallbackReason and shows the specific, actionable sentence for it.
  // Runs once when isFallback/fallbackReason first settle, not tied to
  // map creation, so it fires even if the map effect below is delayed.
  const hasShownFallbackToast = useRef(false);
  useEffect(() => {
    if (!isFallback || hasShownFallbackToast.current) return;
    hasShownFallbackToast.current = true;
    showToast(describeFallbackReason(fallbackReason), 'error', 6000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFallback, fallbackReason]);

  // Map creation — happens once, as soon as we have SOME coords to
  // center on (live or fallback) and the DOM node exists.
  useEffect(() => {
    if (!liveCoords || !mapRef.current || mapInstanceRef.current) return;

    const map = createDarkMap(mapRef.current.id, liveCoords, 16);
    mapInstanceRef.current = map;
    userMarkerRef.current = createUserLocationMarker(map, liveCoords);
    hasCenteredOnLoad.current = true;

    loadClusters();

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      hasCenteredOnLoad.current = false;
      hasDoneAccuracyRecenter.current = false;
      bestAccuracySoFar.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCoords]);

  // Live-location updates: move the "you are here" pulse dot as GPS
  // ticks in. Deliberately does NOT unconditionally call flyToLocation
  // here — that would fight with the citizen panning the map to look at
  // a hotspot elsewhere on every single GPS tick. Continuous, ongoing
  // recentering belongs to "Use my current location," a deliberate
  // action — but see the one-time accuracy-correction exception below.
  useEffect(() => {
    if (liveCoords && userMarkerRef.current) {
      userMarkerRef.current.setLatLng([liveCoords.latitude, liveCoords.longitude]);
    }

    // ONE-TIME CORRECTIVE RECENTER: if this new fix is meaningfully more
    // accurate than anything we've seen so far (accuracy in meters, so
    // SMALLER is better), and we haven't already done this correction
    // once, snap the map to it. This is what fixes the "dot is right,
    // map center is wrong" drift: it catches the case where the very
    // first fix used to center the map on mount was a rough estimate,
    // and a real GPS lock (usually accuracy < ~50m vs. an initial
    // Wi-Fi-based fix often > 500-1000m) arrives a few seconds later.
    //
    // Guarded so it only ever fires once per page load — after that,
    // recentering is the citizen's call via the target button, exactly
    // like every other tick.
    if (
      liveCoords?.accuracy != null &&
      !hasDoneAccuracyRecenter.current &&
      mapInstanceRef.current
    ) {
      const isFirstReading = bestAccuracySoFar.current == null;
      const isMeaningfullyBetter =
        bestAccuracySoFar.current != null && liveCoords.accuracy < bestAccuracySoFar.current * 0.5;

      if (isFirstReading) {
        bestAccuracySoFar.current = liveCoords.accuracy;
      } else if (isMeaningfullyBetter) {
        bestAccuracySoFar.current = liveCoords.accuracy;
        // Only recenter if the citizen hasn't already tapped a location
        // — a correction snapping the map away from a pin they just
        // dropped would be far more confusing than the original bug.
        if (!pickedCoords) {
          flyToLocation(mapInstanceRef.current, liveCoords, 16);
        }
        hasDoneAccuracyRecenter.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCoords?.latitude, liveCoords?.longitude, liveCoords?.accuracy]);

  // Tap-to-pick: registers the map click handler once the map exists.
  // Picking a new spot also means "the address field should reset to
  // auto-filled mode" — a fresh pick should show the reverse-geocoded
  // name for THAT spot, not keep whatever the citizen had typed for a
  // previous spot.
  useMapTapToPick(mapInstanceRef.current, (coords) => {
    setPickedCoords(coords);
    setAddressEdited(false);
  });

  // Renders/moves the picked-location drop-pin marker whenever
  // pickedCoords changes. When pickedCoords is null (nothing picked, or
  // reset via "use my current location"), the hook removes the pin —
  // the live pulse-dot alone represents the location in that state.
  usePickedLocationMarker(mapInstanceRef.current, pickedCoords);

  // Whenever the active location changes (live GPS tick with nothing
  // picked, OR a fresh tap), refresh the address + env readout for that
  // exact spot — but only overwrite the address text if the citizen
  // hasn't hand-edited it since the last location change.
  useEffect(() => {
    if (!activeCoords) return;
    if (!addressEdited) {
      updateLocationName(activeCoords.latitude, activeCoords.longitude);
    }
    loadEnvReadout(activeCoords.latitude, activeCoords.longitude);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoords?.latitude, activeCoords?.longitude]);

  async function updateLocationName(lat: number, lng: number) {
    try {
      const place = await API.getPlaceName(lat, lng);
      const name = place.display_name
        ? place.display_name.split(',').slice(0, 4).join(',').trim()
        : 'Unknown area';
      setLocationName(name);
    } catch {
      setLocationName('Location found');
    }
  }

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
      setClusters(result);
    } catch (err) {
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

  // "Use my current location" — the one deliberate recenter action.
  //
  // BUG FIX: this used to only call setPickedCoords(null) and
  // setAddressEdited(false), then rely on the [activeCoords] effect
  // above to notice the change and refresh the address box + env
  // readout. That works fine when pickedCoords was previously
  // non-null (tapped a spot, then tapped the button) — activeCoords
  // genuinely changes from "tapped spot" to "live GPS", so the effect
  // reruns.
  //
  // But the FIRST time a citizen taps this button — before they've
  // ever tapped the map — pickedCoords is ALREADY null. Setting it to
  // null again is a no-op as far as React state is concerned, so
  // activeCoords doesn't change, so that effect never reruns, so
  // updateLocationName/loadEnvReadout never fire again. The map would
  // visibly fly to the right spot (flyToLocation always runs
  // imperatively below) but the address box and lat/long readout could
  // sit stale on "Locating…" or an outdated value.
  //
  // Fix: make this function directly own refreshing the address text
  // and env readout using liveCoords, instead of hoping a downstream
  // effect notices a state change. It still resets pickedCoords/
  // addressEdited so future GPS ticks and re-renders behave exactly as
  // before — this just removes the dependency on a diff existing for
  // the very first call.
  function useCurrentLocation() {
    if (!liveCoords) {
      showToast('Still finding your location…', 'default');
      return;
    }
    setPickedCoords(null);
    setAddressEdited(false);
    updateLocationName(liveCoords.latitude, liveCoords.longitude);
    loadEnvReadout(liveCoords.latitude, liveCoords.longitude);
    if (mapInstanceRef.current) {
      flyToLocation(mapInstanceRef.current, liveCoords, 16);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleAddressChange(value: string) {
    setLocationName(value);
    setAddressEdited(true);
  }

  async function submitReport() {
    if (!selectedCategory) {
      showToast('Pick what kind of issue this is', 'error');
      return;
    }
    if (!photoFile) {
      showToast('Add a photo — it helps us verify the report', 'error');
      return;
    }
    if (!session) {
      showToast('Your verification expired — please sign in again', 'error');
      navigate('/citizen/login');
      return;
    }
    const submitCoords = activeCoords || FALLBACK_LOCATION;

    setSubmitting(true);
    try {
      await API.createReport(
        {
          latitude: submitCoords.latitude,
          longitude: submitCoords.longitude,
          description: description.trim() || undefined,
          photoFile,
        },
        authHeader(),
      );
      showToast('Report submitted — thank you', 'success');
      setTimeout(() => navigate('/citizen/track'), 900);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        showToast('Your verification expired — please sign in again', 'error');
        logout();
        navigate('/citizen/login');
        return;
      }
      const msg = err instanceof ApiError ? err.message : 'Something went wrong, try again';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/citizen/login');
  }

  const nearbyCount = clusters.length;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div id="citizen-map" ref={mapRef} className="absolute inset-0 z-0" />

      <div className="citizen-topbar">
        <div className="live-pill">
          <span className="live-dot" />
          LIVE — {nearbyCount} nearby
        </div>
        <div className="topbar-actions">
          <button className="chip-btn" onClick={handleLogout}>
            <LogOut size={14} strokeWidth={2.25} />
            Sign out
          </button>
          <ThemeToggle />
          <button className="icon-fab-sm" onClick={() => navigate('/citizen/track')} aria-label="Your reports">
            <ClipboardList size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="citizen-env-row" onClick={() => setShowForecast((v) => !v)}>
        <AqiReadout aqi={envAqi} pm25={envPm25} variant="overlay" />
        <span className="forecast-toggle-hint">
          <Radio size={12} strokeWidth={2.25} />
          {showForecast ? 'Hide 24h forecast' : '24h forecast'}
        </span>
      </div>

      {showForecast && (
        <div className="citizen-forecast-panel">
          <ForecastChart forecast={forecast} loading={forecastLoading} hours={24} />
        </div>
      )}

      <button
        className="recenter-fab"
        style={{ bottom: sheetExpanded ? 'calc(78vh + 16px)' : '160px' }}
        onClick={useCurrentLocation}
        aria-label="Use my current location"
        title="Use my current location"
      >
        <Target size={20} strokeWidth={2} />
      </button>

      <ReportSheet
        expanded={sheetExpanded}
        onToggle={() => setSheetExpanded((v) => !v)}
        locationName={locationName}
        onAddressChange={handleAddressChange}
        coords={activeCoords}
        isPickedLocation={pickedCoords != null}
        onUseCurrentLocation={useCurrentLocation}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        photoPreview={photoPreview}
        onPhotoChange={handlePhotoChange}
        description={description}
        onDescriptionChange={setDescription}
        onSubmit={submitReport}
        submitting={submitting}
      />
    </div>
  );
}