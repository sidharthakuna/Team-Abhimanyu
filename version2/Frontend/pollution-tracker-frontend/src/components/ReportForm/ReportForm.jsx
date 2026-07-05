import { useEffect, useRef, useState } from "react";
import { MapPicker } from "../Map/MapPicker";
import { useLiveLocation } from "../../hooks/useLiveLocation";
import { reverseGeocode } from "../../services/api";
import "./ReportForm.css";

/**
 * @param {(payload: {latitude, longitude, description, address, photoFile}) => Promise<void>} onSubmit
 */
export function ReportForm({ onSubmit, isSubmitting }) {
  const [location, setLocation] = useState(null); // {latitude, longitude}
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef(null);

  const { coords, status: liveLocationStatus, error: liveLocationError, requestLocation } = useLiveLocation();

  // When the geolocation hook successfully resolves coords, apply them
  // to the form's location state and attempt a reverse-geocode pre-fill.
  useEffect(() => {
    if (coords) {
      applyLocation(coords.latitude, coords.longitude, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  async function applyLocation(latitude, longitude, tryAutoAddress = true) {
    setLocation({ latitude, longitude });
    if (!tryAutoAddress) return;

    setIsGeocoding(true);
    try {
      const result = await reverseGeocode(latitude, longitude);
      if (result.address) setAddress(result.address);
    } catch {
      // Silent: reverse geocoding is a convenience pre-fill only, per
      // the backend's own docstring ("citizen typing a manual address
      // never calls this") — a failure here should never block the form.
    } finally {
      setIsGeocoding(false);
    }
  }

  async function handleUseMyLocation() {
    requestLocation();
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose an image file.");
      return;
    }
    setFormError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!location) {
      setFormError("Add a location — use live location or pick a spot on the map.");
      return;
    }
    if (!photoFile) {
      setFormError("A photo of the issue is required.");
      return;
    }

    await onSubmit({
      latitude: location.latitude,
      longitude: location.longitude,
      description: description.trim() || undefined,
      address: address.trim() || undefined,
      photoFile,
    });
  }

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      <div className="report-form__section">
        <label className="report-form__label">Photo of the issue</label>
        <p className="report-form__hint">Our system will detect the category automatically.</p>

        {photoPreview ? (
          <div className="report-form__photo-preview">
            <img src={photoPreview} alt="Selected issue" />
            <button type="button" className="report-form__photo-remove" onClick={clearPhoto}>
              Remove photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="report-form__photo-trigger"
            onClick={() => fileInputRef.current?.click()}
          >
            <span aria-hidden="true">📷</span>
            <span>Take or choose a photo</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="visually-hidden"
        />
      </div>

      <div className="report-form__section">
        <label className="report-form__label">Location</label>
        <p className="report-form__hint">
          Use your live location, or drop a pin on the map — whichever's easier.
        </p>

        <div className="report-form__location-actions">
          <button
            type="button"
            className="report-form__location-btn"
            onClick={handleUseMyLocation}
            disabled={liveLocationStatus === "loading"}
          >
            <span aria-hidden="true">📡</span>
            {liveLocationStatus === "loading" ? "Getting location…" : "Use my live location"}
          </button>
        </div>

        {liveLocationError && <p className="report-form__error">{liveLocationError}</p>}

        <div className="report-form__map-slot">
          <MapPicker
            value={location}
            onConfirm={(lat, lng) => applyLocation(lat, lng, true)}
            triggerLabel="Or pick a spot on the map"
          />
        </div>

        {isGeocoding && <p className="report-form__hint report-form__hint--muted">Looking up address…</p>}
      </div>

      <div className="report-form__section">
        <label className="report-form__label" htmlFor="address">
          Address <span className="report-form__optional">(optional, auto-filled if available)</span>
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Near MG Road bus stop, Vijayawada"
          className="report-form__input"
        />
      </div>

      <div className="report-form__section">
        <label className="report-form__label" htmlFor="description">
          Description <span className="report-form__optional">(optional)</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything the municipal team should know…"
          rows={3}
          className="report-form__textarea"
        />
      </div>

      {formError && <p className="report-form__error report-form__error--form">{formError}</p>}

      <button type="submit" className="report-form__submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}