import { useState } from 'react';

/**
 * Minimal, self-contained version of the "Get Location" form from the
 * screenshot: one button, two coordinate fields, one address field.
 * Wired to real browser geolocation + a real reverse-geocode API call —
 * nothing here is a placeholder.
 *
 * Flow on click:
 *   1. navigator.geolocation.getCurrentPosition() -> real lat/long
 *   2. setLatitude / setLongitude -> the two number fields update
 *   3. fetch(`${API_BASE}/api/geo/reverse?...`) -> real place name
 *   4. setAddress -> the address field fills in
 *
 * If you already have an existing map (Leaflet, as in the rest of this
 * app) that you want re-centered on click too, pass `onLocationPicked`
 * — see the comment near the bottom of handleGetLocation.
 */

// Point this at wherever your FastAPI app actually runs. In dev this is
// usually http://localhost:8000; in prod, your deployed API's origin.
// If you're using Vite, prefer import.meta.env.VITE_API_BASE_URL instead
// of hardcoding this.

interface LiveLocationFormProps {
  // Optional — call this if you want to also fly/recenter a map, the
  // way flyToLocation(mapInstanceRef.current, coords, 16) does
  // elsewhere in this codebase. Left undefined by default so this
  // component works standalone with no map dependency at all.
  onLocationPicked?: (coords: { latitude: number; longitude: number }) => void;
}

export function LiveLocationForm({ onLocationPicked }: LiveLocationFormProps) {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [addressEdited, setAddressEdited] = useState(false);

  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGetLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);
        setLocating(false);

        // A fresh location pick should re-auto-fill the address, even
        // if the citizen had previously hand-edited it for a different
        // spot — matches the addressEdited reset pattern used for
        // pickedCoords elsewhere in this app.
        setAddressEdited(false);

        onLocationPicked?.({ latitude: lat, longitude: lng });

        await fetchAddress(lat, lng);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location permission denied — enable it in your browser settings.'
            : 'Could not get your location. Please try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function fetchAddress(lat: number, lng: number) {
    setGeocoding(true);

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;

      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        throw new Error("Failed to fetch address");
      }

      const data = await resp.json();

      if (data.address) {
        const addr = data.address;

        const location =
          addr.suburb ||
          addr.neighbourhood ||
          addr.village ||
          addr.hamlet ||
          addr.city ||
          addr.town ||
          "";

        const city =
          addr.city ||
          addr.county ||
          addr.state_district ||
          "";

        const state = addr.state || "";

        setAddress(`${location}, ${city}, ${state}`);
      } else {
        setAddress("Address not found");
      }
    } catch (err) {
      console.error(err);
      setAddress("Address lookup failed");
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        type="button"
        onClick={handleGetLocation}
        disabled={locating}
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          border: 'none',
          background: locating ? '#94a3b8' : '#2563eb',
          color: 'white',
          fontWeight: 600,
          cursor: locating ? 'not-allowed' : 'pointer',
        }}
      >
        {locating ? 'Getting location…' : 'Get Location'}
      </button>

      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Latitude
        <input
          type="number"
          value={latitude ?? ''}
          onChange={(e) => setLatitude(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="—"
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Longitude
        <input
          type="number"
          value={longitude ?? ''}
          onChange={(e) => setLongitude(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="—"
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Address
        <input
          type="text"
          value={geocoding ? 'Looking up address…' : address}
          onChange={(e) => {
            setAddress(e.target.value);
            setAddressEdited(true);
          }}
          disabled={geocoding}
          placeholder="Address will appear here after locating"
          style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
        />
      </label>

      {addressEdited && (
        <div style={{ fontSize: 11, color: '#64748b' }}>
          Address edited manually — this won't be overwritten unless you tap Get Location again.
        </div>
      )}
    </div>
  );
}