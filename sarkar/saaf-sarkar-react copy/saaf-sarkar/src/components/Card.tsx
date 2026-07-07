import type { HTMLAttributes, ReactNode } from 'react';
import type { IssueCategory, ReportStatus } from '../types';
import { CATEGORY_COLOR_VAR, CATEGORY_EMOJI, CATEGORY_LABELS, STATUS_EMOJI } from '../types/constants';

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

export function CategoryTag({ category }: { category: IssueCategory }) {
  const color = CATEGORY_COLOR_VAR[category];
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
      <span aria-hidden>{CATEGORY_EMOJI[category]}</span>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function StatusTag({ status }: { status: ReportStatus }) {
  const colorMap: Record<ReportStatus, string> = {
    pending: 'var(--status-pending)',
    assigned: 'var(--status-assigned)',
    resolved: 'var(--status-resolved)',
  };
  const color = colorMap[status];
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
      <span aria-hidden>{STATUS_EMOJI[status]}</span>
      {status}
    </span>
  );
}
