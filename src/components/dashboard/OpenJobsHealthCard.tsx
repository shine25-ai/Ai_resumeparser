import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Briefcase } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { OpenJobHealthItem } from '../../types/dashboard';

interface OpenJobsHealthCardProps {
  jobs: OpenJobHealthItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
  className?: string;
}

function StatusIndicator({ health }: { health: OpenJobHealthItem['health'] }) {
  if (health === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        On track
      </span>
    );
  }
  if (health === 'open_too_long') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Open too long
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Needs applicants
    </span>
  );
}

export const OpenJobsHealthCard = React.memo(function OpenJobsHealthCard({
  jobs,
  loading,
  error,
  onRetry,
  onNavigate,
  className = '',
}: OpenJobsHealthCardProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const needsFocusCount = useMemo(
    () => jobs.filter((j) => j.health !== 'healthy').length,
    [jobs]
  );

  return (
    <WidgetCard
      title="Open Jobs"
      subtitle="Click any role to see top matched candidates"
      icon={<Briefcase size={15} />}
      iconBg="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      className={className}
      headerRight={
        <button
          type="button"
          onClick={() => onNavigate('/job-openings')}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
        >
          <span>Manage jobs</span>
          <ArrowRight size={12} />
        </button>
      }
      footer={
        <div className="flex items-center justify-between gap-2 tabular-nums">
          <span>
            <strong className="font-medium text-slate-800">{jobs.length}</strong> open roles
          </span>
          {needsFocusCount > 0 ? (
            <span className="text-amber-700 font-medium">
              {needsFocusCount} {needsFocusCount === 1 ? 'role needs' : 'roles need'} attention
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">All roles on track</span>
          )}
        </div>
      }
    >
      {jobs.length > 0 ? (
        <div className="overflow-x-auto -mx-5 sm:-mx-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/85 border-y border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                <th className="py-2.5 pl-5 sm:pl-6 pr-3 font-bold">Job Role</th>
                <th className="py-2.5 px-2.5 text-right font-bold">Applied</th>
                <th className="py-2.5 px-2.5 text-right font-bold">Interviewed</th>
                <th className="py-2.5 px-2.5 text-right font-bold">Selected</th>
                <th className="py-2.5 px-2.5 text-right font-bold">Open</th>
                <th className="py-2.5 pl-3 pr-5 sm:pr-6 text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.slice(0, 6).map((job) => {
                const isExpanded = expandedJobId === job.id;
                const hasMatches = job.top_matches.length > 0;
                return (
                  <React.Fragment key={job.id}>
                    <tr
                      onClick={() =>
                        hasMatches && setExpandedJobId(isExpanded ? null : job.id)
                      }
                      className={`group transition-colors ${
                        hasMatches ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <td className="py-3 pl-5 sm:pl-6 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {hasMatches ? (
                            isExpanded ? (
                              <ChevronDown size={13} className="text-indigo-600 shrink-0" />
                            ) : (
                              <ChevronRight
                                size={13}
                                className="text-slate-400 group-hover:text-slate-600 shrink-0"
                              />
                            )
                          ) : (
                            <span className="w-[13px] shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="text-[13px] font-semibold text-slate-800 group-hover:text-indigo-600 block leading-snug truncate">
                              {job.title}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {job.department}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs font-semibold text-slate-800 tabular-nums">
                        {job.applicants}
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs font-medium text-slate-700 tabular-nums">
                        {job.interviewed}
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs font-bold text-emerald-700 tabular-nums">
                        {job.shortlisted}
                      </td>
                      <td className="py-3 px-2.5 text-right text-xs font-medium text-slate-600 tabular-nums whitespace-nowrap">
                        {job.days_open}d
                      </td>
                      <td className="py-3 pl-3 pr-5 sm:pr-6 text-right">
                        <StatusIndicator health={job.health} />
                      </td>
                    </tr>

                    {isExpanded && hasMatches && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="py-2.5 pl-10 sm:pl-12 pr-5 sm:pr-6">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-slate-400 mr-1">
                                Top matches from talent pool:
                              </span>
                              {job.top_matches.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate(`/candidates/${encodeURIComponent(m.id)}`);
                                  }}
                                  title={
                                    m.applied
                                      ? `${m.name} applied to this role (${m.match_pct}% skill fit)`
                                      : `${m.name} is in your talent pool (${m.match_pct}% skill fit)`
                                  }
                                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                                    m.applied
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100/80'
                                      : 'bg-white border-slate-200/80 text-slate-700 hover:border-indigo-300 hover:text-indigo-700'
                                  }`}
                                >
                                  <span className="truncate max-w-[140px]">{m.name}</span>
                                  <span
                                    className={`text-[11px] font-semibold tabular-nums ${
                                      m.applied ? 'text-emerald-700' : 'text-indigo-600'
                                    }`}
                                  >
                                    {m.match_pct}%
                                  </span>
                                  {m.applied && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.2 rounded bg-emerald-600 text-white leading-tight">
                                      Applied
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate(`/job-openings?jobId=${encodeURIComponent(job.id)}`);
                              }}
                              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>Open role</span>
                              <ArrowRight size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center text-xs text-slate-400">
          No open jobs right now. Add a job opening to start tracking candidates.
        </div>
      )}
    </WidgetCard>
  );
});
