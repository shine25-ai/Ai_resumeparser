import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ClipboardCheck, Copy, Download, ExternalLink,
  FileText, Inbox, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { StatCard } from "../components/companies/companyForm";
import { fetchJobOpenings, type JobOpening } from "../utils/jobsApi";
import {
  applyApplicationCorrections,
  fetchApplication,
  fetchApplications,
  reprocessApplication,
  setApplicationReview,
  type ApplicationDetail,
  type ApplicationRow,
  type Confidence,
} from "../utils/applicationsApi";

/**
 * Applications (SRS 4.8 / 4.9): everything sent from the careers page, newest first, and the review of one
 * application: what the candidate entered next to what the AI read from the resume (with how much it found),
 * mark reviewed, copy the candidate's corrections to the profile, and read the resume again.
 * The pipeline (moving candidates through stages) comes in Phase 7.
 */

const PAGE_SIZE = 20;
const COPYABLE = new Set(["full_name", "phone", "location", "linkedin", "total_experience_years", "skills"]);

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const money = (n?: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);
const show = (v: unknown): string => {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "object" && x ? Object.values(x as Record<string, unknown>).filter((y) => y && typeof y === "string").slice(0, 3).join(", ") : String(x))).join(" · ");
  }
  return String(v);
};

function canEdit() {
  try {
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    const role = String(me.role || "").toLowerCase();
    const perms: string[] = me.permissions || [];
    return role === "admin" || role === "superadmin" || perms.length === 0 || perms.includes("candidates:edit");
  } catch {
    return true;
  }
}

