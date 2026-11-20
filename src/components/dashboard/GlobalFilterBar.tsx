import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X } from 'lucide-react';
import type { DashboardFilters, DateRangePreset } from '../../types/dashboard';

interface GlobalFilterBarProps {
  filters: DashboardFilters;
  onChange: (patch: Partial<DashboardFilters>) => void;
  onReset: () => void;
  filtering?: boolean;
}

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

export const GlobalFilterBar = React.memo(function GlobalFilterBar({
  filters,
  onChange,
  onReset,
  filtering,
}: GlobalFilterBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activePreset = DATE_PRESETS.find((p) => p.value === filters.dateRange) || DATE_PRESETS[0];
  const isFiltered = filters.dateRange !== 'all';

  const triggerLabel =
    filters.dateRange === 'custom' && filters.startDate && filters.endDate
      ? `${filters.startDate} – ${filters.endDate}`
      : activePreset.label;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`h-9 px-3 inline-flex items-center gap-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
          isFiltered
            ? 'bg-indigo-50/70 border-indigo-200/90 text-indigo-700 hover:bg-indigo-50'
            : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Calendar size={13} className={isFiltered ? 'text-indigo-600' : 'text-slate-400'} />
        <span>{triggerLabel}</span>
        {filtering ? (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
        ) : (
          <ChevronDown
            size={13}
            className={`text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {isFiltered && (
        <button
          type="button"
          onClick={() => {
            onReset();
            setOpen(false);
          }}
          title="Clear date filter"
          aria-label="Clear date filter"
          className="h-9 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <X size={13} />
        </button>
      )}

      {open && (
        <div
          role="menu"
          aria-label="Date range options"
          className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl border border-slate-200/90 shadow-lg shadow-slate-900/10 py-1.5 z-50"
        >
          <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">Date range</div>
          {DATE_PRESETS.map((preset) => {
            const active = filters.dateRange === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange({ dateRange: preset.value });
                  if (preset.value !== 'custom') setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                  active
                    ? 'bg-indigo-50/70 text-indigo-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{preset.label}</span>
                {active && <Check size={13} className="text-indigo-600" />}
              </button>
            );
          })}

          {filters.dateRange === 'custom' && (
            <div className="mt-1.5 pt-2.5 pb-1 px-3 border-t border-slate-100 space-y-2">
              <label className="block">
                <span className="text-[11px] text-slate-500 block mb-1">From</span>
                <input
                  type="date"
                  aria-label="Custom start date"
                  value={filters.startDate}
                  onChange={(e) => onChange({ startDate: e.target.value })}
                  className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 block mb-1">To</span>
                <input
                  type="date"
                  aria-label="Custom end date"
                  value={filters.endDate}
                  min={filters.startDate || undefined}
                  onChange={(e) => onChange({ endDate: e.target.value })}
                  className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
