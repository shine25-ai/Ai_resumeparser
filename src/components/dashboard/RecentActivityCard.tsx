import React, { useMemo } from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import type { DashboardActivityItem } from '../../types/dashboard';

interface RecentActivityCardProps {
  recentActivities: DashboardActivityItem[];
  onNavigate: (path: string) => void;
  className?: string;
}

function getDotColor(iconType: string) {
  switch (iconType) {
    case 'sparkles':
      return 'bg-indigo-500';
    case 'video':
      return 'bg-sky-500';
    case 'check':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-300';
  }
}

export const RecentActivityCard = React.memo(function RecentActivityCard({
  recentActivities,
  onNavigate,
  className = '',
}: RecentActivityCardProps) {
  const uniqueActivities = useMemo(() => {
    const seen = new Set<string>();
    const result: DashboardActivityItem[] = [];
    for (const act of recentActivities) {
      const key = `${(act.title || '').trim().toLowerCase()}|${(act.details || '').trim().toLowerCase()}|${(act.time || '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(act);
      if (result.length >= 5) break;
    }
    return result;
  }, [recentActivities]);

  const handleActivityClick = (act: DashboardActivityItem) => {
    if (act.email) {
      onNavigate(`/database?search=${encodeURIComponent(act.email)}`);
      return;
    }
    const titleLower = (act.title || '').toLowerCase();
    if (titleLower.includes('interview')) {
      const namePart = act.title.split(':')[1]?.trim();
      onNavigate(namePart ? `/interviews?view=all&search=${encodeURIComponent(namePart)}` : '/interviews');
      return;
    }
    if (titleLower.includes('resume')) {
      const namePart = act.title.split(':')[1]?.trim();
      onNavigate(namePart && namePart !== 'Candidate' ? `/database?search=${encodeURIComponent(namePart)}` : '/database');
      return;
    }
    onNavigate('/audit-log');
  };

  return (
    <WidgetCard
      title="Recent Activity"
      subtitle="Latest job applications and candidate updates"
      icon={<Activity size={15} />}
      iconBg="bg-violet-50 text-violet-600 ring-1 ring-violet-100/80"
      className={className}
      headerRight={
        <button
          type="button"
          onClick={() => onNavigate('/audit-log')}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span>History</span>
          <ArrowRight size={12} />
        </button>
      }
    >
      {uniqueActivities.length > 0 ? (
        <div className="divide-y divide-slate-100 -mx-2">
          {uniqueActivities.map((act, i) => (
            <button
              key={`${act.title}-${act.time}-${i}`}
              type="button"
              onClick={() => handleActivityClick(act)}
              className="w-full py-2.5 px-2 rounded-lg hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3 text-left group"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[6px] ${getDotColor(act.icon_type)}`}
                />
                <div className="min-w-0">
                  <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 transition-colors block leading-snug truncate">
                    {act.title}
                  </span>
                  {act.details && (
                    <span className="text-xs text-slate-500 block mt-0.5 truncate">
                      {act.details}
                    </span>
                  )}
                </div>
              </div>

              <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap tabular-nums pt-0.5">
                {act.time}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-slate-400">
          No recent activity yet.
        </div>
      )}
    </WidgetCard>
  );
});
