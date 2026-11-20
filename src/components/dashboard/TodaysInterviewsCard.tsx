import React, { useState, useMemo } from 'react';
import { Calendar, Video, CalendarClock, XCircle, Plus, User } from 'lucide-react';
import { WidgetCard } from './WidgetCard';
import { cancelInterviewQuick } from '../../utils/Api';
import type {
  TodayInterviewItem,
  DashboardUpcomingInterviewItem,
} from '../../types/dashboard';

interface TodaysInterviewsCardProps {
  interviews: TodayInterviewItem[];
  upcomingInterviews?: DashboardUpcomingInterviewItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefreshDashboard: () => void;
  onNavigate: (path: string) => void;
}

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr: string) {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    }
  } catch {
    // ignore
  }
  return dateStr || 'TBD';
}

export const TodaysInterviewsCard = React.memo(function TodaysInterviewsCard({
  interviews,
  upcomingInterviews = [],
  loading,
  error,
  onRetry,
  onRefreshDashboard,
  onNavigate,
}: TodaysInterviewsCardProps) {
  const [tab, setTab] = useState<'today' | 'upcoming'>('today');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Deduplicate today's interviews by candidate + date + time
  const uniqueTodayInterviews = useMemo(() => {
    const seen = new Set<string>();
    return interviews.filter((inv) => {
      const k = `${(inv.candidate || '').trim().toLowerCase()}|${(inv.date || '').slice(0, 10)}|${(inv.time || '').trim()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [interviews]);

  // Strictly future interviews only (exclude today and deduplicate)
  const futureInterviews = useMemo(() => {
    const todayIso = getLocalTodayIso();
    const seen = new Set<string>();
    return upcomingInterviews.filter((item) => {
      const d = (item.scheduled_date || '').slice(0, 10);
      if (d <= todayIso) return false;
      const k = `${(item.candidate || '').trim().toLowerCase()}|${d}|${(item.time || '').trim()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [upcomingInterviews]);

  const handleCancel = async (item: TodayInterviewItem) => {
    if (!item.id) return;
    setCancellingId(item.id);
    setActionMsg(null);
    try {
      await cancelInterviewQuick(item.id);
      setActionMsg(`Cancelled interview with ${item.candidate}.`);
      onRefreshDashboard();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Could not cancel interview.');
    } finally {
      setCancellingId(null);
    }
  };

  const openProfile = (candidateId?: string | null, candidateName?: string | null) => {
    if (candidateId) {
      onNavigate(`/candidates/${encodeURIComponent(candidateId)}`);
    } else if (candidateName) {
      onNavigate(`/database?search=${encodeURIComponent(candidateName)}`);
    } else {
      onNavigate('/interviews');
    }
  };

  const openReschedule = (interviewId?: string | null) => {
    if (interviewId) {
      onNavigate(`/interviews?reschedule=${encodeURIComponent(interviewId)}`);
    } else {
      onNavigate('/interviews');
    }
  };

  return (
    <WidgetCard
      title="Interviews"
      subtitle="Today's meetings and upcoming schedule"
      icon={<Calendar size={15} />}
      iconBg="bg-sky-50 text-sky-600 ring-1 ring-sky-100/80"
      loading={loading}
      error={error}
      onRetry={onRetry}
      headerRight={
        <div className="inline-flex items-center bg-slate-100/90 rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setTab('today')}
            className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
              tab === 'today'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Today ({uniqueTodayInterviews.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
              tab === 'upcoming'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Upcoming ({futureInterviews.length})
          </button>
        </div>
      }
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('/interviews?action=schedule')}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
          >
            <Plus size={12} />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/interviews')}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Calendar →
          </button>
        </div>
      }
    >
      {actionMsg && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
          {actionMsg}
        </div>
      )}

      {tab === 'today' ? (
        uniqueTodayInterviews.length > 0 ? (
          <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto pr-1">
            {uniqueTodayInterviews.map((inv) => {
              const isCompleted = inv.status === 'COMPLETED';
              return (
                <div
                  key={inv.id || `${inv.candidate}-${inv.time}`}
                  className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-2.5"
                >
                  <button
                    type="button"
                    onClick={() => openProfile(inv.candidate_id, inv.candidate)}
                    className="min-w-0 text-left group flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600 tabular-nums shrink-0">
                        {inv.time}
                      </span>
                      <span className="text-[13px] font-medium text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {inv.candidate}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">{inv.role}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      with {inv.interviewer}
                    </div>
                  </button>

                  {/* Clean Icon Actions */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {inv.meeting_link && (
                      <a
                        href={inv.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Join meeting"
                        aria-label={`Join meeting with ${inv.candidate}`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                      >
                        <Video size={13} />
                      </a>
                    )}

                    <button
                      type="button"
                      title="View candidate profile"
                      aria-label={`View ${inv.candidate} profile`}
                      onClick={() => openProfile(inv.candidate_id, inv.candidate)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <User size={13} />
                    </button>

                    <button
                      type="button"
                      title="Reschedule interview"
                      aria-label={`Reschedule ${inv.candidate}`}
                      onClick={() => openReschedule(inv.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <CalendarClock size={13} />
                    </button>

                    {!isCompleted && inv.id && (
                      <button
                        type="button"
                        disabled={cancellingId === inv.id}
                        title="Cancel interview"
                        aria-label={`Cancel ${inv.candidate}`}
                        onClick={() => handleCancel(inv)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      >
                        <XCircle size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Calendar size={18} className="mx-auto text-slate-300 mb-1.5" />
            <p className="text-xs font-medium text-slate-600">No interviews today</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Switch to Upcoming or schedule a new one.
            </p>
          </div>
        )
      ) : futureInterviews.length > 0 ? (
        <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto pr-1">
          {futureInterviews.slice(0, 8).map((item, i) => (
            <div
              key={item.id || `${item.candidate}-${i}`}
              className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5"
            >
              <button
                type="button"
                onClick={() => openProfile(item.candidate_id, item.candidate)}
                className="min-w-0 text-left group flex-1"
              >
                <span className="text-[13px] font-medium text-slate-800 group-hover:text-indigo-600 block truncate transition-colors">
                  {item.candidate}
                </span>
                <span className="text-xs text-slate-500 block truncate">{item.role}</span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <div className="text-right tabular-nums mr-1">
                  <span className="text-[11px] font-medium text-slate-700 block">
                    {formatShortDate(item.scheduled_date || '')}
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {item.scheduled_time || item.time}
                  </span>
                </div>
                <button
                  type="button"
                  title="View candidate profile"
                  aria-label={`View ${item.candidate} profile`}
                  onClick={() => openProfile(item.candidate_id, item.candidate)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <User size={13} />
                </button>
                {item.id && (
                  <button
                    type="button"
                    title="Reschedule interview"
                    aria-label={`Reschedule ${item.candidate}`}
                    onClick={() => openReschedule(item.id)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    <CalendarClock size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <Calendar size={18} className="mx-auto text-slate-300 mb-1.5" />
          <p className="text-xs font-medium text-slate-600">No upcoming interviews</p>
        </div>
      )}
    </WidgetCard>
  );
});