export function ConfidenceBadge({ c }: { c?: Confidence }) {
  if (!c || c.score == null) return <span className="text-xs text-slate-400">—</span>;
  const tone = c.level === "high" ? "bg-emerald-50 text-emerald-700" : c.level === "medium" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`} title="How much of the usual details the AI found in the resume"><Sparkles size={11} />{Math.round(c.score * 100)}%</span>;
}

function ReviewPill({ status }: { status: string }) {
  return status === "reviewed" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={12} />Reviewed</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"><CircleDashed size={12} />To review</span>
  );
}

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (a: ApplicationDetail) => void }) {
  const { toast } = useFeedback();
  const [a, setA] = useState<ApplicationDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copy, setCopy] = useState<Set<string>>(new Set());
  const editable = useMemo(canEdit, []);

  useEffect(() => {
    setA(null);
    setCopy(new Set());
    fetchApplication(id).then(setA).catch((e) => toast(e instanceof Error ? e.message : "Could not load the application.", "error"));
  }, [id, toast]);

  const run = async (key: string, fn: () => Promise<ApplicationDetail>, ok: string) => {
    setBusy(key);
    try {
      const next = await fn();
      setA(next);
      onChanged(next);
      toast(ok, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!a) return <aside className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm"><Loader2 size={16} className="mr-2 inline animate-spin" />Loading…</aside>;

  const f = a.form;
  const p = f.personal;
  const differences = a.comparison.filter((r) => !r.same && COPYABLE.has(r.field) && !(r.entered == null || r.entered === ""));

  return (
    <aside className="flex max-h-[calc(100vh-150px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{a.full_name || a.applicant_email}</h2>
            <p className="truncate text-xs text-slate-500">{a.opening_title} · {fmt(a.submitted_at)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReviewPill status={a.review_status} />
          <ConfidenceBadge c={a.confidence} />
          {a.linked_existing_profile && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Existing profile</span>}
          {a.resume_status === "PENDING" && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"><Loader2 size={11} className="animate-spin" />Reading resume</span>}
          {a.resume_status === "FAILED" && <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700"><AlertTriangle size={11} />Resume not read</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {editable && (a.review_status === "reviewed" ? (
            <button disabled={!!busy} onClick={() => run("review", () => setApplicationReview(a.id, "pending"), "Marked to review again.")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCcw size={13} /> Reopen review</button>
          ) : (
            <button disabled={!!busy} onClick={() => run("review", () => setApplicationReview(a.id, "reviewed"), "Marked as reviewed.")} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white"><ClipboardCheck size={13} /> Mark reviewed</button>
          ))}
          {a.resume && <Link to={`/candidates/${a.candidate_id || a.resume.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink size={13} /> Profile {a.candidate_code}</Link>}
          {a.resume?.s3_url && <a href={a.resume.s3_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download size={13} /> Resume</a>}
          {editable && a.resume && (
            <button disabled={!!busy} onClick={() => run("reprocess", () => reprocessApplication(a.id), "The resume is being read again. Refresh in a minute.")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {busy === "reprocess" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Read resume again
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
        {!a.full_form ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">This application was sent before the 5-step form: only the resume{a.heard_from ? ` and "${a.heard_from}"` : ""} came with it.</p>
        ) : (
          <>
            <section>
              <h3 className="mb-2 font-bold text-slate-900">Candidate entered vs. read from resume</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr><th className="w-6 px-2 py-2" /><th className="px-2 py-2">Detail</th><th className="px-2 py-2">Entered</th><th className="px-2 py-2">Resume</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.comparison.map((r) => {
                      const can = editable && COPYABLE.has(r.field) && !r.same && !(r.entered == null || r.entered === "");
                      return (
                        <tr key={r.field} className={r.same ? "" : "bg-amber-50/40"}>
                          <td className="px-2 py-2 align-top">
                            {can ? <input type="checkbox" aria-label={`Use the entered ${r.label}`} checked={copy.has(r.field)} onChange={() => setCopy((s) => { const n = new Set(s); if (n.has(r.field)) n.delete(r.field); else n.add(r.field); return n; })} className="accent-indigo-600" /> : r.same ? <CheckCircle2 size={13} className="text-emerald-600" /> : null}
                          </td>
                          <td className="px-2 py-2 align-top font-medium text-slate-700">{r.label}</td>
                          <td className="max-w-[140px] break-words px-2 py-2 align-top text-slate-900">{show(r.entered) || <span className="text-slate-400">—</span>}</td>
                          <td className="max-w-[140px] break-words px-2 py-2 align-top text-slate-600">{show(r.extracted) || <span className="text-slate-400">Not found</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {editable && differences.length > 0 && (
                <button
                  disabled={!copy.size || !!busy}
                  onClick={() => run("copy", () => applyApplicationCorrections(a.id, [...copy]), "The profile now has the candidate's details.")}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-40"
                >
                  <Copy size={13} /> Use the ticked details on the profile
                </button>
              )}
              {a.confidence?.email_matches === false && <p className="mt-2 text-xs text-amber-700">The email in the resume is different from the verified email {a.applicant_email}.</p>}
            </section>

            <section className="grid grid-cols-2 gap-x-4 gap-y-2">
              {([
                ["Email", a.applicant_email], ["Mobile", [p?.phone_code, p?.phone].filter(Boolean).join(" ")], ["Location", p?.location],
                ["Notice period", f.notice_period], ["Expected CTC", money(f.expected_ctc)], ["Current CTC", money(f.current_ctc)],
                ["Experience", f.total_experience_years != null ? `${f.total_experience_years} years` : ""], ["Heard from", f.heard_from],
              ] as const).map(([k, v]) => (
                <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="break-words font-medium text-slate-800">{v || "—"}</p></div>
              ))}
              {(p?.linkedin || p?.portfolio) && (
                <div className="col-span-2 flex flex-wrap gap-3 text-xs">
                  {p?.linkedin && <a href={p.linkedin} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">LinkedIn</a>}
                  {p?.portfolio && <a href={p.portfolio} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">Portfolio / GitHub</a>}
                </div>
              )}
            </section>

            {!!f.education?.length && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Education</h3>
                <ul className="space-y-1 text-slate-700">{f.education.map((e, i) => <li key={i}>{[e.degree, e.specialization].filter(Boolean).join(" – ")}{e.institution ? `, ${e.institution}` : ""}{e.year ? ` (${e.year})` : ""}{e.score ? ` · ${e.score}` : ""}</li>)}</ul>
              </section>
            )}
            {!!f.experience?.length && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Experience</h3>
                <ul className="space-y-2 text-slate-700">
                  {f.experience.map((x, i) => (
                    <li key={i}>
                      <p className="font-medium text-slate-900">{x.designation || "—"} · {x.company}</p>
                      <p className="text-xs text-slate-500">{x.start || "?"} – {x.current ? "now" : x.end || "?"}</p>
                      {x.responsibilities && <p className="mt-0.5 line-clamp-3 text-xs text-slate-600">{x.responsibilities}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!!f.skills?.length && (
              <section>
                <h3 className="mb-1 font-bold text-slate-900">Skills</h3>
                <div className="flex flex-wrap gap-1.5">{f.skills.map((s) => <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{s}</span>)}</div>
                {!!f.certifications?.length && <p className="mt-2 text-xs text-slate-600">Certifications: {f.certifications.join(", ")}</p>}
              </section>
            )}
            {f.cover_note && <section><h3 className="mb-1 font-bold text-slate-900">Note from the candidate</h3><p className="whitespace-pre-line text-slate-700">{f.cover_note}</p></section>}
          </>
        )}

        {a.consent?.accepted && (
          <section className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="flex items-center gap-1 font-semibold text-slate-800"><ShieldCheck size={13} className="text-emerald-600" /> Consent given</p>
            <p className="mt-1">{fmt(a.consent.at)} · version {a.consent.version}{a.consent.ip ? ` · from ${a.consent.ip}` : ""}</p>
            <p className="mt-1 italic">“{a.consent.text}”</p>
          </section>
        )}

        <section>
          <h3 className="mb-1 font-bold text-slate-900">History</h3>
          <ol className="space-y-2 border-l border-slate-200 pl-4">
            {[...a.history].reverse().map((h, i) => (
              <li key={i} className="relative text-xs">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500" />
                <p className="font-medium capitalize text-slate-800">{h.action}{h.note ? `: ${h.note}` : ""}</p>
                <p className="text-slate-500">{h.by || "—"} · {fmt(h.at)}</p>
              </li>
            ))}
            {a.history.length === 0 && <li className="text-xs text-slate-400">Sent {fmt(a.submitted_at)}.</li>}
          </ol>
        </section>
      </div>
    </aside>
  );
}

export default function Applications() {
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, pending: 0 });
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const jobId = params.get("job") || "";
  const review = (params.get("review") || "") as "" | "pending" | "reviewed";
  const selected = params.get("id");

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, all, pending] = await Promise.all([
        fetchApplications({ job_id: jobId, review, q: q.trim(), page, limit: PAGE_SIZE }),
        fetchApplications({ job_id: jobId, limit: 1 }),
        fetchApplications({ job_id: jobId, review: "pending", limit: 1 }),
      ]);
      setRows(list.items);
      setTotal(list.total);
      setCounts({ all: all.total, pending: pending.total });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load applications.", "error");
    } finally {
      setLoading(false);
    }
  }, [jobId, review, q, page, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => setPage(1), [jobId, review, q]);
  useEffect(() => {
    fetchJobOpenings(undefined, true).then(setJobs).catch(() => undefined);
  }, []);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Applications</h1>
          <p className="text-sm text-slate-500">Everything candidates sent from your careers page. Check what the AI read from each resume, then mark it reviewed.</p>
        </div>
        <button onClick={load} title="Refresh" className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={15} /></button>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard tone="blue" icon={<Inbox size={20} />} value={counts.all} label="Applications" />
        <StatCard tone="amber" icon={<CircleDashed size={20} />} value={counts.pending} label="To review" />
        <StatCard tone="green" icon={<CheckCircle2 size={20} />} value={counts.all - counts.pending} label="Reviewed" />
      </section>

      <div className={`grid gap-5 ${selected ? "xl:grid-cols-[minmax(0,1fr)_440px]" : ""}`}>
        <div className="min-w-0 space-y-3">
          <section className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="relative min-w-[220px] flex-[2]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or job…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none" />
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">Job
              <select value={jobId} onChange={(e) => set("job", e.target.value || null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">All jobs</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.title}</option>)}
              </select>
            </label>
            <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
              {([["", "All"], ["pending", "To review"], ["reviewed", "Reviewed"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => set("review", k || null)} className={`rounded-md px-3 py-1.5 font-medium ${review === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Candidate</th>
                    <th className="px-3 py-3">Job</th>
                    <th className="px-3 py-3">Experience</th>
                    <th className="px-3 py-3">Notice</th>
                    <th className="px-3 py-3">AI read</th>
                    <th className="px-3 py-3">Review</th>
                    <th className="px-3 py-3">Applied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500"><FileText size={22} className="mx-auto mb-2 text-slate-300" />No applications {q || jobId || review ? "match these filters" : "yet. Share your careers page to start receiving them"}.</td></tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} onClick={() => set("id", r.id)} className={`cursor-pointer ${r.id === selected ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900">{r.full_name || r.applicant_email}</p>
                          <p className="text-xs text-slate-500">{r.applicant_email}{r.location ? ` · ${r.location}` : ""}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{r.opening_title}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{r.total_experience_years != null ? `${r.total_experience_years} yrs` : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{r.notice_period || "—"}</td>
                        <td className="px-3 py-3"><ConfidenceBadge c={r.confidence} /></td>
                        <td className="px-3 py-3"><ReviewPill status={r.review_status} /></td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-500">{new Date(r.submitted_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                <span>{(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, total)} of {total}</span>
                <div className="flex gap-1">
                  <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={15} /></button>
                  <button disabled={page === pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={15} /></button>
                </div>
              </div>
            )}
          </section>
          <p className="text-xs text-slate-400">Moving candidates through stages (screening, shortlist, interview…) comes with the recruitment pipeline.</p>
        </div>

        {selected && (
          <Detail
            id={selected}
            onClose={() => set("id", null)}
            onChanged={(a) => {
              setRows((list) => list.map((r) => (r.id === a.id ? { ...r, review_status: a.review_status as ApplicationRow["review_status"] } : r)));
              fetchApplications({ job_id: jobId, review: "pending", limit: 1 }).then((x) => setCounts((c) => ({ ...c, pending: x.total }))).catch(() => undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}
