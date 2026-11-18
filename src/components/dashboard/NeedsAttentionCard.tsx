import React, { useMemo } from 'react';
import { ChevronRight, CheckCircle2, BellRing } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { AttentionItem } from '../../types/dashboard';

interface NeedsAttentionCardProps {
  items: AttentionItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate: (path: string) => void;
}

const ITEM_COPY: Record<string, { title: string; detail: string }> = {
  unreviewed_resumes: {
    title: 'Resumes waiting for review',
    detail: 'Uploaded profiles with no recruiter notes or interview yet',
  },
  low_confidence: {
    title: 'Resumes needing manual check',
    detail: 'Failed to read or missing key details (email, phone, skills)',
  },
  awaiting_feedback: {
    title: 'Interviews missing feedback',
    detail: 'Marked completed without a verdict or interviewer notes',
  },
  possible_duplicates: {
    title: 'Possible duplicate profiles',
    detail: 'Multiple resumes sharing the same email or phone number',
  },
  pending_offers: {
    title: 'Pending or expiring offers',
    detail: 'Candidates in Offer stage awaiting acceptance',
  },
};

function getItemCopy(item: AttentionItem): { title: string; detail: string } {
  if (item.key === 'stuck_candidates') {
    const match = item.label.match(/(\d+)/);
    const days = match ? match[1] : '7';
    return {
      title: `Candidates waiting over ${days} days`,
      detail: `No stage movement in Screening, Interviewing, or Offer for ${days}+ days`,
    };
  }
  return ITEM_COPY[item.key] || { title: item.label, detail: 'Click to review' };
}

function getDotStyle(severity: AttentionItem['severity']) {
  if (severity === 'danger') return 'bg-rose-500';
  if (severity === 'warning') return 'bg-amber-500';
  return 'bg-indigo-500';
}

function getTargetRoute(item: AttentionItem): string {
  switch (item.key) {
    case 'unreviewed_resumes':
      return '/database?attention=unreviewed';
    case 'low_confidence':
      return '/database?attention=low_confidence';
    case 'stuck_candidates': {
      const match = item.label.match(/(\d+)/);
      const days = match ? match[1] : '7';
      return `/database?attention=stuck&days=${days}`;
    }
    case 'awaiting_feedback':
      return '/interviews?view=all&filter=awaiting_feedback';
    case 'possible_duplicates':
      return '/pipeline?tab=duplicates';
    case 'pending_offers':
      return '/pipeline?tab=offers';
    default:
      return item.actionPath || '/database';
  }
}

export const NeedsAttentionCard = React.memo(function NeedsAttentionCard({
  items,
  loading,
  error,
  onRetry,
  onNavigate,
}: NeedsAttentionCardProps) {
  const activeItems = useMemo(() => items.filter((i) => i.count > 0), [items]);
  const clearItems = useMemo(() => items.filter((i) => i.count === 0), [items]);
  const totalActionable = useMemo(
    () => activeItems.reduce((sum, item) => sum + item.count, 0),
    [activeItems]
  );

  return (
    <WidgetCard
      title="Needs Attention"
      subtitle="Pending recruiter actions across your pipeline"
      icon={<BellRing size={15} />}
      iconBg="bg-amber-50 text-amber-600 ring-1 ring-amber-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        totalActionable > 0 ? (
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {totalActionable} pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={12} />
            All clear
          </span>
        )
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              {clearItems.length} of {items.length} checks clear
            </span>
          </span>
          <span className="text-slate-400">Click any item to filter</span>
        </div>
      }
    >
      {activeItems.length > 0 ? (
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 -mx-2">
            {activeItems.map((item) => {
              const copy = getItemCopy(item);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(getTargetRoute(item))}
                  className="w-full py-2.5 px-2 hover:bg-slate-50/80 rounded-lg transition-colors flex items-start justify-between gap-3 text-left group"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[6px] ${getDotStyle(item.severity)}`}
                    />
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors block leading-snug">
                        {copy.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5 leading-snug">
                        {copy.detail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <span className="text-[13px] font-semibold text-slate-900 tabular-nums">
                      {item.count}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-slate-300 group-hover:text-indigo-600 transition-colors"
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {clearItems.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                No issues found
              </div>
              <div className="space-y-1">
                {clearItems.map((item) => {
                  const copy = getItemCopy(item);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onNavigate(getTargetRoute(item))}
                      className="w-full py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-2 text-left group"
                    >
                      <span className="inline-flex items-center gap-2 text-xs text-slate-500 group-hover:text-slate-800 truncate">
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{copy.title}</span>
                      </span>
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded tabular-nums shrink-0">
                        0
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center space-y-1">
          <CheckCircle2 size={18} className="mx-auto text-emerald-500" />
          <p className="text-xs font-medium text-slate-700">Everything is caught up</p>
          <p className="text-[11px] text-slate-400">
            No delayed candidates or pending reviews.
          </p>
        </div>
      )}
    </WidgetCard>
  );
});
