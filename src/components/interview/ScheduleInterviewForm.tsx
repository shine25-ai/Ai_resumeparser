import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { apiFetch, BASE_URL } from "../../utils/Api";
import { useFeedback } from "../ui/Feedback";
import { checkPanelConflicts, listPanels, type InterviewPanel } from "../../utils/phase8Api";

/** Schedule Interview (Screen 10): candidate, job, round, interviewers or panel, date, time, mode and invite. */

export type InterviewMode = "ONLINE" | "IN_PERSON" | "TELEPHONIC";

const MODE_LABELS: Record<InterviewMode, string> = { ONLINE: "Online (Video)", IN_PERSON: "In-Person", TELEPHONIC: "Telephonic" };

interface Candidate { id: string; name: string; email: string }
interface JobOption { id: string; title: string; rounds: { name?: string; order?: number; interview_type?: string; duration_minutes?: number }[] }
interface DirectoryUser { id: string; full_name: string; email: string; is_active?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Show as a card beside the calendar (as in the mockup) instead of a dialog. */
  inline?: boolean;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ScheduleInterviewForm({ open, onClose, onSaved, inline = false }: Props) {
  const { toast, confirm } = useFeedback();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [panels, setPanels] = useState<InterviewPanel[]>([]);
  const [busy, setBusy] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  const [candidateId, setCandidateId] = useState("");
  const [jobId, setJobId] = useState("");
  const [round, setRound] = useState(1);
  const [panelId, setPanelId] = useState("");
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<InterviewMode>("ONLINE");
  const [meetingLink, setMeetingLink] = useState("");
  const [sendInvite, setSendInvite] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [resumes, jobsResp, usersResp, panelList, settings] = await Promise.all([
          apiFetch(`${BASE_URL}/resumes?limit=200`).then((r) => r.json()),
          apiFetch(`${BASE_URL}/job-openings`).then((r) => r.json()),
          apiFetch(`${BASE_URL}/users`).then((r) => r.json()),
          listPanels(),
          apiFetch(`${BASE_URL}/interview-settings`).then((r) => r.json()).catch(() => ({})),
        ]);
        if (settings?.timezone) setTimezone(settings.timezone);
        setCandidates(((resumes.data?.resumes || []) as any[]).map((r) => ({
          id: r.candidate_id || r.id,
          name: r.parsed_data?.full_name || r.original_filename || "Candidate",
          email: r.parsed_data?.email || "",
        })));
        setJobs(((jobsResp.data || []) as any[]).map((j) => ({ id: j.id, title: j.title, rounds: j.rounds || [] })));
        setUsers(((usersResp.data?.users || []) as DirectoryUser[]).filter((u) => u.is_active !== false));
        setPanels(panelList.filter((p) => p.status === "ACTIVE"));
      } catch (e: any) {
        toast(e?.message || "Could not load the form", "error");
      }
    })();
  }, [open, toast]);

  const job = jobs.find((j) => j.id === jobId) || null;
  const candidate = candidates.find((c) => c.id === candidateId) || null;

  // Picking a panel fills in its members. Individuals can still be added or removed.
  useEffect(() => {
    const panel = panels.find((p) => p.id === panelId);
    if (panel) setInterviewerIds(panel.members.map((m) => m.user_id));
  }, [panelId, panels]);

  const toggleInterviewer = (id: string) =>
    setInterviewerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    if (!candidate) return toast("Choose a candidate", "error");
    if (!job) return toast("Choose a job opening", "error");
    if (interviewerIds.length === 0) return toast("Choose at least one interviewer or a panel", "error");
    setBusy(true);
    try {
      const conflicts = await checkPanelConflicts({
        interviewer_ids: interviewerIds,
        scheduled_date: date,
        scheduled_time: time,
        timezone,
        duration_minutes: duration,
      });
      if (conflicts.has_conflict) {
        const names = conflicts.conflicts.map((c) => c.candidate_name).join(", ");
        const ok = await confirm({
          title: "An interviewer is already booked",
          message: `This clashes with: ${names}. Schedule anyway?`,
          confirmLabel: "Schedule anyway",
          danger: true,
        });
        if (!ok) return;
      }

      const people = users.filter((u) => interviewerIds.includes(u.id));
      const first = people[0];
      const roundDef = job.rounds[round - 1];
      const body = {
        candidate_id: candidate.id,
        candidate_name: candidate.name,
        candidate_email: candidate.email || null,
        job_id: job.id,
        job_title: job.title,
        interview_type: roundDef?.interview_type || "TECHNICAL",
        round_number: round,
        scheduled_date: date,
        scheduled_time: time,
        timezone,
        duration_minutes: duration,
        interviewer_name: first?.full_name || "Interviewer",
        interviewer_id: first?.id || null,
        interviewer_email: first?.email || null,
        interviewers: people.map((p) => ({ interviewer_id: p.id, interviewer_name: p.full_name, interviewer_email: p.email })),
        interview_mode: mode,
        meeting_link: mode === "ONLINE" ? meetingLink.trim() || null : null,
        location: mode === "IN_PERSON" ? meetingLink.trim() || null : null,
        send_invite: sendInvite,
        status: "SCHEDULED",
      };
      const response = await apiFetch(`${BASE_URL}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.message || "Could not schedule the interview");
      toast(sendInvite ? "Interview scheduled and invites sent" : "Interview scheduled", "success");
      onSaved();
      onClose();
    } catch (e: any) {
      toast(e?.message || "Could not schedule the interview", "error");
    } finally {
      setBusy(false);
    }
  };

  const roundOptions = useMemo(() => {
    const count = Math.max(job?.rounds.length || 0, 4);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [job]);

  if (!open) return null;

  const field = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div
      className={inline ? "" : "fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6"}
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-label="Schedule Interview"
    >
      <div className={inline ? "space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" : "w-full max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">Schedule Interview</h2>
        {!inline && <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>}
      </div>

      <label className="block text-xs font-semibold text-slate-600">Candidate *
        <select className={field} value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
          <option value="">Choose a candidate…</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>)}
        </select>
      </label>

      <label className="block text-xs font-semibold text-slate-600">Job opening *
        <select className={field} value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">Choose a job…</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </label>

      <label className="block text-xs font-semibold text-slate-600">Interview round *
        <select className={field} value={round} onChange={(e) => setRound(Number(e.target.value))}>
          {roundOptions.map((n) => {
            const def = job?.rounds[n - 1];
            return <option key={n} value={n}>Round {n}{def?.name ? ` · ${def.name}` : ""}</option>;
          })}
        </select>
      </label>

      <label className="block text-xs font-semibold text-slate-600">Panel
        <select className={field} value={panelId} onChange={(e) => setPanelId(e.target.value)}>
          <option value="">No panel (choose individuals below)</option>
          {panels.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>)}
        </select>
      </label>

      <div>
        <div className="text-xs font-semibold text-slate-600">Interviewers *</div>
        <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={interviewerIds.includes(u.id)} onChange={() => toggleInterviewer(u.id)} />
              {u.full_name}
            </label>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-500">Times are in the company timezone: {timezone}</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-1 text-xs font-semibold text-slate-600">Date *
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-600">Time *
          <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-600">Minutes
          <input type="number" min={5} max={480} className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600">Mode *</div>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {(Object.keys(MODE_LABELS) as InterviewMode[]).map((m) => (
            <label key={m} className="flex items-center gap-1">
              <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
              {MODE_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      <label className="block text-xs font-semibold text-slate-600">
        {mode === "IN_PERSON" ? "Location" : "Meeting link"}
        <input className={field} value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)}
          placeholder={mode === "IN_PERSON" ? "Room, address" : "https://meet.google.com/…"} />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
        Send interview invite to candidate and panel
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={save} disabled={busy} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Schedule Interview
        </button>
      </div>
      </div>
    </div>
  );
}
