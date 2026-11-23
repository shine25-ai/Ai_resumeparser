import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Clock, Eye, FileText, GitBranch, GripVertical, IndianRupee, Layers, Loader2, Mail, Plus, Save, Send, Settings2,
  Trash2, UserRound,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { getInterviewTypes, getUsers, type InterviewTypeItem, type UserProfile } from "../utils/Api";
import { fetchMasters } from "../utils/adminApi";
import {
  createJobOpening, fetchJobOpening, fetchJobSettings, fetchJobTemplates, jobAction, updateJobOpening,
  type JobForm, type JobOpening, type JobRound, type JobTemplate,
} from "../utils/jobsApi";
import {
  CURRENCIES, ChipsInput, EMPLOYMENT_TYPES, Field, JobPreview, LinesInput, WORK_MODES, formOf, input,
} from "../components/jobs/jobForm";

/**
 * Create / Edit Job Opening (SRS Screen 6), a full page as in the mockup: the job form on the left, the hiring
 * workflow and settings in the middle, and a live preview of the careers-page job on the right. The five steps
 * at the top jump to their section. Saves a draft, or publishes (sent for approval when the company asks for it).
 */

const STEPS = [
  { id: "job-details", title: "Job Details", sub: "Basic information" },
  { id: "requirements", title: "Requirements", sub: "Skills, experience, qualification" },
  { id: "description", title: "Job Description", sub: "Roles & responsibilities" },
  { id: "workflow", title: "Hiring & Workflow", sub: "Interview process" },
  { id: "settings", title: "Publish & Settings", sub: "Visibility and notifications" },
];

