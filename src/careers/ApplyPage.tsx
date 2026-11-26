import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, Briefcase, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Eye,
  FileText, GraduationCap, Laptop, Layers, Loader2, MapPin, Pencil, Plus, Save, Sparkles, Trash2, Upload,
  User, UserCheck, X,
} from "lucide-react";
import {
  NOTICE_PERIODS,
  careerAssetUrl,
  confirmApplicantCode,
  emptyApplicationForm,
  fetchResumeDraft,
  heardFromOptions,
  requestApplicantCode,
  submitApplicationForm,
  uploadApplicationResume,
  type ApplicationForm,
  type CareerCompany,
  type CareerPageContent,
  type EducationEntry,
  type ExperienceEntry,
  type PublicJob,
  type ResumeDraft,
} from "./api";
import { ACCEPTED, MAX_BYTES, OtpInput, RESEND_SECONDS, formatBytes } from "./components";
import { CareerIcon } from "./icons";
import { Stats, videoEmbedUrl } from "./sections";

/**
 * Apply for a job (SRS Screen 18, as in the mockup): verify the email with a code (no accounts), then five steps:
 * personal details with the resume (the AI reads it and fills in the form), education, experience, skills and other
 * information, review and submit with consent. "Save as draft" keeps everything on this device.
 */

const STEPS = [
  { key: "personal", title: "Personal Details" },
  { key: "education", title: "Education" },
  { key: "experience", title: "Experience" },
  { key: "skills", title: "Skills & Other Info" },
  { key: "review", title: "Review & Submit" },
] as const;
const POLL_MS = 3000;
const POLL_LIMIT = 60; // three minutes
const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[var(--cp-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--cp-brand)]/20";

interface Saved {
  email: string;
  token: string;
  tokenExp: number;
  draft: ResumeDraft | null;
  form: ApplicationForm;
  step: number;
  consent: boolean;
  savedAt?: string;
}

const storeKey = (company: string, jobId: string) => `cp-apply:${company || "default"}:${jobId}`;

function load(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: Saved | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Private browsing: the draft just isn't kept.
  }
}

/** Fill only what the candidate hasn't typed yet. Returns the new form and how many details were filled. */
function prefill(form: ApplicationForm, ai: ApplicationForm): [ApplicationForm, number] {
  let n = 0;
  const personal = { ...form.personal };
  for (const k of ["full_name", "phone", "location", "linkedin"] as const) {
    if (!personal[k] && ai.personal[k]) {
      personal[k] = ai.personal[k];
      n++;
    }
  }
  if (!form.personal.phone && ai.personal.phone_code) personal.phone_code = ai.personal.phone_code;
  const next: ApplicationForm = { ...form, personal };
  if (next.total_experience_years == null && ai.total_experience_years != null) { next.total_experience_years = ai.total_experience_years; n++; }
  if (!form.education.length && ai.education.length) { next.education = ai.education; n += ai.education.length; }
  if (!form.experience.length && ai.experience.length) { next.experience = ai.experience; n += ai.experience.length; }
  if (!form.skills.length && ai.skills.length) { next.skills = ai.skills.slice(0, 25); n++; }
  if (!form.certifications.length && ai.certifications.length) { next.certifications = ai.certifications; n++; }
  return [next, n];
}

function Label({ children, required, hint }: { children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <span className="mb-1 block text-sm font-semibold text-slate-800">
      {children}{required && <span className="text-rose-500"> *</span>}{hint && <span className="font-normal text-slate-400"> ({hint})</span>}
    </span>
  );
}

