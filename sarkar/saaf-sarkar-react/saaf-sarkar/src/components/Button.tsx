import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  full?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const base =
  'font-semibold text-[15px] rounded-2xl px-5 py-3.5 inline-flex items-center justify-center gap-2 transition-transform duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer border-none';

const variants: Record<string, string> = {
  primary: 'text-[var(--on-accent)]',
  secondary: 'text-[var(--text-primary)] border border-[var(--border-strong)]',
  danger: 'text-[var(--danger)] border',
  ghost: 'text-[var(--text-muted)] bg-transparent',
};

export function Button({
  variant = 'primary',
  full = false,
  loading = false,
  className = '',
  children,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: 'var(--accent-live)' }
      : variant === 'secondary'
        ? { background: 'var(--bg-surface-raised)' }
        : variant === 'danger'
          ? { background: 'var(--danger-dim)', borderColor: 'var(--danger-border)' }
          : { background: 'transparent' };

  return (
    <button
      className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      style={{ ...variantStyle, ...style }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : children}
    </button>
  );
}