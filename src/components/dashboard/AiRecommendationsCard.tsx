import React from 'react';
import { Sparkles, ChevronRight, Clock } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { AiRecommendationsData } from '../../types/dashboard';

interface AiRecommendationsCardProps {
  data?: AiRecommendationsData;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
}

export const AiRecommendationsCard = React.memo(function AiRecommendationsCard({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
}: AiRecommendationsCardProps) {
  const uncontacted = data?.missed_candidates || [];

  return (
    <WidgetCard
      title="Uncontacted Talent Matches"
      subtitle="Strong pool candidates in Screening who haven't applied to these roles yet"
      icon={<Sparkles size={15} />}
      iconBg="bg-violet-50 text-violet-600 ring-1 ring-violet-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        uncontacted.length > 0 ? (
          <span className="text-xs font-medium text-indigo-600 tabular-nums">
            {uncontacted.length} suggested
          </span>
        ) : undefined
      }
      footer={
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Sparkles size={12} className="text-indigo-500" />
            <span>Excludes candidates who already applied</span>
          </span>
          <button
            type="button"
            onClick={() => onNavigate('/jd-match')}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Open Job Matcher →
          </button>
        </div>
      }
    >
      {uncontacted.length > 0 ? (
        <div className="divide-y divide-slate-100 -mx-2">
          {uncontacted.map((c) => (
            <button
              key={`${c.id}-${c.job_id}`}
              type="button"
              onClick={() => onNavigate(`/candidates/${encodeURIComponent(c.id)}`)}
              className="w-full py-2.5 px-2 rounded-lg hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-2.5 text-left group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 truncate">
                    {c.name}
                  </span>
                  {c.days_in_pool > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 tabular-nums shrink-0">
                      <Clock size={9} />
                      {c.days_in_pool}d in pool
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 block truncate mt-0.5">
                  Good fit for <strong className="font-medium text-slate-700">{c.matched_job}</strong>
                </span>
                {c.matched_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.matched_skills.slice(0, 3).map((sk) => (
                      <span
                        key={sk}
                        className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200/70 px-1.5 py-0.2 rounded"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-md tabular-nums">
                  {c.match_pct}%
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-xs text-slate-400">
          No uncontacted Screening candidates match open jobs right now.
        </div>
      )}
    </WidgetCard>
  );
});
