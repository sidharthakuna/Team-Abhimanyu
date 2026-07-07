import type { IssueCategory, ReportStatus } from './index';

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  garbage: 'Garbage',
  water_pollution: 'Water pollution',
  air_pollution: 'Air pollution',
  industrial_waste: 'Industrial waste',
  sewage: 'Sewage',
  other: 'Other',
};

export const CATEGORY_COLOR_VAR: Record<IssueCategory, string> = {
  garbage: 'var(--cat-garbage)',
  water_pollution: 'var(--cat-water_pollution)',
  air_pollution: 'var(--cat-air_pollution)',
  industrial_waste: 'var(--cat-industrial_waste)',
  sewage: 'var(--cat-sewage)',
  other: 'var(--cat-other)',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  resolved: 'Resolved',
};

export const STATUS_COLOR_VAR: Record<ReportStatus, string> = {
  pending: 'var(--status-pending)',
  assigned: 'var(--status-assigned)',
  resolved: 'var(--status-resolved)',
};

export const CATEGORY_LIST: IssueCategory[] = [
  'garbage',
  'water_pollution',
  'air_pollution',
  'industrial_waste',
  'sewage',
  'other',
];

// AQI color bands — European AQI scale (1-6 buckets, but Open-Meteo
// returns 0-100+ raw index values in some configs; this maps the actual
// numeric ranges get_live_environment_reading returns in weather.py's
// `european_aqi` field to a semantic color, used everywhere an AQI
// number is rendered so a citizen reads risk instantly, not just a digit.
export function aqiColorVar(aqi: number | null): string {
  if (aqi == null) return 'var(--text-dim)';
  if (aqi <= 20) return 'var(--aqi-good)';
  if (aqi <= 40) return 'var(--aqi-fair)';
  if (aqi <= 60) return 'var(--aqi-moderate)';
  if (aqi <= 80) return 'var(--aqi-poor)';
  return 'var(--aqi-severe)';
}

export function aqiLabel(aqi: number | null): string {
  if (aqi == null) return 'No data';
  if (aqi <= 20) return 'Good';
  if (aqi <= 40) return 'Fair';
  if (aqi <= 60) return 'Moderate';
  if (aqi <= 80) return 'Poor';
  return 'Severe';
}