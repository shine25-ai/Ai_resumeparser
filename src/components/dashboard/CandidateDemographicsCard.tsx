import React, { useState, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { CandidateExtrasData } from '../../types/dashboard';

interface CandidateDemographicsCardProps {
  candidateExtras?: CandidateExtrasData;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate?: (path: string) => void;
}

type DemoTab = 'location' | 'notice' | 'ctc';

export const CandidateDemographicsCard = React.memo(function CandidateDemographicsCard({
  candidateExtras,
  loading,
  error,
  onRetry,
  onNavigate,
}: CandidateDemographicsCardProps) {
  const [demoTab, setDemoTab] = useState<DemoTab>('location');

  const locations = candidateExtras?.locations || [];
  const noticePeriods = candidateExtras?.notice_periods || [];

  const salaryRows = useMemo(() => {
    const ctcBands = candidateExtras?.ctc_bands || [];
    const withCounts = ctcBands.map((b) => ({
      band: b.band,
      count: (b.expected_count || 0) || (b.current_count || 0),
    }));
    const total = withCounts.reduce((sum, r) => sum + r.count, 0);
    return {
      total,
      rows: withCounts
        .filter((r) => r.count > 0)
        .map((r) => ({
          ...r,
          percent: total > 0 ? Math.round((r.count / total) * 100) : 0,
        })),
    };
  }, [candidateExtras?.ctc_bands]);

  return (
    <WidgetCard
      title="Candidate Details"
      subtitle="Locations, joining availability, and expected salary"
      icon={<MapPin size={15} />}
      iconBg="bg-sky-50 text-sky-600 ring-1 ring-sky-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        <div
          role="group"
          aria-label="Candidate details view"
          className="inline-flex items-center bg-slate-100 rounded-lg p-0.5"
        >
          {(
            [
              { id: 'location', label: 'City' },
              { id: 'notice', label: 'Notice' },
              { id: 'ctc', label: 'Salary' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={demoTab === t.id}
              onClick={() => setDemoTab(t.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                demoTab === t.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span>
            {demoTab === 'ctc'
              ? salaryRows.total > 0
                ? `${salaryRows.total} ${salaryRows.total === 1 ? 'candidate' : 'candidates'} with expected salary recorded`
                : 'No expected salary recorded yet'
              : demoTab === 'notice'
                ? 'How soon candidates can join'
                : 'Click any city to view matching candidates'}
          </span>
          {demoTab === 'ctc' && salaryRows.total > 0 && (
            <span className="text-slate-400">Expected salary (INR LPA)</span>
          )}
        </div>
      }
    >
      {demoTab === 'location' && (
        <div className="space-y-2.5 pt-1">
          {locations.length > 0 ? (
            locations.map((loc) => (
              <button
                key={loc.label}
                type="button"
                onClick={() => onNavigate?.(`/database?city=${encodeURIComponent(loc.label)}`)}
                className="w-full py-1 -mx-1.5 px-1.5 rounded-md hover:bg-slate-50/80 transition-colors space-y-1 text-left group"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {loc.label}
                  </span>
                  <span className="tabular-nums text-slate-900 font-semibold">
                    {loc.count}{' '}
                    <span className="text-slate-400 font-normal">({loc.percent}%)</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-sky-500"
                    style={{ width: `${Math.max(loc.percent, 2)}%` }}
                  />
                </div>
              </button>
            ))
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No candidate locations recorded yet.
            </div>
          )}
        </div>
      )}

      {demoTab === 'notice' && (
        <div className="space-y-2.5 pt-1">
          {noticePeriods.length > 0 ? (
            noticePeriods.map((np) => (
              <div key={np.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{np.label}</span>
                  <span className="tabular-nums text-slate-900 font-semibold">
                    {np.count}{' '}
                    <span className="text-slate-400 font-normal">({np.percent}%)</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${Math.max(np.percent, 2)}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No notice period info recorded yet.
            </div>
          )}
        </div>
      )}

      {demoTab === 'ctc' && (
        <div className="space-y-3 pt-1">
          {candidateExtras?.ctc_has_real_data && salaryRows.rows.length > 0 ? (
            salaryRows.rows.map((row) => (
              <div key={row.band} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">{row.band}</span>
                  <span className="tabular-nums text-slate-900 font-semibold">
                    {row.count} {row.count === 1 ? 'candidate' : 'candidates'}{' '}
                    <span className="text-slate-400 font-normal">({row.percent}%)</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${Math.max(row.percent, 4)}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="py-10 text-center space-y-1">
              <p className="text-xs font-medium text-slate-600">
                No salary details recorded yet
              </p>
              <p className="text-[11px] text-slate-400">
                Salary ranges appear once candidates share expected salary during interviews or on resumes.
              </p>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
});
