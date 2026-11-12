import { useEffect, useState } from "react";
import { Briefcase, CheckCircle2, Loader2, MapPin, Upload, X } from "lucide-react";
import {
  confirmApplicantCode,
  fetchPublicJobs,
  requestApplicantCode,
  submitApplication,
  type PublicJob,
} from "../utils/jobsApi";

const ACCEPTED = ".pdf,.doc,.docx";
const MAX_BYTES = 10 * 1024 * 1024;

type Step = "email" | "code" | "resume" | "done";

function ApplyModal({ job, onClose }: { job: PublicJob; onClose: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      setStep("code");
    });

  const verifyCode = () =>
    run(async () => {
      const result = await confirmApplicantCode(email.trim(), code.trim());
      setToken(result.applicant_token);
      setStep("resume");
    });

  const pickFile = (picked: File | null) => {
    setError("");
    if (!picked) return setFile(null);
    if (picked.size > MAX_BYTES) return setError("The file is larger than 10 MB.");
    if (!/\.(pdf|docx?)$/i.test(picked.name)) return setError("Upload a PDF, DOC or DOCX file.");
    setFile(picked);
  };

  const send = () => {
    if (!file) return;
    run(async () => {
      await submitApplication(job.id, token, file);
      setStep("done");
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Apply: {job.title}</h2>
            <p className="text-sm text-slate-500">
              {step === "email" && "Enter your email. We will send a verification code."}
              {step === "code" && `Enter the 6-digit code sent to ${email.trim()}.`}
              {step === "resume" && "Upload your resume to finish."}
              {step === "done" && "Your application is in."}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {step === "email" && (
          <div className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
            <button
              disabled={busy || !email.trim()}
              onClick={sendCode}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Send code
            </button>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-4">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl tracking-[0.5em] focus:border-indigo-500 focus:outline-none"
            />
            <button
              disabled={busy || code.length !== 6}
              onClick={verifyCode}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Verify
            </button>
            <button onClick={sendCode} disabled={busy} className="w-full text-sm text-slate-500 hover:text-slate-700">
              Resend code
            </button>
          </div>
        )}

        {step === "resume" && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-indigo-400">
              <Upload className="text-indigo-500" size={28} />
              <span className="text-sm text-slate-700">{file ? file.name : "Choose your resume (PDF, DOC, DOCX, max 10 MB)"}</span>
              <input type="file" accept={ACCEPTED} className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>
            <button
              disabled={busy || !file}
              onClick={send}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />} Submit application
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="text-emerald-500" size={48} />
            <p className="font-medium text-slate-900">Application submitted successfully</p>
            <p className="text-sm text-slate-500">Your resume is being processed. Thank you for applying.</p>
            <button onClick={onClose} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Close
            </button>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}

export default function PublicJobs() {
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<PublicJob | null>(null);

  const load = () => {
    setLoading(true);
    fetchPublicJobs()
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load open roles."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-2xl font-bold">Open roles</h1>
          <p className="mt-1 text-sm text-slate-500">Browse current openings and apply with your resume.</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading && <p className="text-slate-500">Loading roles…</p>}
        {!loading && error && <p className="text-rose-700">{error}</p>}
        {!loading && !error && jobs.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            There are no open roles right now. Please check back later.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {jobs.map((job) => (
            <article key={job.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{job.title}</h2>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {job.open_positions} open {job.open_positions === 1 ? "position" : "positions"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                {job.department && <span className="inline-flex items-center gap-1"><Briefcase size={14} />{job.department}</span>}
                {job.location && <span className="inline-flex items-center gap-1"><MapPin size={14} />{job.location}</span>}
                {job.employment_type && <span>{job.employment_type}</span>}
              </div>
              {job.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{job.description}</p>}
              <button
                onClick={() => setApplying(job)}
                className="mt-4 self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Apply
              </button>
            </article>
          ))}
        </div>
      </main>

      {applying && (
        <ApplyModal
          job={applying}
          onClose={() => {
            setApplying(null);
            load();
          }}
        />
      )}
    </div>
  );
}
