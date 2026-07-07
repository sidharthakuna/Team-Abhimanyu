import type { IssueCategory, ReportStatus } from '../types';

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  garbage: 'Garbage',
  water_pollution: 'Water pollution',
  air_pollution: 'Air pollution',
  industrial_waste: 'Industrial waste',
  sewage: 'Sewage',
  other: 'Other',
};

export const CATEGORY_EMOJI: Record<IssueCategory, string> = {
  garbage: '🗑️',
  water_pollution: '💧',
  air_pollution: '💨',
  industrial_waste: '🏭',
  sewage: '🚰',
  other: '❓',
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

export const STATUS_EMOJI: Record<ReportStatus, string> = {
  pending: '🟠',
  assigned: '🔵',
  resolved: '✅',
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
