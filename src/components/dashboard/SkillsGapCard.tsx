import React, { useMemo } from 'react';
import { Cpu } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { SkillGapItem } from '../../types/dashboard';

interface SkillsGapCardProps {
  items: SkillGapItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
}

export const SkillsGapCard = React.memo(function SkillsGapCard({
  items,
  loading,
  error,
  onRetry,
  onNavigate,
}: SkillsGapCardProps) {
  const highGapCount = useMemo(
    () => items.filter((i) => i.gap_severity === 'high').length,
    [items]
  );

  return (
    <WidgetCard
      title="In-Demand Skills"
      subtitle="Skills needed by open jobs compared with candidates who list them"
      icon={<Cpu size={15} />}
      iconBg="bg-rose-50 text-rose-600 ring-1 ring-rose-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        highGapCount > 0 ? (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 tabular-nums">
            {highGapCount} {highGapCount === 1 ? 'shortage' : 'shortages'}
          </span>
        ) : (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            Good coverage
          </span>
        )
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Target: 8 candidates per open job (Shortage &lt;40%, Low &lt;75%)</span>
          <span className="text-slate-400">Click skill to search</span>
        </div>
      }
    >
      {items.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 7).map((item) => {
            const barColor =
              item.gap_severity === 'high'
                ? 'bg-rose-500'
                : item.gap_severity === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';
            const badgeStyle =
              item.gap_severity === 'high'
                ? 'bg-rose-50 text-rose-700'
                : item.gap_severity === 'medium'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700';

            return (
              <button
                key={item.skill}
                type="button"
                onClick={() => onNavigate(`/database?skill=${encodeURIComponent(item.skill)}`)}
                className="w-full py-2.5 -mx-2 px-2 rounded-lg hover:bg-slate-50/70 transition-colors text-left space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-slate-800 truncate">
                    {item.skill}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-[11px] text-slate-500">
                      {item.demand_jobs > 0
                        ? `${item.demand_jobs} ${item.demand_jobs === 1 ? 'job' : 'jobs'}`
                        : 'Talent pool'}{' '}
                      ·{' '}
                      <strong className="font-semibold text-slate-800">
                        {item.supply_candidates}
                      </strong>{' '}
                      {item.supply_candidates === 1 ? 'candidate' : 'candidates'}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeStyle}`}>
                      {item.gap_severity === 'high'
                        ? 'Shortage'
                        : item.gap_severity === 'medium'
                          ? 'Low'
                          : 'Good'}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${Math.max(item.coverage_pct, 4)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-xs text-slate-400">
          Add required skills to open job descriptions to analyze demand vs. supply gaps.
        </div>
      )}
    </WidgetCard>
  );
});

