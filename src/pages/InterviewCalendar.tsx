import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, Calendar as CalendarIcon } from "lucide-react";
import { apiFetch, BASE_URL, getInterviews, rescheduleInterview } from "../utils/Api";
import type { InterviewItem, RescheduleInterviewPayload } from "../types/interview";
import { useFeedback } from "../components/ui/Feedback";
import { ScheduleInterviewForm } from "../components/interview/ScheduleInterviewForm";
import { KpiGrid, KpiTile, PageHeader, TabGroup, btnPrimary, btnSecondary } from "../components/interview/interviewUi";
import { viewerTimeFor, viewerTimeZone } from "../utils/timezones";

/** Adds the date and time this interview shows for the viewer, from its own timezone. */
const withViewer = (i: InterviewItem): InterviewItem => {
  const v = viewerTimeFor(i.scheduled_date, i.scheduled_time, i.timezone);
  return { ...i, viewer_date: v.date, viewer_time: v.time };
};
import { AvailabilityPanel, InterviewListView, InterviewPanelView, TodayInterviewsTable } from "../components/interview/CalendarViews";

/**
 * Interview calendar (Phase 8): day, week and month views with filters, colour by round,
 * a side panel for today, and drag-to-reschedule (confirmed, with a conflict check first).
 *
 * Times are shown in each viewer's own timezone; drag-and-drop keeps each interview's stored time.
 */

type CalendarView = "day" | "week" | "month";

const ROUND_COLOURS = [
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-cyan-100 text-cyan-800 border-cyan-300",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => new Date(`${iso}T00:00:00`);
const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};
const startOfWeek = (d: Date) => {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -day);
};
const startOfMonthGrid = (d: Date) => startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));

const colourForRound = (round: number) => ROUND_COLOURS[(Math.max(1, round) - 1) % ROUND_COLOURS.length];
const interviewerKey = (i: InterviewItem) => i.interviewer_id || i.interviewer_name || "unassigned";
const interviewerIds = (i: InterviewItem): string[] => {
  const ids = [i.interviewer_id, ...(i.interviewers || []).map((x: any) => x.interviewer_id || x.evaluator_user_id)];
  return Array.from(new Set(ids.filter(Boolean) as string[]));
};

