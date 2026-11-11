import { useEffect, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { getInterviews, type InterviewItem } from "../../utils/Api";
import { getInterviewPhase, todayIso } from "../../utils/interviewState";

/**
 * The default Interviews view: what is happening today, what is coming up, and which
 * past interviews still need feedback. Replaces the separate Interview Dashboard page.
 */

interface TodayViewProps {
  refreshKey: number;
  onFeedback: (item: InterviewItem) => void;
  onReschedule: (item: InterviewItem) => void;
  onView: (item: InterviewItem) => void;
}

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayLabel = (iso: string, today: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const text = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (iso === today) return `Today, ${text}`;
  if (iso === shiftDays(today, 1)) return `Tomorrow, ${text}`;
  return text;
};

const byDateTime = (a: InterviewItem, b: InterviewItem) =>
  `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`);

const typeLabel = (code?: string) => {
  if (!code) return "";
  if (code.length <= 3) return code.toUpperCase(); // HR, QA
  return code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

const panelNames = (item: InterviewItem) =>
  (item.interviewers?.length ? item.interviewers.map((i) => i.interviewer_name) : [item.interviewer_name]).filter(Boolean).join(", ");

export function TodayView({ refreshKey, onFeedback, onReschedule, onView }: TodayViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<InterviewItem[]>([]);
  const [needsFeedback, setNeedsFeedback] = useState<InterviewItem[]>([]);
  const today = todayIso();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const listOf = (data: any): InterviewItem[] => (Array.isArray(data) ? data : data?.interviews || data?.data?.interviews || []);
    Promise.all([
      // Next 14 days
      getInterviews({ date_from: today, date_to: shiftDays(today, 14), limit: 200 }),
      // Last 30 days, to find interviews still waiting for feedback
      getInterviews({ date_from: shiftDays(today, -30), date_to: shiftDays(today, -1), limit: 200 }),
    ])
      .then(([next, past]) => {
        if (cancelled) return;
        setUpcoming(listOf(next).filter((i) => getInterviewPhase(i, today) === "upcoming").sort(byDateTime));
        setNeedsFeedback(listOf(past).filter((i) => getInterviewPhase(i, today) === "needs-feedback").sort(byDateTime).reverse());
      })
      .catch((err) => !cancelled && setError(err?.message || "Could not load interviews."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey, today]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
        <Loader2 size={18} className="animate-spin text-indigo-600" /> Loading today's interviews...
      </div>
    );
  }
  if (error) {
    return <p className="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">{error}</p>;
  }

  const groups = upcoming.reduce<Record<string, InterviewItem[]>>((acc, item) => {
    (acc[item.scheduled_date] ||= []).push(item);
    return acc;
  }, {});

  const row = (item: InterviewItem, action: React.ReactNode, when: string) => (
    <li
      key={item.id}
      className="grid grid-cols-[auto_1fr] sm:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_170px] gap-x-4 gap-y-1 items-center rounded-xl border border-slate-200 bg-white px-4 py-3"
    >
      <span className="font-bold text-slate-900 text-sm">{when}</span>
      <button onClick={() => onView(item)} className="text-left font-semibold text-slate-900 text-sm hover:text-indigo-700 cursor-pointer truncate">
        {item.candidate_name}
      </button>
      <span className="text-sm text-slate-600 truncate col-span-2 sm:col-span-1">{item.job_title}</span>
      <span className="text-sm text-slate-600 truncate hidden sm:block">{typeLabel(item.interview_type)}, R{item.round_number || 1}</span>
      <span className="text-sm text-slate-600 truncate hidden sm:block">{panelNames(item)}</span>
      <span className="col-span-2 sm:col-span-1 flex justify-end gap-3">{action}</span>
    </li>
  );

  const join = (item: InterviewItem) =>
    item.meeting_link ? (
      <a href={item.meeting_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline">
        <Video size={14} /> Join
      </a>
    ) : null;

  return (
    <div className="space-y-6">
      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">Nothing booked for the next two weeks.</p>
      )}

      {Object.entries(groups).map(([date, items]) => (
        <section key={date} aria-label={dayLabel(date, today)}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{dayLabel(date, today)}</h3>
          <ul className="space-y-2">
            {items.map((item) =>
              row(
                item,
                <>
                  {join(item)}
                  <button onClick={() => onReschedule(item)} className="text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer">
                    Reschedule
                  </button>
                </>,
                item.scheduled_time
              )
            )}
          </ul>
        </section>
      ))}

      <section aria-label="Needs feedback">
        <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Needs feedback ({needsFeedback.length})</h3>
        {needsFeedback.length === 0 ? (
          <p className="text-sm text-slate-500">All interviews from the last 30 days have feedback.</p>
        ) : (
          <ul className="space-y-2">
            {needsFeedback.map((item) =>
              row(
                item,
                <button onClick={() => onFeedback(item)} className="text-sm font-semibold text-indigo-700 hover:underline cursor-pointer">
                  Give feedback
                </button>,
                new Date(`${item.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
