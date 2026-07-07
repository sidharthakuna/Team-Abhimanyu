import { TrendingUp, WifiOff } from 'lucide-react';
import type { ForecastResult } from '../types';
import { aqiColorVar } from '../types/constants';

interface ForecastChartProps {
  forecast: ForecastResult | null;
  loading: boolean;
  hours?: number;
}

const CHART_HEIGHT = 84;
const CHART_WIDTH = 320;

// Hand-rolled SVG area chart rather than pulling in recharts — this is a
// single sparkline-style series (AQI over time), and a tightly-controlled
// custom path gives exact control over the gradient-fill severity look
// used elsewhere on the map. Keeps the bundle lean for a hackathon build.
function buildPath(values: number[], width: number, height: number): { line: string; area: string } {
  if (values.length < 2) return { line: '', area: '' };
  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

export function ForecastChart({ forecast, loading, hours = 24 }: ForecastChartProps) {
  if (loading) {
    return (
      <div className="forecast-chart forecast-chart--loading">
        <div className="forecast-shimmer" />
      </div>
    );
  }

  if (!forecast || !forecast.is_live || forecast.points.length === 0) {
    return (
      <div className="forecast-chart forecast-chart--empty">
        <WifiOff size={16} strokeWidth={2} />
        <span>Forecast temporarily unavailable</span>
      </div>
    );
  }

  const slice = forecast.points.slice(0, hours);
  const aqiValues = slice.map((p) => p.european_aqi ?? 0);
  const { line, area } = buildPath(aqiValues, CHART_WIDTH, CHART_HEIGHT);

  const peakIdx = aqiValues.indexOf(Math.max(...aqiValues));
  const peak = slice[peakIdx];
  const peakColor = aqiColorVar(peak?.european_aqi ?? null);

  const startTime = slice[0]?.time ? new Date(slice[0].time) : null;
  const endTime = slice[slice.length - 1]?.time ? new Date(slice[slice.length - 1].time) : null;
  const fmt = (d: Date | null) =>
    d ? d.toLocaleTimeString(undefined, { hour: 'numeric' }) : '';

  return (
    <div className="forecast-chart">
      <div className="forecast-chart-head">
        <span className="forecast-chart-title">
          <TrendingUp size={14} strokeWidth={2.25} />
          Next {hours}h AQI forecast
        </span>
        {peak && (
          <span className="forecast-chart-peak" style={{ color: peakColor }}>
            Peak {peak.european_aqi} at {new Date(peak.time).toLocaleTimeString(undefined, { hour: 'numeric' })}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="forecast-chart-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={peakColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={peakColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#forecastFill)" />
        <path d={line} fill="none" stroke={peakColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      <div className="forecast-chart-axis">
        <span>{fmt(startTime)}</span>
        <span>{fmt(endTime)}</span>
      </div>
    </div>
  );
}