function Card({ id, icon, title, action, children }: { id?: string; icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-transparent px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><span className="text-indigo-600">{icon}</span>{title}</h2>
        {action}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-sm text-slate-700">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

const canDo = () => {
  try {
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    const role = String(me.role || "").toLowerCase();
    const perms: string[] = me.permissions || [];
    const all = role === "admin" || role === "superadmin" || perms.length === 0;
    return { approve: all || perms.includes("jobs:approve"), publish: all || perms.includes("jobs:publish") };
  } catch {
    return { approve: true, publish: true };
  }
};

export default function JobEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [job, setJob] = useState<JobOpening | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [form, setForm] = useState<JobForm>(() => formOf());
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [masters, setMasters] = useState<Record<string, string[]>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [types, setTypes] = useState<InterviewTypeItem[]>([]);
  const [active, setActive] = useState(STEPS[0].id);
  const perms = useMemo(canDo, []);
  const isDraft = !job || job.status === "DRAFT";

  useEffect(() => {
    ["department", "job_category", "location", "skill", "education_level"].forEach((type) =>
      fetchMasters(type).then((items) => setMasters((m) => ({ ...m, [type]: items.map((i) => i.name) }))).catch(() => undefined)
    );
    getUsers().then(setUsers).catch(() => setUsers([]));
    getInterviewTypes(false).then(setTypes).catch(() => setTypes([]));
    fetchJobSettings().then((s) => setRequireApproval(s.require_approval)).catch(() => undefined);
    fetchJobTemplates()
      .then((t) => {
        setTemplates(t);
        const fromTemplate = params.get("template");
        const tpl = t.find((x) => x.id === fromTemplate);
        if (!id && tpl) setForm(formOf(null, tpl.job));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchJobOpening(id)
      .then((j) => {
        setJob(j);
        setForm(formOf(j));
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Could not load the job.", "error"))
      .finally(() => setLoading(false));
  }, [id, toast]);

  // Highlight the step whose section is on screen.
  useEffect(() => {
    const els = STEPS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -60% 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === "" ? null : Number(v));
  const rounds = form.rounds || [];
  const setRound = (i: number, patch: Partial<JobRound>) => set("rounds", rounds.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dropRound = (to: number) => {
    if (dragFrom === null || dragFrom === to) return;
    const next = [...rounds];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(to, 0, moved);
    set("rounds", next);
    setDragFrom(null);
  };

  const problems = useMemo(() => {
    const p: { step: string; text: string }[] = [];
    if (!form.title?.trim()) p.push({ step: "job-details", text: "Add a job title." });
    if (form.experience_min != null && form.experience_max != null && form.experience_min > form.experience_max) p.push({ step: "job-details", text: "Minimum experience is more than the maximum." });
    if (form.salary_min != null && form.salary_max != null && form.salary_min > form.salary_max) p.push({ step: "requirements", text: "Minimum salary is more than the maximum." });
    if (rounds.some((r) => !r.name.trim())) p.push({ step: "workflow", text: "Every interview round needs a name." });
    return p;
  }, [form, rounds]);
  const publishProblems = [!form.description?.trim() && "a job summary", !form.primary_skills?.length && "primary skills"].filter(Boolean) as string[];

  const jump = (stepId: string) => {
    setActive(stepId);
    document.getElementById(stepId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const save = async (publish: boolean) => {
    if (problems.length) {
      jump(problems[0].step);
      toast(problems[0].text, "error");
      return;
    }
    if (publish && publishProblems.length) {
      toast(`Add ${publishProblems.join(" and ")} before publishing.`, "error");
      jump(publishProblems[0] === "primary skills" ? "requirements" : "description");
      return;
    }
    setSaving(publish ? "publish" : "draft");
    try {
      let saved: JobOpening;
      if (job) {
        saved = await updateJobOpening(job.id, form);
        if (publish && isDraft) saved = await jobAction(job.id, "publish");
      } else {
        saved = await createJobOpening({ ...form, publish });
      }
      toast(
        publish ? (saved.status === "PENDING_APPROVAL" ? `${saved.code} was sent for approval.` : `${saved.code} is published.`) : `${saved.code} saved.`,
        "success"
      );
      navigate(`/job-openings?jobId=${saved.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the job.", "error");
    } finally {
      setSaving(null);
    }
  };

  const publishLabel = requireApproval && !perms.approve ? "Submit for Approval" : "Publish Job";

  if (loading) {
    return <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading the job…</p>;
  }

  return (
    <div className="space-y-4 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{job ? `Edit ${job.code}` : "Create Job Opening"}</h1>
          <p className="text-sm text-slate-500">{job ? job.title : "Add a new job, define requirements, set hiring workflow and publish to your career page."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!job && templates.length > 0 && (
            <select
              defaultValue={params.get("template") || ""}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) {
                  setForm(formOf(null, t.job));
                  toast(`Started from "${t.name}".`, "info");
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              aria-label="Start from a template"
            >
              <option value="">Start from a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button type="button" disabled={!!saving} onClick={() => save(false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {job && !isDraft ? "Save Changes" : "Save as Draft"}
          </button>
          {isDraft && perms.publish && (
            <button type="button" disabled={!!saving} onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {publishLabel}
            </button>
          )}
        </div>
      </div>

      {/* Steps: each jumps to its section */}
      <nav className="sticky top-0 z-20 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur sm:grid-cols-5">
        {STEPS.map((s, i) => {
          const bad = problems.some((p) => p.step === s.id);
          const on = active === s.id;
          return (
            <button key={s.id} type="button" onClick={() => jump(s.id)} className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left ${on ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${bad ? "bg-rose-100 text-rose-700" : on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-semibold ${on ? "text-slate-900" : "text-slate-600"}`}>{s.title}</span>
                <span className="hidden truncate text-[11px] text-slate-400 lg:block">{s.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px_320px]">
        {/* Column 1: the job */}
        <div className="space-y-4">
          <Card id="job-details" icon={<FileText size={18} />} title="Job Details">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Job title *" className="sm:col-span-2">
                <input autoFocus={!job} maxLength={200} value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Senior Java Developer" className={input} />
              </Field>
              <Field label="Job code" hint="automatic">
                <input value={job?.code || "Given when saved"} disabled className={`${input} bg-slate-50 text-slate-500`} />
              </Field>
              <Field label="Department">
                <input list="je-departments" maxLength={200} value={form.department || ""} onChange={(e) => set("department", e.target.value)} placeholder="Engineering" className={input} />
                <datalist id="je-departments">{(masters.department || []).map((d) => <option key={d} value={d} />)}</datalist>
              </Field>
              <Field label="Employment type">
                <select value={form.employment_type || ""} onChange={(e) => set("employment_type", e.target.value)} className={input}>
                  <option value="">Choose…</option>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Work mode">
                <select value={form.work_mode || ""} onChange={(e) => set("work_mode", e.target.value as JobForm["work_mode"])} className={input}>
                  {WORK_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Location">
                <input list="je-locations" maxLength={200} value={form.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="Chennai" className={input} />
                <datalist id="je-locations">{(masters.location || []).map((d) => <option key={d} value={d} />)}</datalist>
              </Field>
              <Field label="Category">
                <input list="je-categories" maxLength={120} value={form.category || ""} onChange={(e) => set("category", e.target.value)} placeholder="Engineering" className={input} />
                <datalist id="je-categories">{(masters.job_category || []).map((d) => <option key={d} value={d} />)}</datalist>
              </Field>
              <Field label="Vacancies">
                <input type="number" min={0} max={10000} value={form.open_positions ?? 1} onChange={(e) => set("open_positions", Number(e.target.value || 0))} className={input} />
              </Field>
              <Field label="Experience (years)" className="sm:col-span-2">
                <div className="flex items-center gap-2">
                  <input type="number" min={0} step={0.5} placeholder="Min" value={form.experience_min ?? ""} onChange={(e) => set("experience_min", num(e.target.value))} className={input} />
                  <span className="text-slate-400">to</span>
                  <input type="number" min={0} step={0.5} placeholder="Max" value={form.experience_max ?? ""} onChange={(e) => set("experience_max", num(e.target.value))} className={input} />
                </div>
              </Field>
            </div>
          </Card>

          <Card id="requirements" icon={<Layers size={18} />} title="Required Skills">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Primary skills *" hint="must-have; Enter to add">
                <ChipsInput listId="je-skills-1" value={form.primary_skills || []} onChange={(v) => set("primary_skills", v)} suggestions={masters.skill} placeholder="Java, Spring Boot, Microservices" />
              </Field>
              <Field label="Secondary skills" hint="good to have">
                <ChipsInput listId="je-skills-2" value={form.secondary_skills || []} onChange={(v) => set("secondary_skills", v)} suggestions={masters.skill} placeholder="SQL, Docker, Kubernetes, AWS" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_1fr]">
              <Field label="Qualification" hint="one per line">
                <LinesInput value={form.qualifications || []} onChange={(v) => set("qualifications", v)} placeholder="B.E / B.Tech (CS/IT or related)" rows={2} />
              </Field>
              <Field label="Salary range" hint="optional">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400"><IndianRupee size={14} /></span>
                  <input type="number" min={0} placeholder="From" value={form.salary_min ?? ""} onChange={(e) => set("salary_min", num(e.target.value))} className={input} />
                  <span className="text-slate-400">to</span>
                  <input type="number" min={0} placeholder="To" value={form.salary_max ?? ""} onChange={(e) => set("salary_max", num(e.target.value))} className={input} />
                </div>
                <div className="mt-1 flex gap-1.5">
                  <select value={form.salary_currency || "INR"} onChange={(e) => set("salary_currency", e.target.value)} className={`${input} py-1 text-xs`} aria-label="Currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
                  <select value={form.salary_period || "year"} onChange={(e) => set("salary_period", e.target.value as JobForm["salary_period"])} className={`${input} py-1 text-xs`} aria-label="Salary period">
                    <option value="year">Per annum</option>
                    <option value="month">Per month</option>
                    <option value="hour">Per hour</option>
                  </select>
                </div>
              </Field>
              <Field label="Notice period">
                <select value={form.notice_period || ""} onChange={(e) => set("notice_period", e.target.value)} className={input}>
                  <option value="">Any</option>
                  {["Immediate", "Up to 15 Days", "Up to 30 Days", "Up to 60 Days", "Up to 90 Days"].map((n) => <option key={n}>{n}</option>)}
                  {form.notice_period && !["Immediate", "Up to 15 Days", "Up to 30 Days", "Up to 60 Days", "Up to 90 Days"].includes(form.notice_period) && <option>{form.notice_period}</option>}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Requirements" hint="one per line; shown on the job page">
                <LinesInput value={form.requirements || []} onChange={(v) => set("requirements", v)} placeholder={"5 – 8 years of hands-on Java experience\nStrong in Spring Boot and REST APIs"} rows={3} />
              </Field>
              <Field label="Good to have" hint="one per line">
                <LinesInput value={form.nice_to_have || []} onChange={(v) => set("nice_to_have", v)} placeholder={"Kubernetes and containers\nKafka / RabbitMQ"} rows={3} />
              </Field>
              <Field label="Certifications"><ChipsInput listId="je-certs" value={form.certifications || []} onChange={(v) => set("certifications", v)} placeholder="AWS Certified Developer" /></Field>
              <Field label="Additional requirements">
                <input maxLength={2000} value={form.additional_requirements || ""} onChange={(e) => set("additional_requirements", e.target.value)} className={input} />
              </Field>
            </div>
          </Card>

          <Card id="description" icon={<FileText size={18} />} title="Job Description">
            <Field label="Tagline" hint="one line under the title on the job page">
              <input maxLength={200} value={form.tagline || ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Build scalable, high-performance products used by global customers." className={input} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Job summary *">
                <textarea rows={6} maxLength={5000} value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="What the role is about and why it matters." className={input} />
                <span className="self-end text-[11px] text-slate-400">{(form.description || "").length} / 5000</span>
              </Field>
              <Field label="Key responsibilities" hint="one per line">
                <LinesInput value={form.responsibilities || []} onChange={(v) => set("responsibilities", v)} placeholder={"Design and develop high-performance services\nMentor junior developers"} rows={6} />
              </Field>
              <Field label="What we offer" hint="one per line">
                <LinesInput value={form.what_we_offer || []} onChange={(v) => set("what_we_offer", v)} placeholder={"Competitive compensation\nFlexible work options (Hybrid)"} rows={4} />
              </Field>
              <Field label="Keywords (tags)">
                <ChipsInput listId="je-tags" value={form.tags || []} onChange={(v) => set("tags", v)} placeholder="Java, Backend, Chennai" />
              </Field>
            </div>
          </Card>
        </div>

        {/* Column 2: workflow and settings */}
        <div className="space-y-4">
          <Card
            id="workflow"
            icon={<GitBranch size={18} />}
            title="Hiring Workflow"
            action={
              <button type="button" onClick={() => set("rounds", [...rounds, { name: `Round ${rounds.length + 1}`, interview_type: "", duration_minutes: 60 }])} disabled={rounds.length >= 10} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 disabled:opacity-40">
                <Plus size={13} /> Add Round
              </button>
            }
          >
            <p className="-mt-1 text-xs font-semibold text-slate-600">Interview Rounds</p>
            <ol className="space-y-2">
              {rounds.map((r, i) => (
                <li
                  key={i}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropRound(i)}
                  className={`rounded-xl border border-slate-200 p-2 ${dragFrom === i ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" aria-label="Drag to reorder" />
                    <span className="w-4 text-xs font-bold text-slate-500">{i + 1}</span>
                    <input value={r.name} maxLength={80} onChange={(e) => setRound(i, { name: e.target.value })} className={`${input} py-1.5`} aria-label={`Round ${i + 1} name`} />
                    <button type="button" onClick={() => set("rounds", rounds.filter((_, k) => k !== i))} className="rounded p-1 text-rose-500 hover:bg-rose-50" aria-label="Remove round"><Trash2 size={14} /></button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 pl-10">
                    <select value={r.interview_type} onChange={(e) => setRound(i, { interview_type: e.target.value })} className={`${input} py-1 text-xs`} aria-label={`Round ${i + 1} type`}>
                      <option value="">Type…</option>
                      {types.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
                      {r.interview_type && !types.some((t) => t.code === r.interview_type) && <option value={r.interview_type}>{r.interview_type}</option>}
                    </select>
                    <Clock size={13} className="shrink-0 text-slate-400" />
                    <input type="number" min={10} max={480} step={5} value={r.duration_minutes} onChange={(e) => setRound(i, { duration_minutes: Number(e.target.value || 0) })} className={`${input} w-16 py-1 text-xs`} aria-label={`Round ${i + 1} minutes`} />
                    <span className="text-[11px] text-slate-400">min</span>
                  </div>
                </li>
              ))}
              {rounds.length === 0 && <li className="text-xs text-slate-500">No rounds yet.</li>}
            </ol>
          </Card>

          <Card id="settings" icon={<Settings2 size={18} />} title="Additional Settings">
            <div className="divide-y divide-slate-100">
              <Toggle label="Accept applications" checked={!!form.accept_applications} onChange={(v) => set("accept_applications", v)} hint="Turn off to show the job without an Apply button" />
              <Toggle label="Show salary range" checked={!!form.show_salary} onChange={(v) => set("show_salary", v)} />
            </div>
            <Field label="Application deadline" hint="optional">
              <input type="date" value={form.closing_date || ""} onChange={(e) => set("closing_date", e.target.value || null)} className={input} />
            </Field>
            <Field label="Hiring manager">
              <div className="relative">
                <UserRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={form.hiring_manager?.id || ""}
                  onChange={(e) => {
                    const u = users.find((x) => x.id === e.target.value);
                    set("hiring_manager", u ? { id: u.id, name: u.full_name } : null);
                  }}
                  className={`${input} pl-8`}
                >
                  <option value="">Not set</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Application notification to">
              <div className="flex items-start gap-1.5">
                <Mail size={14} className="mt-3 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1"><ChipsInput listId="je-emails" value={form.notify_emails || []} onChange={(v) => set("notify_emails", v)} placeholder="careers@company.com" suggestions={users.map((u) => u.email)} /></div>
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!form.send_candidate_confirmation} onChange={(e) => set("send_candidate_confirmation", e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Send confirmation email to candidates
            </label>
            {publishProblems.length > 0 && isDraft && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">To publish, add {publishProblems.join(" and ")}. You can save a draft now.</p>
            )}
            {requireApproval && !perms.approve && isDraft && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Your company reviews jobs before they go live: publishing sends this job for approval.</p>
            )}
          </Card>

          {/* On screens without the third column, the preview sits under the settings. */}
          <div className="2xl:hidden">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Eye size={16} className="text-indigo-600" /> Job Preview <span className="font-normal text-slate-500">(Career Page)</span></p>
            <JobPreview form={form} />
          </div>
        </div>

        {/* Column 3: preview */}
        <aside className="hidden 2xl:block">
          <div className="sticky top-20 space-y-2">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Eye size={16} className="text-indigo-600" /> Job Preview <span className="font-normal text-slate-500">(Career Page)</span></p>
            <JobPreview form={form} />
          </div>
        </aside>
      </div>
    </div>
  );
}
