import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Plus, Trash2, X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  createInterview, batchCreateInterviews, updateInterview, rescheduleInterview, sendInterviewEmail,
  checkInterviewConflict, checkCandidateActiveInterviewStatus, getNextRoundNumber,
  getResumes, getUsers, getInterviewTypes,
  type InterviewItem, type InterviewTypeEnum, type InterviewerItem, type ClientFeedbackItem,
  type UserProfile, type InterviewTypeItem,
} from "../../utils/Api";
import type { CandidateInterviewItem } from "../../types/interview";
import { useFeedback } from "../ui/Feedback";

/**
 * The one form for booking an interview. It replaces the separate Schedule, Edit,
 * Reschedule, Next Round, Interview Dashboard and JD Match forms.
 *
 * It only asks for what is needed to book the interview. Salary, joining date and
 * the outcome are entered after the interview, in the feedback panel.
 */

export type InterviewFormMode = "schedule" | "edit" | "reschedule" | "next-round" | "bulk";

export interface CandidatePrefill {
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string;
  resume_id?: string;
  job_title?: string;
}

interface InterviewFormProps {
  mode: InterviewFormMode;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** The interview being edited / rescheduled, or the round before a next round */
  interview?: InterviewItem | null;
  /** Schedule mode: a candidate chosen before opening the form */
  candidate?: CandidatePrefill | null;
  /** Bulk mode: several candidates get the same slot and panel */
  bulkCandidates?: CandidateInterviewItem[];
  bulkJobTitle?: string;
}

interface PanelMember {
  id?: string;
  name: string;
  email: string;
}

const TITLES: Record<InterviewFormMode, string> = {
  schedule: "Schedule interview",
  edit: "Edit interview",
  reschedule: "Reschedule interview",
  "next-round": "Schedule next round",
  bulk: "Schedule interviews",
};

// Used when no interview types are configured in Settings yet
const BUILT_IN_TYPES = [
  { id: "", code: "TECHNICAL", name: "Technical" },
  { id: "", code: "HR", name: "HR" },
  { id: "", code: "MANAGERIAL", name: "Managerial" },
  { id: "", code: "CLIENT_ROUND", name: "Client round" },
  { id: "", code: "FINAL_ROUND", name: "Final round" },
];

const today = () => new Date().toISOString().split("T")[0];

