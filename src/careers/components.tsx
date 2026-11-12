import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import logoUrl from "./assets/shinelogics-logo.png";
import { Briefcase, Check, CheckCircle2, Clock3, FileText, Loader2, MapPin, Pencil, Upload, Users, X } from "lucide-react";
import { confirmApplicantCode, requestApplicantCode, submitApplication, type PublicJob } from "./api";

/** Building blocks of the public careers site: layout, the job details pop-up and the apply flow. */

const ACCEPTED = ".pdf,.doc,.docx";
const MAX_BYTES = 10 * 1024 * 1024;
const RESEND_SECONDS = 60; // matches the server's resend cooldown

export const primaryBtn =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-[#5B3EF0] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4A2FD8] disabled:cursor-not-allowed disabled:bg-[#5B3EF0]/30";

// ── Helpers ─────────────────────────────────────────────────────────────────

export const postedAgo = (iso: string) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1d ago";
  if (days < 30) return `Posted ${days}d ago`;
  const months = Math.floor(days / 30);
  return `Posted ${months}mo ago`;
};

export const openingsLabel = (n: number) => `${n} ${n === 1 ? "opening" : "openings"}`;

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Renders a plain-text description: blank lines split paragraphs, lines starting with - or • become bullets. */
export function Description({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-6 text-slate-600">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const bullets = lines.every((l) => /^[-•*]\s+/.test(l));
        if (bullets) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s+/, "")}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line">{lines.join("\n")}</p>;
      })}
    </div>
  );
}

// ── Layout pieces ───────────────────────────────────────────────────────────

export function Logo({ className = "h-10" }: { className?: string }) {
  return <img src={logoUrl} alt="Shinelogics, Building What's Next." className={`w-auto select-none ${className}`} draggable={false} />;
}

export function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-[#EEEAFE] px-2.5 py-1 text-xs font-medium text-[#5B3EF0]">{children}</span>
  );
}

