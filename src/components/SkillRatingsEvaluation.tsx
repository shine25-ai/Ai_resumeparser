import React, { useState, useEffect } from "react";
import { Star, Plus, Trash2, Cpu, CheckCircle2, Award, Sparkles } from "lucide-react";
import type { SkillRatingItem, CategoryScoreItem } from "../types/interview";

interface SkillRatingsEvaluationProps {
  skillRatings: SkillRatingItem[];
  onChangeSkills: (skills: SkillRatingItem[]) => void;
  categoryScores?: CategoryScoreItem[];
  onChangeCategoryScores?: (scores: CategoryScoreItem[]) => void;
  aiScore?: number;
  onAiScoreCalculated?: (score: number, recommendation: string) => void;
  readOnly?: boolean;
}

const DEFAULT_CATEGORIES: { category: string; weightage: number }[] = [
  { category: "Programming Fundamentals", weightage: 15 },
  { category: "Coding Skills", weightage: 20 },
  { category: "Data Structures & Algorithms", weightage: 15 },
  { category: "Database", weightage: 10 },
  { category: "System Design", weightage: 10 },
  { category: "Framework Knowledge", weightage: 10 },
  { category: "Debugging & Problem Solving", weightage: 5 },
  { category: "Testing Knowledge", weightage: 5 },
  { category: "Cloud & DevOps", weightage: 5 },
  { category: "Security Awareness", weightage: 5 },
  { category: "Communication & Collaboration", weightage: 5 },
];

