import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Briefcase, Building2, CalendarDays, Clock, MapPin, Users, X } from "lucide-react";
import type { JobForm, JobOpening, JobRound } from "../../utils/jobsApi";
import { useTheme, assetUrl } from "../../theme/ThemeProvider";

/** Pieces of the job form (SRS Screen 6), used by the Create / Edit Job Opening page. */

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";
export const STEPS = ["Job details", "Requirements", "Job description", "Hiring & workflow", "Publish & settings"];
export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Temporary"];
export const WORK_MODES = ["Onsite", "Hybrid", "Remote"] as const;
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
export const DEFAULT_ROUNDS: JobRound[] = [
  { name: "HR Screening", interview_type: "HR", duration_minutes: 30 },
  { name: "Technical Round 1", interview_type: "TECHNICAL", duration_minutes: 60 },
  { name: "Technical Round 2", interview_type: "TECHNICAL", duration_minutes: 60 },
  { name: "Managerial Round", interview_type: "MANAGERIAL", duration_minutes: 45 },
];

export const EMPTY: JobForm = {
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
  tagline: "",
  requirements: [],
  nice_to_have: [],
  salary_period: "year",
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

export const formOf = (job?: JobOpening | null, template?: JobForm | null): JobForm => {
  const src = (job || template || {}) as JobForm;
  const out: JobForm = { ...EMPTY };
  (Object.keys(EMPTY) as (keyof JobForm)[]).forEach((k) => {
    if (src[k] !== undefined && src[k] !== null) (out as Record<string, unknown>)[k] = src[k];
  });
  if (job || template) out.rounds = src.rounds || [];
  if (template && !job) out.closing_date = null;
  return out;
};

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
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
export function ChipsInput({ value, onChange, placeholder, suggestions = [], listId }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; suggestions?: string[]; listId: string }) {
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
export function LinesInput({ value, onChange, placeholder, rows = 4 }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; rows?: number }) {
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

export const money = (n: number | null | undefined, cur?: string) =>
  n == null ? "" : new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "INR", maximumFractionDigits: 0 }).format(n);

/** How the job will look on the careers page (the mockup's "Job Preview" card). */
export function JobPreview({ form }: { form: JobForm }) {
  const { branding, logo } = useTheme();
  const salary = form.show_salary && (form.salary_min || form.salary_max)
    ? [money(form.salary_min, form.salary_currency), money(form.salary_max, form.salary_currency)].filter(Boolean).join(" – ") +
      (form.salary_period === "month" ? " / month" : form.salary_period === "hour" ? " / hour" : " / year")
    : "";
  const exp = form.experience_min != null || form.experience_max != null
    ? form.experience_max != null ? `${form.experience_min ?? 0} – ${form.experience_max} Years` : `${form.experience_min}+ Years`
    : "";
  const facts: [ReactNode, string][] = [
    [<Building2 size={12} />, form.department || ""],
    [<MapPin size={12} />, form.location || ""],
    [<CalendarDays size={12} />, exp],
    [<Users size={12} />, form.open_positions ? `${form.open_positions} Opening${form.open_positions === 1 ? "" : "s"}` : ""],
    [<Briefcase size={12} />, form.employment_type || ""],
    [<Clock size={12} />, form.work_mode || ""],
  ].filter(([, v]) => v) as [ReactNode, string][];
  const skills = [...(form.primary_skills || []), ...(form.secondary_skills || [])];
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Live Preview</span>
      <div className="flex items-center gap-2">
        {logo ? <img src={assetUrl(logo)} alt="" className="h-8 w-8 rounded object-contain" /> : <Briefcase size={18} className="text-indigo-600" />}
        <span className="truncate text-base font-bold text-slate-900">{branding.app_name}</span>
      </div>
      <h3 className="text-lg font-bold leading-snug text-slate-900">{form.title || "Job title"}</h3>
      {form.tagline && <p className="-mt-2 text-xs text-slate-500">{form.tagline}</p>}
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {facts.map(([icon, v]) => <span key={v} className="inline-flex items-center gap-1 truncate"><span className="text-slate-400">{icon}</span>{v}</span>)}
        </div>
      )}
      {salary && <p className="text-xs font-semibold text-emerald-700">{salary}</p>}
      <div>
        <p className="text-sm font-bold text-slate-900">Job Summary</p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-line text-xs text-slate-600">{form.description || "The job summary appears here."}</p>
      </div>
      {!!form.responsibilities?.length && (
        <div>
          <p className="text-sm font-bold text-slate-900">Key Responsibilities</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {form.responsibilities.slice(0, 5).map((r) => <li key={r} className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /><span className="line-clamp-1">{r}</span></li>)}
          </ul>
        </div>
      )}
      {skills.length > 0 && (
        <div>
          <p className="text-sm font-bold text-slate-900">Required Skills</p>
          <div className="mt-1 flex flex-wrap gap-1">{skills.map((s) => <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{s}</span>)}</div>
        </div>
      )}
      <button type="button" disabled className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white">Apply Now</button>
    </div>
  );
}

