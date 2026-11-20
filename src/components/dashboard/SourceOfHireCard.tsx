import React, { useMemo, useState } from 'react';
import { Share2, Info } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { SourceOfHireItem } from '../../types/dashboard';

interface SourceOfHireCardProps {
  items: SourceOfHireItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigate?: (path: string) => void;
}

const DEFAULT_DIVISION_CONTENTS: Record<string, string[]> = {
  'Job Portals': ['Naukri', 'Indeed', 'Glassdoor', 'Foundit / Monster', 'Shine'],
  'Social & Professional': ['LinkedIn', 'WhatsApp', 'Social Media'],
  'Careers Website': ['Careers Page', 'Company Website'],
  'Referrals & Events': ['Employee Referral', 'Walk-in', 'Campus Drive'],
  'Agencies & Vendors': ['Recruitment Consultancy', 'Staffing Agency'],
  'Direct & Email': ['Direct Upload', 'Email'],
};

export const SourceOfHireCard = React.memo(function SourceOfHireCard({
  items,
  loading,
  error,
  onRetry,
  onNavigate,
}: SourceOfHireCardProps) {
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);

  const totalCandidates = useMemo(
    () => items.reduce((sum, i) => sum + (i.candidates || 0), 0) || 1,
    [items]
  );

  const bestConverting = useMemo(
    () =>
      items
        .filter((i) => i.candidates >= 2)
        .reduce<SourceOfHireItem | null>(
          (best, curr) => (curr.conversion_rate > (best?.conversion_rate ?? -1) ? curr : best),
          items[0] || null
        ),
    [items]
  );

  return (
    <WidgetCard
      title="Where Candidates Come From"
      subtitle="Grouped sourcing channels — hover any row to see included sources"
      icon={<Share2 size={15} />}
      iconBg="bg-sky-50 text-sky-600 ring-1 ring-sky-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        <span className="text-[11px] font-medium text-slate-500 tabular-nums">
          {items.length} {items.length === 1 ? 'group' : 'groups'}
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            Best source:{' '}
            <strong className="font-semibold text-slate-800">
              {bestConverting
                ? `${bestConverting.source} (${bestConverting.conversion_rate}%)`
                : '—'}
            </strong>
          </span>
          <span className="text-slate-400 whitespace-nowrap">% reached interview</span>
        </div>
      }
    >
      {items.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => {
            const sharePct = Math.round((item.candidates / totalCandidates) * 100);
            const isHovered = hoveredSource === item.source;
            const breakdown = item.breakdown && item.breakdown.length > 0 ? item.breakdown : null;
            const fallbackList = DEFAULT_DIVISION_CONTENTS[item.source] || [];
            const showBelow = idx === 0;

            return (
              <div
                key={item.source}
                className="relative"
                onMouseEnter={() => setHoveredSource(item.source)}
                onMouseLeave={() => setHoveredSource((prev) => (prev === item.source ? null : prev))}
              >
                <button
                  type="button"
                  onClick={() => onNavigate?.(`/database?source=${encodeURIComponent(item.source)}`)}
                  onFocus={() => setHoveredSource(item.source)}
                  onBlur={() => setHoveredSource((prev) => (prev === item.source ? null : prev))}
                  className="w-full py-2.5 -mx-2 px-2 rounded-lg hover:bg-slate-50/80 transition-colors space-y-1.5 text-left group cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                        {item.source}
                      </span>
                      <Info
                        size={12}
                        className="text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0"
                      />
                      <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {item.candidates} ({sharePct}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                      <span className="text-[11px] text-slate-500">
                        {item.interviewed} interviewed · {item.selected} selected
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          item.conversion_rate >= 30
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.conversion_rate}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500/85 transition-all duration-500"
                      style={{ width: `${Math.max(sharePct, item.candidates > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </button>

                {/* Styled Hover Breakdown Tooltip */}
                {isHovered && (breakdown || fallbackList.length > 0) && (
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute left-2 z-30 w-64 rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700/80 px-3.5 py-2.5 text-xs ${
                      showBelow ? 'top-full mt-1' : 'bottom-full mb-1'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-700/80">
                      <span className="font-semibold text-white">{item.source}</span>
                      <span className="text-[11px] text-slate-300 tabular-nums">
                        {item.candidates} total
                      </span>
                    </div>
                    {breakdown ? (
                      <ul className="space-y-1">
                        {breakdown.map((b) => (
                          <li
                            key={b.name}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-200 truncate">{b.name}</span>
                            <span className="font-semibold text-indigo-300 tabular-nums shrink-0">
                              {b.count} {b.count === 1 ? 'candidate' : 'candidates'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-slate-300 leading-relaxed">
                        Includes: {fallbackList.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-slate-400">
          No candidate source records available for this period.
        </div>
      )}
    </WidgetCard>
  );
});
