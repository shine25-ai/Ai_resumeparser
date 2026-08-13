import React, { useState, useEffect } from "react";
import { Star, Plus, Trash2, Cpu, CheckCircle2, Award, Sparkles } from "lucide-react";
import type { SkillRatingItem, CategoryScoreItem } from "../types/interview";
import { getSkillsEvaluations, saveSkillsEvaluation, deleteSkillsEvaluation } from "../utils/Api";

interface SkillRatingsEvaluationProps {
  skillRatings: SkillRatingItem[];
  onChangeSkills: (skills: SkillRatingItem[]) => void;
  categoryScores?: CategoryScoreItem[];
  onChangeCategoryScores?: (scores: CategoryScoreItem[]) => void;
  aiScore?: number;
  onAiScoreCalculated?: (score: number, recommendation: string) => void;
  readOnly?: boolean;
}

export const SkillRatingsEvaluation: React.FC<SkillRatingsEvaluationProps> = ({
  skillRatings,
  onChangeSkills,
  categoryScores = [],
  onChangeCategoryScores,
  onAiScoreCalculated,
  readOnly = false,
}) => {
  const [newSkillName, setNewSkillName] = useState("");
  const [skillTemplates, setSkillTemplates] = useState<any[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number>(0);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);


  // Input state for adding new evaluation categories manually
  const [newCatName, setNewCatName] = useState("");
  const [newCatWeight, setNewCatWeight] = useState<number>(20);

  // Suggestion list state & dropdown visibility
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Fetch all templates from the database on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await getSkillsEvaluations();
        setSkillTemplates(data || []);
        setHasInitialized(true);
      } catch (err) {
        console.error("Failed to load skills evaluations templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  // Filter existing skills from database templates based on user input (e.g. "JA" -> "JAVA")
  const filteredSuggestions = React.useMemo(() => {
    if (!newSkillName.trim()) return [];
    const query = newSkillName.trim().toLowerCase();
    const existingSkillNames = skillRatings.map((s) => s.skill_name.toLowerCase());
    return skillTemplates.filter(
      (t) =>
        t.skill_name.toLowerCase().includes(query) &&
        !existingSkillNames.includes(t.skill_name.toLowerCase())
    );
  }, [newSkillName, skillTemplates, skillRatings]);

  const selectedSkillName = skillRatings[selectedSkillIndex]?.skill_name || "";

  // Get active template corresponding to selected skill
  const activeTemplate = React.useMemo(() => {
    if (!selectedSkillName) return null;
    return skillTemplates.find(
      (t) => t.skill_name.toLowerCase() === selectedSkillName.toLowerCase()
    );
  }, [selectedSkillName, skillTemplates]);

  // Compute categories to display in the table based on active template, and sync with parent categoryScores
  const activeCategories: CategoryScoreItem[] = React.useMemo(() => {
    if (!selectedSkillName) return [];
    const templateCats = activeTemplate?.categories || [];

    return templateCats.map((tCat: any) => {
      const matched = categoryScores.find(
        (c) => c.category.toLowerCase() === tCat.category.toLowerCase()
      );
      return {
        category: tCat.category,
        weightage: tCat.weightage,
        rating: matched ? matched.rating : 1,
        score: matched ? matched.score : Math.round((1 / 5) * tCat.weightage * 10) / 10,
        feedback: matched?.feedback || "",
      };
    });
  }, [selectedSkillName, activeTemplate, categoryScores]);

  // Ensure that all categories in the active template exist in the parent's categoryScores
  useEffect(() => {
    if (!selectedSkillName || !onChangeCategoryScores || !categoryScores) return;
    const templateCats = activeTemplate?.categories || [];
    let updated = [...categoryScores];
    let needsUpdate = false;

    templateCats.forEach((tCat: any) => {
      const exists = updated.some(
        (c) => c.category.toLowerCase() === tCat.category.toLowerCase()
      );
      if (!exists) {
        needsUpdate = true;
        updated.push({
          category: tCat.category,
          weightage: tCat.weightage,
          rating: 1,
          score: Math.round((1 / 5) * tCat.weightage * 10) / 10,
          feedback: "",
        });
      }
    });

    if (needsUpdate) {
      onChangeCategoryScores(updated);
    }
  }, [selectedSkillName, activeTemplate]);

  // Compute active AI Score
  const activeAiScore = React.useMemo(() => {
    if (activeCategories.length === 0) return 0;
    const totalScore = activeCategories.reduce((sum, item) => sum + (item.score || 0), 0);
    const sumWeightage = activeCategories.reduce((sum, item) => sum + item.weightage, 0);
    if (sumWeightage === 0) return 0;
    return Math.round((totalScore / sumWeightage) * 100);
  }, [activeCategories]);

  // Broadcast AI Live Score changes up to parent
  useEffect(() => {
    let rec = "Hire";
    if (activeAiScore >= 85) rec = "Strong Hire";
    else if (activeAiScore >= 70) rec = "Hire";
    else if (activeAiScore >= 55) rec = "Hold";
    else rec = "No Hire";

    if (onAiScoreCalculated) {
      onAiScoreCalculated(activeAiScore, rec);
    }
  }, [activeAiScore]);

  const handleSaveTemplateInternal = async (skillName: string, categories: any[]) => {
    try {
      const payload = {
        skill_name: skillName,
        categories: categories.map((c: any) => ({
          category: c.category,
          weightage: c.weightage,
        })),
      };

      const result = await saveSkillsEvaluation(payload);

      setSkillTemplates((prev) => {
        const idx = prev.findIndex(
          (t) => t.skill_name.toLowerCase() === skillName.toLowerCase()
        );
        const updated = [...prev];
        if (idx > -1) {
          updated[idx] = result;
        } else {
          updated.push(result);
        }
        return updated;
      });
    } catch (err: any) {
      console.error("Failed to save dynamic categories to DB:", err);
    }
  };

  const handleAddSkill = async (customName?: string) => {
    const targetName = customName || newSkillName;
    if (!targetName.trim()) return;
    const name = targetName.trim();

    // Check if skill already added
    const alreadyAdded = skillRatings.some(
      (s) => s.skill_name.toLowerCase() === name.toLowerCase()
    );
    if (alreadyAdded) {
      setNewSkillName("");
      setShowSuggestions(false);
      return;
    }

    // Save to backend if template doesn't exist
    const templateExists = skillTemplates.some(
      (t) => t.skill_name.toLowerCase() === name.toLowerCase()
    );
    if (!templateExists) {
      await handleSaveTemplateInternal(name, []);
    }

    // Add locally to parent skill ratings
    const updated = [...skillRatings, { skill_name: name, rating: 1 }];
    onChangeSkills(updated);

    // Select the newly added skill
    setSelectedSkillIndex(updated.length - 1);
    setNewSkillName("");
    setShowSuggestions(false);
  };

  const handleSelectSuggestion = (suggestedName: string) => {
    handleAddSkill(suggestedName);
  };

  const handleRemoveSkill = async (index: number) => {
    const skillToRemove = skillRatings[index];
    const updated = skillRatings.filter((_, i) => i !== index);
    onChangeSkills(updated);

    // Adjust selected index
    if (selectedSkillIndex >= updated.length) {
      setSelectedSkillIndex(Math.max(0, updated.length - 1));
    }

    // Delete matching template from database if present
    if (skillToRemove) {
      const template = skillTemplates.find(
        (t) => t.skill_name.toLowerCase() === skillToRemove.skill_name.toLowerCase()
      );
      if (template && (template.id || template._id)) {
        try {
          await deleteSkillsEvaluation(template.id || template._id);
          setSkillTemplates((prev) =>
            prev.filter((t) => (t.id || t._id) !== (template.id || template._id))
          );
        } catch (err) {
          console.error("Failed to delete skill evaluation template from DB:", err);
        }
      }
    }
  };

  const handleSkillRatingChange = (index: number, newRating: number) => {
    const updated = [...skillRatings];
    updated[index] = { ...updated[index], rating: newRating };
    onChangeSkills(updated);
  };

  const handleCategoryRatingChange = (catName: string, newRating: number, weightage: number) => {
    if (!onChangeCategoryScores) return;
    const newScore = Math.round((newRating / 5) * weightage * 10) / 10;

    const index = categoryScores.findIndex(
      (c) => c.category.toLowerCase() === catName.toLowerCase()
    );

    const updated = [...categoryScores];
    if (index > -1) {
      updated[index] = {
        ...updated[index],
        rating: newRating,
        score: newScore,
      };
    } else {
      updated.push({
        category: catName,
        weightage,
        rating: newRating,
        score: newScore,
        feedback: "",
      });
    }
    onChangeCategoryScores(updated);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim() || !selectedSkillName) return;
    const catName = newCatName.trim();

    // Check duplicate
    const exists = activeCategories.some(
      (c) => c.category.toLowerCase() === catName.toLowerCase()
    );
    if (exists) {
      alert("This category already exists for the selected skill.");
      return;
    }

    const newCatItem = {
      category: catName,
      weightage: newCatWeight,
    };

    const currentCats = activeTemplate?.categories || [];
    const updatedCats = [...currentCats, newCatItem];

    await handleSaveTemplateInternal(selectedSkillName, updatedCats);

    // Add to parent categoryScores
    if (onChangeCategoryScores) {
      const newScore = Math.round((1 / 5) * newCatWeight * 10) / 10;
      onChangeCategoryScores([
        ...categoryScores,
        {
          category: catName,
          weightage: newCatWeight,
          rating: 1,
          score: newScore,
          feedback: "",
        },
      ]);
    }

    setNewCatName("");
  };

  const handleRemoveCategory = async (catName: string) => {
    if (!selectedSkillName) return;

    const currentCats = activeTemplate?.categories || [];
    const updatedCats = currentCats.filter(
      (c: any) => c.category.toLowerCase() !== catName.toLowerCase()
    );

    await handleSaveTemplateInternal(selectedSkillName, updatedCats);

    // Remove from parent categoryScores
    if (onChangeCategoryScores) {
      onChangeCategoryScores(
        categoryScores.filter((c) => c.category.toLowerCase() !== catName.toLowerCase())
      );
    }
  };

  const totalWeightage = activeCategories.reduce((sum, item) => sum + item.weightage, 0);

  const aiRecommendation =
    activeAiScore >= 85
      ? "Strong Hire"
      : activeAiScore >= 70
        ? "Hire"
        : activeAiScore >= 55
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
            <div className="flex items-center gap-2 relative">
              <div className="relative">
                <input
                  type="text"
                  value={newSkillName}
                  onChange={(e) => {
                    setNewSkillName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Slight delay to allow clicking on a suggestion item
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                  placeholder="Type skill (e.g. Java, Python)"
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
                />

                {showSuggestions && filteredSuggestions.length > 0 && (
                  <ul className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto py-1 text-xs font-medium text-slate-800">
                    {filteredSuggestions.map((template) => (
                      <li
                        key={template.id || template._id || template.skill_name}
                        onMouseDown={(e) => {
                          e.preventDefault(); // prevent input blur before click resolves
                          handleSelectSuggestion(template.skill_name);
                        }}
                        className="px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <span className="font-bold uppercase tracking-wider">{template.skill_name}</span>
                        <span className="text-[10px] text-slate-400 font-medium">Database Skill</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleAddSkill()}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <Plus size={13} /> Add Skill
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Skill Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {skillRatings.map((skill, index) => {
            const isSelected = selectedSkillIndex === index;
            return (
              <div
                key={index}
                onClick={() => setSelectedSkillIndex(index)}
                className={`cursor-pointer border rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-xs transition-all ${isSelected
                  ? "ring-2 ring-indigo-500 bg-indigo-50/50 border-indigo-300"
                  : "bg-white border-slate-200 hover:border-indigo-300"
                  }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                      {skill.skill_name}
                    </span>
                    {isSelected && (
                      <span className="bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider scale-90">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((starVal) => (
                      <button
                        key={starVal}
                        type="button"
                        disabled={readOnly}
                        onClick={(e) => {
                          e.stopPropagation(); // Avoid changing selected index when rating
                          handleSkillRatingChange(index, starVal);
                        }}
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

                {!readOnly && skillRatings.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // Avoid triggering card click selection
                      handleRemoveSkill(index);
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: CATEGORY-WISE WEIGHTED EVALUATION & AI SCORE */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Category-wise Weighted Evaluation {selectedSkillName && `for "${selectedSkillName}"`}
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                {selectedSkillName
                  ? `Category scores & AI live score calculated for the selected skill: ${selectedSkillName}`
                  : "Please select a skill above to perform category evaluations"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Score Badge */}
            <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
              <div className="text-center">
                <span className="text-[9px] text-indigo-600 font-bold uppercase tracking-wider block">
                  Skill AI Score
                </span>
                <span className="text-base font-black text-indigo-900">
                  {activeAiScore} <span className="text-[10px] font-bold text-slate-500">/ 100</span>
                </span>
              </div>

              <div className="border-l border-indigo-200 pl-2.5 space-y-0.5">
                <span className="text-[9px] text-slate-500 font-semibold block">Recommendation</span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${aiRecommendation === "Strong Hire"
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
        </div>

        {selectedSkillName ? (
          <div className="space-y-3">
            {/* Categories Rating Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-extrabold text-[11px]">
                    <th className="py-2 px-3">Evaluation Category</th>
                    <th className="py-2 px-3">Weightage</th>
                    <th className="py-2 px-3">Rating Score</th>
                    <th className="py-2 px-3">Category Score</th>
                    {!readOnly && <th className="py-2 px-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCategories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={readOnly ? 4 : 5}
                        className="py-6 px-3 text-center text-slate-500 font-semibold"
                      >
                        No evaluation categories configured for this skill yet. Configure one below!
                      </td>
                    </tr>
                  ) : (
                    activeCategories.map((cat, idx) => (
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
                                onClick={() =>
                                  handleCategoryRatingChange(cat.category, sVal, cat.weightage)
                                }
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
                        {!readOnly && (
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCategory(cat.category)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Weightage Status */}
            <div className="flex justify-between items-center bg-slate-50 p-2 px-3 rounded-lg border border-slate-100 text-xs">
              <span className="font-bold text-slate-600">Total Template Weightage:</span>
              <span
                className={`font-black px-2 py-0.5 rounded-full ${totalWeightage === 100
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
              >
                {totalWeightage}% {totalWeightage !== 100 && "(Recommended: 100%)"}
              </span>
            </div>

            {/* Add Category Form */}
            {!readOnly && (
              <div className="bg-slate-50/50 border border-dashed border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3.5">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    New Category Name
                  </label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Memory Management, API Design"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="w-28 space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Weightage (%)
                  </label>
                  <input
                    type="number"
                    value={newCatWeight}
                    onChange={(e) => setNewCatWeight(Math.max(0, Math.min(100, Number(e.target.value))))}
                    min={0}
                    max={100}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <Plus size={13} /> Add Category
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 font-semibold text-xs bg-slate-50/30 rounded-xl border border-dashed border-slate-200">
            Please add or select a technical/soft skill card above to configure and evaluate categories.
          </div>
        )}
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
