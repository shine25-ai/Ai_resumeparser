import React, { useState, useMemo } from 'react';
import { Star, Plus, Scale } from 'lucide-react';
import {
  submitScorecard,
  type KanbanCandidate,
  type ScorecardItem,
} from '../../utils/atsApi';

interface ScorecardsCompareTabProps {
  candidates: KanbanCandidate[];
  scorecards: ScorecardItem[];
  onReload: () => void;
}

function StarRatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} stars`}
            className="p-0.5"
          >
            <Star
              size={15}
              className={
                n <= value ? 'fill-amber-400 text-amber-500' : 'text-slate-200 hover:text-amber-300'
              }
            />
          </button>
        ))}
        <span className="text-xs font-semibold text-slate-700 tabular-nums w-6 text-right">
          {value}.0
        </span>
      </div>
    </div>
  );
}

export const ScorecardsCompareTab = React.memo(function ScorecardsCompareTab({
  candidates,
  scorecards,
  onReload,
}: ScorecardsCompareTabProps) {
  const [selectedCandId, setSelectedCandId] = useState(candidates[0]?.id || '');
  const [technical, setTechnical] = useState(4);
  const [communication, setCommunication] = useState(4);
  const [cultureFit, setCultureFit] = useState(4);
  const [recommendation, setRecommendation] = useState('Strong Hire');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Side-by-side comparison selection (up to 3 candidates)
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    candidates.slice(0, 3).map((c) => c.id)
  );

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cand = candidates.find((c) => c.id === selectedCandId);
    if (!cand) return;
    setSaving(true);
    try {
      await submitScorecard({
        candidate_id: cand.id,
        candidate_name: cand.name,
        role: cand.role,
        technical,
        communication,
        culture_fit: cultureFit,
        recommendation,
        notes,
      });
      setNotes('');
      onReload();
    } finally {
      setSaving(false);
    }
  };

  const scoreMap = useMemo(() => {
    const map: Record<string, { tech: number; comm: number; culture: number; overall: number; count: number }> = {};
    for (const sc of scorecards) {
      const e = map[sc.candidate_id] || { tech: 0, comm: 0, culture: 0, overall: 0, count: 0 };
      e.tech += sc.technical;
      e.comm += sc.communication;
      e.culture += sc.culture_fit;
      e.overall += sc.overall;
      e.count += 1;
      map[sc.candidate_id] = e;
    }
    return map;
  }, [scorecards]);

  const comparedCandidates = useMemo(
    () => compareIds.map((id) => candidates.find((c) => c.id === id)).filter(Boolean) as KanbanCandidate[],
    [compareIds, candidates]
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Submit Scorecard Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200/80 space-y-4"
        >
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Submit Interview Scorecard</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Rate technical depth, communication, and culture fit (1–5)
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Candidate</label>
            <select
              value={selectedCandId}
              onChange={(e) => setSelectedCandId(e.target.value)}
              className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
            >
              {candidates.slice(0, 60).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/70 space-y-2.5">
            <StarRatingInput label="Technical" value={technical} onChange={setTechnical} />
            <StarRatingInput label="Communication" value={communication} onChange={setCommunication} />
            <StarRatingInput label="Culture Fit" value={cultureFit} onChange={setCultureFit} />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Recommendation
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {['Strong Hire', 'Hire', 'Hold', 'No Hire'].map((rec) => (
                <button
                  key={rec}
                  type="button"
                  onClick={() => setRecommendation(rec)}
                  className={`py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    recommendation === rec
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {rec}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Evaluation Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key strengths, coding depth, red flags..."
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !selectedCandId}
            className="w-full h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Plus size={13} />
            <span>{saving ? 'Saving…' : 'Save Scorecard'}</span>
          </button>
        </form>

        {/* Side-by-Side Candidate Comparison */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Scale size={14} className="text-indigo-500" />
                <span>Side-by-Side Candidate Comparison</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select up to 3 candidates to compare scorecards, skills, and experience
              </p>
            </div>
          </div>

          {/* Candidate Picker Pills */}
          <div className="flex flex-wrap gap-1.5">
            {candidates.slice(0, 10).map((c) => {
              const active = compareIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCompare(c.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {comparedCandidates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80">
                    <th className="py-2 pr-3 text-[11px] font-medium text-slate-400 w-28">
                      Criterion
                    </th>
                    {comparedCandidates.map((c) => (
                      <th key={c.id} className="py-2 px-3 font-semibold text-slate-900">
                        <div className="truncate max-w-[160px]">{c.name}</div>
                        <div className="text-[10px] font-normal text-slate-400 truncate max-w-[160px]">
                          {c.role}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2.5 pr-3 text-slate-500 font-medium">Stage</td>
                    {comparedCandidates.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {c.stage}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 text-slate-500 font-medium">Experience</td>
                    {comparedCandidates.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 tabular-nums text-slate-800">
                        {c.experience_years ? `${c.experience_years} yrs` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 text-slate-500 font-medium">AI Tech Score</td>
                    {comparedCandidates.map((c) => (
                      <td key={c.id} className="py-2.5 px-3 tabular-nums font-semibold text-indigo-700">
                        {c.ai_score !== null && c.ai_score !== undefined ? `${c.ai_score}/100` : '—'}
                      </td>
                    ))}
                  </tr>
                  {(['tech', 'comm', 'culture', 'overall'] as const).map((metric) => (
                    <tr key={metric}>
                      <td className="py-2.5 pr-3 text-slate-500 font-medium capitalize">
                        {metric === 'tech'
                          ? 'Technical'
                          : metric === 'comm'
                            ? 'Communication'
                            : metric === 'culture'
                              ? 'Culture Fit'
                              : 'Overall Scorecard'}
                      </td>
                      {comparedCandidates.map((c) => {
                        const agg = scoreMap[c.id];
                        const val = agg ? (agg[metric] / agg.count).toFixed(1) : null;
                        return (
                          <td
                            key={c.id}
                            className={`py-2.5 px-3 tabular-nums ${
                              metric === 'overall' ? 'font-semibold text-emerald-700' : 'text-slate-700'
                            }`}
                          >
                            {val ? `${val} / 5.0` : 'No scorecard'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2.5 pr-3 text-slate-500 font-medium align-top">Top Skills</td>
                    {comparedCandidates.map((c) => (
                      <td key={c.id} className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {c.skills.slice(0, 4).map((sk) => (
                            <span
                              key={sk}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-slate-400">
              Select candidates above to compare side by side.
            </div>
          )}
        </div>
      </div>

      {/* Recent Scorecards Feed */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80">
        <h3 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
          Submitted Scorecards ({scorecards.length})
        </h3>
        {scorecards.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {scorecards.slice(0, 12).map((sc) => (
              <div key={sc.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[13px] font-semibold text-slate-800">{sc.candidate_name}</span>
                  <span className="text-xs text-slate-400 ml-2">{sc.role}</span>
                  {sc.notes && <p className="text-xs text-slate-500 mt-0.5">{sc.notes}</p>}
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  <span className="text-slate-500">
                    T: <strong>{sc.technical}</strong> · C: <strong>{sc.communication}</strong> · F:{' '}
                    <strong>{sc.culture_fit}</strong>
                  </span>
                  <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    {sc.overall}/5
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {sc.recommendation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No interview scorecards submitted yet. Use the form above to record the first evaluation.
          </div>
        )}
      </div>
    </div>
  );
});

