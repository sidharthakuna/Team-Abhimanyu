import { Camera, ChevronUp, LocateFixed, MapPin, Send } from 'lucide-react';
import { CATEGORY_ICON } from './Card';
import { CATEGORY_LIST, CATEGORY_LABELS } from '../types/constants';
import { Button } from './Button';
import type { IssueCategory, Coords } from '../types';

interface ReportSheetProps {
  expanded: boolean;
  onToggle: () => void;
  locationName: string;
  onAddressChange: (value: string) => void;
  coords: Coords | null;
  // true when the location came from a map tap rather than live GPS —
  // drives the little "Picked on map" vs "Your live location" label so
  // the citizen always knows which one is currently active.
  isPickedLocation: boolean;
  onUseCurrentLocation: () => void;
  selectedCategory: IssueCategory | null;
  onSelectCategory: (c: IssueCategory) => void;
  photoPreview: string | null;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

// The citizen-facing report form, extracted from CitizenReport.tsx so
// that file stays focused on map/geo orchestration and this one stays
// focused on form state + presentation.
export function ReportSheet({
  expanded,
  onToggle,
  locationName,
  onAddressChange,
  coords,
  isPickedLocation,
  onUseCurrentLocation,
  selectedCategory,
  onSelectCategory,
  photoPreview,
  onPhotoChange,
  description,
  onDescriptionChange,
  onSubmit,
  submitting,
}: ReportSheetProps) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-10 flex flex-col transition-transform duration-300"
      style={{
        maxHeight: '78vh',
        transform: expanded ? 'translateY(0)' : 'translateY(calc(100% - 132px))',
        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="report-sheet-inner">
        <div className="sheet-handle" onClick={onToggle} />
        <div className="sheet-summary" onClick={onToggle}>
          <div>
            <h3 className="text-base font-bold mb-0.5">Spotted something?</h3>
            <p className="text-xs text-[var(--text-muted)] font-mono">{locationName}</p>
          </div>
          <div className="sheet-cta">
            Report
            <ChevronUp size={16} className={`sheet-cta-chevron ${expanded ? 'sheet-cta-chevron--open' : ''}`} />
          </div>
        </div>

        <div className="px-5 pb-6 overflow-y-auto">
          <label className="form-label">What's the issue?</label>
          <div className="category-grid">
            {CATEGORY_LIST.map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              const active = selectedCategory === cat;
              return (
                <div
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`category-tile ${active ? 'category-tile--active' : ''}`}
                >
                  <Icon size={20} strokeWidth={2} className="category-tile-icon" />
                  {CATEGORY_LABELS[cat]}
                </div>
              );
            })}
          </div>

          <label className="form-label">Photo evidence</label>
          <div
            className="photo-dropzone"
            style={{ minHeight: photoPreview ? 140 : undefined, padding: photoPreview ? 0 : undefined }}
            onClick={() => document.getElementById('citizen-photo-input')?.click()}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Evidence preview" className="photo-dropzone-img" />
            ) : (
              <div className="photo-dropzone-empty">
                <Camera size={26} strokeWidth={1.75} />
                <p>Tap to add a photo</p>
              </div>
            )}
          </div>
          <input
            id="citizen-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPhotoChange}
          />

          <div className="location-label-row">
            <label className="form-label mb-0">Location</label>
            <span className="location-source-tag">
              {isPickedLocation ? (
                <>
                  <MapPin size={11} strokeWidth={2.25} />
                  Picked on map
                </>
              ) : (
                <>
                  <LocateFixed size={11} strokeWidth={2.25} />
                  Your live location
                </>
              )}
            </span>
          </div>

          {/* Address is auto-filled from reverse-geocoding whichever
              coords are active (live GPS or a map tap), but stays a
              real editable input — a citizen standing near a spot but
              reporting an issue at a slightly different address (e.g.
              "behind the bus stop, not on the main road") can just
              overwrite the text. Editing it does NOT move the pin or
              change the submitted lat/long; it's purely the
              human-readable label sent alongside the coordinates. */}
          <div className="address-input-wrap">
            <MapPin size={16} strokeWidth={2} className="address-input-icon" style={{ color: 'var(--accent-live)' }} />
            <input
              type="text"
              value={locationName}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Address, landmark, or pincode"
              className="form-input address-input"
            />
          </div>

          {/* BUG FIX: this button used to only render once
              isPickedLocation was true — i.e. only AFTER the citizen
              had already tapped the map once. That meant on first load
              there was no visible way to re-fetch live GPS / refresh
              the address at all, which read as "there's no location
              button." It's now always shown: label and icon still
              adapt to context (recover a dropped pin vs. just refresh
              a stale live reading), but the action and click target are
              present from the very first render. */}
          <div className="location-row">
            <div className="flex-1">
              <div className="font-mono text-[var(--text-muted)] text-[11px]">
                {coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Waiting for location…'}
              </div>
            </div>
            <button type="button" className="use-current-loc-btn" onClick={onUseCurrentLocation}>
              <LocateFixed size={13} strokeWidth={2.25} />
              {isPickedLocation ? 'Use my location' : 'Refresh location'}
            </button>
          </div>

          <label className="form-label">Add a note (optional)</label>
          <textarea
            rows={3}
            placeholder="e.g. Overflowing bin near the bus stop, been here 3 days"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="form-input form-textarea"
          />

          <Button full onClick={onSubmit} loading={submitting}>
            <Send size={16} strokeWidth={2.25} />
            Submit report
          </Button>
        </div>
      </div>
    </div>
  );
}