const formatTime = (t?: string) => t || "";
const rangeLabel = (view: CalendarView, anchor: Date) => {
  if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") {
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    return `${s.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

/** Visible date window used to fetch interviews. */
const visibleWindow = (view: CalendarView, anchor: Date): [Date, Date] => {
  if (view === "day") return [anchor, anchor];
  if (view === "week") {
    const s = startOfWeek(anchor);
    return [s, addDays(s, 6)];
  }
  const s = startOfMonthGrid(anchor);
  return [s, addDays(s, 41)]; // six weeks
};

// The list endpoint wraps its result as { success, data: { interviews } }; accept that and the bare shapes too.
const listOf = (data: any): InterviewItem[] => (Array.isArray(data) ? data : data?.interviews || data?.data?.interviews || []);

export default function InterviewCalendar() {
  const { toast, confirm } = useFeedback();
  const today = toIso(new Date());
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [items, setItems] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [, setSelected] = useState<InterviewItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"calendar" | "list" | "panel">("calendar");
  const [showAvailability, setShowAvailability] = useState(false);
  const [kpiItems, setKpiItems] = useState<InterviewItem[]>([]);

  // Filters (applied to the fetched window)
  const [interviewerFilter, setInterviewerFilter] = useState("All");
  const [jobFilter, setJobFilter] = useState("All");
  const [roundFilter, setRoundFilter] = useState("All");

  const [windowStart, windowEnd] = useMemo(() => visibleWindow(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull a little either side so timezone shifts near the edges are not cut off
      const data = await getInterviews({
        date_from: toIso(addDays(windowStart, -1)),
        date_to: toIso(addDays(windowEnd, 1)),
        limit: 500,
      });
      setItems(listOf(data).filter((i) => i.status !== "CANCELLED").map(withViewer));
    } catch (e: any) {
      setError(e?.message || "Could not load interviews");
    } finally {
      setLoading(false);
    }
  }, [windowStart, windowEnd]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Every interview for the KPI cards, not just the visible window.
  useEffect(() => {
    getInterviews({ limit: 500 }).then((data) => setKpiItems(listOf(data).map(withViewer))).catch(() => setKpiItems([]));
  }, [reloadKey]);

  const kpis = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 6);
    const todayStr = toIso(now);
    const monthStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const live = kpiItems.filter((i) => i.status !== "CANCELLED");
    const inWeek = (d: string) => d >= toIso(weekStart) && d <= toIso(weekEnd);
    return {
      total: live.length,
      today: live.filter((i) => i.scheduled_date === todayStr).length,
      thisWeek: live.filter((i) => inWeek(i.scheduled_date)).length,
      thisMonth: live.filter((i) => i.scheduled_date.startsWith(monthStr)).length,
      completed: kpiItems.filter((i) => i.status === "COMPLETED").length,
      rescheduled: kpiItems.filter((i) => i.status === "RESCHEDULED").length,
      pendingFeedback: kpiItems.filter((i) => i.status === "COMPLETED" && !(i as any).rating && !(i as any).recommendation).length,
    };
  }, [kpiItems]);

  const jobs = useMemo(() => Array.from(new Set(items.map((i) => i.job_title).filter(Boolean))).sort(), [items]);
  const rounds = useMemo(() => Array.from(new Set(items.map((i) => i.round_number))).sort((a, b) => a - b), [items]);
  const interviewers = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => map.set(interviewerKey(i), i.interviewer_name || "Unassigned"));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (interviewerFilter === "All" || interviewerKey(i) === interviewerFilter) &&
          (jobFilter === "All" || i.job_title === jobFilter) &&
          (roundFilter === "All" || String(i.round_number) === roundFilter),
      ),
    [items, interviewerFilter, jobFilter, roundFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, InterviewItem[]>();
    visible.forEach((i) => {
      const key = i.viewer_date || i.scheduled_date;
      const list = map.get(key) || [];
      list.push(i);
      map.set(key, list);
    });
    map.forEach((list) => list.sort((a, b) => (a.viewer_time || a.scheduled_time).localeCompare(b.viewer_time || b.scheduled_time)));
    return map;
  }, [visible]);


  const days = useMemo(() => {
    const out: Date[] = [];
    let d = new Date(windowStart);
    while (d <= windowEnd) {
      out.push(new Date(d));
      d = addDays(d, 1);
    }
    return out;
  }, [windowStart, windowEnd]);

  const step = (direction: -1 | 1) => {
    if (view === "day") setAnchor((a) => addDays(a, direction));
    else if (view === "week") setAnchor((a) => addDays(a, 7 * direction));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + direction, 1));
  };

  /** Drag an interview onto a day: same time, new date. Checks clashes, asks, then reschedules. */
  const handleDrop = async (targetIso: string, item: InterviewItem) => {
    setDraggingId(null);
    if (targetIso === item.scheduled_date) return;

    let clashText = "";
    try {
      const res = await apiFetch(`${BASE_URL}/interview-panels/check-conflicts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewer_ids: interviewerIds(item),
          scheduled_date: targetIso,
          scheduled_time: item.scheduled_time,
          timezone: item.timezone || "Asia/Kolkata",
          duration_minutes: item.duration_minutes || 60,
          exclude_interview_id: item.id,
        }),
      });
      const body = await res.json();
      if (body?.has_conflict) {
        const names = (body.conflicts || []).map((c: any) => c.candidate_name).join(", ");
        clashText = `\n\nWarning: an interviewer is already booked at this time (${names}).`;
      }
    } catch {
      clashText = "\n\n(Could not check for clashes; please verify manually.)";
    }

    const ok = await confirm({
      title: `Move ${item.candidate_name} to ${fromIso(targetIso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}?`,
      message: `Same time (${formatTime(item.viewer_time || item.scheduled_time)}). Reschedule emails will be sent to the candidate and interviewers.${clashText}`,
      confirmLabel: "Reschedule",
    });
    if (!ok) return;

    try {
      const payload: RescheduleInterviewPayload = {
        scheduled_date: targetIso,
        scheduled_time: item.scheduled_time,
        timezone: item.timezone,
        duration_minutes: item.duration_minutes,
        reason: "Moved from the calendar",
      };
      await rescheduleInterview(item.id, payload);
      toast(`${item.candidate_name} moved to ${targetIso}`, "success");
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      toast(e?.message || "Could not reschedule", "error");
    }
  };

  const onDragStart = (e: DragEvent, item: InterviewItem) => {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(item.id);
  };

  const renderEvent = (item: InterviewItem, compact = false) => (
    <button
      key={item.id}
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={() => setDraggingId(null)}
      onClick={() => setSelected(item)}
      className={`w-full text-left rounded-md border px-2 py-1 text-xs ${colourForRound(item.round_number)} ${
        draggingId === item.id ? "opacity-50" : ""
      } cursor-grab active:cursor-grabbing`}
      title={`${item.candidate_name} · ${item.job_title} · Round ${item.round_number}`}
    >
      <div className="font-semibold">
        {formatTime(item.viewer_time || item.scheduled_time)} {item.candidate_name}
      </div>
      {!compact && <div className="truncate opacity-80">{item.job_title} · R{item.round_number}</div>}
    </button>
  );

  const dayCell = (d: Date, mode: "week" | "month" | "day") => {
    const iso = toIso(d);
    const list = byDay.get(iso) || [];
    const isOther = view === "month" && d.getMonth() !== anchor.getMonth();
    return (
      <div
        key={iso}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          const item = items.find((i) => i.id === id);
          if (item) void handleDrop(iso, item);
        }}
        className={`min-h-[110px] rounded-lg border border-slate-200 p-1.5 space-y-1 bg-white ${
          iso === today ? "ring-2 ring-indigo-500" : ""
        } ${isOther ? "opacity-50" : ""}`}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>
            {mode === "month" ? d.getDate() : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
          </span>
          {list.length > 0 && <span>{list.length}</span>}
        </div>
        {list.map((i) => renderEvent(i, mode === "month"))}
      </div>
    );
  };

  const selectClass = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

  const HOUR_START = 8;
  const HOUR_END = 19;
  const PX_PER_HOUR = 56;
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

  /** Week and day views on an hour grid, as in the Interview Scheduling Calendar mockup. */
  const timeGrid = (cols: Date[]) => {
    const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
    const gridHeight = hours.length * PX_PER_HOUR;
    return (
      <div className="flex overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="w-16 shrink-0 border-r border-slate-100">
          <div className="h-10 border-b border-slate-100" />
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div key={h} className="absolute right-2 -translate-y-2 text-[11px] text-slate-500" style={{ top: (h - HOUR_START) * PX_PER_HOUR }}>{hourLabel(h)}</div>
            ))}
          </div>
        </div>
        {cols.map((d) => {
          const iso = toIso(d);
          const list = byDay.get(iso) || [];
          return (
            <div
              key={iso}
              className="min-w-[130px] flex-1 border-r border-slate-100 last:border-r-0"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                const item = items.find((i) => i.id === id);
                if (item) void handleDrop(iso, item);
              }}
            >
              <div className={`flex h-10 items-center justify-center border-b border-slate-100 text-xs font-semibold ${iso === today ? "bg-indigo-50 text-indigo-700" : "bg-slate-50 text-slate-600"}`}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: (h - HOUR_START) * PX_PER_HOUR }} />
                ))}
                {list.map((i) => {
                  const [hh, mm] = (i.viewer_time || i.scheduled_time).split(":").map(Number);
                  const top = ((hh * 60 + mm) - HOUR_START * 60) / 60 * PX_PER_HOUR;
                  const height = Math.max(((i.duration_minutes || 60) / 60) * PX_PER_HOUR - 4, 28);
                  if (top < 0 || top >= gridHeight) return null;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      draggable
                      onDragStart={(e) => onDragStart(e, i)}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setSelected(i)}
                      title={`${i.candidate_name} · ${i.job_title} · Round ${i.round_number}`}
                      className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] leading-tight ${colourForRound(i.round_number)} ${draggingId === i.id ? "opacity-50" : ""} cursor-grab active:cursor-grabbing`}
                      style={{ top: top + 2, height }}
                    >
                      <div className="font-bold truncate">{formatTime(i.viewer_time || i.scheduled_time)} · {i.candidate_name}</div>
                      <div className="truncate opacity-80">{i.job_title} · R{i.round_number}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Interview Scheduling Calendar"
        subtitle="Plan and manage interviews, assign panels, and track candidate interview status."
        actions={
          <>
            <Link to="/interviews" className={btnSecondary}>Back to interviews</Link>
            <Link to="/interviews/panels" className={btnSecondary}>Panel Management</Link>
            <button type="button" onClick={() => setShowAvailability((v) => !v)} className={btnSecondary}>Interviewer Availability</button>
            <button type="button" onClick={() => document.getElementById("schedule-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })} className={btnPrimary}>+ Schedule Interview</button>
          </>
        }
      />

      <TabGroup
        tabs={[{ key: "calendar", label: "Calendar" }, { key: "list", label: "List View" }, { key: "panel", label: "Panel View" }] as { key: "calendar" | "list" | "panel"; label: string }[]}
        value={tab}
        onChange={setTab}
      />

      <KpiGrid cols="lg:grid-cols-7">
        {[
          { label: "Total Interviews", value: kpis.total, tone: "blue", icon: <CalendarIcon size={18} /> },
          { label: "Today", value: kpis.today, tone: "green", icon: <CalendarDays size={18} /> },
          { label: "This Week", value: kpis.thisWeek, tone: "violet", icon: <CalendarDays size={18} /> },
          { label: "This Month", value: kpis.thisMonth, tone: "indigo", icon: <CalendarIcon size={18} /> },
          { label: "Completed", value: kpis.completed, tone: "green", icon: <CheckCircle2 size={18} /> },
          { label: "Rescheduled", value: kpis.rescheduled, tone: "rose", icon: <RefreshCw size={18} /> },
          { label: "Pending Feedback", value: kpis.pendingFeedback, tone: "amber", icon: <Clock size={18} /> },
        ].map((k) => (
          <KpiTile key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone as "blue"} />
        ))}
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAnchor(new Date())} className={btnSecondary}>Today</button>
        <button type="button" onClick={() => step(-1)} className={btnSecondary} aria-label="Previous"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => step(1)} className={btnSecondary} aria-label="Next"><ChevronRight className="h-3.5 w-3.5" /></button>
        <span className="ml-1 text-sm font-semibold text-slate-700">{rangeLabel(view, anchor)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className={selectClass} value={interviewerFilter} onChange={(e) => setInterviewerFilter(e.target.value)}>
            <option value="All">All interviewers</option>
            {interviewers.map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
          <select className={selectClass} value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="All">All jobs</option>
            {jobs.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <select className={selectClass} value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
            <option value="All">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={String(r)}>Round {r}</option>
            ))}
          </select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        </div>
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        {tab === "calendar" ? (
        <div>
          {view === "month" ? (
            <>
              <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-xs font-semibold text-slate-500">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="px-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">{days.map((d) => dayCell(d, "month"))}</div>
            </>
          ) : (
            timeGrid(days)
          )}
          <p className="mt-3 text-xs text-slate-500">
            Drag an interview onto another day to reschedule it. Colours show the round. Times are shown in your timezone ({viewerTimeZone()}).
          </p>
        </div>
        ) : (
        <div className="space-y-3">
          {tab === "list"
            ? <InterviewListView items={visible} onOpen={setSelected} onChanged={() => setReloadKey((k) => k + 1)} />
            : <InterviewPanelView items={visible} onOpen={setSelected} />}
        </div>
        )}

        <div id="schedule-panel" className="space-y-4">
          <ScheduleInterviewForm open inline onClose={() => {}} onSaved={() => setReloadKey((k) => k + 1)} />
        </div>
      </div>

      {showAvailability && <AvailabilityPanel items={kpiItems} />}
      <TodayInterviewsTable items={kpiItems} today={toIso(new Date())} onOpen={setSelected} onChanged={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}
