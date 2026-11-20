import React from 'react';
import { Users, FileUp, Briefcase, Video, Award } from 'lucide-react';
import type { DashboardStatItem, DateRangePreset } from '../../types/dashboard';

interface KpiCardsGridProps {
  stats: DashboardStatItem[];
  uniqueCandidatesInterviewed: number;
  totalInterviewRounds: number;
  activeInterviewingCount: number;
  dateRange: DateRangePreset;
  localTimeZoneName: string;
  onNavigate: (path: string) => void;
}

function getNewResumesSubtitle(dateRange: DateRangePreset): string {
  switch (dateRange) {
    case 'today':
      return 'Added today';
    case '7d':
      return 'In the last 7 days';
    case '30d':
      return 'In the last 30 days';
    case '90d':
      return 'In the last 90 days';
    case 'custom':
      return 'In selected dates';
    default:
      return 'In the last 24 hours';
  }
}

function InlineTrend({ item }: { item?: DashboardStatItem }) {
  if (!item || !item.trend_direction || item.trend_direction === 'flat') return null;

  const isUp = item.trend_direction === 'up';
  const pct =
    item.trend_percent !== null && item.trend_percent !== undefined
      ? `${Math.abs(item.trend_percent)}%`
      : `${Math.abs(item.trend_delta || 0)}`;

  return (
    <span
      title={
        item.trend_delta !== undefined && item.trend_delta !== null
          ? `${item.trend_delta > 0 ? '+' : ''}${item.trend_delta} (${item.trend_label || 'vs previous period'})`
          : item.trend_label || 'Compared to previous period'
      }
      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap ${
        isUp
          ? 'text-emerald-700 bg-emerald-50/90'
          : 'text-rose-700 bg-rose-50/90'
      }`}
    >
      {isUp ? '+' : '−'}
      {pct}
    </span>
  );
}

export const KpiCardsGrid = React.memo(function KpiCardsGrid({
  stats,
  uniqueCandidatesInterviewed,
  totalInterviewRounds,
  activeInterviewingCount,
  dateRange,
  localTimeZoneName,
  onNavigate,
}: KpiCardsGridProps) {
  const byKey = (key: string, fallbackLabel: string) =>
    stats.find((s) => s.key === key) || stats.find((s) => s.label === fallbackLabel);

  const totalStat = byKey('total_talent', 'Total Resumes');
  const parsedStat = byKey('parsed_window', 'AI Parsed Today');
  const jdStat = byKey('jd_matches', 'JD Matches');
  const jobsStat = byKey('active_jobs', 'Active Jobs');
  const interviewStat = byKey('interview_rounds', 'Interviews');
  const selectedStat = byKey('selected_offer', 'Offers');

  const matchedCount = jdStat?.value ?? '0';

  const metrics = [
    {
      id: 'total_talent',
      label: 'Total Candidates',
      value: totalStat?.value ?? '0',
      sub: `${matchedCount} matched to jobs`,
      tooltip: 'All candidate profiles in the system and how many match open roles.',
      path: '/database',
      stat: totalStat,
      icon: Users,
      iconTone: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80',
      hoverBorder: 'hover:border-indigo-200',
    },
    {
      id: 'parsed_window',
      label: 'New Resumes',
      value: `+${parsedStat?.value ?? '0'}`,
      sub: getNewResumesSubtitle(dateRange),
      tooltip: `Resumes uploaded and read by AI (${localTimeZoneName}).`,
      path: '/database?sort=latest',
      stat: parsedStat,
      icon: FileUp,
      iconTone: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100/80',
      hoverBorder: 'hover:border-sky-200',
    },
    {
      id: 'active_jobs',
      label: 'Open Jobs',
      value: jobsStat?.value ?? '0',
      sub: 'Currently hiring',
      tooltip: 'Open job roles actively accepting candidates.',
      path: '/job-openings',
      stat: jobsStat,
      icon: Briefcase,
      iconTone: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100/80',
      hoverBorder: 'hover:border-violet-200',
    },
    {
      id: 'interview_rounds',
      label: 'Interviews',
      value: interviewStat?.value ?? String(totalInterviewRounds),
      sub: `${uniqueCandidatesInterviewed} candidates · ${activeInterviewingCount} active`,
      tooltip: `${totalInterviewRounds} total interviews across ${uniqueCandidatesInterviewed} candidates (${activeInterviewingCount} currently interviewing).`,
      path: '/interviews',
      stat: interviewStat,
      icon: Video,
      iconTone: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100/80',
      hoverBorder: 'hover:border-amber-200',
    },
    {
      id: 'selected_offer',
      label: 'Selected & Offers',
      value: selectedStat?.value ?? '0',
      sub: selectedStat?.subtitle || 'Cleared interviews',
      tooltip: 'Candidates who passed interviews or received an offer.',
      path: '/database?attention=selected',
      stat: selectedStat,
      icon: Award,
      iconTone: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/80',
      hoverBorder: 'hover:border-emerald-200',
      valueTone: 'text-emerald-700',
    },
  ];

  return (
    <section
      aria-label="Key recruitment metrics"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
    >
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.id}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate(m.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate(m.path);
              }
            }}
            title={m.tooltip}
            className={`bg-white px-4 py-4 rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(79,70,229,0.10)] ${m.hoverBorder} hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-10px_rgba(79,70,229,0.16)] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate">{m.label}</span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.iconTone}`}
              >
                <Icon size={14} />
              </div>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span
                className={`text-2xl font-bold tracking-[-0.02em] tabular-nums leading-none ${
                  m.valueTone || 'text-slate-900'
                }`}
              >
                {m.value}
              </span>
              <InlineTrend item={m.stat} />
            </div>

            <div className="mt-1.5 text-[11px] font-medium text-slate-500 leading-snug truncate">{m.sub}</div>
          </div>
        );
      })}
    </section>
  );
});
