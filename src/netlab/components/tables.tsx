/**
 * Resource tables shared by the lab pages.
 *
 * A thin generic wrapper keeps the ten resource pages consistent without
 * pulling in a table library.
 */

import React from 'react';
import { EmptyState } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyTitle,
  emptyMessage,
  emptyAction,
  onRowClick,
  isPending,
  pendingLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyTitle: string;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** True while a row for this resource type is provisioning. */
  isPending?: boolean;
  pendingLabel?: string;
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] ${
                    col.numeric ? 'text-right' : ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-blue)]" aria-hidden="true" />
                    {pendingLabel ?? 'Creating…'}
                  </span>
                </td>
              </tr>
            ) : null}

            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-[var(--border-subtle)] last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-[var(--card-hover)]' : ''
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 text-[var(--text-primary)] ${col.numeric ? 'text-right font-mono tabular-nums' : ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && !isPending ? (
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      ) : null}
    </div>
  );
}

/** Slide-over form panel used for every Create action. */
export const FormPanel: React.FC<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, title, description, onClose, children, footer }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 cursor-default bg-black/50"
        tabIndex={-1}
      />
      <div className="flex w-full max-w-md flex-col overflow-y-auto border-l border-[var(--border-color)] bg-[var(--bg-shell)]">
        <header className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--bg-shell)] px-5 py-4">
          <h2 className="text-base font-medium text-[var(--text-primary)]">{title}</h2>
          {description ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p> : null}
        </header>
        <div className="flex-1 space-y-4 px-5 py-4">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-shell)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
};

/** Format an ISO timestamp as a short relative-ish label for tables. */
export function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}