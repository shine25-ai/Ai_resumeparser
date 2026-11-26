import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive, ArchiveRestore, Bookmark, Briefcase, Building2, CalendarDays, ChevronLeft, ChevronRight, CircleCheck,
  CircleDashed, Clock3, Copy, Download, ExternalLink, Eye, FileText, FileUp, Loader2, MapPin, MoreHorizontal, Pencil,
  Plus, RefreshCw, RotateCcw, Search, Send, ShieldCheck, Timer, Trash2, Users, X, XCircle,
} from "lucide-react";
import CompanyBar from "../components/jobs/CompanyBar";
import { useFeedback } from "../components/ui/Feedback";
import { StatCard } from "../components/companies/companyForm";
import { downloadFile } from "../utils/adminApi";
import {
  JOBS_IMPORT_TEMPLATE_URL,
  deleteJobTemplate,
  duplicateJob,
  fetchCompanies,
  fetchJobApplications,
  fetchJobOpenings,
  fetchJobSettings,
  fetchJobTemplates,
  importJobs,
  jobAction,
  jobsExportUrl,
  saveJobSettings,
  saveJobTemplate,
  type Company,
  type JobAction,
  type JobApplicationRow,
  type JobOpening,
  type JobStatus,
  type JobTemplate,
} from "../utils/jobsApi";

/** Job Openings (SRS Screen 5): summary cards, filters, the job list and the job panel, as in the mockup. */

const PAGE_SIZE = 10;
const COMPANY_KEY = "jobOpenings.companyId";

const STATUS_STYLE: Record<JobStatus, { pill: string; dot: string; label: string }> = {
  DRAFT: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500", label: "Draft" },
  PENDING_APPROVAL: { pill: "bg-sky-50 text-sky-700", dot: "bg-sky-500", label: "Pending approval" },
  OPEN: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Active" },
  CLOSED: { pill: "bg-violet-50 text-violet-700", dot: "bg-violet-500", label: "Closed" },
  ARCHIVED: { pill: "bg-slate-100 text-slate-500", dot: "bg-slate-400", label: "Archived" },
};

const filterClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const readSavedCompany = () => {
  try {
    return localStorage.getItem(COMPANY_KEY) || "";
  } catch {
    return "";
  }
};

/** What the signed-in user may do with jobs (the API checks too). */
function useJobPermissions() {
  return useMemo(() => {
    try {
      const me = JSON.parse(localStorage.getItem("user") || "{}");
      const role = String(me.role || "").toLowerCase();
      const perms: string[] = me.permissions || [];
      const all = role === "admin" || role === "superadmin" || perms.length === 0;
      const can = (p: string) => all || perms.includes(p);
      return {
        create: can("jobs:create"),
        edit: can("jobs:edit"),
        publish: can("jobs:publish"),
        approve: can("jobs:approve"),
        remove: can("jobs:delete"),
        settings: all || can("settings:edit"),
      };
    } catch {
      return { create: true, edit: true, publish: true, approve: true, remove: true, settings: true };
    }
  }, []);
}
type Perms = ReturnType<typeof useJobPermissions>;

const daysBetween = (from?: string | null, to?: string | null) => {
  if (!from) return null;
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.round((b - a) / 86_400_000));
};

