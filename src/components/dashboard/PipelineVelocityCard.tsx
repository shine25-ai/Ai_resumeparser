import React from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import type { DashboardPipelineItem } from '../../types/dashboard';

interface PipelineVelocityCardProps {
  pipelineData: DashboardPipelineItem[];
  totalResumes: string;
  onNavigate: (path: string) => void;
}

const STAGE_META: Record<
  string,
  { label: string; barColor: string; targetPath: string }
> = {
  'Resumes Uploaded': {
    label: 'Applied / Uploaded',
    barColor: 'bg-gradient-to-r from-indigo-600 to-violet-500',
    targetPath: '/database',
  },
  Interviewed: {
    label: 'Interviewed',
    barColor: 'bg-gradient-to-r from-sky-500 to-indigo-500',
    targetPath: '/database?stage=Interviewing',
  },
  Selected: {
    label: 'Selected',
    barColor: 'bg-gradient-to-r from-emerald-500 to-teal-500',
    targetPath: '/database?attention=selected',
  },
  Offer: {
    label: 'Offer Sent',
    barColor: 'bg-gradient-to-r from-teal-500 to-emerald-500',
    targetPath: '/database?stage=Offer',
  },
  Hired: {
    label: 'Hired',
    barColor: 'bg-gradient-to-r from-emerald-600 to-green-500',
    targetPath: '/database?stage=Hired',
  },
};

export const PipelineVelocityCard = React.memo(function PipelineVelocityCard({
  pipelineData,
  totalResumes,
  onNavigate,
}: PipelineVelocityCardProps) {
  const uploadedCount =
    parseInt(pipelineData.find((p) => p.stage === 'Resumes Uploaded')?.count || totalResumes, 10) ||
    1;
  const interviewedCount = parseInt(
    pipelineData.find((p) => p.stage === 'Interviewed')?.count || '0',
    10
  );
  const selectedCount = parseInt(
    pipelineData.find((p) => p.stage === 'Selected')?.count || '0',
    10
  );
  const interviewPassRate =
    interviewedCount > 0 ? Math.round((selectedCount / interviewedCount) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/85 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(79,70,229,0.10)] flex flex-col justify-between h-full overflow-hidden">
      <div className="flex-1 flex flex-col">
        {/* Highlighted Card Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-slate-50/80 border-b border-slate-200/75">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80 flex items-center justify-center shrink-0 mt-0.5">
              <TrendingUp size={15} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-bold text-slate-900 tracking-[-0.015em] leading-snug">
                Hiring Pipeline
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Candidate progress across each hiring stage
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('/database')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 transition-colors shrink-0"
          >
            <span>View all</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Funnel Rows */}
        <div className="px-5 sm:px-6 py-4 flex-1">
          {pipelineData.length > 0 ? (
            <div className="space-y-4">
              {pipelineData.map((step, idx) => {
                const meta = STAGE_META[step.stage] || {
                  label: step.stage,
                  barColor: 'bg-indigo-500',
                  targetPath: '/database',
                };
                const countNum = parseInt(step.count, 10) || 0;
                const widthPct =
                  idx === 0
                    ? 100
                    : uploadedCount > 0
                      ? Math.round((countNum / uploadedCount) * 100)
                      : 0;
                const convPrev = step.conversion_from_prev_percent;

                return (
                  <div key={step.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onNavigate(meta.targetPath)}
                        className="text-[13px] font-medium text-slate-800 hover:text-indigo-600 transition-colors truncate text-left"
                      >
                        {meta.label}
                      </button>

                      <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                        {idx > 0 && convPrev !== null && convPrev !== undefined && (
                          <span className="text-xs text-slate-500">
                            {Math.round(convPrev)}%
                          </span>
                        )}
                        <span className="text-[13px] font-semibold text-slate-900 min-w-[28px] text-right">
                          {countNum}
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${meta.barColor} transition-all duration-500`}
                        style={{ width: `${Math.max(widthPct, countNum > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              No hiring funnel data available yet.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 sm:px-6 py-3 bg-slate-50/40 flex items-center justify-between gap-2 text-xs text-slate-600 border-t border-slate-100 tabular-nums">
        <span>Interview-to-selection conversion</span>
        <span>
          Selection rate:{' '}
          <strong className="font-semibold text-indigo-600">{interviewPassRate}%</strong>
        </span>
      </div>
    </div>
  );
});
