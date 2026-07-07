import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CircleCheck, Droplets, Factory, Trash2, Waves } from 'lucide-react';
import type { IssueCategory, ReportStatus } from '../types';
import { CATEGORY_COLOR_VAR, CATEGORY_LABELS, STATUS_COLOR_VAR, STATUS_LABELS } from '../types/constants';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
}

export function Card({ children, interactive = false, className = '', style, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-[24px] border ${interactive ? 'cursor-pointer transition-colors duration-150' : ''} ${className}`}
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
        padding: 'var(--sp-5)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export const CATEGORY_ICON: Record<IssueCategory, typeof Trash2> = {
  garbage: Trash2,
  water_pollution: Droplets,
  air_pollution: Waves,
  industrial_waste: Factory,
  sewage: Waves,
  other: AlertTriangle,
};

export function CategoryTag({ category }: { category: IssueCategory }) {
  const color = CATEGORY_COLOR_VAR[category];
  const Icon = CATEGORY_ICON[category];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-mono text-xs font-semibold"
      style={{
        padding: '5px 10px',
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        letterSpacing: '0.02em',
      }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusTag({ status }: { status: ReportStatus }) {
  const color = STATUS_COLOR_VAR[status];
  const Icon = status === 'resolved' ? CircleCheck : AlertTriangle;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-mono text-xs font-semibold uppercase"
      style={{
        padding: '5px 10px',
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        letterSpacing: '0.04em',
      }}
    >
      <Icon size={13} strokeWidth={2.5} />
      {STATUS_LABELS[status]}
    </span>
  );
}