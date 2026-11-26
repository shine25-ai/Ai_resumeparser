import React, { useState, useEffect } from "react";
import {
  Sparkles, Sliders, TrendingUp, Download, Search, RefreshCw, AlertTriangle, GitMerge,
  Layers, ShieldCheck, Loader2
} from "lucide-react";
import type { SkillWeights, SkillMatrixAnalytics } from "../utils/skillIntelligenceApi";
import {
  fetchSkillWeights, updateSkillWeights, fetchSkillMatrixAnalytics, mergeDuplicateSkills, downloadSkillMatrixCsv
} from "../utils/skillIntelligenceApi";
import { useFeedback } from "../components/ui/Feedback";

export default function SkillIntelligencePage() {
  const { toast, confirm } = useFeedback();

  // Active Tab
  const [activeTab, setActiveTab] = useState<"matrix" | "demand" | "weights" | "merge">("matrix");
  const [loading, setLoading] = useState(true);

  // Matrix & Analytics State
  const [matrixData, setMatrixData] = useState<SkillMatrixAnalytics | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedSkillFilter, setSelectedSkillFilter] = useState("all");

  // Weights Configuration State
  const [weights, setWeights] = useState<SkillWeights>({ interview_weight: 70, resume_weight: 30 });
  const [savingWeights, setSavingWeights] = useState(false);

  // Merge Skills State
  const [sourceSkill, setSourceSkill] = useState("");
  const [targetSkill, setTargetSkill] = useState("");
  const [merging, setMerging] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analytics, currentWeights] = await Promise.all([
        fetchSkillMatrixAnalytics(),
        fetchSkillWeights(),
      ]);
      setMatrixData(analytics);
      setWeights(currentWeights);
    } catch (err: any) {
      toast(err.message || "Failed to load skill intelligence data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weights.interview_weight + weights.resume_weight !== 100) {
      toast("Weights must sum to exactly 100%", "error");
      return;
    }
    try {
      setSavingWeights(true);
      const updated = await updateSkillWeights(weights);
      setWeights(updated);
      toast("Weights saved and candidate skill proficiencies recalculated!", "success");
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to update weights", "error");
    } finally {
      setSavingWeights(false);
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceSkill.trim() || !targetSkill.trim()) {
      toast("Both source and canonical skill names are required.", "error");
      return;
    }
    const ok = await confirm({
      title: "Merge Duplicate Skills",
      message: `Merge "${sourceSkill}" into "${targetSkill}"? All candidate skill records and job opening requirements will be updated.`,
      confirmLabel: "Merge Skills",
      danger: true,
    });
    if (!ok) return;

    try {
      setMerging(true);
      const res = await mergeDuplicateSkills(sourceSkill.trim(), targetSkill.trim());
      toast(`Merged successfully! Updated ${res.updated_candidate_skills} records.`, "success");
      setSourceSkill("");
      setTargetSkill("");
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to merge skills", "error");
    } finally {
      setMerging(false);
    }
  };

  const handleExportCSV = () => {
    downloadSkillMatrixCsv().catch((e) => toast(e instanceof Error ? e.message : "Could not export.", "error"));
  };

  // Distinct skills for matrix table headers
  const allKnownSkills = Array.from(
    new Set(matrixData?.matrix_rows?.flatMap((r) => Object.keys(r.skills || {})) || [])
  ).slice(0, 15);

  const filteredRows = (matrixData?.matrix_rows || []).filter((r) => {
    if (searchFilter && !r.candidate_name.toLowerCase().includes(searchFilter.toLowerCase()) && !r.role.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    if (selectedSkillFilter !== "all" && !(r.skills || {})[selectedSkillFilter]) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles className="text-indigo-600 dark:text-indigo-400" size={26} />
            Skill Intelligence & Matrix (Screen 13)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Proficiency calculated from both resume evidence and interview evaluations. Configurable weights, alias normalization, and gap analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg shadow-sm"
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            onClick={loadData}
            className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300 rounded-lg shadow-sm"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-6">
        <button
          onClick={() => setActiveTab("matrix")}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "matrix"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers size={16} /> Skill Matrix & Heatmap
        </button>
        <button
          onClick={() => setActiveTab("demand")}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "demand"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <TrendingUp size={16} /> Job Demand & Talent Pool
        </button>
        <button
          onClick={() => setActiveTab("weights")}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "weights"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Sliders size={16} /> Weighting Engine Configuration
        </button>
        <button
          onClick={() => setActiveTab("merge")}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "merge"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <GitMerge size={16} /> Skill Master & Aliases
        </button>
      </div>

      {/* ── TAB 1: Skill Matrix & Heatmap ──────────────────────────────────── */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search candidates or roles..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter Skill:</span>
              <select
                value={selectedSkillFilter}
                onChange={(e) => setSelectedSkillFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="all">All Skills</option>
                {allKnownSkills.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 min-w-[180px]">Candidate</th>
                    <th className="py-3 px-3 min-w-[140px]">Role & Exp</th>
                    <th className="py-3 px-3 min-w-[200px]">Primary Skills</th>
                    {allKnownSkills.map((sk) => (
                      <th key={sk} className="py-3 px-2 text-center min-w-[80px]">
                        {sk}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredRows.map((row) => (
                    <tr key={row.candidate_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4">
                        <a
                          href={`/candidates/${row.candidate_id}`}
                          className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                        >
                          {row.candidate_name}
                        </a>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">{row.role || "—"}</div>
                        <div className="text-[11px] text-slate-400">{row.experience} yrs exp</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {row.primary_skills?.map((ps) => (
                            <span
                              key={ps}
                              className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px]"
                            >
                              ★ {ps}
                            </span>
                          ))}
                          {(!row.primary_skills || row.primary_skills.length === 0) && (
                            <span className="text-slate-400 italic text-[11px]">No primary skills</span>
                          )}
                        </div>
                      </td>
                      {allKnownSkills.map((sk) => {
                        const val = row.skills[sk];
                        if (val === undefined) {
                          return <td key={sk} className="py-3 px-2 text-center text-slate-300 dark:text-slate-600">—</td>;
                        }

                        let bgClass = "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
                        if (val >= 4.5) bgClass = "bg-emerald-500 text-white font-bold";
                        else if (val >= 4.0) bgClass = "bg-emerald-100 text-emerald-800 font-bold dark:bg-emerald-900/50 dark:text-emerald-300";
                        else if (val >= 3.0) bgClass = "bg-amber-100 text-amber-800 font-semibold dark:bg-amber-900/50 dark:text-amber-300";
                        else bgClass = "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";

                        return (
                          <td key={sk} className="py-3 px-2 text-center">
                            <span className={`inline-block px-2 py-1 rounded text-xs min-w-[36px] ${bgClass}`}>
                              {val.toFixed(1)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={allKnownSkills.length + 3} className="py-12 text-center text-slate-400">
                        No candidates matching the current skill criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Demand & Talent Pool ────────────────────────────────────── */}
      {activeTab === "demand" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 mb-1">
              <TrendingUp className="text-indigo-600" size={18} />
              Most In-Demand Skills Across Open Roles
            </h3>
            <p className="text-xs text-slate-500 mb-4">Required skills aggregated across all currently active job postings.</p>

            <div className="space-y-3">
              {(matrixData?.top_demanded || []).map((item, idx) => (
                <div key={item.skill} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-[11px]">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{item.skill}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                    {item.job_count} open role{item.job_count !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
              {(!matrixData?.top_demanded || matrixData.top_demanded.length === 0) && (
                <p className="text-sm text-slate-400 italic py-6 text-center">No open job postings with requirements.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 mb-1">
              <Layers className="text-emerald-600" size={18} />
              Candidate Talent Pool Strength
            </h3>
            <p className="text-xs text-slate-500 mb-4">Verified skills with average candidate proficiency in your company database.</p>

            <div className="space-y-3">
              {(matrixData?.talent_pool || []).map((item) => (
                <div key={item.skill} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm mr-2">{item.skill}</span>
                    <span className="text-[11px] text-slate-400">({item.candidate_count} candidates)</span>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded text-xs">
                    Avg {item.avg_proficiency}/5
                  </span>
                </div>
              ))}
              {(!matrixData?.talent_pool || matrixData.talent_pool.length === 0) && (
                <p className="text-sm text-slate-400 italic py-6 text-center">No candidate skills calculated yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Weighting Engine Configuration ─────────────────────────── */}
      {activeTab === "weights" && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-2xl">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 mb-2">
            <Sliders className="text-indigo-600" size={18} />
            Proficiency Calculation Weights
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            Configure how much weight is given to verified interview ratings vs. resume claims.
            Weights must sum to 100%. Changing weights triggers an automatic background recalculation of all candidate skill scores.
          </p>

          <form onSubmit={handleSaveWeights} className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-semibold mb-1">
                <span className="text-slate-700 dark:text-slate-300">Interview Evaluation Rating:</span>
                <span className="text-indigo-600 font-bold">{weights.interview_weight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={weights.interview_weight}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setWeights({ interview_weight: val, resume_weight: 100 - val });
                }}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">Verified scores submitted on interview scorecards.</p>
            </div>

            <div>
              <div className="flex justify-between text-sm font-semibold mb-1">
                <span className="text-slate-700 dark:text-slate-300">Resume Evidence & Experience:</span>
                <span className="text-indigo-600 font-bold">{weights.resume_weight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={weights.resume_weight}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setWeights({ resume_weight: val, interview_weight: 100 - val });
                }}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">Derived from years of experience and parsed frequency.</p>
            </div>

            <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-300 flex items-start gap-2">
              <ShieldCheck size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>Active Formula:</strong> Score = ({weights.interview_weight}% × Interview Rating) + ({weights.resume_weight}% × Resume Score).
                Candidates are never automatically rejected by scores alone.
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button
                type="submit"
                disabled={savingWeights}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50"
              >
                {savingWeights && <Loader2 size={14} className="animate-spin" />}
                Save Weights & Recalculate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB 4: Skill Master & Merge ────────────────────────────────────── */}
      {activeTab === "merge" && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-2xl space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2 mb-2">
              <GitMerge className="text-indigo-600" size={18} />
              Merge Duplicate Skills & Aliases
            </h3>
            <p className="text-xs text-slate-500">
              Combine duplicate or misspelled skill entries into one canonical master name across all candidate records and job openings.
            </p>
          </div>

          <form onSubmit={handleMerge} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Source Duplicate Skill (To be merged)
              </label>
              <input
                type="text"
                placeholder="e.g. ReactJS or Golang"
                value={sourceSkill}
                onChange={(e) => setSourceSkill(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Target Canonical Master Skill (Kept)
              </label>
              <input
                type="text"
                placeholder="e.g. React or Go"
                value={targetSkill}
                onChange={(e) => setTargetSkill(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                Merging will update all candidate skill profiles, job requirements, and matrix entries pointing to the source name.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={merging}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50"
              >
                {merging && <Loader2 size={14} className="animate-spin" />}
                Merge Into Master Skill
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
