import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useFeedback } from "../ui/Feedback";
import { getInterviewTypes, getUsers, type InterviewTypeItem, type UserProfile } from "../../utils/Api";
import { fetchMasters } from "../../utils/adminApi";
import {
  createJobOpening,
  jobAction,
  updateJobOpening,
  type JobForm,
  type JobOpening,
  type JobRound,
  type JobTemplate,
} from "../../utils/jobsApi";
import { useTheme, assetUrl } from "../../theme/ThemeProvider";

/**
 * Create / edit a job (SRS Screen 6): a 5-step wizard with a live preview of how the job looks on the
 * careers page. Saves as a draft, or publishes (sent for approval when the company asks for it).
 */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";
const STEPS = ["Job details", "Requirements", "Job description", "Hiring & workflow", "Publish & settings"];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];
const WORK_MODES = ["Onsite", "Hybrid", "Remote"] as const;
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const DEFAULT_ROUNDS: JobRound[] = [
  { name: "HR Screening", interview_type: "HR", duration_minutes: 30 },
  { name: "Technical Round 1", interview_type: "TECHNICAL", duration_minutes: 60 },
  { name: "Technical Round 2", interview_type: "TECHNICAL", duration_minutes: 60 },
  { name: "Managerial Round", interview_type: "MANAGERIAL", duration_minutes: 45 },
];

const EMPTY: JobForm = {
  title: "",
  department: "",
  category: "",
  employment_type: "Full-time",
  work_mode: "Onsite",
  location: "",
  open_positions: 1,
  experience_min: null,
  experience_max: null,
  primary_skills: [],
  secondary_skills: [],
  qualifications: [],
  salary_min: null,
  salary_max: null,
  salary_currency: "INR",
  show_salary: false,
  notice_period: "",
  certifications: [],
  additional_requirements: "",
  description: "",
  responsibilities: [],
  what_we_offer: [],
  tags: [],
  rounds: DEFAULT_ROUNDS,
  hiring_manager: null,
  notify_emails: [],
  send_candidate_confirmation: true,
  accept_applications: true,
  closing_date: null,
};

const formOf = (job?: JobOpening | null, template?: JobForm | null): JobForm => {
  const src = (job || template || {}) as JobForm;
  const out: JobForm = { ...EMPTY };
  (Object.keys(EMPTY) as (keyof JobForm)[]).forEach((k) => {
    if (src[k] !== undefined && src[k] !== null) (out as Record<string, unknown>)[k] = src[k];
  });
  if (job || template) out.rounds = src.rounds || [];
  if (template && !job) out.closing_date = null;
  return out;
};

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-600">
        {label} {hint && <span className="font-normal text-slate-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Type and press Enter (or comma) to add; suggestions come from master data. */
function ChipsInput({ value, onChange, placeholder, suggestions = [], listId }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[]; listId: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    items.forEach((item) => {
      if (!next.some((v) => v.toLowerCase() === item.toLowerCase())) next.push(item);
    });
    onChange(next);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-indigo-500">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-indigo-400 hover:text-indigo-700"><X size={11} /></button>
        </span>
      ))}
      <input
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(text)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

/** One item per line. */
function LinesInput({ value, onChange, placeholder, rows = 4 }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; rows?: number }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => setText(value.join("\n")), [value]);
  return (
    <textarea
      rows={rows}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onChange(text.split("\n").map((l) => l.trim().replace(/^[-•*]\s*/, "")).filter(Boolean))}
      className={input}
    />
  );
}

const money = (n: number | null | undefined, cur?: string) =>
  n == null ? "" : new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "INR", maximumFractionDigits: 0 }).format(n);

