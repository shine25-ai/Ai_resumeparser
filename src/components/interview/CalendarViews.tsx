import { Link } from "react-router-dom";
import { cancelInterview, type InterviewItem } from "../../utils/Api";
import { useFeedback } from "../ui/Feedback";
import { Badge, btnSecondary, card, rowHover, statusTone, tableHead, tableShell, td, th } from "./interviewUi";

/** Pieces of Screen 10 that sit beside or below the calendar: list view, panel view, today's table and availability. */

export const MODE_TEXT: Record<string, string> = { ONLINE: "Online", IN_PERSON: "In-person", TELEPHONIC: "Telephonic" };

const panelNames = (item: InterviewItem): string[] => {
  const list = item.interviewers?.length ? item.interviewers.map((i) => i.interviewer_name) : [item.interviewer_name];
  return list.filter(Boolean);
};

const byDateTime = (a: InterviewItem, b: InterviewItem) =>
  `${a.viewer_date || a.scheduled_date} ${a.viewer_time || a.scheduled_time}`.localeCompare(`${b.viewer_date || b.scheduled_date} ${b.viewer_time || b.scheduled_time}`);

/** Actions used on the list and today tables. */
function QuickActions({ item, onOpen, onChanged }: { item: InterviewItem; onOpen: (i: InterviewItem) => void; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel ${item.candidate_name}'s interview?`,
      message: "The interview is marked cancelled and kept in history. No email is sent from here.",
      confirmLabel: "Cancel interview",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelInterview(item.id, { reason: "Cancelled from the calendar", send_email: false });
      toast("Interview cancelled", "success");
      onChanged();
    } catch (e: any) {
      toast(e?.message || "Could not cancel", "error");
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onOpen(item)} className={btnSecondary}>View</button>
      <Link to={`/interviews?search=${encodeURIComponent(item.candidate_name)}`} className={btnSecondary}>Feedback</Link>
      {item.status !== "CANCELLED" && (
        <button type="button" onClick={cancel} className={`${btnSecondary} !border-rose-200 !text-rose-700`}>Cancel</button>
      )}
    </div>
  );
}

export function InterviewListView({ items, onOpen, onChanged }: { items: InterviewItem[]; onOpen: (i: InterviewItem) => void; onChanged: () => void }) {
  const rows = [...items].sort(byDateTime);
  return (
    <div className={tableShell}>
      <table className="w-full text-sm">
        <thead className={tableHead}>
          <tr>
            <th className={th}>Date & time</th>
            <th className={th}>Candidate</th>
            <th className={th}>Job title</th>
            <th className={th}>Round</th>
            <th className={th}>Interviewers</th>
            <th className={th}>Mode</th>
            <th className={th}>Status</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No interviews in this range.</td></tr>}
          {rows.map((i) => (
            <tr key={i.id} className={`border-t ${rowHover}`}>
              <td className={`${td} whitespace-nowrap`}>{i.viewer_date || i.scheduled_date} {i.viewer_time || i.scheduled_time}</td>
              <td className={`${td} font-semibold text-slate-900`}>{i.candidate_name}</td>
              <td className={td}>{i.job_title}</td>
              <td className={td}>Round {i.round_number}</td>
              <td className={td}>{panelNames(i).join(", ") || "—"}</td>
              <td className={td}>{MODE_TEXT[(i as any).interview_mode] || "—"}</td>
              <td className={td}><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
              <td className={td}><QuickActions item={i} onOpen={onOpen} onChanged={onChanged} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Interviews grouped by interviewer, so each person's load is visible at a glance. */
export function InterviewPanelView({ items, onOpen }: { items: InterviewItem[]; onOpen: (i: InterviewItem) => void }) {
  const groups = new Map<string, { name: string; list: InterviewItem[] }>();
  items.forEach((i) => {
    panelNames(i).forEach((name) => {
      const key = name;
      const g = groups.get(key) || { name, list: [] };
      g.list.push(i);
      groups.set(key, g);
    });
  });
  const sorted = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) return <p className="text-sm text-slate-500">No interviews in this range.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sorted.map((g) => (
        <div key={g.name} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">{g.name}</h3>
            <span className="text-xs text-slate-500">{g.list.length} interview{g.list.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {g.list.sort(byDateTime).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onOpen(i)} className="text-left hover:underline">
                  {i.viewer_date || i.scheduled_date} {i.viewer_time || i.scheduled_time} · {i.candidate_name} · Round {i.round_number}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Today's interviews with quick actions, as on the mockup. */
export function TodayInterviewsTable({ items, today, onOpen, onChanged }: { items: InterviewItem[]; today: string; onOpen: (i: InterviewItem) => void; onChanged: () => void }) {
  const todays = items.filter((i) => (i.viewer_date || i.scheduled_date) === today && i.status !== "CANCELLED").sort(byDateTime);
  return (
    <div className={card}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-bold text-slate-800">Today's Interviews</h2>
        <span className="text-xs text-slate-500">{todays.length} scheduled</span>
      </div>
      {todays.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">No interviews today.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className={tableHead}>
            <tr>
              <th className={th}>Time</th>
              <th className={th}>Candidate</th>
              <th className={th}>Job title</th>
              <th className={th}>Round</th>
              <th className={th}>Interviewers</th>
              <th className={th}>Mode</th>
              <th className={th}>Status</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {todays.map((i) => (
              <tr key={i.id} className={`border-t ${rowHover}`}>
                <td className={`${td} whitespace-nowrap`}>{i.viewer_time || i.scheduled_time}</td>
                <td className={`${td} font-semibold text-slate-900`}>{i.candidate_name}</td>
                <td className={td}>{i.job_title}</td>
                <td className={td}>Round {i.round_number}</td>
                <td className={td}>{panelNames(i).join(", ") || "—"}</td>
                <td className={td}>{MODE_TEXT[(i as any).interview_mode] || "—"}</td>
                <td className={td}><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                <td className={td}><QuickActions item={i} onOpen={onOpen} onChanged={onChanged} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Who is busy when, from the interviews in view. Panel-set availability is not stored yet, so this shows booked time only. */
export function AvailabilityPanel({ items }: { items: InterviewItem[] }) {
  const byPerson = new Map<string, InterviewItem[]>();
  items.filter((i) => i.status !== "CANCELLED").forEach((i) => {
    panelNames(i).forEach((name) => byPerson.set(name, [...(byPerson.get(name) || []), i]));
  });
  const people = Array.from(byPerson.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <h2 className="text-sm font-bold text-slate-800">Interviewer availability</h2>
      <p className="mb-2 text-xs text-slate-500">Booked time for each interviewer in the range shown. Working hours are not set up yet.</p>
      {people.length === 0 ? (
        <p className="text-sm text-slate-500">No interviewers booked in this range.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {people.map(([name, list]) => (
            <li key={name}>
              <span className="font-semibold">{name}</span>
              <span className="ml-2 text-xs text-slate-500">
                {list.sort(byDateTime).map((i) => `${i.viewer_date || i.scheduled_date} ${i.viewer_time || i.scheduled_time}`).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