export function Modal({ onClose, children, wide = false, label }: { onClose: () => void; children: ReactNode; wide?: boolean; label?: string }) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`max-h-[calc(100vh-2rem)] w-full rounded-2xl bg-white shadow-2xl ${wide ? "flex max-w-2xl flex-col overflow-hidden" : "max-w-md overflow-y-auto"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 pt-5">
      <Logo className="h-9" />
      <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
        <X size={18} />
      </button>
    </div>
  );
}

// ── Apply flow ──────────────────────────────────────────────────────────────

type Step = "email" | "code" | "resume" | "done";
const STEPS: { key: Exclude<Step, "done">; label: string }[] = [
  { key: "email", label: "Email verification" },
  { key: "code", label: "OTP verification" },
  { key: "resume", label: "Resume upload" },
];

function Stepper({ step }: { step: Step }) {
  const current = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="mt-5 grid grid-cols-3">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-1.5">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-3 mr-4 h-0.5 w-[calc(100%-2rem)] ${i <= current ? "bg-[#5B3EF0]" : "bg-slate-200"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-[#5B3EF0] text-white"
                  : active
                    ? "bg-[#5B3EF0] text-white ring-4 ring-[#5B3EF0]/15"
                    : "border border-slate-300 bg-white text-slate-500"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-[11px] ${active ? "font-semibold text-slate-900" : "text-slate-500"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OtpInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  useEffect(() => refs.current[0]?.focus(), []);

  const setAt = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    const joined = next.join("").slice(0, 6);
    onChange(joined);
    return joined;
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const joined = setAt(index, digit);
    if (index < 5) refs.current[index + 1]?.focus();
    else if (joined.length === 6) onComplete();
  };

  const handleKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) setAt(index, "");
      else if (index > 0) {
        setAt(index - 1, "");
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
    else if (e.key === "Enter" && value.length === 6) onComplete();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="grid grid-cols-6 gap-2" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-12 w-full rounded-lg border border-slate-300 text-center text-lg font-semibold text-slate-900 focus:border-[#5B3EF0] focus:outline-none focus:ring-2 focus:ring-[#5B3EF0]/20"
        />
      ))}
    </div>
  );
}

export function ApplyModal({
  job,
  onClose,
  successTitle,
  successMessage,
}: {
  job: PublicJob;
  onClose: () => void;
  successTitle: string;
  successMessage: string;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await requestApplicantCode(email.trim());
      setCode("");
      setCooldown(RESEND_SECONDS);
      setStep("code");
    });

  const verifyCode = () => {
    if (busy || code.length !== 6) return;
    run(async () => {
      const result = await confirmApplicantCode(email.trim(), code.trim());
      setToken(result.applicant_token);
      setStep("resume");
    });
  };

  const editEmail = () => {
    setError("");
    setCode("");
    setToken("");
    setFile(null);
    setStep("email");
  };

  const pickFile = (picked: File | null) => {
    setError("");
    if (!picked) return;
    if (picked.size > MAX_BYTES) return setError("The file is larger than 10 MB.");
    if (!/\.(pdf|docx?)$/i.test(picked.name)) return setError("Upload a PDF, DOC or DOCX file.");
    setFile(picked);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const send = () => {
    if (!file) return;
    run(async () => {
      await submitApplication(job.id, token, file);
      setStep("done");
    });
  };

  const mm = Math.floor(cooldown / 60);
  const ss = String(cooldown % 60).padStart(2, "0");

  return (
    <Modal onClose={onClose}>
      <ModalHeader onClose={onClose} />
      <div className="px-6 pb-6 pt-4">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Briefcase size={16} className="shrink-0 text-[#5B3EF0]" />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500">Applying for</p>
            <p className="truncate text-sm font-semibold text-slate-900">{job.title}</p>
            <p className="truncate text-xs text-slate-500">{[job.department, job.location].filter(Boolean).join(" · ")}</p>
          </div>
        </div>

        <Stepper step={step} />

        {step === "email" && (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && email.trim()) sendCode();
            }}
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Verify your email address</h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter your email address to receive a verification code and continue your application.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Email address</span>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-[#5B3EF0] focus:outline-none focus:ring-2 focus:ring-[#5B3EF0]/20"
              />
            </label>
            <button type="submit" disabled={busy || !email.trim()} className={primaryBtn}>
              {busy && <Loader2 size={16} className="animate-spin" />} Send verification code
            </button>
          </form>
        )}

        {step === "code" && (
          <div className="mt-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Enter verification code</h2>
              <p className="mt-1 text-sm text-slate-500">
                We've sent a 6-digit verification code to <span className="font-semibold text-slate-800">{email.trim()}</span>.
              </p>
            </div>
            <OtpInput value={code} onChange={setCode} onComplete={verifyCode} />
            <button disabled={busy || code.length !== 6} onClick={verifyCode} className={primaryBtn}>
              {busy && <Loader2 size={16} className="animate-spin" />} Verify
            </button>
            <div className="flex flex-col items-center gap-2 border-t border-slate-100 pt-4 text-xs">
              <span className="text-slate-500">Didn't get the code?</span>
              <button
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
              >
                <Clock3 size={13} /> {cooldown > 0 ? `Resend code in ${mm}:${ss}` : "Resend code"}
              </button>
              <button onClick={editEmail} className="inline-flex items-center gap-1 font-medium text-[#5B3EF0] hover:underline">
                <Pencil size={12} /> Edit email
              </button>
            </div>
          </div>
        )}

        {step === "resume" && (
          <div className="mt-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Upload your resume</h2>
              <p className="mt-1 text-sm text-slate-500">Upload your latest resume to complete your application.</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-emerald-800">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                <span className="truncate">{email.trim()}</span>
              </span>
              <button onClick={editEmail} className="shrink-0 text-xs font-medium text-[#5B3EF0] hover:underline">Change</button>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />

            {file ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
                    <FileText size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.name.split(".").pop() || "").toUpperCase()} document · {formatBytes(file.size)}
                    </p>
                  </div>
                  <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-emerald-500" />
                <div className="mt-1.5 flex justify-between text-xs">
                  <span className="font-medium text-slate-700">Ready to submit</span>
                  <span className="text-slate-500">100%</span>
                </div>
                <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs font-medium">
                  <button onClick={() => fileInput.current?.click()} className="text-[#5B3EF0] hover:underline">Replace file</button>
                  <button onClick={() => setFile(null)} className="text-rose-600 hover:underline">Remove</button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center transition ${
                  dragging ? "border-[#5B3EF0] bg-[#5B3EF0]/5" : "border-slate-300"
                }`}
              >
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEEAFE] text-[#5B3EF0]">
                  <Upload size={18} />
                </span>
                <p className="text-sm font-semibold text-slate-900">Drag and drop your resume here</p>
                <p className="text-sm text-slate-500">
                  or{" "}
                  <button onClick={() => fileInput.current?.click()} className="font-semibold text-[#5B3EF0] underline">
                    browse files
                  </button>
                </p>
                <p className="mt-1 text-xs text-slate-400">PDF, DOC or DOCX · Max 10 MB</p>
              </div>
            )}

            <button disabled={busy || !file} onClick={send} className={primaryBtn}>
              {busy && <Loader2 size={16} className="animate-spin" />} Submit Application
            </button>
            {!file && <p className="text-center text-xs text-slate-500">Upload your resume to enable submission.</p>}
          </div>
        )}

        {step === "done" && (
          <div className="mt-6 flex flex-col items-center gap-3 py-2 text-center">
            <CheckCircle2 className="text-emerald-500" size={48} />
            <p className="text-lg font-semibold text-slate-900">{successTitle}</p>
            <p className="text-sm text-slate-500">{successMessage}</p>
            <button onClick={onClose} className={`${primaryBtn} mt-2`}>Close</button>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

const COMPANY_SITE = "https://shinelogics.com";
const CAREERS_EMAIL = "careers@shinelogics.com";

/** onHome: back to the role list (closes any open role). */
export function CareersHeader({ homeHref, onHome }: { homeHref: string; onHome: () => void }) {
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    onHome();
  };
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href={homeHref} onClick={goHome} aria-label="Shinelogics careers home"><Logo className="h-11" /></a>
        <nav className="flex h-full items-center gap-6 text-sm font-medium">
          <a href={homeHref} onClick={goHome} aria-current="page" className="flex h-full items-center border-b-2 border-[#5B3EF0] text-[#5B3EF0]">Careers</a>
          <a href={COMPANY_SITE} target="_blank" rel="noreferrer" className="flex h-full items-center border-b-2 border-transparent text-slate-800 hover:text-[#5B3EF0]">
            About Us
          </a>
        </nav>
      </div>
    </header>
  );
}

