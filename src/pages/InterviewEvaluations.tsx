import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { Briefcase, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Code2, Flag, Layers, Lightbulb, Loader2, Star, Target, Users } from "lucide-react";
import { apiFetch, BASE_URL, getInterviews } from "../utils/Api";
import type { InterviewItem } from "../types/interview";
import { useFeedback } from "../components/ui/Feedback";
import { Badge, PageHeader, TabGroup, btnPrimary, btnSecondary, inputClass, selectClass, tableHead, tableShell } from "../components/interview/interviewUi";

interface StageSuggestion { stage: string; reason: string }
import {
  DEFAULT_CRITERIA, RECOMMENDATION_LABELS, fitLabel, weightedContribution, weightedTotal,
  createEvaluationForm, getPanelView, listEvaluationForms, saveMyEvaluation,
  type EvaluationForm, type PanelView, type Recommendation,
} from "../utils/phase8Api";

/** Screen 12, Interview Evaluation & Scoring: scoring, interviewer feedback, round history, all scores and notes. */

type Section = "scoring" | "feedback" | "history" | "scores" | "notes";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "scoring", label: "Evaluation & Scoring" },
  { key: "feedback", label: "Interviewer Feedback" },
  { key: "history", label: "Round History" },
  { key: "scores", label: "All Scores" },
  { key: "notes", label: "Notes & Collaboration" },
];

const CRITERION_ICON: Record<string, { icon: ReactElement; tone: string }> = {
  code_technical: { icon: <Code2 size={15} />, tone: "bg-indigo-50 text-indigo-600" },
  system_design: { icon: <Layers size={15} />, tone: "bg-violet-50 text-violet-600" },
  problem_solving: { icon: <Lightbulb size={15} />, tone: "bg-amber-50 text-amber-600" },
  communication: { icon: <Users size={15} />, tone: "bg-sky-50 text-sky-600" },
  ownership: { icon: <Flag size={15} />, tone: "bg-rose-50 text-rose-600" },
  culture_fit: { icon: <Target size={15} />, tone: "bg-emerald-50 text-emerald-600" },
  overall: { icon: <CheckCircle2 size={15} />, tone: "bg-emerald-50 text-emerald-600" },
};

