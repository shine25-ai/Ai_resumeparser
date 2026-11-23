import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import CompanyBar from "../components/jobs/CompanyBar";
import JobWizard from "../components/jobs/JobWizard";
import { useFeedback } from "../components/ui/Feedback";
import {
  deleteJobTemplate,
  duplicateJob,
  fetchCompanies,
  fetchJobApplications,
  fetchJobOpenings,
  fetchJobSettings,
  fetchJobTemplates,
  jobAction,
  saveJobSettings,
  saveJobTemplate,
  type Company,
  type JobAction,
  type JobApplicationRow,
  type JobOpening,
  type JobStatus,
  type JobTemplate,
} from "../utils/jobsApi";

/** Jobs & Openings (SRS Screen 5): KPIs, search and filters, the job list with actions, and a details panel. */

const PAGE_SIZE = 20;
const COMPANY_KEY = "jobOpenings.companyId";

const STATUS_STYLE: Record<JobStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  OPEN: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-rose-50 text-rose-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};
const STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  OPEN: "Published",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

const filterClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

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

const daysBetween = (from?: string | null, to?: string | null) => {
  if (!from) return null;
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.round((b - a) / 86_400_000));
};

const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function StatusPill({ status }: { status: JobStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Progress({ label, value, of, color }: { label: string; value: number; of: number; color: string }) {
  const pct = of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold text-slate-800">{value}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

type Act = (job: JobOpening, action: JobAction) => void;

/** The actions a job offers now, given its status and the user's permissions. */
function actionsFor(job: JobOpening, perms: ReturnType<typeof useJobPermissions>, requireApproval: boolean) {
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

function JobPanel({
  job,
  perms,
  requireApproval,
  onClose,
  onEdit,
  onAct,
  onDuplicate,
  onTemplate,
  onApplications,
}: {
  job: JobOpening;
  perms: ReturnType<typeof useJobPermissions>;
  requireApproval: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAct: Act;
  onDuplicate: () => void;
  onTemplate: () => void;
  onApplications: () => void;
}) {
  const vacancies = Math.max(job.open_positions, 1);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-400">{job.code}</p>
              <h2 className="text-lg font-bold text-slate-900">{job.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <StatusPill status={job.status} />
                {job.department && <span>{job.department}</span>}
                {job.location && <span>· {job.location}</span>}
                {job.work_mode && <span>· {job.work_mode}</span>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {perms.edit && job.status !== "ARCHIVED" && (
              <button onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white"><Pencil size={13} /> Edit</button>
            )}
            {actionsFor(job, perms, requireApproval).map((a) => (
              <button key={a.action} onClick={() => onAct(job, a.action)} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${a.danger ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                {a.icon} {a.label}
              </button>
            ))}
            {perms.create && <button onClick={onDuplicate} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Copy size={13} /> Duplicate</button>}
            {perms.create && <button onClick={onTemplate} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Bookmark size={13} /> Save as template</button>}
          </div>
        </div>

        <div className="space-y-6 p-5 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hiring progress</h3>
            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              <Progress label="Applications" value={job.applications_count} of={Math.max(job.applications_count, 1)} color="bg-indigo-500" />
              <Progress label="Interviews" value={job.interviews_count} of={Math.max(job.applications_count, job.interviews_count, 1)} color="bg-sky-500" />
              <Progress label={`Selected (of ${job.open_positions} vacancies)`} value={job.selected_count} of={vacancies} color="bg-emerald-500" />
            </div>
            <button onClick={onApplications} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"><Eye size={12} /> View applications</button>
          </section>

          <section className="grid grid-cols-2 gap-3">
            {[
              ["Experience", job.experience || "—"],
              ["Vacancies", String(job.open_positions)],
              ["Employment", job.employment_type || "—"],
              ["Closing date", fmtDate(job.closing_date)],
              ["Hiring manager", job.hiring_manager?.name || "—"],
              ["Salary", job.salary_min || job.salary_max ? `${job.salary_min ?? "—"} – ${job.salary_max ?? "—"} ${job.salary_currency}${job.show_salary ? "" : " (hidden)"}` : "—"],
            ].map(([k, v]) => (
              <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-medium text-slate-800">{v}</p></div>
            ))}
          </section>

          {job.description && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Job description</h3>
              <p className="whitespace-pre-line text-slate-700">{job.description}</p>
            </section>
          )}
          {job.responsibilities.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Responsibilities</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700">{job.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {job.primary_skills.map((s) => <span key={s} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{s}</span>)}
              {job.secondary_skills.map((s) => <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
              {!job.primary_skills.length && !job.secondary_skills.length && <span className="text-slate-400">—</span>}
            </div>
          </section>
          {job.rounds.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Interview rounds</h3>
              <ol className="space-y-1">
                {job.rounds.map((r, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-xs">
                    <span><b className="mr-1 text-slate-400">{i + 1}.</b>{r.name}</span><span className="text-slate-500">{r.duration_minutes} min</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
            <ol className="space-y-2 border-l border-slate-200 pl-4">
              {[...job.status_history].reverse().map((h, i) => (
                <li key={i} className="text-xs">
                  <p className="font-medium text-slate-700">{h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : STATUS_LABEL[h.to]}</p>
                  <p className="text-slate-500">{h.by?.name || "System"} · {new Date(h.at).toLocaleString()}</p>
                  {h.note && <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-amber-800">{h.note}</p>}
                </li>
              ))}
              {job.status_history.length === 0 && <li className="text-xs text-slate-400">No changes recorded.</li>}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function JobOpenings() {
  const { toast, confirm } = useFeedback();
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
  const [wizard, setWizard] = useState<{ job: JobOpening | null; template?: JobTemplate } | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  // Filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | JobStatus>("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("");
  // Applications
  const [selectedId, setSelectedId] = useState("");
  const [applications, setApplications] = useState<JobApplicationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

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

  const loadApplications = useCallback(async () => {
    try {
      const data = await fetchJobApplications(selectedId, page, PAGE_SIZE, company?.id);
      setApplications(data.items);
      setTotal(data.total);
    } catch {
      setApplications([]);
    }
  }, [selectedId, page, company?.id]);

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => undefined);
    fetchJobSettings().then((s) => setRequireApproval(s.require_approval)).catch(() => undefined);
    fetchJobTemplates().then(setTemplates).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Dashboard links: ?jobId=<id> opens that job; ?action=new opens the wizard.
  useEffect(() => {
    const jobIdParam = searchParams.get("jobId");
    if (jobIdParam && jobs.some((j) => j.id === jobIdParam)) setPanelId(jobIdParam);
    if (searchParams.get("action") === "new" && perms.create) {
      setWizard({ job: null });
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, jobs, perms.create, setSearchParams]);

  const replaceJob = (job: JobOpening) => setJobs((list) => (list.some((j) => j.id === job.id) ? list.map((j) => (j.id === job.id ? job : j)) : [job, ...list]));

  const askText = (title: string, message: string) => prompt({ title, message, placeholder: "What should change?", confirmLabel: "Send back" });

  const act: Act = async (job, action) => {
    setMenuId(null);
    let note = "";
    if (action === "reject") {
      const reason = await askText(`Send "${job.title}" back?`, "Tell the author what to change.");
      if (!reason?.trim()) return;
      note = reason.trim();
    }
    if (action === "archive" && !(await confirm({ title: `Archive ${job.code}?`, message: "It disappears from the list and the careers page. You can restore it later.", confirmLabel: "Archive", danger: true }))) return;
    if (action === "close" && !(await confirm({ title: `Close ${job.code}?`, message: "It stops taking applications and leaves the careers page.", confirmLabel: "Close job" }))) return;
    try {
      const updated = await jobAction(job.id, action, note);
      replaceJob(updated);
      if (updated.status === "ARCHIVED" && !showArchived) setPanelId(null);
      toast(`${updated.code} is now ${updated.status_label.toLowerCase()}.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the job.", "error");
    }
  };

  const duplicate = async (job: JobOpening) => {
    setMenuId(null);
    try {
      const copy = await duplicateJob(job.id);
      replaceJob(copy);
      toast(`Copied as ${copy.code} (draft).`, "success");
      setPanelId(copy.id);
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

  const showApplications = (job: JobOpening) => {
    setPanelId(null);
    setSelectedId(job.id);
    setPage(1);
    setTimeout(() => document.getElementById("job-applications")?.scrollIntoView({ behavior: "smooth" }), 50);
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

  const kpis = useMemo(() => {
    const live = jobs.filter((j) => j.status !== "ARCHIVED");
    const closed = live.filter((j) => j.status === "CLOSED" && j.published_at && j.closed_at);
    const avg = closed.length ? Math.round(closed.reduce((n, j) => n + (daysBetween(j.published_at, j.closed_at) || 0), 0) / closed.length) : null;
    return [
      ["Total jobs", live.length],
      ["Published", live.filter((j) => j.status === "OPEN").length],
      ["Drafts", live.filter((j) => j.status === "DRAFT").length],
      ["Pending approval", live.filter((j) => j.status === "PENDING_APPROVAL").length],
      ["Closed", live.filter((j) => j.status === "CLOSED").length],
      ["Applications", live.reduce((n, j) => n + j.applications_count, 0)],
      ["Avg. days open", avg ?? "—"],
    ] as [string, number | string][];
  }, [jobs]);

  const hasFilters = !!(q || status || department || location || experience);
  const panelJob = jobs.find((j) => j.id === panelId) || null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs & Openings</h1>
          <p className="text-sm text-slate-500">Create, approve and publish jobs on your careers page, and follow their hiring progress.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { loadJobs(); loadApplications(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={15} /> Refresh</button>
          <button onClick={() => setShowTemplates((v) => !v)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><FileText size={15} /> Templates ({templates.length})</button>
          {perms.create && (
            <button onClick={() => setWizard({ job: null })} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={16} /> Create job</button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {kpis.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      {showTemplates && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">Job templates</h2>
            <button onClick={() => setShowTemplates(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={14} /></button>
          </div>
          {templates.length === 0 ? (
            <p className="text-xs text-slate-500">No templates yet. Open a job and choose "Save as template".</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <span><b>{t.name}</b> <span className="text-xs text-slate-500">· {t.job.department || "—"} · {(t.job.primary_skills || []).slice(0, 4).join(", ")}</span></span>
                  <span className="flex gap-1">
                    {perms.create && <button onClick={() => setWizard({ job: null, template: t })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Use</button>}
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
        </section>
      )}

      <section className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job title, code or skill" className={`${filterClass} w-full pl-9`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "")} className={filterClass} aria-label="Status">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as JobStatus[]).filter((s) => showArchived || s !== "ARCHIVED").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className={filterClass} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)} className={filterClass} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={experience} onChange={(e) => setExperience(e.target.value)} className={filterClass} aria-label="Experience">
          <option value="">Any experience</option>
          <option value="0-2">0–2 years</option>
          <option value="2-5">2–5 years</option>
          <option value="5-10">5–10 years</option>
          <option value="10-">10+ years</option>
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-indigo-600" /> Show archived</label>
        {hasFilters && <button onClick={() => { setQ(""); setStatus(""); setDepartment(""); setLocation(""); setExperience(""); }} className="text-xs font-medium text-indigo-600 hover:underline">Reset filters</button>}
      </section>

      <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3">Job title</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Experience</th>
                <th className="px-4 py-3 text-right">Applicants</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Closing date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-6 text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading jobs…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-slate-500">{jobs.length ? "No jobs match these filters." : "No jobs yet. Create your first job."}</td></tr>
              ) : (
                shown.map((j) => (
                  <tr key={j.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setPanelId(j.id)}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{j.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{j.title}</p>
                      <p className="text-xs text-slate-500">{[j.employment_type, j.work_mode].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{j.department || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{j.location || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{j.experience || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{j.applications_count}</td>
                    <td className="px-4 py-3"><StatusPill status={j.status} />{j.status === "OPEN" && !j.accepting && <p className="mt-0.5 text-[10px] text-amber-700">Not taking applications</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(j.closing_date)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex justify-end gap-1">
                        <button onClick={() => setPanelId(j.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View" aria-label={`View ${j.title}`}><Eye size={15} /></button>
                        {perms.edit && j.status !== "ARCHIVED" && <button onClick={() => setWizard({ job: j })} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit" aria-label={`Edit ${j.title}`}><Pencil size={15} /></button>}
                        <button onClick={() => setMenuId(menuId === j.id ? null : j.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="More" aria-label={`More actions for ${j.title}`}><MoreHorizontal size={15} /></button>
                        {menuId === j.id && (
                          <div className="absolute right-0 top-8 z-20 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                            {actionsFor(j, perms, requireApproval).map((a) => (
                              <button key={a.action} onClick={() => act(j, a.action)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${a.danger ? "text-rose-600" : "text-slate-700"}`}>{a.icon} {a.label}</button>
                            ))}
                            {perms.create && <button onClick={() => duplicate(j)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Copy size={14} /> Duplicate</button>}
                            {perms.create && <button onClick={() => saveAsTemplate(j)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Bookmark size={14} /> Save as template</button>}
                            <button onClick={() => { setMenuId(null); showApplications(j); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Eye size={14} /> View applications</button>
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
            <CheckCircle2 size={14} /> {requireApproval ? "Approval required" : "No approval needed"}
          </button>
        </section>
      )}

      <section id="job-applications" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h2 className="font-semibold">Applications {selectedId ? `for ${jobs.find((o) => o.id === selectedId)?.title ?? "selected job"}` : "(all jobs)"}</h2>
          {selectedId && <button onClick={() => { setSelectedId(""); setPage(1); }} className="text-sm text-slate-500 hover:underline">Show all</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">How they heard</th>
                <th className="px-4 py-3">Resume</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 && <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>No applications yet.</td></tr>}
              {applications.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{a.full_name || "—"}{a.phone && <div className="text-xs text-slate-500">{a.phone}</div>}</td>
                  <td className="px-4 py-3">{a.applicant_email}</td>
                  <td className="px-4 py-3">{a.opening_title}</td>
                  <td className="px-4 py-3">{new Date(a.submitted_at).toLocaleString()}</td>
                  <td className="max-w-[240px] px-4 py-3">
                    {a.heard_from || <span className="text-slate-400">—</span>}
                    {a.note && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500" title={a.note}>“{a.note}”</div>}
                  </td>
                  <td className="px-4 py-3">
                    {a.candidate_id ? (
                      <Link to={`/candidates/${a.resume_id}`} className="text-indigo-600 hover:underline">{a.candidate_id} · {a.resume_status}</Link>
                    ) : (
                      <span className="text-slate-500">{a.resume_status === "MERGED" ? "Merged into existing profile" : a.resume_status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button>
          </div>
        )}
      </section>

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
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-bold">Careers page</h2>
          <p className="text-xs text-slate-500">Its sections, text, images and website address are set in the Career Page builder.</p>
        </div>
        <Link to="/career-page" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Open the builder</Link>
      </section>

      {wizard && (
        <JobWizard
          job={wizard.job}
          template={wizard.template}
          templates={templates}
          requireApproval={requireApproval}
          canPublish={perms.approve}
          onClose={() => setWizard(null)}
          onSaved={(job, published) => {
            replaceJob(job);
            setWizard(null);
            setPanelId(job.id);
            toast(
              published ? (job.status === "PENDING_APPROVAL" ? `${job.code} was sent for approval.` : `${job.code} is published.`) : `${job.code} saved.`,
              "success"
            );
          }}
        />
      )}
      {ask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); ask.resolve(ask.value); setAsk(null); }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
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
      {panelJob && (
        <JobPanel
          job={panelJob}
          perms={perms}
          requireApproval={requireApproval}
          onClose={() => setPanelId(null)}
          onEdit={() => { setPanelId(null); setWizard({ job: panelJob }); }}
          onAct={act}
          onDuplicate={() => duplicate(panelJob)}
          onTemplate={() => saveAsTemplate(panelJob)}
          onApplications={() => showApplications(panelJob)}
        />
      )}
    </div>
  );
}
