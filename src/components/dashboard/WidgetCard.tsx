import React from 'react';
import { AlertCircle } from 'lucide-react';

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
}

export const WidgetCard = React.memo(function WidgetCard({
  title,
  subtitle,
  icon,
  iconBg = 'bg-indigo-50 text-indigo-600',
  headerRight,
  footer,
  loading,
  error,
  onRetry,
  className = '',
  children,
}: WidgetCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(79,70,229,0.10)] flex flex-col justify-between h-full overflow-hidden ${className}`}
    >
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200/75">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {icon && (
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-bold text-slate-900 tracking-[-0.015em] leading-snug">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-600 mt-0.5 leading-snug">{subtitle}</p>
              )}
            </div>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>

        <div className="px-5 sm:px-6 py-4 flex-1">
          {loading ? (
            <div className="space-y-3 py-2 animate-pulse" role="status" aria-label={`Loading ${title}`}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="h-3.5 w-44 bg-slate-100 rounded" />
                  <div className="h-3.5 w-14 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50/80 border border-rose-200/70 flex items-center justify-between gap-2 text-xs text-rose-700"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={14} className="shrink-0" />
                <span className="truncate">{error}</span>
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-2.5 py-1 rounded-md bg-white border border-rose-200 text-[11px] font-medium hover:bg-rose-50 shrink-0"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <div>{children}</div>
          )}
        </div>
      </div>

      {footer && !loading && !error && (
        <div className="px-5 sm:px-6 py-3 bg-slate-50/40 border-t border-slate-100 text-xs text-slate-600">
          {footer}
        </div>
      )}
    </div>
  );
});