const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function StatusPill({ status }: { status: JobStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

type Act = (job: JobOpening, action: JobAction) => void;

/** The actions a job offers now, given its status and the user's permissions. */
function actionsFor(job: JobOpening, perms: Perms, requireApproval: boolean) {
  const list: { action: JobAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [];
  const s = job.status;
  if (s === "DRAFT" && perms.publish) list.push({ action: "publish", label: requireApproval && !perms.approve ? "Submit for approval" : "Publish", icon: <Send size={14} /> });
  if (s === "PENDING_APPROVAL" && perms.approve) {
    list.push({ action: "approve", label: "Approve & publish", icon: <ShieldCheck size={14} /> });
    list.push({ action: "reject", label: "Send back", icon: <RotateCcw size={14} /> });
  }
  if (s === "OPEN" && perms.publish) list.push({ action: "close", label: "Close job", icon: <XCircle size={14} /> });
  if (s === "CLOSED" && perms.publish) list.push({ action: "reopen", label: "Reopen job", icon: <RotateCcw size={14} /> });
  if (["DRAFT", "CLOSED", "PENDING_APPROVAL"].includes(s) && perms.remove) list.push({ action: "archive", label: "Archive", icon: <Archive size={14} />, danger: true });
  if (s === "ARCHIVED" && perms.edit) list.push({ action: "restore", label: "Restore as draft", icon: <ArchiveRestore size={14} /> });
  return list;
}

// ── Job panel (Screen 5 §5) ──────────────────────────────────────────────────

type PanelTab = "overview" | "applications" | "interviews" | "activity";

function JobPanel({
  job, perms, requireApproval, careersSlug, tab, onTab, onClose, onAct, onDuplicate, onTemplate,
}: {
  job: JobOpening;
  perms: Perms;
  requireApproval: boolean;
  careersSlug?: string;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  onAct: Act;
  onDuplicate: () => void;
  onTemplate: () => void;
}) {
  const navigate = useNavigate();
  const [apps, setApps] = useState<JobApplicationRow[] | null>(null);

  useEffect(() => {
    setApps(null);
    if (tab !== "applications") return;
    fetchJobApplications(job.id, 1, 50).then((d) => setApps(d.items)).catch(() => setApps([]));
  }, [job.id, tab]);

  const publicUrl = careersSlug ? `${window.location.origin}/careers/${careersSlug}?job=${job.id}` : "";
  const stages: [string, number, string][] = [
    ["Applied", job.applications_count, "bg-sky-50 text-sky-700"],
    ["Interviewed", job.interviews_count, "bg-violet-50 text-violet-700"],
    ["Selected", job.selected_count, "bg-emerald-50 text-emerald-700"],
  ];

  return (
    <aside className="flex max-h-[calc(100vh-150px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-0">
      <div className="border-b border-slate-100 px-5 pb-0 pt-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold leading-snug text-slate-900">{job.title}</h2>
          {publicUrl && job.status === "OPEN" && (
            <a href={publicUrl} target="_blank" rel="noreferrer" title="Open on the careers page" className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"><ExternalLink size={16} /></a>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <StatusPill status={job.status} /> <span className="font-mono">{job.code}</span>
          {job.status === "OPEN" && !job.accepting && <span className="text-amber-700">· not taking applications</span>}
        </div>
        {actionsFor(job, perms, requireApproval).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actionsFor(job, perms, requireApproval).map((a) => (
              <button key={a.action} onClick={() => onAct(job, a.action)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${a.danger ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-3 overflow-x-auto text-[13px]">
          {([["overview", "Overview"], ["applications", `Applications (${job.applications_count})`], ["interviews", `Interviews (${job.interviews_count})`], ["activity", "Activity"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => onTab(k)} className={`-mb-px whitespace-nowrap border-b-2 px-1 py-2 font-medium ${tab === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-slate-700">
              {([
                [<Building2 size={15} />, job.department || "—"],
                [<MapPin size={15} />, job.location || "—"],
                [<Briefcase size={15} />, job.experience || "—"],
                [<Users size={15} />, `${job.open_positions} Vacanc${job.open_positions === 1 ? "y" : "ies"}`],
                [<CalendarDays size={15} />, `Closing: ${fmtDate(job.closing_date)}`],
                [<Clock3 size={15} />, [job.employment_type, job.work_mode].filter(Boolean).join(" · ") || "—"],
              ] as const).map(([icon, v], i) => (
                <span key={i} className="inline-flex items-center gap-2"><span className="text-slate-400">{icon}</span><span className="truncate">{v}</span></span>
              ))}
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Hiring Progress</h3>
                <span className="text-xs text-slate-500">{job.applications_count} Applications</span>
              </div>
              <div className="flex items-stretch gap-1">
                {stages.map(([label, n, tone], i) => (
                  <div key={label} className="flex flex-1 items-center gap-1">
                    <div className={`flex-1 rounded-lg px-2 py-2 text-center ${tone}`}>
                      <p className="text-lg font-bold tabular-nums">{n}</p>
                      <p className="text-[11px] font-medium">{label}</p>
                    </div>
                    {i < stages.length - 1 && <ChevronRight size={14} className="shrink-0 text-slate-300" />}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Screened and shortlisted counts arrive with the hiring pipeline.</p>
            </section>

            {job.description && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Job Description</h3>
                <p className="line-clamp-6 whitespace-pre-line text-slate-700">{job.description}</p>
              </section>
            )}
            {job.responsibilities.length > 0 && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Key Responsibilities</h3>
                <ul className="space-y-1 text-slate-700">
                  {job.responsibilities.map((r) => <li key={r} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{r}</li>)}
                </ul>
              </section>
            )}
            <section>
              <h3 className="mb-1.5 font-bold text-slate-900">Required Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {[...job.primary_skills, ...job.secondary_skills].map((s) => <span key={s} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{s}</span>)}
                {!job.primary_skills.length && !job.secondary_skills.length && <span className="text-slate-400">—</span>}
              </div>
            </section>
            {job.rounds.length > 0 && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Interview Rounds</h3>
                <ol className="space-y-1">
                  {job.rounds.map((r, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
                      <span><b className="mr-1 text-slate-400">{i + 1}.</b>{r.name}</span><span className="text-slate-500">{r.duration_minutes} min</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {tab === "applications" && (
          apps === null ? (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
          ) : apps.length === 0 ? (
            <p className="text-slate-500">No applications yet.</p>
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{(a.full_name || a.applicant_email).slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{a.full_name || a.applicant_email}</p>
                    <p className="truncate text-xs text-slate-500">{a.applicant_email} · {fmtDate(a.submitted_at)}{a.heard_from ? ` · ${a.heard_from}` : ""}</p>
                  </div>
                  <Link to={`/applications?job=${job.id}&id=${a.id}`} className="shrink-0 text-xs font-semibold text-indigo-600 hover:underline">Review</Link>
                </li>
              ))}
            </ul>
            <Link to={`/applications?job=${job.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">Open all in Applications <ChevronRight size={14} /></Link>
            </>
          )
        )}

        {tab === "interviews" && (
          <div className="space-y-2 text-slate-600">
            <p>{job.interviews_count ? `${job.interviews_count} interview${job.interviews_count === 1 ? "" : "s"} for this job, ${job.selected_count} selected.` : "No interviews for this job yet."}</p>
            <Link to="/interviews" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">Open Interviews <ChevronRight size={14} /></Link>
          </div>
        )}

        {tab === "activity" && (
          <ol className="space-y-3 border-l border-slate-200 pl-4">
            {[...job.status_history].reverse().map((h, i) => (
              <li key={i} className="relative text-xs">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500" />
                <p className="text-sm font-medium text-slate-800">{h.from ? `${STATUS_STYLE[h.from].label} → ${STATUS_STYLE[h.to].label}` : STATUS_STYLE[h.to].label}</p>
                <p className="text-slate-500">{h.by?.name || "System"} · {new Date(h.at).toLocaleString()}</p>
                {h.note && <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-amber-800">{h.note}</p>}
              </li>
            ))}
            {job.status_history.length === 0 && <li className="text-xs text-slate-400">No changes recorded.</li>}
          </ol>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3">
        {perms.edit && job.status !== "ARCHIVED" ? (
          <button onClick={() => navigate(`/job-openings/${job.id}/edit`)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={13} /> Edit Job</button>
        ) : <span />}
        {perms.create ? (
          <button onClick={onDuplicate} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy size={13} /> Duplicate</button>
        ) : <span />}
        <button onClick={() => onTab("applications")} className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-semibold text-white hover:bg-indigo-700">View Applications <ChevronRight size={13} /></button>
        {perms.create && (
          <button onClick={onTemplate} className="col-span-3 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-700"><Bookmark size={12} /> Save as template</button>
        )}
      </div>
    </aside>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JobOpenings() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [ask, setAsk] = useState<null | { title: string; message: string; placeholder: string; confirmLabel: string; value: string; resolve: (v: string | null) => void }>(null);
  /** A small in-page text dialog (send-back reason, template name). */
  const prompt = (o: { title: string; message: string; placeholder?: string; confirmLabel: string; value?: string }) =>
    new Promise<string | null>((resolve) => setAsk({ placeholder: "", value: "", ...o, resolve }));
  const perms = useJobPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>(readSavedCompany);
  const company = companies.find((c) => c.id === companyId) ?? companies[0];
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("overview");
  const importRef = useRef<HTMLInputElement>(null);
  // Filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | JobStatus>("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("");
  const [page, setPage] = useState(1);

  const panelId = searchParams.get("jobId");
  const showTemplates = searchParams.get("view") === "templates";
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const openPanel = (id: string | null, tab: PanelTab = "overview") => {
    setPanelTab(tab);
    setParam("jobId", id);
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await fetchJobOpenings(undefined, showArchived));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load jobs.", "error");
    } finally {
      setLoading(false);
    }
  }, [showArchived, toast]);

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => undefined);
    fetchJobSettings().then((s) => setRequireApproval(s.require_approval)).catch(() => undefined);
    fetchJobTemplates().then(setTemplates).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Old dashboard links: ?action=new opens the job form.
  useEffect(() => {
    if (searchParams.get("action") === "new" && perms.create) navigate("/job-openings/new", { replace: true });
  }, [searchParams, perms.create, navigate]);

  const replaceJob = (job: JobOpening) => setJobs((list) => (list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]));

  const act: Act = async (job, action) => {
    setMenuId(null);
    let note = "";
    if (action === "reject") {
      const reason = await prompt({ title: `Send "${job.title}" back?`, message: "Tell the author what to change.", placeholder: "What should change?", confirmLabel: "Send back" });
      if (!reason?.trim()) return;
      note = reason.trim();
    }
    if (action === "archive" && !(await confirm({ title: `Archive ${job.code}?`, message: "It disappears from the list and the careers page. You can restore it later.", confirmLabel: "Archive", danger: true }))) return;
    if (action === "close" && !(await confirm({ title: `Close ${job.code}?`, message: "It stops taking applications and leaves the careers page.", confirmLabel: "Close job" }))) return;
    try {
      const updated = await jobAction(job.id, action, note);
      replaceJob(updated);
      if (updated.status === "ARCHIVED" && !showArchived) openPanel(null);
      toast(`${updated.code} is now ${updated.status_label.toLowerCase()}.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the job.", "error");
    }
  };

  /** Bulk actions on the ticked jobs: each job goes through the same checks as one at a time. */
  const bulk = async (action: "close" | "archive") => {
    const targets = jobs.filter((j) => checked.has(j.id) && actionsFor(j, perms, requireApproval).some((a) => a.action === action));
    if (!targets.length) {
      toast(action === "close" ? "None of the selected jobs can be closed." : "None of the selected jobs can be archived.", "error");
      return;
    }
    if (!(await confirm({ title: `${action === "close" ? "Close" : "Archive"} ${targets.length} job${targets.length === 1 ? "" : "s"}?`, confirmLabel: action === "close" ? "Close jobs" : "Archive", danger: action === "archive" }))) return;
    setBusy("bulk");
    let done = 0;
    for (const j of targets) {
      try {
        replaceJob(await jobAction(j.id, action));
        done += 1;
      } catch {
        // reported below
      }
    }
    setBusy(null);
    setChecked(new Set());
    toast(`${done} of ${targets.length} jobs ${action === "close" ? "closed" : "archived"}.`, done === targets.length ? "success" : "error");
    if (action === "archive" && !showArchived) loadJobs();
  };

  const duplicate = async (job: JobOpening) => {
    setMenuId(null);
    try {
      const copy = await duplicateJob(job.id);
      replaceJob(copy);
      toast(`Copied as ${copy.code} (draft).`, "success");
      openPanel(copy.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not copy the job.", "error");
    }
  };

  const saveAsTemplate = async (job: JobOpening) => {
    setMenuId(null);
    const name = await prompt({ title: "Save as template", message: "Name the template so you can start new jobs from it.", value: job.title, confirmLabel: "Save template" });
    if (!name?.trim()) return;
    try {
      const t = await saveJobTemplate(name.trim(), { from_job_id: job.id });
      setTemplates((list) => [...list, t].sort((a, b) => a.name.localeCompare(b.name)));
      toast(`Template "${t.name}" saved.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the template.", "error");
    }
  };

  const toggleApproval = async () => {
    try {
      const s = await saveJobSettings(!requireApproval);
      setRequireApproval(s.require_approval);
      toast(s.require_approval ? "Jobs now need approval before they are published." : "Jobs can be published without approval.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not change the setting.", "error");
    }
  };

  const exportCsv = async () => {
    setBusy("export");
    try {
      await downloadFile(jobsExportUrl(showArchived), "jobs.csv");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not export.", "error");
    } finally {
      setBusy(null);
    }
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    setBusy("import");
    try {
      const r = await importJobs(file);
      await loadJobs();
      const skipped = r.errors.length ? ` ${r.errors.length} skipped: ${r.errors.slice(0, 3).map((e) => `row ${e.row} (${e.message})`).join("; ")}${r.errors.length > 3 ? "…" : ""}` : "";
      toast(`${r.created.length} draft job${r.created.length === 1 ? "" : "s"} created.${skipped}`, r.errors.length ? "error" : "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not import.", "error");
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const departments = useMemo(() => [...new Set(jobs.map((j) => j.department).filter(Boolean))].sort(), [jobs]);
  const locations = useMemo(() => [...new Set(jobs.map((j) => j.location).filter(Boolean))].sort(), [jobs]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (status && j.status !== status) return false;
      if (department && j.department !== department) return false;
      if (location && j.location !== location) return false;
      if (experience) {
        const [lo, hi] = experience.split("-").map(Number);
        const min = j.experience_min ?? 0;
        if (min < lo || (hi && min > hi)) return false;
      }
      return !term || [j.title, j.code, j.department, ...j.primary_skills].some((v) => (v || "").toLowerCase().includes(term));
    });
  }, [jobs, q, status, department, location, experience]);

  useEffect(() => setPage(1), [q, status, department, location, experience, showArchived]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpis = useMemo(() => {
    const live = jobs.filter((j) => j.status !== "ARCHIVED");
    const closed = live.filter((j) => j.status === "CLOSED" && j.published_at && j.closed_at);
    const avg = closed.length ? Math.round(closed.reduce((n, j) => n + (daysBetween(j.published_at, j.closed_at) || 0), 0) / closed.length) : null;
    return {
      total: live.length,
      active: live.filter((j) => j.status === "OPEN").length,
      draft: live.filter((j) => j.status === "DRAFT").length,
      pending: live.filter((j) => j.status === "PENDING_APPROVAL").length,
      closed: live.filter((j) => j.status === "CLOSED").length,
      applications: live.reduce((n, j) => n + j.applications_count, 0),
      avg,
    };
  }, [jobs]);

  const hasFilters = !!(q || status || department || location || experience);
  const panelJob = jobs.find((j) => j.id === panelId) || null;
  const allOnPage = pageRows.length > 0 && pageRows.every((j) => checked.has(j.id));
  const wide = panelJob ? "hidden 2xl:table-cell" : "";

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Openings</h1>
          <p className="text-sm text-slate-500">Create, view and manage all job openings for your company.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadJobs} title="Refresh" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={15} /></button>
          <button onClick={exportCsv} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            {busy === "export" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export
          </button>
          {perms.create && (
            <>
              <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
              <button onClick={() => importRef.current?.click()} disabled={busy !== null} title="Each row of a CSV file becomes a draft job" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                {busy === "import" ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} Import
              </button>
            </>
          )}
          <button onClick={() => setParam("view", showTemplates ? null : "templates")} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${showTemplates ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            <FileText size={15} /> Job Templates
          </button>
          {perms.create && (
            <button onClick={() => navigate("/job-openings/new")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={16} /> Create Job Opening</button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard tone="blue" icon={<Briefcase size={20} />} value={kpis.total} label="Total Jobs" />
        <StatCard tone="green" icon={<CircleCheck size={20} />} value={kpis.active} label="Active Jobs" />
        <StatCard tone="amber" icon={<CircleDashed size={20} />} value={kpis.draft} label={kpis.pending ? `Draft · ${kpis.pending} awaiting approval` : "Draft"} />
        <StatCard tone="violet" icon={<Clock3 size={20} />} value={kpis.closed} label="Closed" />
        <StatCard tone="teal" icon={<Users size={20} />} value={kpis.applications.toLocaleString()} label="Total Applications" />
        <StatCard tone="green" icon={<Timer size={20} />} value={kpis.avg != null ? `${kpis.avg} Days` : "—"} label="Avg. Days Open" />
      </section>

      {showTemplates && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Job Templates</h2>
            <button onClick={() => setParam("view", null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={14} /></button>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-500">No templates yet. Open a job and choose "Save as template".</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{t.name}</b>
                    <span className="block truncate text-xs text-slate-500">{t.job.department || "—"} · {(t.job.primary_skills || []).slice(0, 4).join(", ") || "no skills"}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {perms.create && <button onClick={() => navigate(`/job-openings/new?template=${t.id}`)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white">Use</button>}
                    {perms.remove && (
                      <button
                        onClick={async () => {
                          if (!(await confirm({ title: `Delete template "${t.name}"?`, confirmLabel: "Delete", danger: true }))) return;
                          await deleteJobTemplate(t.id).catch((e) => toast(e instanceof Error ? e.message : "Could not delete.", "error"));
                          setTemplates((list) => list.filter((x) => x.id !== t.id));
                        }}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                        aria-label={`Delete ${t.name}`}
                      ><Trash2 size={13} /></button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Importing many jobs? <button onClick={() => downloadFile(JOBS_IMPORT_TEMPLATE_URL, "jobs-import-template.csv").catch(() => undefined)} className="font-semibold text-indigo-600 hover:underline">Download the CSV import template</button>.
          </p>
        </section>
      )}

      <div className={`grid gap-5 ${panelJob ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        <div className="min-w-0 space-y-3">
          <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm [&>label]:min-w-[140px] [&>label]:flex-1">
            <label className="relative !min-w-[220px] !flex-[2]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by job title, job code…" className={`${filterClass} pl-9`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Department
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className={filterClass}>
                <option value="">All Departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Location
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={filterClass}>
                <option value="">All Locations</option>
                {locations.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Status
              <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "")} className={filterClass}>
                <option value="">All Status</option>
                {(Object.keys(STATUS_STYLE) as JobStatus[]).filter((s) => showArchived || s !== "ARCHIVED").map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Experience
              <select value={experience} onChange={(e) => setExperience(e.target.value)} className={filterClass}>
                <option value="">All Experience</option>
                <option value="0-2">0–2 years</option>
                <option value="2-5">2–5 years</option>
                <option value="5-10">5–10 years</option>
                <option value="10-">10+ years</option>
              </select>
            </label>
            <div className="flex items-center gap-3 pb-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-indigo-600" /> Archived</label>
              <button onClick={() => { setQ(""); setStatus(""); setDepartment(""); setLocation(""); setExperience(""); }} disabled={!hasFilters} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 disabled:opacity-40"><RefreshCw size={14} /> Reset</button>
            </div>
          </section>

          {checked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
              <b className="text-indigo-800">{checked.size} selected</b>
              {perms.publish && <button disabled={busy !== null} onClick={() => bulk("close")} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">Close</button>}
              {perms.remove && <button disabled={busy !== null} onClick={() => bulk("archive")} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Archive</button>}
              {busy === "bulk" && <Loader2 size={14} className="animate-spin text-indigo-600" />}
              <button onClick={() => setChecked(new Set())} className="ml-auto text-xs text-indigo-700 hover:underline">Clear</button>
            </div>
          )}

          <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPage}
                        onChange={() => setChecked((s) => { const n = new Set(s); pageRows.forEach((j) => (allOnPage ? n.delete(j.id) : n.add(j.id))); return n; })}
                        className="accent-indigo-600"
                      />
                    </th>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Job Title</th>
                    <th className="px-3 py-3">Department</th>
                    <th className={`px-3 py-3 ${wide}`}>Location</th>
                    <th className={`px-3 py-3 ${wide}`}>Experience</th>
                    <th className="px-3 py-3 text-center">Applicants</th>
                    <th className="px-3 py-3">Status</th>
                    <th className={`px-3 py-3 ${wide}`}>Closing Date</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={10} className="px-4 py-6 text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading jobs…</td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-6 text-slate-500">{jobs.length ? "No jobs match these filters." : "No jobs yet. Create your first job opening."}</td></tr>
                  ) : (
                    pageRows.map((j, i) => (
                      <tr key={j.id} className={`cursor-pointer ${j.id === panelId ? "bg-indigo-50/60" : "hover:bg-slate-50"}`} onClick={() => openPanel(j.id)}>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select ${j.title}`} checked={checked.has(j.id)} onChange={() => setChecked((s) => { const n = new Set(s); if (n.has(j.id)) n.delete(j.id); else n.add(j.id); return n; })} className="accent-indigo-600" />
                        </td>
                        <td className="px-3 py-3 text-slate-500 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900">{j.title}</p>
                          <p className="font-mono text-xs text-indigo-600">{j.code}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{j.department || "—"}</td>
                        <td className={`px-3 py-3 text-slate-600 ${wide}`}>{j.location ? <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-slate-400" />{j.location}</span> : "—"}</td>
                        <td className={`whitespace-nowrap px-3 py-3 text-slate-600 ${wide}`}>{j.experience || "—"}</td>
                        <td className="px-3 py-3 text-center"><span className="inline-block min-w-[40px] rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700 tabular-nums">{j.applications_count}</span></td>
                        <td className="px-3 py-3"><StatusPill status={j.status} /></td>
                        <td className={`whitespace-nowrap px-3 py-3 text-slate-500 ${wide}`}>{j.closing_date ? fmtDate(j.closing_date) : "–"}</td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="relative flex justify-end gap-0.5">
                            <button onClick={() => openPanel(j.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View" aria-label={`View ${j.title}`}><Eye size={15} /></button>
                            {perms.edit && j.status !== "ARCHIVED" && <button onClick={() => navigate(`/job-openings/${j.id}/edit`)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit" aria-label={`Edit ${j.title}`}><Pencil size={15} /></button>}
                            <button onClick={() => setMenuId(menuId === j.id ? null : j.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="More" aria-label={`More actions for ${j.title}`}><MoreHorizontal size={15} /></button>
                            {menuId === j.id && (
                              <div className="absolute right-0 top-8 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                                {actionsFor(j, perms, requireApproval).map((a) => (
                                  <button key={a.action} onClick={() => act(j, a.action)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${a.danger ? "text-rose-600" : "text-slate-700"}`}>{a.icon} {a.label}</button>
                                ))}
                                {perms.create && <button onClick={() => duplicate(j)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Copy size={14} /> Duplicate</button>}
                                {perms.create && <button onClick={() => saveAsTemplate(j)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Bookmark size={14} /> Save as template</button>}
                                <button onClick={() => { setMenuId(null); openPanel(j.id, "applications"); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Users size={14} /> View applications</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {shown.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                <span>Showing {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, shown.length)} of {shown.length} job openings</span>
                <div className="flex items-center gap-1">
                  <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={15} /></button>
                  {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map((n) => (
                    <button key={n} onClick={() => setPage(n)} className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold ${n === page ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{n}</button>
                  ))}
                  <button disabled={page === pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={15} /></button>
                </div>
              </div>
            )}
          </section>

          {perms.settings && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-bold">Job approval</h2>
                <p className="text-xs text-slate-500">
                  {requireApproval ? "Jobs are reviewed by someone who can approve (e.g. a Hiring Manager) before they go live." : "Anyone who can publish jobs puts them live straight away."}
                </p>
              </div>
              <button onClick={toggleApproval} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${requireApproval ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-700"}`}>
                <CircleCheck size={14} /> {requireApproval ? "Approval required" : "No approval needed"}
              </button>
            </section>
          )}

          <CompanyBar
            companies={companies}
            selected={company}
            onSelect={(id) => {
              setCompanyId(id);
              try {
                localStorage.setItem(COMPANY_KEY, id);
              } catch {
                // only a convenience
              }
            }}
            onChanged={(changed) => setCompanies((list) => list.map((c) => (c.id === changed.id ? { ...c, ...changed } : c)))}
          />
        </div>

        {panelJob && (
          <JobPanel
            job={panelJob}
            perms={perms}
            requireApproval={requireApproval}
            careersSlug={company?.slug}
            tab={panelTab}
            onTab={setPanelTab}
            onClose={() => openPanel(null)}
            onAct={act}
            onDuplicate={() => duplicate(panelJob)}
            onTemplate={() => saveAsTemplate(panelJob)}
          />
        )}
      </div>

      {ask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={(e) => { e.preventDefault(); ask.resolve(ask.value); setAsk(null); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{ask.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{ask.message}</p>
            <textarea
              autoFocus
              rows={3}
              maxLength={500}
              value={ask.value}
              placeholder={ask.placeholder}
              onChange={(e) => setAsk({ ...ask, value: e.target.value })}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { ask.resolve(null); setAsk(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={!ask.value.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{ask.confirmLabel}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