export function CareersFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="max-w-xs">
          <Logo className="h-16" />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            We design and build AI-powered products that turn ideas into meaningful technology.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-slate-800">
            <li><a href={COMPANY_SITE} target="_blank" rel="noreferrer" className="hover:text-[#5B3EF0]">shinelogics.com</a></li>
            <li>LinkedIn</li>
            <li><a href={`mailto:${CAREERS_EMAIL}`} className="hover:text-[#5B3EF0]">{CAREERS_EMAIL}</a></li>
          </ul>
        </div>
        <div className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
          © {new Date().getFullYear()} Shinelogics. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ── Job details pop-up (Figma: "View Details") ─────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 border-l-[3px] border-[#5B3EF0] pl-2.5 text-sm font-semibold text-slate-900">{children}</h3>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-6 text-slate-600">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B3EF0]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every section comes from the role as set up in the resume portal (Job openings page).
 * Empty sections are left out.
 */
export function JobDetailsModal({ job, onClose, onApply }: { job: PublicJob; onClose: () => void; onApply: () => void }) {
  const sections: { title: string; body: ReactNode; show: boolean }[] = [
    { title: "About the Role", body: <Description text={job.description} />, show: !!job.description.trim() },
    { title: "Key Responsibilities", body: <BulletList items={job.responsibilities} />, show: job.responsibilities.length > 0 },
    {
      title: "Required Skills",
      body: (
        <div className="flex flex-wrap gap-2">
          {job.required_skills.map((skill) => (
            <span key={skill} className="rounded-full bg-[#EEEAFE] px-3 py-1 text-xs font-medium text-[#5B3EF0]">{skill}</span>
          ))}
        </div>
      ),
      show: job.required_skills.length > 0,
    },
    { title: "Qualifications", body: <BulletList items={job.qualifications} />, show: job.qualifications.length > 0 },
    { title: "Preferred Skills", body: <BulletList items={job.preferred_skills} />, show: job.preferred_skills.length > 0 },
  ].filter((section) => section.show);

  return (
    <Modal onClose={onClose} wide label={`${job.title} details`}>
      <div className="shrink-0 border-b-2 border-[#5B3EF0] px-6 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {job.department && (
              <span className="inline-block rounded-md bg-[#EEEAFE] px-2.5 py-1 text-xs font-medium text-[#5B3EF0]">{job.department}</span>
            )}
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{job.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
          {job.location && <Meta icon={<MapPin size={15} />}>{job.location}</Meta>}
          {job.employment_type && <Meta icon={<Briefcase size={15} />}>{job.employment_type}</Meta>}
          {job.experience && <Meta icon={<Clock3 size={15} />}>{job.experience}</Meta>}
          <Meta icon={<Users size={15} />}>{openingsLabel(job.open_positions)}</Meta>
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto px-6">
        {sections.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">More details will be shared with shortlisted candidates.</p>
        ) : (
          sections.map((section) => (
            <section key={section.title} className="py-5">
              <SectionTitle>{section.title}</SectionTitle>
              {section.body}
            </section>
          ))
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Close
        </button>
        <button onClick={onApply} className="rounded-lg bg-[#5B3EF0] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#4A2FD8]">
          Apply Now
        </button>
      </div>
    </Modal>
  );
}
