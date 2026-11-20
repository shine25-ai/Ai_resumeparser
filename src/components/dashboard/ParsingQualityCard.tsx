import React from 'react';
import { FileCheck2 } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { ParsingQualityData } from '../../types/dashboard';

interface ParsingQualityCardProps {
  data?: ParsingQualityData;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
  className?: string;
}

export const ParsingQualityCard = React.memo(function ParsingQualityCard({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
  className = '',
}: ParsingQualityCardProps) {
  const successRate = data?.parse_success_rate ?? 0;
  const avgConfidence = data?.avg_confidence_score ?? 0;
  const failedCount = data?.failed_count ?? 0;
  const missingFields = data?.missing_fields || [];

  return (
    <WidgetCard
      title="Resume Reading Quality"
      subtitle="How accurately and completely resumes are read by AI"
      icon={<FileCheck2 size={15} />}
      iconBg="bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80"
      className={className}
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        failedCount > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate('/database?attention=low_confidence')}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 hover:bg-rose-100/70 tabular-nums"
          >
            {failedCount} failed
          </button>
        ) : (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            0 failed
          </span>
        )
      }
      footer={
        <div className="flex items-center justify-between">
          <span>
            Checked:{' '}
            <strong className="font-semibold text-slate-800 tabular-nums">
              {data?.total_resumes ?? 0} resumes
            </strong>
          </span>
          <span className="text-slate-400">Based on key contact &amp; job fields</span>
        </div>
      }
    >
      {/* Top 2 Summary Stat Boxes */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-slate-50/90 border border-slate-200/60">
          <span className="text-[11px] text-slate-500 block">Successfully read</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-slate-900 tabular-nums">
              {successRate}%
            </span>
            <span className="text-[10px] text-emerald-700 font-medium">good</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50/90 border border-slate-200/60">
          <span className="text-[11px] text-slate-500 block">Profile completeness</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold text-slate-900 tabular-nums">
              {avgConfidence}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">fields filled</span>
          </div>
        </div>
      </div>

      {/* Frequently Missing Fields */}
      <div>
        <div className="text-xs font-bold text-slate-800 mb-2.5">
          Fields missing from resumes (not found in uploaded files)
        </div>
        {missingFields.length > 0 ? (
          <div className="space-y-2.5">
            {missingFields.map((mf) => (
              <div key={mf.field} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{mf.field}</span>
                  <span className="text-slate-500 tabular-nums">
                    {mf.count} missing{' '}
                    <span className="text-slate-400">({mf.percent}%)</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      mf.percent >= 50
                        ? 'bg-amber-500'
                        : mf.percent >= 20
                          ? 'bg-indigo-400'
                          : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(mf.percent, 2))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            All core candidate fields are completely populated.
          </div>
        )}
      </div>
    </WidgetCard>
  );
});