export const SkillRatingsEvaluation: React.FC<SkillRatingsEvaluationProps> = ({
  skillRatings,
  onChangeSkills,
  categoryScores,
  onChangeCategoryScores,
  onAiScoreCalculated,
  readOnly = false,
}) => {
  const [newSkillName, setNewSkillName] = useState("");
  const [categories, setCategories] = useState<CategoryScoreItem[]>(() => {
    if (categoryScores && categoryScores.length > 0) return categoryScores;
    return DEFAULT_CATEGORIES.map((cat) => ({
      category: cat.category,
      weightage: cat.weightage,
      rating: 1,
      score: (1 / 5) * cat.weightage,
      feedback: "",
    }));
  });

  // Sync categories if categoryScores prop changes
  useEffect(() => {
    if (categoryScores && categoryScores.length > 0) {
      setCategories(categoryScores);
    } else {
      const initial = DEFAULT_CATEGORIES.map((cat) => ({
        category: cat.category,
        weightage: cat.weightage,
        rating: 1,
        score: (1 / 5) * cat.weightage,
        feedback: "",
      }));
      setCategories(initial);
      if (onChangeCategoryScores) onChangeCategoryScores(initial);
    }
  }, [categoryScores]);

  // Default skills pre-populated if empty
  useEffect(() => {
    if (!skillRatings || skillRatings.length === 0) {
      onChangeSkills([
        { skill_name: "Java", rating: 1 },
        { skill_name: "SQL", rating: 1 },
        { skill_name: "DATA BRICKS", rating: 1 },
      ]);
    }
  }, []);

  // Compute AI Live Score automatically when category ratings change
  useEffect(() => {
    const totalAiScore = categories.reduce((sum, item) => sum + (item.score || 0), 0);
    const roundedScore = Math.round(totalAiScore);

    let rec = "Hire";
    if (roundedScore >= 85) rec = "Strong Hire";
    else if (roundedScore >= 70) rec = "Hire";
    else if (roundedScore >= 55) rec = "Hold";
    else rec = "No Hire";

    if (onAiScoreCalculated) {
      onAiScoreCalculated(roundedScore, rec);
    }
  }, [categories]);

  const handleAddSkill = () => {
    if (!newSkillName.trim()) return;
    const updated = [...skillRatings, { skill_name: newSkillName.trim(), rating: 1 }];
    onChangeSkills(updated);
    setNewSkillName("");
  };

  const handleRemoveSkill = (index: number) => {
    const updated = skillRatings.filter((_, i) => i !== index);
    onChangeSkills(updated);
  };

  const handleSkillRatingChange = (index: number, newRating: number) => {
    const updated = [...skillRatings];
    updated[index] = { ...updated[index], rating: newRating };
    onChangeSkills(updated);
  };

  const handleCategoryRatingChange = (index: number, newRating: number) => {
    const updated = [...categories];
    const cat = updated[index];
    const newScore = (newRating / 5) * cat.weightage;
    updated[index] = { ...cat, rating: newRating, score: Math.round(newScore * 10) / 10 };
    setCategories(updated);
    if (onChangeCategoryScores) onChangeCategoryScores(updated);
  };

  const currentAiScore = Math.round(categories.reduce((sum, item) => sum + (item.score || 0), 0));
  const aiRecommendation =
    currentAiScore >= 85
      ? "Strong Hire"
      : currentAiScore >= 70
      ? "Hire"
      : currentAiScore >= 55
      ? "Hold"
      : "No Hire";

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* SECTION 1: DYNAMIC TECH SKILL / SOFT SKILL RATINGS */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-indigo-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Technical & Soft Skill Evaluation (Dynamic Skills)
            </h4>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                placeholder="Add skill (e.g. Spring Boot, Docker)"
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <Plus size={13} /> Add Skill
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Skill Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {skillRatings.map((skill, index) => (
            <div
              key={index}
              className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-xs hover:border-indigo-300 transition-all"
            >
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                  {skill.skill_name}
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((starVal) => (
                    <button
                      key={starVal}
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleSkillRatingChange(index, starVal)}
                      className={`focus:outline-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <Star
                        size={14}
                        className={
                          starVal <= skill.rating
                            ? "text-amber-500 fill-amber-500"
                            : "text-slate-200"
                        }
                      />
                    </button>
                  ))}
                  <span className="text-[11px] font-bold text-slate-700 ml-1">
                    ({skill.rating}/5)
                  </span>
                </div>
              </div>

              {!readOnly && skillRatings.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(index)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: CATEGORY-WISE WEIGHTED EVALUATION & AI SCORE */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Category-wise Weighted Evaluation
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                Category scores & AI calculated interview performance score
              </p>
            </div>
          </div>

          {/* AI Score Badge */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
            <div className="text-center">
              <span className="text-[9px] text-indigo-600 font-bold uppercase tracking-wider block">
                AI Live Score
              </span>
              <span className="text-base font-black text-indigo-900">
                {currentAiScore} <span className="text-[10px] font-bold text-slate-500">/ 100</span>
              </span>
            </div>

            <div className="border-l border-indigo-200 pl-2.5 space-y-0.5">
              <span className="text-[9px] text-slate-500 font-semibold block">Recommendation</span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  aiRecommendation === "Strong Hire"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : aiRecommendation === "Hire"
                    ? "bg-teal-50 border-teal-200 text-teal-700"
                    : aiRecommendation === "Hold"
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                }`}
              >
                <Award size={11} /> {aiRecommendation}
              </span>
            </div>
          </div>
        </div>

        {/* Categories Rating Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-extrabold text-[11px]">
                <th className="py-2 px-3">Evaluation Category</th>
                <th className="py-2 px-3">Weightage</th>
                <th className="py-2 px-3">Rating Score</th>
                <th className="py-2 px-3">Category Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((cat, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2 px-3 font-semibold text-slate-900 text-xs">{cat.category}</td>
                  <td className="py-2 px-3 font-semibold text-slate-600 text-xs">{cat.weightage}%</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((sVal) => (
                        <button
                          key={sVal}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleCategoryRatingChange(idx, sVal)}
                          className={`focus:outline-none ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <Star
                            size={14}
                            className={
                              sVal <= cat.rating
                                ? "text-amber-500 fill-amber-500"
                                : "text-slate-200"
                            }
                          />
                        </button>
                      ))}
                      <span className="text-[10px] font-bold text-slate-700 ml-1">
                        ({cat.rating}/5)
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-bold text-indigo-700 text-xs">
                    {cat.score} / {cat.weightage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: HIRING MANAGER REVIEW & ROUND PROGRESS WORKFLOW */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
          Hiring Manager Review & Interview Workflow Progress
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs font-bold">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1">
            <CheckCircle2 size={13} /> HR Screening
          </div>
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1">
            <CheckCircle2 size={13} /> Technical R1
          </div>
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 py-1.5 px-2 rounded-lg">
            Technical R2
          </div>
          <div className="bg-white border border-slate-200 text-slate-400 py-1.5 px-2 rounded-lg">
            Managerial Round
          </div>
          <div className="bg-white border border-slate-200 text-slate-400 py-1.5 px-2 rounded-lg">
            Final Decision
          </div>
        </div>
      </div>
    </div>
  );
};
