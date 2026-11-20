import React, { useMemo } from 'react';
import { Layers, Grid } from 'lucide-react';
import type { DashboardStatusItem } from '../../types/dashboard';

interface DistributionsRowProps {
  seniorityData: DashboardStatusItem[];
  domainData: DashboardStatusItem[];
  onNavigate: (path: string) => void;
}

function getSeniorityMeta(name: string) {
  switch (name) {
    case 'Lead / Architect':
      return { exp: '8+ yrs', bar: 'bg-slate-800' };
    case 'Senior':
      return { exp: '5–8 yrs', bar: 'bg-indigo-600' };
    case 'Mid':
      return { exp: '2–5 yrs', bar: 'bg-indigo-400' };
    case 'Junior':
      return { exp: '0–2 yrs', bar: 'bg-sky-400' };
    default:
      return { exp: 'Unspecified', bar: 'bg-slate-300' };
  }
}

export const DistributionsRow = React.memo(function DistributionsRow({
  seniorityData,
  domainData,
  onNavigate,
}: DistributionsRowProps) {
  const totalSeniority = useMemo(
    () => seniorityData.reduce((acc, item) => acc + (item.count || 0), 0) || 1,
    [seniorityData]
  );

  const totalDomain = useMemo(
    () => domainData.reduce((acc, item) => acc + (item.count || 0), 0) || 1,
    [domainData]
  );

  const dominantSeniority = useMemo(
    () =>
      seniorityData.reduce<DashboardStatusItem | null>(
        (top, curr) => (curr.count > (top?.count ?? -1) ? curr : top),
        seniorityData[0] || null
      ),
    [seniorityData]
  );

  const experiencedPct = useMemo(() => {
    const expCount = seniorityData
      .filter((s) => s.name === 'Senior' || s.name === 'Lead / Architect')
      .reduce((acc, s) => acc + (s.count || 0), 0);
    return Math.round((expCount / totalSeniority) * 100);
  }, [seniorityData, totalSeniority]);

  const primaryDomain = domainData[0] || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      {/* Experience Levels */}
      <div className="bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(79,70,229,0.10)] flex flex-col justify-between h-full overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200/75">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100/80 flex items-center justify-center shrink-0 mt-0.5">
                <Layers size={15} />
              </div>
              <div>
                <h2 className="text-[14.5px] font-bold text-slate-900 tracking-[-0.015em] leading-snug">
                  Experience Levels
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Candidates grouped by years of experience
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
              {seniorityData.length > 0 ? totalSeniority : 0} candidates
            </span>
          </div>

          <div className="px-5 sm:px-6 py-3 flex-1">
          {seniorityData.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {seniorityData.map((item) => {
                const meta = getSeniorityMeta(item.name);
                const percentNum = Math.round((item.count / totalSeniority) * 100);
                return (
                  <div
                    key={item.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigate(`/database?seniority=${encodeURIComponent(item.name)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNavigate(`/database?seniority=${encodeURIComponent(item.name)}`);
                      }
                    }}
                    className="py-3 hover:bg-slate-50/70 -mx-2 px-2 rounded-lg cursor-pointer transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
                          {item.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{meta.exp}</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="text-xs text-slate-500">{item.count}</span>
                        <span className="text-xs font-semibold text-slate-900 w-9 text-right">
                          {item.percentage}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${meta.bar} transition-all duration-500`}
                        style={{ width: `${Math.max(percentNum, item.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No seniority breakdown available yet.
            </div>
          )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3 bg-slate-50/40 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100">
          <span>
            Most common:{' '}
            <strong className="font-semibold text-slate-800">
              {dominantSeniority
                ? `${dominantSeniority.name} (${dominantSeniority.percentage})`
                : '—'}
            </strong>
          </span>
          <span>
            5+ years experience:{' '}
            <strong className="font-semibold text-slate-800 tabular-nums">
              {seniorityData.length > 0 ? `${experiencedPct}%` : '—'}
            </strong>
          </span>
        </div>
      </div>

      {/* Job Categories */}
      <div className="bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(79,70,229,0.10)] flex flex-col justify-between h-full overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200/75">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80 flex items-center justify-center shrink-0 mt-0.5">
                <Grid size={15} />
              </div>
              <div>
                <h2 className="text-[14.5px] font-bold text-slate-900 tracking-[-0.015em] leading-snug">
                  Job Categories
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Main skill areas across your candidate pool
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600 tabular-nums whitespace-nowrap">
              {domainData.length} areas
            </span>
          </div>

          <div className="px-5 sm:px-6 py-3 flex-1">
          {domainData.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {domainData.slice(0, 6).map((item) => {
                const percentNum = Math.round((item.count / totalDomain) * 100);
                return (
                  <div
                    key={item.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => onNavigate(`/database?domain=${encodeURIComponent(item.name)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onNavigate(`/database?domain=${encodeURIComponent(item.name)}`);
                      }
                    }}
                    className="py-2.5 hover:bg-slate-50/70 -mx-2 px-2 rounded-lg cursor-pointer transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-3 tabular-nums shrink-0">
                        <span className="text-xs text-slate-500">{item.count}</span>
                        <span className="text-xs font-semibold text-slate-900 w-9 text-right">
                          {item.percentage}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500/85 transition-all duration-500"
                        style={{ width: `${Math.max(percentNum, item.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No domain specialization data available yet.
            </div>
          )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3 bg-slate-50/40 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 gap-2">
          <span className="truncate">
            Largest group:{' '}
            <strong className="font-semibold text-slate-800">
              {primaryDomain ? `${primaryDomain.name} (${primaryDomain.percentage})` : '—'}
            </strong>
          </span>
          <span className="whitespace-nowrap">
            Showing top {Math.min(domainData.length, 6)} of{' '}
            <strong className="font-semibold text-slate-800 tabular-nums">
              {domainData.length}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
});

