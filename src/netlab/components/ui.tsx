/**
 * Shared UI primitives for the networking lab.
 *
 * Styled with the same CSS variables as the rest of the console so the lab
 * matches the Google Cloud Console look in both dark and light themes.
 */

import React from 'react';

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const tone =
    status === 'RUNNING' || status === 'READY' || status === 'ATTACHED'
      ? 'success'
      : status === 'PROVISIONING' || status === 'CREATING' || status === 'ATTACHING'
        ? 'info'
        : status === 'DELETING'
          ? 'warning'
          : 'neutral';

  const colorMap: Record<string, string> = {
    success: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10',
    info: 'text-[var(--accent-blue)] border-[var(--accent-blue-border)] bg-[var(--accent-blue-bg)]',
    warning: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10',
    neutral: 'text-[var(--text-secondary)] border-[var(--border-color)] bg-[var(--bg-surface)]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${colorMap[tone]}`}
    >
      {status === 'PROVISIONING' || status === 'CREATING' || status === 'ATTACHING' ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {status}
    </span>
  );
};

export const Card: React.FC<{ title?: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  action,
  children,
}) => (
  <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]">
    {title ? (
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{title}</h2>
        {action}
      </header>
    ) : null}
    <div className="p-4">{children}</div>
  </section>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; size?: 'sm' | 'md' }
> = ({ variant = 'secondary', size = 'md', className = '', ...props }) => {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-blue)]';

  const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  const variants = {
    primary: 'border-transparent bg-[var(--accent-blue)] text-[#0e0e0f] hover:bg-[var(--accent-hover)]',
    secondary:
      'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--card-hover)]',
    danger: 'border-[var(--danger)]/50 text-[var(--danger)] hover:bg-[var(--danger)]/10',
  } as const;

  return <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />;
};

export const Field: React.FC<{
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}> = ({ label, hint, error, children, htmlFor }) => (
  <label className="block space-y-1.5" htmlFor={htmlFor}>
    <span className="block text-xs font-medium text-[var(--text-secondary)]">{label}</span>
    {children}
    {error ? (
      <span className="block text-xs text-[var(--danger)]">{error}</span>
    ) : hint ? (
      <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
    ) : null}
  </label>
);

export const inputClass =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:outline-none';

export const EmptyState: React.FC<{ title: string; message: string; action?: React.ReactNode }> = ({
  title,
  message,
  action,
}) => (
  <div className="space-y-3 rounded-xl border border-dashed border-[var(--border-color)] px-6 py-10 text-center">
    <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
    <p className="mx-auto max-w-md text-xs text-[var(--text-secondary)]">{message}</p>
    {action}
  </div>
);

export const MetaRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <span className="text-xs text-[var(--text-secondary)]">{label}</span>
    <span className="font-mono text-xs tabular-nums text-[var(--text-primary)]">{value}</span>
  </div>
);

/** Small inline panel used for guidance and "how to fix" messages. */
export const Callout: React.FC<{ tone?: 'info' | 'error' | 'success'; title?: string; children: React.ReactNode }> = ({
  tone = 'info',
  title,
  children,
}) => {
  const tones = {
    info: 'border-[var(--accent-blue-border)] bg-[var(--accent-blue-bg)] text-[var(--accent-blue)]',
    error: 'border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]',
    success: 'border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]',
  } as const;

  return (
    <div className={`space-y-1 rounded-lg border px-3 py-2 text-xs ${tones[tone]}`}>
      {title ? <p className="font-medium">{title}</p> : null}
      <div className="text-[var(--text-secondary)]">{children}</div>
    </div>
  );
};