/** How the job will look on the careers page. */
function JobPreview({ form }: { form: JobForm }) {
  const { branding, logo } = useTheme();
  const salary = form.show_salary && (form.salary_min || form.salary_max)
    ? [money(form.salary_min, form.salary_currency), money(form.salary_max, form.salary_currency)].filter(Boolean).join(" – ")
    : "";
  const exp = form.experience_min != null || form.experience_max != null
    ? form.experience_max != null ? `${form.experience_min ?? 0}-${form.experience_max} yrs` : `${form.experience_min}+ yrs`
    : "";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: "var(--sidebar-bg)" }}>
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-white">
          {logo ? <img src={assetUrl(logo)} alt="" className="h-full w-full object-contain" /> : <Briefcase size={14} className="text-indigo-600" />}
        </span>
        <span className="truncate text-xs font-semibold">{branding.app_name} · Careers</span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{form.title || "Job title"}</h3>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {form.department && <span>{form.department}</span>}
            {form.location && <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{form.location}</span>}
            {form.work_mode && <span>{form.work_mode}</span>}
            {form.employment_type && <span>{form.employment_type}</span>}
            {exp && <span className="inline-flex items-center gap-0.5"><Clock size={10} />{exp}</span>}
          </p>
        </div>
        {salary && <p className="text-xs font-semibold text-emerald-700">{salary}</p>}
        <p className="line-clamp-4 whitespace-pre-line text-xs text-slate-600">{form.description || "The job summary appears here."}</p>
        {!!form.responsibilities?.length && (
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">Responsibilities</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">{form.responsibilities.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
        {!!(form.primary_skills?.length || form.secondary_skills?.length) && (
          <div className="flex flex-wrap gap-1">
            {form.primary_skills?.map((s) => <span key={s} className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{s}</span>)}
            {form.secondary_skills?.map((s) => <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{s}</span>)}
          </div>
        )}
        <button type="button" disabled className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white">Apply now</button>
      </div>
    </div>
  );
}

export default function JobWizard({
  job,
  template,
  templates,
  requireApproval,
  canPublish,
  onClose,
  onSaved,
}: {
  job: JobOpening | null;
  template?: JobTemplate;
  templates: JobTemplate[];
  requireApproval: boolean;
  canPublish: boolean;
  onClose: () => void;
  onSaved: (job: JobOpening, published: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<JobForm>(() => formOf(job, template?.job));
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [masters, setMasters] = useState<Record<string, string[]>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [types, setTypes] = useState<InterviewTypeItem[]>([]);
  const isDraft = !job || job.status === "DRAFT";

  useEffect(() => {
    ["department", "job_category", "location", "skill"].forEach((type) =>
      fetchMasters(type)
        .then((items) => setMasters((m) => ({ ...m, [type]: items.map((i) => i.name) })))
        .catch(() => undefined)
    );
    getUsers().then(setUsers).catch(() => setUsers([]));
    getInterviewTypes(false).then(setTypes).catch(() => setTypes([]));
  }, []);

  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === "" ? null : Number(v));

  const problems = useMemo(() => {
    const p: Record<number, string> = {};
    if (!form.title?.trim()) p[0] = "Add a job title.";
    else if (form.experience_min != null && form.experience_max != null && form.experience_min > form.experience_max) p[0] = "Minimum experience is more than the maximum.";
    if (form.salary_min != null && form.salary_max != null && form.salary_min > form.salary_max) p[1] = "Minimum salary is more than the maximum.";
    if ((form.rounds || []).some((r) => !r.name.trim())) p[3] = "Every interview round needs a name.";
    return p;
  }, [form]);
  const publishProblems = [
    !form.description?.trim() && "a job summary",
    !form.primary_skills?.length && "primary skills",
  ].filter(Boolean) as string[];

  const rounds = form.rounds || [];
  const setRound = (i: number, patch: Partial<JobRound>) => set("rounds", rounds.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const moveRound = (i: number, d: -1 | 1) => {
    const next = [...rounds];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set("rounds", next);
  };

  const save = async (publish: boolean) => {
    if (Object.keys(problems).length) {
      const first = Number(Object.keys(problems)[0]);
      setStep(first);
      toast(problems[first], "error");
      return;
    }
    if (publish && publishProblems.length) {
      toast(`Add ${publishProblems.join(" and ")} before publishing.`, "error");
      setStep(publishProblems[0] === "primary skills" ? 1 : 2);
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
      onSaved(saved, publish);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the job.", "error");
    } finally {
      setSaving(null);
    }
  };

  const publishLabel = requireApproval && !canPublish ? "Submit for approval" : "Publish job";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-6">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{job ? `Edit ${job.code}` : "Create job opening"}</h2>
            <p className="text-xs text-slate-500">{job ? job.title : "Define the role, its requirements and interview rounds, then publish it on your careers page."}</p>
          </div>
          <div className="flex items-center gap-2">
            {!job && templates.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  if (t) {
                    setForm(formOf(null, t.job));
                    toast(`Started from "${t.name}".`, "info");
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                aria-label="Start from a template"
              >
                <option value="">Start from a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <ol className="flex gap-2 overflow-x-auto border-b border-slate-100 px-6 py-3">
          {STEPS.map((label, i) => (
            <li key={label} className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${i === step ? "bg-indigo-600 text-white" : problems[i] ? "bg-rose-50 text-rose-700" : i < step ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25">{i < step && !problems[i] ? <Check size={12} /> : i + 1}</span>
                {label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {step === 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" className="sm:col-span-2">
                  <input autoFocus maxLength={200} value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="Senior Java Developer" className={input} />
                </Field>
                <Field label="Job code" hint="made automatically">
                  <input value={job?.code || "Given when saved"} disabled className={`${input} bg-slate-50 text-slate-500`} />
                </Field>
                <Field label="Department">
                  <input list="jw-departments" maxLength={200} value={form.department || ""} onChange={(e) => set("department", e.target.value)} placeholder="Engineering" className={input} />
                  <datalist id="jw-departments">{(masters.department || []).map((d) => <option key={d} value={d} />)}</datalist>
                </Field>
                <Field label="Category">
                  <input list="jw-categories" maxLength={120} value={form.category || ""} onChange={(e) => set("category", e.target.value)} placeholder="Engineering" className={input} />
                  <datalist id="jw-categories">{(masters.job_category || []).map((d) => <option key={d} value={d} />)}</datalist>
                </Field>
                <Field label="Employment type">
                  <select value={form.employment_type || ""} onChange={(e) => set("employment_type", e.target.value)} className={input}>
                    <option value="">Choose…</option>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Work mode">
                  <div className="flex gap-2">
                    {WORK_MODES.map((m) => (
                      <button key={m} type="button" onClick={() => set("work_mode", m)} className={`flex-1 rounded-lg border px-3 py-2 text-sm ${form.work_mode === m ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 bg-white text-slate-700"}`}>{m}</button>
                    ))}
                  </div>
                </Field>
                <Field label="Location">
                  <input list="jw-locations" maxLength={200} value={form.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="Chennai" className={input} />
                  <datalist id="jw-locations">{(masters.location || []).map((d) => <option key={d} value={d} />)}</datalist>
                </Field>
                <Field label="Vacancies">
                  <input type="number" min={0} max={10000} value={form.open_positions ?? 1} onChange={(e) => set("open_positions", Number(e.target.value || 0))} className={input} />
                </Field>
                <Field label="Experience" hint="years">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} step={0.5} placeholder="Min" value={form.experience_min ?? ""} onChange={(e) => set("experience_min", num(e.target.value))} className={input} />
                    <span className="text-slate-400">–</span>
                    <input type="number" min={0} step={0.5} placeholder="Max" value={form.experience_max ?? ""} onChange={(e) => set("experience_max", num(e.target.value))} className={input} />
                  </div>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Field label="Primary skills" hint="must-have; Enter to add">
                  <ChipsInput listId="jw-skills-1" value={form.primary_skills || []} onChange={(v) => set("primary_skills", v)} suggestions={masters.skill} placeholder="Java, Spring Boot, Microservices, REST API" />
                </Field>
                <Field label="Secondary skills" hint="good to have">
                  <ChipsInput listId="jw-skills-2" value={form.secondary_skills || []} onChange={(v) => set("secondary_skills", v)} suggestions={masters.skill} placeholder="SQL, Docker, Kubernetes, AWS" />
                </Field>
                <Field label="Qualifications" hint="one per line">
                  <LinesInput value={form.qualifications || []} onChange={(v) => set("qualifications", v)} placeholder="B.E. / B.Tech in Computer Science or equivalent" rows={3} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_110px]">
                  <Field label="Salary from"><input type="number" min={0} value={form.salary_min ?? ""} onChange={(e) => set("salary_min", num(e.target.value))} className={input} /></Field>
                  <Field label="Salary to"><input type="number" min={0} value={form.salary_max ?? ""} onChange={(e) => set("salary_max", num(e.target.value))} className={input} /></Field>
                  <Field label="Currency">
                    <select value={form.salary_currency || "INR"} onChange={(e) => set("salary_currency", e.target.value)} className={input}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!form.show_salary} onChange={(e) => set("show_salary", e.target.checked)} className="accent-indigo-600" /> Show the salary range on the careers page
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Notice period"><input maxLength={60} value={form.notice_period || ""} onChange={(e) => set("notice_period", e.target.value)} placeholder="Up to 60 days" className={input} /></Field>
                  <Field label="Certifications"><ChipsInput listId="jw-certs" value={form.certifications || []} onChange={(v) => set("certifications", v)} placeholder="AWS Certified Developer" /></Field>
                </div>
                <Field label="Additional requirements">
                  <textarea rows={2} maxLength={2000} value={form.additional_requirements || ""} onChange={(e) => set("additional_requirements", e.target.value)} className={input} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Field label="Job summary" hint="blank lines start a new paragraph">
                  <textarea rows={5} maxLength={5000} value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="What the role is about and why it matters." className={input} />
                </Field>
                <Field label="Key responsibilities" hint="one per line">
                  <LinesInput value={form.responsibilities || []} onChange={(v) => set("responsibilities", v)} placeholder={"Design and build payment services\nReview code and mentor engineers"} />
                </Field>
                <Field label="What we offer" hint="one per line">
                  <LinesInput value={form.what_we_offer || []} onChange={(v) => set("what_we_offer", v)} placeholder={"Health insurance for family\nHybrid working"} rows={3} />
                </Field>
                <Field label="Keywords / tags"><ChipsInput listId="jw-tags" value={form.tags || []} onChange={(v) => set("tags", v)} placeholder="fintech, backend" /></Field>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">Interview rounds</p>
                    <button type="button" onClick={() => set("rounds", [...rounds, { name: `Round ${rounds.length + 1}`, interview_type: "", duration_minutes: 60 }])} disabled={rounds.length >= 10} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 disabled:opacity-40">
                      <Plus size={13} /> Add round
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr><th className="w-10 px-3 py-2">#</th><th className="px-2 py-2">Round</th><th className="px-2 py-2">Interview type</th><th className="w-28 px-2 py-2">Minutes</th><th className="w-24" /></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rounds.map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-1.5"><input value={r.name} maxLength={80} onChange={(e) => setRound(i, { name: e.target.value })} className={`${input} py-1.5`} aria-label={`Round ${i + 1} name`} /></td>
                            <td className="px-2 py-1.5">
                              <select value={r.interview_type} onChange={(e) => setRound(i, { interview_type: e.target.value })} className={`${input} py-1.5`} aria-label={`Round ${i + 1} type`}>
                                <option value="">—</option>
                                {types.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
                                {r.interview_type && !types.some((t) => t.code === r.interview_type) && <option value={r.interview_type}>{r.interview_type}</option>}
                              </select>
                            </td>
                            <td className="px-2 py-1.5"><input type="number" min={10} max={480} step={5} value={r.duration_minutes} onChange={(e) => setRound(i, { duration_minutes: Number(e.target.value || 0) })} className={`${input} py-1.5`} aria-label={`Round ${i + 1} minutes`} /></td>
                            <td className="px-2 py-1.5">
                              <div className="flex justify-end gap-0.5">
                                <button type="button" disabled={i === 0} onClick={() => moveRound(i, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={13} /></button>
                                <button type="button" disabled={i === rounds.length - 1} onClick={() => moveRound(i, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={13} /></button>
                                <button type="button" onClick={() => set("rounds", rounds.filter((_, k) => k !== i))} className="rounded p-1 text-rose-500 hover:bg-rose-50" aria-label="Remove round"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {rounds.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-xs text-slate-500">No rounds yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Hiring manager">
                    <select
                      value={form.hiring_manager?.id || ""}
                      onChange={(e) => {
                        const u = users.find((x) => x.id === e.target.value);
                        set("hiring_manager", u ? { id: u.id, name: u.full_name } : null);
                      }}
                      className={input}
                    >
                      <option value="">Not set</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Tell these people about new applications">
                    <ChipsInput listId="jw-emails" value={form.notify_emails || []} onChange={(v) => set("notify_emails", v)} placeholder="hr@company.com" suggestions={users.map((u) => u.email)} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!form.send_candidate_confirmation} onChange={(e) => set("send_candidate_confirmation", e.target.checked)} className="accent-indigo-600" /> Email candidates a confirmation when they apply
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Application deadline" hint="optional">
                    <input type="date" value={form.closing_date || ""} onChange={(e) => set("closing_date", e.target.value || null)} className={input} />
                  </Field>
                  <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={!!form.accept_applications} onChange={(e) => set("accept_applications", e.target.checked)} className="accent-indigo-600" /> Accept applications on the careers page
                  </label>
                </div>
                <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                  {[
                    ["Job", `${form.title || "—"}${form.department ? ` · ${form.department}` : ""}`],
                    ["Where", [form.location, form.work_mode, form.employment_type].filter(Boolean).join(" · ") || "—"],
                    ["Vacancies", String(form.open_positions ?? 0)],
                    ["Primary skills", form.primary_skills?.join(", ") || "—"],
                    ["Interview rounds", rounds.map((r) => r.name).join(" → ") || "—"],
                    ["Hiring manager", form.hiring_manager?.name || "—"],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="truncate font-medium text-slate-800">{v}</dd></div>
                  ))}
                </dl>
                {publishProblems.length > 0 && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">To publish, add {publishProblems.join(" and ")}. You can save a draft now.</p>
                )}
                {requireApproval && !canPublish && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Your company reviews jobs before they go live: publishing sends this job for approval.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => (step ? setStep(step - 1) : onClose())} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <ChevronLeft size={14} /> {step ? "Back" : "Cancel"}
              </button>
              <div className="flex gap-2">
                <button type="button" disabled={!!saving} onClick={() => save(false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {saving === "draft" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {job && !isDraft ? "Save changes" : "Save as draft"}
                </button>
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={() => setStep(step + 1)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
                    Next <ChevronRight size={14} />
                  </button>
                ) : (
                  isDraft && (
                    <button type="button" disabled={!!saving} onClick={() => save(true)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {saving === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {publishLabel}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p>
            <div className="sticky top-4"><JobPreview form={form} /></div>
          </aside>
        </div>
      </div>
    </div>
  );
}