function Card({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><span className="text-[var(--cp-brand)]">{icon}</span>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Email check ──────────────────────────────────────────────────────────────

function VerifyEmail({ jobId, initialEmail, onVerified }: { jobId: string; initialEmail: string; onVerified: (email: string, token: string) => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const send = () => run(async () => {
    await requestApplicantCode(email.trim(), jobId);
    setSent(true);
    setCode("");
    setCooldown(RESEND_SECONDS);
  });
  const verify = () => {
    if (busy || code.length !== 6) return;
    run(async () => {
      const r = await confirmApplicantCode(email.trim(), code);
      onVerified(email.trim().toLowerCase(), r.applicant_token);
    });
  };

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><UserCheck size={22} /></span>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{sent ? "Enter the code we emailed you" : "First, verify your email"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {sent ? <>We sent a 6-digit code to <b className="text-slate-800">{email.trim()}</b>.</> : "We'll send you a code. No account or password needed."}
        </p>
      </div>
      {!sent ? (
        <form onSubmit={(e) => { e.preventDefault(); if (email.trim() && !busy) send(); }} className="space-y-3">
          <input type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className={field} aria-label="Email address" />
          <button disabled={busy || !email.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--cp-brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)] disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />} Send code
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <OtpInput value={code} onChange={setCode} onComplete={verify} />
          <button disabled={busy || code.length !== 6} onClick={verify} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--cp-brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)] disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />} Verify and continue
          </button>
          <div className="flex justify-between text-xs">
            <button onClick={() => { setSent(false); setError(""); }} className="inline-flex items-center gap-1 font-medium text-[var(--cp-brand)] hover:underline"><Pencil size={12} /> Change email</button>
            <button onClick={send} disabled={busy || cooldown > 0} className="inline-flex items-center gap-1 text-slate-600 disabled:text-slate-400"><Clock3 size={12} /> {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}

// ── Resume upload with the AI assistant ──────────────────────────────────────

function ResumeBox({ draft, busy, onPick, onView }: { draft: ResumeDraft | null; busy: boolean; onPick: (f: File) => void; onView: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const pick = (f?: File | null) => {
    setError("");
    if (!f) return;
    if (f.size > MAX_BYTES) return setError("The file is larger than 10 MB.");
    if (!/\.(pdf|docx?)$/i.test(f.name)) return setError("Upload a PDF, DOC or DOCX file.");
    onPick(f);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };
  const reading = draft && (draft.parse_status === "queued" || draft.parse_status === "processing");
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Upload size={20} className="text-[var(--cp-brand)]" /> Upload Resume <span className="text-rose-500">*</span></h2>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center ${dragging ? "border-[var(--cp-brand)] bg-[var(--cp-brand-soft)]" : "border-slate-300 bg-white"}`}
        >
          <input ref={input} type="file" accept={ACCEPTED} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          {draft ? (
            <>
              <FileText size={32} className="text-rose-500" />
              <p className="mt-2 max-w-full truncate text-sm font-semibold text-slate-900">{draft.filename}</p>
              <p className="text-xs text-slate-500">{formatBytes(draft.size)}</p>
              <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-3 text-xs font-semibold text-[var(--cp-brand)] hover:underline">Replace file</button>
            </>
          ) : (
            <>
              <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">PDF</span>
              <p className="mt-2 text-sm text-slate-700">Drag & drop your resume here or</p>
              <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-lg border-2 border-[var(--cp-brand)] px-4 py-2 text-sm font-semibold text-[var(--cp-brand)] hover:bg-[var(--cp-brand-soft)]">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Browse File
              </button>
            </>
          )}
          <p className="mt-3 text-[11px] text-slate-500">Supported formats: PDF, DOC, DOCX | Max size: 10 MB</p>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
        <div className="rounded-xl bg-[var(--cp-brand-soft)] p-4">
          <p className="flex items-center gap-2 font-bold text-slate-900"><Sparkles size={18} className="text-[var(--cp-brand)]" /> AI Resume Assistant</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {["Extracts your details automatically", "Identifies your skills & experience", "Pre-fills the application form"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check size={15} className="text-emerald-600" />{t}</li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">You can check and change everything before you submit.</p>
        </div>
      </div>

      {reading && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Loader2 size={18} className="shrink-0 animate-spin" />
          <span>Reading your resume… keep filling in the form; we'll add what we find to empty fields.</span>
        </div>
      )}
      {draft?.parse_status === "done" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 size={22} className="shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Resume Parsed Successfully!</p>
            <p className="text-xs text-slate-600">
              Your details have been extracted and auto-filled. Please review and edit if needed.
              {draft.confidence && draft.confidence.level !== "high" && " Some details couldn't be found, so please check carefully."}
            </p>
          </div>
          <button type="button" onClick={onView} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--cp-brand)] px-3 py-1.5 text-sm font-semibold text-[var(--cp-brand)]"><Eye size={15} /> View Extracted Data</button>
        </div>
      )}
      {(draft?.parse_status === "failed" || draft?.parse_status === "unavailable") && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {draft.parse_status === "unavailable" ? "Our resume reader is busy right now." : "We couldn't read this resume automatically."} Your resume is attached; please fill in your details yourself.
        </p>
      )}
      {draft?.summary && (
        <div className="rounded-xl bg-[color-mix(in_oklab,var(--cp-brand)_6%,white)] p-4">
          <p className="font-bold text-slate-900">Quick Extracted Summary <span className="font-normal text-slate-500">(from Resume)</span></p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div className="flex gap-2"><Briefcase size={18} className="mt-0.5 text-[var(--cp-brand)]" /><div><p className="text-xs text-slate-500">Total Experience</p><p className="font-bold text-slate-900">{draft.summary.total_experience_years != null ? `${draft.summary.total_experience_years} Years` : "—"}</p></div></div>
            <div className="flex gap-2"><GraduationCap size={18} className="mt-0.5 text-[var(--cp-brand)]" /><div><p className="text-xs text-slate-500">Highest Education</p><p className="font-bold text-slate-900">{draft.summary.highest_education || "—"}</p></div></div>
            <div className="flex gap-2"><Layers size={18} className="mt-0.5 text-[var(--cp-brand)]" /><div><p className="text-xs text-slate-500">Top Skills (Identified)</p><div className="mt-1 flex flex-wrap gap-1">{draft.summary.top_skills.map((s) => <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{s}</span>)}</div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExtractedDialog({ draft, onClose }: { draft: ResumeDraft; onClose: () => void }) {
  const x = draft.extracted;
  if (!x) return null;
  const rows: [string, string][] = [
    ["Full name", x.personal.full_name], ["Email", x.personal.email], ["Mobile", [x.personal.phone_code, x.personal.phone].filter(Boolean).join(" ")],
    ["Location", x.personal.location], ["LinkedIn", x.personal.linkedin],
    ["Total experience", x.total_experience_years != null ? `${x.total_experience_years} years` : ""],
    ["Education", x.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(", ")).join(" · ")],
    ["Experience", x.experience.map((e) => `${e.designation} at ${e.company}`).join(" · ")],
    ["Skills", x.skills.join(", ")], ["Certifications", x.certifications.join(", ")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-10" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Details read from your resume">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Details read from your resume</h3>
            {draft.confidence && (
              <p className="text-xs text-slate-500">
                Found {Math.round(draft.confidence.score * 100)}% of the usual details ({draft.confidence.level}).
                {!draft.confidence.email_matches && " The email in the resume is different from the one you verified; we use the verified one."}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-3 py-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className={v ? "text-slate-900" : "text-slate-400"}>{v || "Not found"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ── Lists ────────────────────────────────────────────────────────────────────

function EducationList({ value, onChange }: { value: EducationEntry[]; onChange: (v: EducationEntry[]) => void }) {
  const set = (i: number, patch: Partial<EducationEntry>) => onChange(value.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-3">
      {value.map((e, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-6">
          <label className="sm:col-span-3"><Label required>Degree</Label><input value={e.degree} maxLength={120} onChange={(x) => set(i, { degree: x.target.value })} placeholder="B.E. / B.Tech" className={field} /></label>
          <label className="sm:col-span-3"><Label>Specialization</Label><input value={e.specialization} maxLength={120} onChange={(x) => set(i, { specialization: x.target.value })} placeholder="Computer Science" className={field} /></label>
          <label className="sm:col-span-3"><Label>College / University</Label><input value={e.institution} maxLength={160} onChange={(x) => set(i, { institution: x.target.value })} className={field} /></label>
          <label className="sm:col-span-1"><Label>Year</Label><input value={e.year} maxLength={4} inputMode="numeric" onChange={(x) => set(i, { year: x.target.value.replace(/\D/g, "") })} placeholder="2019" className={field} /></label>
          <label className="sm:col-span-1"><Label>Score</Label><input value={e.score} maxLength={20} onChange={(x) => set(i, { score: x.target.value })} placeholder="8.2 CGPA" className={field} /></label>
          <div className="flex items-end justify-end sm:col-span-1">
            <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-600 hover:bg-rose-50" aria-label="Remove education"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" onClick={() => onChange([...value, { degree: "", specialization: "", institution: "", year: "", score: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--cp-brand)] px-4 py-2 text-sm font-semibold text-[var(--cp-brand)]">
          <Plus size={15} /> Add education
        </button>
      )}
    </div>
  );
}

function ExperienceList({ value, onChange }: { value: ExperienceEntry[]; onChange: (v: ExperienceEntry[]) => void }) {
  const set = (i: number, patch: Partial<ExperienceEntry>) => onChange(value.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-3">
      {value.map((e, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-6">
          <label className="sm:col-span-3"><Label required>Company</Label><input value={e.company} maxLength={160} onChange={(x) => set(i, { company: x.target.value })} className={field} /></label>
          <label className="sm:col-span-3"><Label>Designation</Label><input value={e.designation} maxLength={120} onChange={(x) => set(i, { designation: x.target.value })} className={field} /></label>
          <label className="sm:col-span-2"><Label>From</Label><input type="month" value={e.start.length === 7 ? e.start : ""} onChange={(x) => set(i, { start: x.target.value })} className={field} /></label>
          <label className="sm:col-span-2"><Label>To</Label><input type="month" disabled={e.current} value={e.end.length === 7 ? e.end : ""} onChange={(x) => set(i, { end: x.target.value })} className={`${field} disabled:bg-slate-50`} /></label>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={e.current} onChange={(x) => set(i, { current: x.target.checked, end: "" })} className="h-4 w-4 accent-[var(--cp-brand)]" /> I currently work here</label>
          <label className="sm:col-span-6"><Label>What you did</Label><textarea rows={2} maxLength={2000} value={e.responsibilities} onChange={(x) => set(i, { responsibilities: x.target.value })} className={field} /></label>
          <div className="flex justify-end sm:col-span-6">
            <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"><Trash2 size={15} /> Remove</button>
          </div>
        </div>
      ))}
      {value.length < 20 && (
        <button type="button" onClick={() => onChange([...value, { company: "", designation: "", start: "", end: "", current: value.length === 0, responsibilities: "" }])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--cp-brand)] px-4 py-2 text-sm font-semibold text-[var(--cp-brand)]">
          <Plus size={15} /> Add experience
        </button>
      )}
    </div>
  );
}

function Chips({ value, onChange, placeholder, max = 50 }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const next = [...value];
    raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => {
      if (!next.some((x) => x.toLowerCase() === s.toLowerCase()) && next.length < max) next.push(s);
    });
    onChange(next);
    setText("");
  };
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-[var(--cp-brand)]">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[var(--cp-brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--cp-brand)]">
          {v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X size={11} /></button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); }
          else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ApplyPage({
  job,
  content,
  company,
  companySlug,
  onBack,
  onBrowse,
}: {
  job: PublicJob;
  content: CareerPageContent;
  company?: CareerCompany | null;
  companySlug: string;
  onBack: () => void;
  onBrowse: () => void;
}) {
  const key = storeKey(companySlug, job.id);
  const saved = useMemo(() => load(key), [key]);
  const tokenValid = !!saved && saved.tokenExp > Date.now() + 60_000;
  const [email, setEmail] = useState(saved?.email || "");
  const [token, setToken] = useState(tokenValid ? saved!.token : "");
  const [tokenExp, setTokenExp] = useState(tokenValid ? saved!.tokenExp : 0);
  const [draft, setDraft] = useState<ResumeDraft | null>(saved?.draft || null);
  const [form, setForm] = useState<ApplicationForm>(saved?.form || emptyApplicationForm());
  const [step, setStep] = useState(saved?.step || 0);
  const [consent, setConsent] = useState(!!saved?.consent);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(saved?.savedAt ? `Welcome back: your draft from ${new Date(saved.savedAt).toLocaleString()} is restored.` : "");
  const [viewExtracted, setViewExtracted] = useState(false);
  const [done, setDone] = useState<{ title: string } | null>(null);
  const polls = useRef(0);
  const top = useRef<HTMLDivElement>(null);
  const name = company?.short_name || company?.name || "us";

  const snapshot = useCallback((extra?: Partial<Saved>): Saved => ({ email, token, tokenExp, draft, form, step, consent, ...extra }), [email, token, tokenExp, draft, form, step, consent]);

  // Keep the session (not the "draft saved" note) on the device as the candidate works.
  useEffect(() => {
    if (done) return;
    if (email || draft) save(key, { ...(load(key) || {}), ...snapshot() } as Saved);
  }, [key, snapshot, email, draft, done]);

  const setPersonal = (patch: Partial<ApplicationForm["personal"]>) => setForm((f) => ({ ...f, personal: { ...f.personal, ...patch } }));

  // While the AI reads the resume, ask every few seconds; fill empty fields when it's done.
  useEffect(() => {
    if (!draft || !token || (draft.parse_status !== "queued" && draft.parse_status !== "processing")) return;
    if (polls.current >= POLL_LIMIT) return;
    const t = setTimeout(async () => {
      polls.current += 1;
      try {
        const next = await fetchResumeDraft(job.id, draft.draft_id, token);
        setDraft(next);
        if (next.parse_status === "done" && next.extracted) {
          setForm((f) => {
            const [filled, n] = prefill(f, next.extracted!);
            setNotice(n ? `We filled in ${n} detail${n === 1 ? "" : "s"} from your resume. Please check them.` : "Your resume was read. Your own entries were kept.");
            return filled;
          });
        }
      } catch {
        // try again on the next tick
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [draft, token, job.id]);

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      polls.current = 0;
      setDraft(await uploadApplicationResume(job.id, token, file));
    } catch (e) {
      handleError(e);
    } finally {
      setUploading(false);
    }
  };

  const handleError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
    if (/verify your email|expired|signature|token/i.test(msg)) {
      setToken("");
      setTokenExp(0);
      setError("Your email check has expired. Please verify your email again; your answers are kept.");
    } else setError(msg);
  };

  const missingStep1 = [
    !form.personal.full_name.trim() && "full name", !form.personal.phone.trim() && "mobile number", !form.personal.location.trim() && "current location",
    !form.notice_period && "notice period", form.expected_ctc == null && "expected CTC", !draft && "resume",
  ].filter(Boolean) as string[];

  const go = (n: number) => {
    setError("");
    if (n > 0 && missingStep1.length) {
      setStep(0);
      setError(`Please add your ${missingStep1.join(", ")}.`);
      return;
    }
    setStep(n);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveDraft = () => {
    const at = new Date().toISOString();
    save(key, snapshot({ savedAt: at }));
    setNotice("Draft saved on this device. Come back to this job to continue.");
  };

  const submit = async () => {
    if (!consent) return setError("Please confirm your details and accept the Privacy Policy and Terms of Use.");
    if (!draft) return go(0);
    setSubmitting(true);
    setError("");
    try {
      await submitApplicationForm(job.id, token, { draft_id: draft.draft_id, form: { ...form, personal: { ...form.personal, email } }, consent });
      save(key, null);
      setDone({ title: job.title });
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const about = content.sections.find((s) => s.type === "about" && s.visible);
  const benefits = (job.what_we_offer && job.what_we_offer.length ? job.what_we_offer : content.sections.find((s) => s.type === "benefits")?.items?.map((i) => i.title || "") || []).filter(Boolean).slice(0, 6);
  const media = about?.image_url || about?.video_url || content.hero.banner_url;
  const banner = careerAssetUrl(content.hero.banner_url);

  return (
    <div ref={top} className="scroll-mt-16">
      <section className="relative overflow-hidden bg-[var(--cp-dark)] text-white">
        {banner && <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--cp-dark)] via-[var(--cp-dark)]/85 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-white/80">
            <button onClick={onBrowse} className="hover:text-white">Open Positions</button><ChevronRight size={14} />
            <button onClick={onBack} className="hover:text-white">{job.title}</button><ChevronRight size={14} />
            <span className="text-white">Apply</span>
          </nav>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Apply for {job.title}</h1>
          <p className="mt-1 text-white/85">Take the next step in your career with {name}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* Job summary */}
        <aside className="order-2 space-y-4 lg:order-none lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><Briefcase size={20} /></span>
              <div className="min-w-0"><p className="truncate font-bold text-slate-900">{job.title}</p>{job.code && <p className="text-xs text-slate-500">{job.code}</p>}</div>
            </div>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
              {([[<Building2 size={16} />, job.department], [<MapPin size={16} />, job.location], [<CalendarDays size={16} />, job.experience], [<Laptop size={16} />, job.work_mode || job.employment_type]] as const)
                .filter(([, v]) => v).map(([icon, v]) => <li key={v} className="flex items-center gap-2.5"><span className="text-[var(--cp-brand)]">{icon}</span>{v}</li>)}
            </ul>
            {benefits.length > 0 && (
              <>
                <p className="mt-4 font-bold text-slate-900">Why Join {name}?</p>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                  {benefits.map((b) => <li key={b} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />{b}</li>)}
                </ul>
              </>
            )}
            {about?.stats?.length ? <div className="mt-4"><Stats stats={about.stats} compact /></div> : null}
            {media && (
              <div className="relative mt-4 overflow-hidden rounded-xl">
                {about?.image_url || content.hero.banner_url ? (
                  <img src={careerAssetUrl(about?.image_url || content.hero.banner_url)} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-36 items-center justify-center bg-[var(--cp-dark)] text-white/80"><CareerIcon name="users" size={36} /></div>
                )}
                {about?.video_url && videoEmbedUrl(about.video_url) && (
                  <a href={about.video_url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center" aria-label="Watch the video">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-[var(--cp-brand)]">▶</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* The form */}
        <div className="order-1 min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm lg:order-none">
          {done ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={34} /></span>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">{content.texts.success_title}</h2>
              <p className="mt-2 max-w-lg text-slate-600">{content.texts.success_message}</p>
              <p className="mt-1 text-sm text-slate-500">Application for <b>{done.title}</b> sent from {email}.</p>
              <button onClick={onBrowse} className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ArrowLeft size={16} /> Back to Open Positions</button>
            </div>
          ) : !token ? (
            <div className="p-6">
              {error && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
              <VerifyEmail
                jobId={job.id}
                initialEmail={email}
                onVerified={(verified, t) => {
                  if (email && verified !== email) {
                    // Another person on this device: start fresh.
                    setDraft(null);
                    setForm(emptyApplicationForm());
                    setStep(0);
                  }
                  setEmail(verified);
                  setToken(t);
                  setTokenExp(Date.now() + 115 * 60_000);
                  setError("");
                }}
              />
            </div>
          ) : (
            <>
              {/* Steps */}
              <ol className="flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3 [scrollbar-width:none]">
                {STEPS.map((s, i) => (
                  <li key={s.key} className="shrink-0">
                    <button type="button" onClick={() => go(i)} className={`flex items-center gap-2 border-b-2 px-2 pb-2 pt-1 text-sm font-semibold ${i === step ? "border-[var(--cp-brand)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${i === step ? "bg-[var(--cp-brand)] text-white" : i < step ? "bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]" : "border border-slate-300 text-slate-500"}`}>{i < step ? <Check size={13} /> : i + 1}</span>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>

              <div className="space-y-5 p-5 sm:p-6">
                {notice && <p className="flex items-start justify-between gap-2 rounded-lg bg-[var(--cp-brand-soft)] px-3 py-2 text-sm text-slate-800"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></p>}

                {step === 0 && (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                    <Card icon={<User size={22} />} title="Personal Details">
                      <label className="block"><Label required>Full Name</Label><input value={form.personal.full_name} maxLength={100} onChange={(e) => setPersonal({ full_name: e.target.value })} className={field} autoComplete="name" /></label>
                      <label className="block">
                        <Label required>Email Address</Label>
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                          <CheckCircle2 size={15} className="text-emerald-600" /><span className="min-w-0 flex-1 truncate">{email}</span>
                          <button type="button" onClick={() => { setToken(""); setTokenExp(0); }} className="text-xs font-semibold text-[var(--cp-brand)]">Change</button>
                        </div>
                      </label>
                      <label className="block">
                        <Label required>Mobile Number</Label>
                        <div className="flex gap-2">
                          <input value={form.personal.phone_code} maxLength={6} onChange={(e) => setPersonal({ phone_code: e.target.value })} className={field.replace("w-full", "w-20 shrink-0")} aria-label="Country code" />
                          <input value={form.personal.phone} maxLength={20} inputMode="tel" onChange={(e) => setPersonal({ phone: e.target.value })} className={field} autoComplete="tel-national" />
                        </div>
                      </label>
                      <label className="block"><Label required>Current Location</Label><input value={form.personal.location} maxLength={120} onChange={(e) => setPersonal({ location: e.target.value })} placeholder="Chennai, Tamil Nadu" className={field} /></label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <Label required>Notice Period</Label>
                          <select value={form.notice_period} onChange={(e) => setForm({ ...form, notice_period: e.target.value })} className={field}>
                            <option value="">Choose…</option>
                            {NOTICE_PERIODS.map((n) => <option key={n}>{n}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <Label required>Expected CTC (Annual)</Label>
                          <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white pl-3 focus-within:border-[var(--cp-brand)]">
                            <span className="text-sm text-slate-500">{form.currency === "INR" ? "₹" : form.currency}</span>
                            <input inputMode="numeric" value={form.expected_ctc ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm({ ...form, expected_ctc: v ? Number(v) : null }); }} className="w-full rounded-lg px-2 py-2.5 text-sm outline-none" placeholder="22,00,000" />
                          </div>
                        </label>
                      </div>
                      <label className="block"><Label hint="Optional">LinkedIn Profile</Label><input value={form.personal.linkedin} maxLength={300} onChange={(e) => setPersonal({ linkedin: e.target.value })} placeholder="https://www.linkedin.com/in/…" className={field} /></label>
                      <label className="block"><Label hint="Optional">Portfolio / GitHub</Label><input value={form.personal.portfolio} maxLength={300} onChange={(e) => setPersonal({ portfolio: e.target.value })} placeholder="https://github.com/…" className={field} /></label>
                    </Card>
                    <ResumeBox draft={draft} busy={uploading} onPick={upload} onView={() => setViewExtracted(true)} />
                  </div>
                )}

                {step === 1 && (
                  <Card icon={<GraduationCap size={22} />} title="Education">
                    <EducationList value={form.education} onChange={(education) => setForm({ ...form, education })} />
                  </Card>
                )}

                {step === 2 && (
                  <Card icon={<Briefcase size={22} />} title="Experience">
                    <label className="block max-w-xs">
                      <Label>Total experience (years)</Label>
                      <input inputMode="decimal" value={form.total_experience_years ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setForm({ ...form, total_experience_years: v ? Number(v) : null }); }} className={field} placeholder="6" />
                    </label>
                    <ExperienceList value={form.experience} onChange={(experience) => setForm({ ...form, experience })} />
                    {form.experience.length === 0 && <p className="text-sm text-slate-500">New to work? That's fine. Leave this empty and continue.</p>}
                  </Card>
                )}

                {step === 3 && (
                  <Card icon={<Layers size={22} />} title="Skills & Other Info">
                    <label className="block"><Label>Skills</Label><Chips value={form.skills} onChange={(skills) => setForm({ ...form, skills })} placeholder="Type a skill and press Enter" /></label>
                    {job.required_skills.length > 0 && (
                      <p className="text-xs text-slate-500">
                        This job asks for: {job.required_skills.map((s) => (
                          <button key={s} type="button" onClick={() => !form.skills.some((x) => x.toLowerCase() === s.toLowerCase()) && setForm({ ...form, skills: [...form.skills, s] })} className="mr-1 mt-1 inline-flex items-center gap-0.5 rounded-full border border-slate-200 px-2 py-0.5 text-slate-700 hover:border-[var(--cp-brand)]"><Plus size={10} />{s}</button>
                        ))}
                      </p>
                    )}
                    <label className="block"><Label>Certifications</Label><Chips value={form.certifications} onChange={(certifications) => setForm({ ...form, certifications })} placeholder="e.g. AWS Certified Developer" max={20} /></label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <Label>How did you hear about this job?</Label>
                        <select value={form.heard_from} onChange={(e) => setForm({ ...form, heard_from: e.target.value })} className={field}>
                          <option value="">Choose…</option>
                          {heardFromOptions(name).map((o) => <option key={o}>{o}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <Label hint="Optional">Current CTC (Annual)</Label>
                        <input inputMode="numeric" value={form.current_ctc ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm({ ...form, current_ctc: v ? Number(v) : null }); }} className={field} />
                      </label>
                    </div>
                    <label className="block"><Label hint="Optional">Anything else you'd like us to know?</Label><textarea rows={4} maxLength={2000} value={form.cover_note} onChange={(e) => setForm({ ...form, cover_note: e.target.value })} className={field} /></label>
                  </Card>
                )}

                {step === 4 && (
                  <Card icon={<CheckCircle2 size={22} />} title="Review & Submit">
                    <ReviewBlock title="Personal Details" onEdit={() => go(0)} rows={[
                      ["Full name", form.personal.full_name], ["Email", email],
                      ["Mobile", [form.personal.phone_code, form.personal.phone].filter(Boolean).join(" ")], ["Location", form.personal.location],
                      ["Notice period", form.notice_period], ["Expected CTC", form.expected_ctc != null ? `${form.currency === "INR" ? "₹" : form.currency + " "}${form.expected_ctc.toLocaleString("en-IN")}` : ""],
                      ["LinkedIn", form.personal.linkedin], ["Portfolio", form.personal.portfolio], ["Resume", draft?.filename || ""],
                    ]} />
                    <ReviewBlock title="Education" onEdit={() => go(1)} rows={form.education.map((e, i) => [`#${i + 1}`, [e.degree, e.specialization, e.institution, e.year].filter(Boolean).join(", ")])} />
                    <ReviewBlock title="Experience" onEdit={() => go(2)} rows={[
                      ["Total", form.total_experience_years != null ? `${form.total_experience_years} years` : ""],
                      ...form.experience.map((e, i) => [`#${i + 1}`, `${e.designation || "—"} at ${e.company} (${e.start || "?"} – ${e.current ? "now" : e.end || "?"})`] as [string, string]),
                    ]} />
                    <ReviewBlock title="Skills & Other Info" onEdit={() => go(3)} rows={[
                      ["Skills", form.skills.join(", ")], ["Certifications", form.certifications.join(", ")], ["Heard from", form.heard_from], ["Note", form.cover_note],
                    ]} />
                  </Card>
                )}

                {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                <label className="flex max-w-xl items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cp-brand)]" />
                  <span>I confirm that the information provided is true and correct. I agree to the <b>Privacy Policy</b> and <b>Terms of Use</b>.</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {step > 0 && <button type="button" onClick={() => go(step - 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={15} /> Back</button>}
                  <button type="button" onClick={saveDraft} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--cp-brand)] hover:bg-[var(--cp-brand-soft)]"><Save size={15} /> Save as Draft</button>
                  {step < STEPS.length - 1 ? (
                    <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center gap-2 rounded-lg bg-[var(--cp-brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)]">
                      Continue to {STEPS[step + 1].title} <ArrowRight size={16} />
                    </button>
                  ) : (
                    <button type="button" disabled={submitting} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-[var(--cp-brand)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)] disabled:opacity-60">
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Submit Application
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {viewExtracted && draft && <ExtractedDialog draft={draft} onClose={() => setViewExtracted(false)} />}
    </div>
  );
}

function ReviewBlock({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <p className="font-semibold text-slate-900">{title}</p>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--cp-brand)] hover:underline"><Pencil size={12} /> Edit</button>
      </div>
      <dl className="divide-y divide-slate-50 px-4 text-sm">
        {rows.length === 0 && <p className="py-2 text-slate-400">Nothing added.</p>}
        {rows.map(([k, v], i) => (
          <div key={`${k}-${i}`} className="grid grid-cols-[130px_1fr] gap-3 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className={`break-words ${v ? "text-slate-900" : "text-slate-400"}`}>{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