/** Five clickable stars; the number of the rating is shown beside them. */
function StarRating({ label, value, disabled, onChange }: { label: string; value?: number; disabled?: boolean; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={`Rating for ${label}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded p-0.5 disabled:opacity-50"
        >
          <Star size={18} className={value && n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
        </button>
      ))}
      <span className="ml-1 text-xs text-slate-500">{value ? `${value}/5` : "Rate"}</span>
    </div>
  );
}

const CRITERIA_HINT: Record<string, string> = {
  code_technical: "Java, Spring Boot, coding, problem solving",
  system_design: "Design approach, scalability, best practices",
  problem_solving: "Logical thinking, debugging, solution quality",
  communication: "Clarity, articulation, team fit",
  ownership: "Initiative, accountability, learning mindset",
  culture_fit: "Alignment with company values and role expectations",
  overall: "Overall hiring suitability for the role",
};

const listOf = (data: any): InterviewItem[] => (Array.isArray(data) ? data : data?.interviews || data?.data?.interviews || []);
const formatTime = (t?: string) => t || "";
const byDateTime = (a: InterviewItem, b: InterviewItem) =>
  `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`);

export default function InterviewEvaluations() {
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [forms, setForms] = useState<EvaluationForm[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [view, setView] = useState<PanelView | null>(null);
  const [roundScores, setRoundScores] = useState<Record<string, number | null>>({});
  const [section, setSection] = useState<Section>("scoring");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<StageSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [comments, setComments] = useState("");

  const selectedId = params.get("interview") || "";
  const selected = interviews.find((i) => i.id === selectedId) || null;
  const ordered = useMemo(() => [...interviews].sort(byDateTime), [interviews]);
  const index = ordered.findIndex((i) => i.id === selectedId);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, formList, meResp] = await Promise.all([
        getInterviews({ limit: 500 }),
        listEvaluationForms(),
        apiFetch(`${BASE_URL}/users/me`).then((r) => r.json()),
      ]);
      setInterviews(listOf(list).filter((i) => i.status !== "CANCELLED"));
      setForms(formList);
      setMyId((meResp.data || meResp).id);
    } catch (e: any) {
      setError(e?.message || "Could not load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadPanel = useCallback(async (interviewId: string) => {
    try {
      setView(await getPanelView(interviewId));
    } catch (e: any) {
      setView(null);
      setError(e?.message || "Could not load the panel");
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadPanel(selectedId);
    else setView(null);
  }, [selectedId, loadPanel]);

  // Pipeline suggestion for this candidate and job. Read-only: a recruiter moves the candidate.
  useEffect(() => {
    if (!selected) return setSuggestion(null);
    apiFetch(`${BASE_URL}/pipeline/stage-suggestion?candidate_id=${encodeURIComponent(selected.candidate_id)}&job_id=${encodeURIComponent(selected.job_id || "")}`)
      .then((r) => r.json())
      .then((d) => setSuggestion(d.suggestion || null))
      .catch(() => setSuggestion(null));
  }, [selected]);

  const moveToSuggested = async () => {
    if (!selected || !suggestion) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${BASE_URL}/ats/candidates/${encodeURIComponent(selected.candidate_id)}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: suggestion.stage }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || d.message || "Could not move the candidate");
      toast(`Candidate moved to ${suggestion.stage}`, "success");
      setSuggestion(null);
    } catch (e: any) {
      toast(e?.message || "Could not move the candidate", "error");
    } finally {
      setBusy(false);
    }
  };

  // This candidate's interviews, in order, for round history and round-wise scores.
  const candidateInterviews = useMemo(
    () => (selected ? ordered.filter((i) => i.candidate_id === selected.candidate_id) : []),
    [ordered, selected],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(candidateInterviews.map(async (i) => {
        try {
          const v = await getPanelView(i.id);
          return [i.id, v.summary.score] as const;
        } catch {
          return [i.id, null] as const;
        }
      }));
      if (!cancelled) setRoundScores(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateInterviews]);

  const go = (offset: number) => {
    const next = ordered[index + offset];
    if (next) setParams({ interview: next.id });
  };

  // The form for this interview: job and round, then job, then the company default.
  const form = useMemo(() => {
    if (!selected) return null;
    const exact = forms.find((f) => f.job_id === selected.job_id && f.round_number === selected.round_number);
    const byJob = forms.find((f) => f.job_id === selected.job_id && f.round_number == null);
    const defaults = forms.find((f) => f.job_id == null && f.round_number == null);
    return exact || byJob || defaults || null;
  }, [forms, selected]);

  const criteria = form?.criteria ?? [];
  const myEvaluation = view?.evaluations.find((e) => e.interviewer_user_id === myId) || null;
  const locked = myEvaluation?.status === "SUBMITTED";

  useEffect(() => {
    if (myEvaluation) {
      setRatings(myEvaluation.ratings || {});
      setRecommendation((myEvaluation.recommendation as Recommendation) || null);
      setComments(myEvaluation.comments || "");
    } else {
      setRatings({});
      setRecommendation(null);
      setComments("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, myId]);

  const total = weightedTotal(criteria, ratings);
  const maxScore = form?.scale_max ?? 5;
  const percent = Math.round((total / maxScore) * 100);
  const allRated = criteria.length > 0 && criteria.every((c) => ratings[c.id]);
  const canSubmit = allRated && !!recommendation && comments.trim().length > 0 && !locked && !!view?.can_evaluate;
  const jobRounds = selected ? Math.max(candidateInterviews.reduce((m, i) => Math.max(m, i.round_number || 1), 1), 1) : 0;

  const setupDefault = async () => {
    setBusy(true);
    try {
      await createEvaluationForm({ name: "Company default", scale_max: 5, criteria: DEFAULT_CRITERIA });
      toast("Default criteria created", "success");
      setForms(await listEvaluationForms());
    } catch (e: any) {
      toast(e?.message || "Could not create criteria", "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async (submit: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await saveMyEvaluation(selected.id, { ratings, comments: comments.trim(), recommendation, submit });
      toast(submit ? "Evaluation submitted" : "Draft saved", "success");
      await loadPanel(selected.id);
    } catch (e: any) {
      toast(e?.message || "Could not save", "error");
    } finally {
      setBusy(false);
    }
  };

  const interviewLabel = (i: InterviewItem) => `${i.candidate_name} · ${i.job_title} · Round ${i.round_number} · ${i.scheduled_date}`;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Interview Evaluation & Scoring"
        subtitle="Record interviewer feedback, rate competencies, and provide a hiring recommendation."
        actions={
          <>
            <button type="button" onClick={() => go(-1)} disabled={index <= 0} className={btnSecondary}><ChevronLeft className="h-3.5 w-3.5" /> Prev Candidate</button>
            <button type="button" onClick={() => go(1)} disabled={index < 0 || index >= ordered.length - 1} className={btnSecondary}>Next Candidate <ChevronRight className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setSection("history")} className={btnSecondary}>View Interview History</button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-700" htmlFor="interview-pick">Interview</label>
        <select
          id="interview-pick"
          className={`min-w-[360px] ${selectClass}`}
          value={selectedId}
          onChange={(e) => setParams(e.target.value ? { interview: e.target.value } : {})}
        >
          <option value="">Choose an interview…</option>
          {ordered.map((i) => <option key={i.id} value={i.id}>{interviewLabel(i)}</option>)}
        </select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {!selected && !loading && <p className="text-sm text-slate-500">Pick an interview to evaluate it.</p>}

      {selected && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
              {selected.candidate_name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{selected.candidate_name}</span>
                <Badge tone="sky">In Interview Process</Badge>
              </div>
              <div className="text-xs text-slate-500">{selected.candidate_email || "No email on file"}</div>
            </div>
          </div>
          {[
            { label: "Job", value: selected.job_title, icon: <Briefcase size={16} />, tone: "bg-indigo-50 text-indigo-600" },
            { label: "Round", value: `${selected.round_number ? `Round ${selected.round_number}` : "Round"}${jobRounds > 1 ? ` (${selected.round_number} of ${jobRounds})` : ""}`, icon: <Layers size={16} />, tone: "bg-violet-50 text-violet-600" },
            { label: "Date", value: `${selected.scheduled_date} · ${formatTime(selected.scheduled_time)}`, icon: <CalendarDays size={16} />, tone: "bg-amber-50 text-amber-600" },
            { label: "Interview panel", value: view ? view.evaluations.map((e) => e.interviewer_name).join(", ") || selected.interviewer_name : selected.interviewer_name, icon: <Users size={16} />, tone: "bg-sky-50 text-sky-600" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 text-sm">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${f.tone}`}>{f.icon}</span>
              <div>
                <div className="text-xs text-slate-500">{f.label}</div>
                <div className="font-semibold text-slate-900">{f.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && suggestion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-emerald-900">Suggested next stage: {suggestion.stage}</span>
            <span className="ml-2 text-emerald-800">{suggestion.reason}. Nothing moves until you confirm.</span>
          </div>
          <button type="button" onClick={moveToSuggested} disabled={busy} className={btnPrimary}>
            Move candidate to {suggestion.stage}
          </button>
        </div>
      )}

      {selected && (
        <TabGroup tabs={SECTIONS} value={section} onChange={setSection} />
      )}

      {selected && view && section === "scoring" && !form && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-2">No evaluation criteria are set up yet for this interview.</p>
          <button type="button" onClick={setupDefault} disabled={busy} className={btnPrimary}>
            Create the default criteria (7 competencies, weights add to 100)
          </button>
        </div>
      )}

      {selected && view && form && section === "scoring" && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-bold text-slate-800">Competency Evaluation</h2>
                <div className="flex flex-wrap gap-1">
                  {["1 · Poor", "2 · Below Avg", "3 · Average", "4 · Good", "5 · Excellent"].map((t) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t}</span>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="py-3 px-4 text-left">Competency / Criteria</th>
                    <th className="py-3 px-4 text-right">Weightage</th>
                    <th className="py-3 px-4 text-left">Rating</th>
                    <th className="py-3 px-4 text-right">Score (weighted)</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CRITERION_ICON[c.id]?.tone || "bg-slate-100 text-slate-600"}`}>
                            {CRITERION_ICON[c.id]?.icon || <Star size={14} />}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900">{c.label}</div>
                            <div className="text-[11px] text-slate-500">{CRITERIA_HINT[c.id] || ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 align-middle text-slate-700 text-right">{c.weight}%</td>
                      <td className="py-3 px-4 align-middle text-slate-700">
                        <StarRating
                          label={c.label}
                          value={ratings[c.id]}
                          disabled={locked || !view.can_evaluate}
                          onChange={(n) => setRatings((r) => ({ ...r, [c.id]: n }))}
                        />
                      </td>
                      <td className="py-3 px-4 align-middle text-slate-700 text-right">
                        {weightedContribution(ratings[c.id], c.weight).toFixed(2)} / {(c.weight / 20).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>


            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-800" htmlFor="comments">Interviewer Comments <span className="text-rose-600">*</span></label>
                <textarea id="comments" rows={4} maxLength={500} disabled={locked || !view.can_evaluate} value={comments} onChange={(e) => setComments(e.target.value)} className={`w-full ${inputClass} py-2`} />
                <div className="text-right text-xs text-slate-400">{comments.length} / 500</div>
              </div>
            </div>

            {!view.can_evaluate && <p className="text-sm text-slate-500">You are not one of the assigned interviewers for this interview, so you can view it but not score it.</p>}
            {locked && <p className="text-sm text-slate-600">Your evaluation is submitted and locked. An admin can reopen it.</p>}

            {view.can_evaluate && !locked && (
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => save(false)} disabled={busy} className={btnSecondary}>Save as Draft</button>
                <button type="button" onClick={() => save(true)} disabled={busy || !canSubmit} className={btnPrimary}
                  title={canSubmit ? "" : "Rate every competency, choose a recommendation and add comments first"}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Submit Evaluation
                </button>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Evaluation Summary</h2>
                <Badge tone="emerald">Total Score: {total.toFixed(2)} / {maxScore.toFixed(2)}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <svg width="84" height="84" viewBox="0 0 84 84" aria-label={`${percent}%`}>
                  <circle cx="42" cy="42" r="34" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle cx="42" cy="42" r="34" fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(Math.min(percent, 100) / 100) * 213.6} 213.6`} transform="rotate(-90 42 42)" />
                  <text x="42" y="47" textAnchor="middle" className="fill-slate-900 text-[15px] font-bold">{percent}%</text>
                </svg>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{total.toFixed(2)} <span className="text-sm font-medium text-slate-500">/ {maxScore.toFixed(2)}</span></div>
                  <Badge tone={percent >= 80 ? "emerald" : percent >= 60 ? "sky" : "amber"}>{fitLabel(percent)}</Badge>
                </div>
              </div>
              <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Weightage score</dt><dd className="font-semibold">{total.toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Maximum score</dt><dd className="font-semibold">{maxScore.toFixed(2)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Panel</dt><dd className="font-semibold">{view.summary.label}</dd></div>
              </dl>
            </div>
            <RoundWiseCard interviews={candidateInterviews} scores={roundScores} currentId={selected.id} onPick={(id) => setParams({ interview: id })} />
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-800">Interview Recommendation <span className="text-rose-600">*</span></h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="recommendation" disabled={locked || !view.can_evaluate} checked={recommendation === key} onChange={() => setRecommendation(key)} />
                    {RECOMMENDATION_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>

          </aside>
        </div>
      )}

      {selected && view && section === "feedback" && (
        <div className="space-y-3">
          {view.evaluations.length === 0 && <p className="text-sm text-slate-500">No interviewer feedback yet.</p>}
          {view.evaluations.map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{e.interviewer_name}</div>
                <span className={e.status === "SUBMITTED" ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>
                  {e.status === "SUBMITTED" ? `Submitted · ${e.score?.toFixed(2) ?? "—"} / ${maxScore.toFixed(2)}` : "Draft"}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-600">{e.recommendation ? RECOMMENDATION_LABELS[e.recommendation as Recommendation] : "No recommendation yet"}</div>
              {e.comments && <p className="mt-2 text-sm text-slate-700">{e.comments}</p>}
            </div>
          ))}
        </div>
      )}

      {selected && section === "history" && (
        <div className={tableShell}>
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="py-3 px-4 text-left">Round</th>
                <th className="py-3 px-4 text-left">Date</th>
                <th className="py-3 px-4 text-left">Job</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-left">Score</th>
              </tr>
            </thead>
            <tbody>
              {candidateInterviews.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="py-3 px-4 align-middle text-slate-700"><button type="button" className="text-indigo-600 hover:underline" onClick={() => setParams({ interview: i.id })}>Round {i.round_number}</button></td>
                  <td className="py-3 px-4 align-middle text-slate-700">{i.scheduled_date} {i.scheduled_time}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{i.job_title}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{i.status}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{roundScores[i.id] != null ? `${roundScores[i.id]?.toFixed(2)} / ${maxScore.toFixed(2)}` : "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && view && section === "scores" && (
        <div className={tableShell}>
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="py-3 px-4 text-left">Interviewer</th>
                {criteria.map((c) => <th key={c.id} className="px-2 py-2 text-right">{c.label}</th>)}
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {view.evaluations.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-3 px-4 align-middle text-slate-700">{e.interviewer_name} {e.status === "DRAFT" && <span className="text-xs text-amber-700">(draft)</span>}</td>
                  {criteria.map((c) => <td key={c.id} className="px-2 py-2 text-right">{e.ratings?.[c.id] ?? "—"}</td>)}
                  <td className="px-4 py-2 text-right font-semibold">{e.score != null ? e.score.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && view && section === "notes" && (
        <div className="space-y-2">
          {view.evaluations.filter((e) => e.comments).length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
          {view.evaluations.filter((e) => e.comments).map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 text-sm">
              <div className="text-xs font-semibold text-slate-500">{e.interviewer_name} · {e.status === "SUBMITTED" ? "Submitted" : "Draft"}</div>
              <p className="mt-1 text-slate-800">{e.comments}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoundWiseCard({ interviews, scores, currentId, onPick }: {
  interviews: InterviewItem[];
  scores: Record<string, number | null>;
  currentId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <h2 className="mb-2 text-sm font-bold text-slate-800">Round-wise Scores (This Candidate)</h2>
      {interviews.length === 0 && <p className="text-sm text-slate-500">No other rounds.</p>}
      <ul className="space-y-2 text-sm">
        {interviews.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPick(i.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left ${i.id === currentId ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <span className="flex items-center gap-2">
                {i.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : i.id === currentId ? <Circle className="h-4 w-4 fill-indigo-600 text-indigo-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                <span className={i.id === currentId ? "font-semibold text-slate-900" : "text-slate-700"}>Round {i.round_number}{i.id === currentId ? " (Current)" : ""} · {i.scheduled_date}</span>
              </span>
              {scores[i.id] != null
                ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{`${scores[i.id]?.toFixed(2)} / 5.00`}</span>
                : <span className="text-xs text-slate-400">Pending</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