const to12Hour = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${suffix}`;
};

const panelFromInterview = (item?: InterviewItem | null): PanelMember[] => {
  if (!item) return [{ name: "", email: "" }];
  if (item.interviewers && item.interviewers.length > 0) {
    return item.interviewers.map((i) => ({ id: i.interviewer_id, name: i.interviewer_name || "", email: i.interviewer_email || "" }));
  }
  return [{ id: item.interviewer_id, name: item.interviewer_name || "", email: item.interviewer_email || "" }];
};

const clientsFromInterview = (item?: InterviewItem | null): PanelMember[] => {
  if (!item) return [];
  if (item.clients && item.clients.length > 0) {
    return item.clients.map((c) => ({ id: c.client_id, name: c.client_name || "", email: c.client_email || "" }));
  }
  return item.client_name ? [{ id: item.client_id, name: item.client_name, email: item.client_email || "" }] : [];
};

const inputClass =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
const labelClass = "block text-xs font-semibold text-slate-600 mb-1";

export function InterviewForm({ mode, isOpen, onClose, onSaved, interview, candidate, bulkCandidates, bulkJobTitle }: InterviewFormProps) {
  const { toast } = useFeedback();

  const [types, setTypes] = useState<InterviewTypeItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);

  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [round, setRound] = useState(1);
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [panel, setPanel] = useState<PanelMember[]>([{ name: "", email: "" }]);
  const [clients, setClients] = useState<PanelMember[]>([]);
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);

  const [activeInterviewMessage, setActiveInterviewMessage] = useState<string | null>(null);
  // Bulk mode: candidates who already have an open interview are skipped
  const [busyCandidates, setBusyCandidates] = useState<{ id: string; name: string }[]>([]);
  const [conflict, setConflict] = useState<{ state: "idle" | "checking" | "free" | "busy"; text?: string }>({ state: "idle" });
  const [saving, setSaving] = useState(false);

  const isReschedule = mode === "reschedule";
  const candidateFixed = mode !== "schedule" || !!candidate;
  const activeTypes = useMemo(() => {
    const configured = types.filter((t) => t.is_active !== false);
    return configured.length > 0 ? configured : BUILT_IN_TYPES;
  }, [types]);

  // Load the lists the form needs, once per opening
  useEffect(() => {
    if (!isOpen) return;
    getInterviewTypes().then((t) => setTypes(Array.isArray(t) ? t : [])).catch(() => setTypes([]));
    getUsers().then((u) => setUsers(Array.isArray(u) ? u : (u as any)?.users || [])).catch(() => setUsers([]));
    if (mode === "schedule" && !candidate) {
      getResumes({ page: 1, limit: 100 })
        .then((data: any) => setResumes(Array.isArray(data) ? data : data?.resumes || data?.data?.resumes || []))
        .catch(() => setResumes([]));
    }
  }, [isOpen, mode, candidate]);

  // Fill the form whenever it opens
  useEffect(() => {
    if (!isOpen) return;
    const src = interview;
    setCandidateId(src?.candidate_id || candidate?.candidate_id || "");
    setCandidateName(src?.candidate_name || candidate?.candidate_name || "");
    setCandidateEmail(src?.candidate_email || candidate?.candidate_email || "");
    setResumeId(src?.resume_id || candidate?.resume_id || "");
    setJobTitle(src?.job_title || candidate?.job_title || bulkJobTitle || "");
    setTypeCode(mode === "next-round" ? "" : src?.interview_type || "");
    setTypeId(mode === "next-round" ? "" : src?.interview_type_id || "");
    setRound(mode === "next-round" ? (src?.round_number || 1) + 1 : src?.round_number || 1);
    setDate(mode === "edit" || isReschedule ? src?.scheduled_date || today() : today());
    setTime(mode === "edit" || isReschedule ? src?.scheduled_time || "10:00" : "10:00");
    setDuration(src?.duration_minutes || 60);
    setPanel(panelFromInterview(src));
    setClients(clientsFromInterview(src));
    setMeetingLink(mode === "edit" ? src?.meeting_link || "" : "");
    setNotes(mode === "edit" ? src?.notes || "" : "");
    setReason("");
    setNotify(true);
    setActiveInterviewMessage(null);
    setConflict({ state: "idle" });
  }, [isOpen, mode, interview, candidate, bulkJobTitle, isReschedule]);

  // Default the interview type to the first configured one
  useEffect(() => {
    if (!isOpen || isReschedule || activeTypes.length === 0) return;
    const match = typeCode ? activeTypes.find((t) => t.code === typeCode) : undefined;
    if (!match) {
      setTypeCode(activeTypes[0].code);
      setTypeId(activeTypes[0].id);
    }
  }, [isOpen, isReschedule, activeTypes, typeCode, typeId]);

  // Next round: ask the server which round number comes next for this type
  useEffect(() => {
    if (!isOpen || mode !== "next-round" || !candidateId || !typeCode) return;
    getNextRoundNumber(candidateId, typeCode, typeId)
      .then((res) => res?.next_round_number && setRound(res.next_round_number))
      .catch(() => undefined);
  }, [isOpen, mode, candidateId, typeCode, typeId]);

  // Warn early if the chosen candidate already has an open interview
  useEffect(() => {
    if (!isOpen || (mode !== "schedule" && mode !== "next-round") || !candidateId) return;
    checkCandidateActiveInterviewStatus(candidateId, candidateName)
      .then((res) => {
        const otherOpen = res?.has_active_interview && res.interview_id !== interview?.id;
        setActiveInterviewMessage(otherOpen ? res.message || `${candidateName} already has an open interview.` : null);
      })
      .catch(() => setActiveInterviewMessage(null));
  }, [isOpen, mode, candidateId, candidateName, interview?.id]);

  useEffect(() => {
    if (!isOpen || mode !== "bulk" || !bulkCandidates?.length) {
      setBusyCandidates([]);
      return;
    }
    Promise.all(
      bulkCandidates.map((c) =>
        checkCandidateActiveInterviewStatus(c.candidate_id, c.candidate_name)
          .then((res) => (res?.has_active_interview ? { id: c.candidate_id, name: c.candidate_name } : null))
          .catch(() => null)
      )
    ).then((list) => setBusyCandidates(list.filter((x): x is { id: string; name: string } => x !== null)));
  }, [isOpen, mode, bulkCandidates]);

  // Check the panel is free, shown next to the time instead of as a popup
  const panelKey = panel.map((p) => p.id || p.name).join("|") + "#" + clients.map((c) => c.id || c.name).join("|");
  useEffect(() => {
    if (!isOpen || !date || !time) return;
    const people = panel.filter((p) => p.name.trim());
    const clientPeople = clients.filter((c) => c.name.trim());
    if (people.length === 0 && clientPeople.length === 0) {
      setConflict({ state: "idle" });
      return;
    }
    setConflict({ state: "checking" });
    const timer = setTimeout(() => {
      checkInterviewConflict({
        scheduled_date: date,
        scheduled_time: time,
        interviewers: people.map((p) => ({ interviewer_id: p.id, interviewer_name: p.name, interviewer_email: p.email })),
        clients: clientPeople.map((c) => ({ client_id: c.id, client_name: c.name, client_email: c.email })),
        exclude_interview_id: mode === "edit" || isReschedule ? interview?.id : undefined,
      })
        .then((res) => setConflict(res.has_conflict ? { state: "busy", text: res.conflict_message } : { state: "free" }))
        .catch(() => setConflict({ state: "idle" }));
    }, 400);
    return () => clearTimeout(timer);
    // panelKey stands in for the panel and client lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, date, time, panelKey, mode, isReschedule, interview?.id]);

  if (!isOpen) return null;

  const pickResume = (id: string) => {
    const found = resumes.find((r) => (r.id || r._id) === id);
    const parsed = found?.parsed_data || {};
    setCandidateId(id);
    setResumeId(id);
    setCandidateName(parsed.full_name || parsed.name || found?.original_filename || "");
    setCandidateEmail(parsed.email || found?.email || "");
  };

  const updateMember = (list: PanelMember[], setList: (l: PanelMember[]) => void, index: number, patch: Partial<PanelMember>) => {
    setList(list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const pickUser = (list: PanelMember[], setList: (l: PanelMember[]) => void, index: number, userId: string) => {
    const user = users.find((u) => u.id === userId);
    updateMember(list, setList, index, user ? { id: user.id, name: user.full_name, email: user.email } : { id: undefined });
  };

  const interviewersPayload = (): InterviewerItem[] =>
    panel.filter((p) => p.name.trim()).map((p) => ({ interviewer_id: p.id, interviewer_name: p.name.trim(), interviewer_email: p.email.trim() || undefined }));
  const clientsPayload = (): ClientFeedbackItem[] =>
    clients.filter((c) => c.name.trim()).map((c) => ({ client_id: c.id, client_name: c.name.trim(), client_email: c.email.trim() || undefined }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const interviewers = interviewersPayload();
    const clientList = clientsPayload();

    if (!isReschedule) {
      if (mode !== "bulk" && !candidateName.trim()) return toast("Choose a candidate.", "warning");
      if (!jobTitle.trim()) return toast("Enter the job title.", "warning");
      if (interviewers.length === 0) return toast("Add at least one interviewer.", "warning");
    }
    if (activeInterviewMessage && (mode === "schedule" || mode === "next-round")) {
      return toast(activeInterviewMessage, "warning");
    }

    const slot = {
      interview_type: typeCode as InterviewTypeEnum,
      interview_type_id: typeId || undefined,
      round_number: Number(round),
      scheduled_date: date,
      scheduled_time: time,
      duration_minutes: Number(duration),
      interviewer_id: interviewers[0]?.interviewer_id,
      interviewer_name: interviewers[0]?.interviewer_name || "",
      interviewer_email: interviewers[0]?.interviewer_email,
      interviewers,
      client_id: clientList[0]?.client_id,
      client_name: clientList[0]?.client_name,
      client_email: clientList[0]?.client_email,
      clients: clientList,
      meeting_link: meetingLink.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      setSaving(true);
      if (mode === "reschedule" && interview) {
        await rescheduleInterview(interview.id, { scheduled_date: date, scheduled_time: time, duration_minutes: Number(duration), reason: reason.trim() || undefined });
        if (notify) {
          const panelEmails = [...panelFromInterview(interview), ...clientsFromInterview(interview)]
            .map((p) => p.email.trim()).filter(Boolean).join(", ");
          await sendInterviewEmail(interview.id, {
            send_to_candidate: !!interview.candidate_email,
            candidate_email: interview.candidate_email || undefined,
            send_to_interviewer: !!panelEmails,
            interviewer_email: panelEmails || undefined,
            custom_notes: `INTERVIEW RESCHEDULED: New date ${date} at ${to12Hour(time)}.\nReason: ${reason.trim() || "Schedule change"}\nMeeting link / location: ${interview.meeting_link || interview.meeting_platform || "to be shared"}`,
          }).catch(() => toast("Rescheduled, but the email could not be sent.", "warning"));
        }
        toast(`Rescheduled ${interview.candidate_name} to ${date}, ${to12Hour(time)}.`, "success");
      } else if (mode === "edit" && interview) {
        await updateInterview(interview.id, { ...slot, candidate_name: candidateName, job_title: jobTitle.trim() });
        toast("Interview updated.", "success");
      } else if (mode === "bulk") {
        const busyIds = new Set(busyCandidates.map((b) => b.id));
        const targets = (bulkCandidates || []).filter((c) => !busyIds.has(c.candidate_id));
        if (targets.length === 0) {
          toast("Every selected candidate already has an open interview.", "warning");
          return;
        }
        await batchCreateInterviews({ ...slot, candidates: targets, job_title: jobTitle.trim() });
        toast(
          `Scheduled ${targets.length} interview${targets.length === 1 ? "" : "s"}.` +
            (busyCandidates.length ? ` Skipped ${busyCandidates.length} with an open interview.` : ""),
          "success"
        );
      } else {
        // Schedule and next round both create a new interview.
        // A next round keeps the candidate's offer details from the round before.
        await createInterview({
          ...slot,
          candidate_id: candidateId || `cand_${Date.now()}`,
          candidate_name: candidateName.trim(),
          candidate_email: candidateEmail.trim() || undefined,
          resume_id: resumeId || undefined,
          job_id: interview?.job_id,
          job_title: jobTitle.trim(),
          job_location: interview?.job_location,
          job_type: interview?.job_type,
          candidate_requested_role: interview?.candidate_requested_role,
          salary_requested: interview?.salary_requested,
          final_fit_salary: interview?.final_fit_salary,
          joining_date: interview?.joining_date,
          recommendation: "Pending",
        });
        toast(`Scheduled ${candidateName.trim()} on ${date}, ${to12Hour(time)}.`, "success");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err?.message || "Could not save the interview.", "error");
    } finally {
      setSaving(false);
    }
  };

  const memberRows = (list: PanelMember[], setList: (l: PanelMember[]) => void, kind: "interviewer" | "client") =>
    list.map((m, i) => (
      <div key={`${kind}-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
        <select
          aria-label={`${kind === "client" ? "Client evaluator" : "Interviewer"} ${i + 1} user`}
          value={m.id || ""}
          onChange={(e) => pickUser(list, setList, i, e.target.value)}
          className={inputClass}
        >
          <option value="">Pick a user or type below</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>
        <input
          aria-label={`${kind === "client" ? "Client evaluator" : "Interviewer"} ${i + 1} name`}
          placeholder="Name"
          value={m.name}
          onChange={(e) => updateMember(list, setList, i, { name: e.target.value, id: undefined })}
          className={inputClass}
        />
        <input
          aria-label={`${kind === "client" ? "Client evaluator" : "Interviewer"} ${i + 1} email`}
          type="email"
          placeholder="Email"
          value={m.email}
          onChange={(e) => updateMember(list, setList, i, { email: e.target.value })}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setList(list.filter((_, idx) => idx !== i))}
          disabled={kind === "interviewer" && list.length === 1}
          aria-label="Remove"
          className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
        >
          <Trash2 size={16} />
        </button>
      </div>
    ));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-form-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h2 id="interview-form-title" className="text-lg font-bold text-slate-900">{TITLES[mode]}</h2>
            {candidateFixed && mode !== "bulk" && (
              <p className="text-sm text-slate-500">{candidateName}{jobTitle ? `, ${jobTitle}` : ""}</p>
            )}
            {mode === "bulk" && (
              <p className="text-sm text-slate-500">{bulkCandidates?.length || 0} candidates get the same slot and panel</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {!isReschedule && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!candidateFixed && (
                <div>
                  <label htmlFor="if-candidate" className={labelClass}>Candidate *</label>
                  <select id="if-candidate" value={candidateId} onChange={(e) => pickResume(e.target.value)} className={inputClass}>
                    <option value="">Choose from parsed resumes</option>
                    {resumes.map((r) => {
                      const parsed = r.parsed_data || {};
                      return (
                        <option key={r.id || r._id} value={r.id || r._id}>
                          {parsed.full_name || parsed.name || r.original_filename}{parsed.email ? ` (${parsed.email})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              <div className={candidateFixed ? "sm:col-span-2" : ""}>
                <label htmlFor="if-job" className={labelClass}>Job title *</label>
                <input id="if-job" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. React Engineer" className={inputClass} />
              </div>
              <div>
                <label htmlFor="if-type" className={labelClass}>Interview type</label>
                <select
                  id="if-type"
                  value={typeCode}
                  onChange={(e) => {
                    const t = activeTypes.find((x) => x.code === e.target.value);
                    setTypeCode(t?.code || e.target.value);
                    setTypeId(t?.id || "");
                  }}
                  className={inputClass}
                >
                  {activeTypes.map((t) => (
                    <option key={t.code} value={t.code}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="if-round" className={labelClass}>Round</label>
                <input id="if-round" type="number" min={1} value={round} onChange={(e) => setRound(Number(e.target.value) || 1)} className={inputClass} />
              </div>
            </div>
          )}

          {busyCandidates.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                {busyCandidates.length} already {busyCandidates.length === 1 ? "has" : "have"} an open interview and will be skipped:{" "}
                {busyCandidates.map((b) => b.name).join(", ")}
              </span>
            </p>
          )}

          {activeInterviewMessage && (
            <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {activeInterviewMessage}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="if-date" className={labelClass}><Calendar size={12} className="inline mr-1" />Date *</label>
              <input id="if-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="if-time" className={labelClass}><Clock size={12} className="inline mr-1" />Time *</label>
              <input id="if-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="if-duration" className={labelClass}>Duration</label>
              <select id="if-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
          </div>

          {conflict.state !== "idle" && (
            <p className={`flex items-center gap-2 text-sm ${conflict.state === "busy" ? "text-rose-700" : conflict.state === "free" ? "text-emerald-700" : "text-slate-500"}`}>
              {conflict.state === "checking" && <><Loader2 size={14} className="animate-spin" /> Checking the panel's calendar...</>}
              {conflict.state === "free" && <><CheckCircle2 size={14} /> The panel is free at {to12Hour(time)}.</>}
              {conflict.state === "busy" && <><AlertTriangle size={14} /> {conflict.text || "Someone on the panel is busy at this time."}</>}
            </p>
          )}

          {isReschedule ? (
            <>
              <div>
                <label htmlFor="if-reason" className={labelClass}>Reason</label>
                <input id="if-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Candidate asked for a later slot" className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4" />
                Email the candidate and panel about the new time
              </label>
            </>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className={labelClass}>Panel *</legend>
                {memberRows(panel, setPanel, "interviewer")}
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setPanel([...panel, { name: "", email: "" }])} className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                    <Plus size={14} /> Add interviewer
                  </button>
                  <button type="button" onClick={() => setClients([...clients, { name: "", email: "" }])} className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                    <Plus size={14} /> Add client evaluator
                  </button>
                </div>
              </fieldset>

              {clients.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className={labelClass}>Client evaluators</legend>
                  {memberRows(clients, setClients, "client")}
                </fieldset>
              )}

              <div>
                <label htmlFor="if-link" className={labelClass}>Meeting link or place</label>
                <input id="if-link" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/... or office address" className={inputClass} />
              </div>
              <div>
                <label htmlFor="if-notes" className={labelClass}>Notes for the panel</label>
                <textarea id="if-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Focus areas, documents to read" className={inputClass} />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isReschedule ? "Reschedule" : mode === "edit" ? "Save changes" : "Schedule"}
          </button>
        </div>
      </form>
    </div>
  );
}
