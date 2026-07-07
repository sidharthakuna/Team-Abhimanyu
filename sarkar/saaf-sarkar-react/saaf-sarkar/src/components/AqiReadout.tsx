import { Wind } from 'lucide-react';
import { aqiColorVar, aqiLabel } from '../types/constants';

interface AqiReadoutProps {
  aqi: number | null;
  pm25: number | null;
  variant?: 'pill' | 'overlay';
}

// One component replacing three copy-pasted inline blocks (CitizenReport's
// second header, MunicipalDashboard's header pill, and its map overlay).
// 'pill' = solid background chip (used in headers). 'overlay' = text-only
// with shadow, for floating directly on the map tile.
export function AqiReadout({ aqi, pm25, variant = 'pill' }: AqiReadoutProps) {
  const color = aqiColorVar(aqi);
  const label = aqiLabel(aqi);

  if (variant === 'overlay') {
    return (
      <div className="aqi-overlay">
        <span style={{ color: 'var(--text-primary)' }}>
          AQI <b style={{ color }}>{aqi ?? '—'}</b>
          <span className="aqi-overlay-label" style={{ color }}>
            {' '}
            {label}
          </span>
        </span>
        <span className="aqi-overlay-sep">·</span>
        <span style={{ color: 'var(--text-primary)' }}>
          PM2.5 <b style={{ color: 'var(--accent-live)' }}>{pm25 != null ? `${pm25} µg/m³` : '—'}</b>
        </span>
      </div>
    );
  }

  return (
    <div className="aqi-pill">
      <Wind size={14} strokeWidth={2.25} style={{ color }} />
      <span>
        AQI <b style={{ color }}>{aqi ?? '—'}</b>
      </span>
      <span className="aqi-pill-sep" />
      <span>
        PM2.5 <b className="text-[var(--text-primary)]">{pm25 != null ? `${pm25} µg/m³` : '—'}</b>
      </span>
    </div>
  );
}