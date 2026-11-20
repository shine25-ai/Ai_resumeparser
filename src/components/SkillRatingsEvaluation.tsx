import React, { useState, useEffect, useRef } from "react";
import { Star, Plus, Trash2, Award, Sparkles, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import type { SkillRatingItem, CategoryScoreItem } from "../types/interview";
import { getSkillsEvaluations, saveSkillsEvaluation } from "../utils/Api";
import { useFeedback } from "./ui/Feedback";

interface SkillRatingsEvaluationProps {
  skillRatings: SkillRatingItem[];
  onChangeSkills: (skills: SkillRatingItem[]) => void;
  categoryScores?: CategoryScoreItem[];
  onChangeCategoryScores?: (scores: CategoryScoreItem[]) => void;
  aiScore?: number;
  onAiScoreCalculated?: (score: number, recommendation: string) => void;
  readOnly?: boolean;
  currentRoundNumber?: number;
  currentInterviewType?: string;
  hrCallVerification?: string;
  allRounds?: any[];
  evaluatorName?: string;
}

const selectCategoriesForTable = (
  templateCategories?: { category: string; weightage?: number }[]
) => {
  if (!templateCategories || templateCategories.length === 0) {
    return [];
  }

  const valid = templateCategories
    .filter((c) => c.category && c.category.trim())
    .map((c) => ({
      category: c.category.trim(),
      weightage: Math.max(0, Number(c.weightage) || 0),
    }));

  // Deduplicate categories case-insensitively while preserving ordering
  const seen = new Set<string>();
  const uniqueCats: { category: string; weightage: number }[] = [];
  for (const item of valid) {
    const key = item.category.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCats.push(item);
    }
  }

  if (uniqueCats.length === 0) return [];

  // If none of the categories have weightage set (> 0), distribute 100% evenly
  const hasConfiguredWeights = uniqueCats.some((c) => c.weightage > 0);
  if (!hasConfiguredWeights) {
    const count = uniqueCats.length;
    const baseWeight = Math.floor(100 / count);
    const remainder = 100 - baseWeight * count;
    return uniqueCats.map((c, idx) => ({
      ...c,
      weightage: baseWeight + (idx === 0 ? remainder : 0),
    }));
  }

  return uniqueCats;
};

const DEFAULT_RECOMMENDED_SKILLS = [
  "Communication & Soft Skills",
  "Problem Solving & Analytical",
  "Role Technical Depth",
  "System Design & Process",
  "Teamwork & Culture Fit",
];

export const SkillRatingsEvaluation: React.FC<SkillRatingsEvaluationProps> = ({
  skillRatings,
  onChangeSkills,
  categoryScores = [],
  onChangeCategoryScores,
  onAiScoreCalculated,
  readOnly = false,
  currentRoundNumber: _currentRoundNumber,
  currentInterviewType: _currentInterviewType,
  hrCallVerification: _hrCallVerification,
  allRounds: _allRounds = [],
  evaluatorName,
}) => {
  // Resolve current logged in evaluator name from props or localStorage
  const currentLoggedInName = React.useMemo(() => {
    if (evaluatorName && evaluatorName.trim()) return evaluatorName.trim();
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const uObj = JSON.parse(rawUser);
        return uObj.full_name || uObj.name || uObj.email || "";
      }
    } catch {
      /* ignore */
    }
    return "";
  }, [evaluatorName]);

  const { toast, confirm } = useFeedback();

  const [newSkillName, setNewSkillName] = useState("");
  const [skillTemplates, setSkillTemplates] = useState<any[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState<number>(0);

  // Input state for adding new evaluation categories manually
  const [newCatName, setNewCatName] = useState("");
  const [newCatWeight, setNewCatWeight] = useState<number>(20);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);

  // Suggestion list state & dropdown visibility
  const [showSuggestions, setShowSuggestions] = useState(false);

  const autoPopulatedSkillsRef = useRef<Set<string>>(new Set());

  const selectedSkillName = skillRatings[selectedSkillIndex]?.skill_name || "";

  // Fetch active template (with categories) for selectedSkillName if not already loaded
  useEffect(() => {
    if (!selectedSkillName) return;
    const existingTemplate = skillTemplates.find(
      (t) => t.skill_name.toLowerCase() === selectedSkillName.toLowerCase()
    );
    // If template not loaded or template categories missing, fetch full template details
    if (!existingTemplate || !existingTemplate.categories) {
      getSkillsEvaluations(selectedSkillName, true)
        .then((data) => {
          if (data && data.length > 0) {
            setSkillTemplates((prev) => {
              const map = new Map();
              prev.forEach((t) => map.set(t.skill_name.toLowerCase(), t));
              data.forEach((t) => map.set(t.skill_name.toLowerCase(), t));
              return Array.from(map.values());
            });
          }
        })
        .catch((err) => console.error("Error fetching template for skill:", err));
    }
  }, [selectedSkillName, skillTemplates]);

  // Debounced backend search when typing in skill input field (lightweight, excludes categories)
  useEffect(() => {
    const query = newSkillName.trim();
    if (!query) return;

    const timer = setTimeout(() => {
      getSkillsEvaluations(query, false)
        .then((data) => {
          if (data && data.length > 0) {
            setSkillTemplates((prev) => {
              const map = new Map();
              prev.forEach((t) => map.set(t.skill_name.toLowerCase(), t));
              data.forEach((t) => {
                const existing = map.get(t.skill_name.toLowerCase());
                // Keep existing categories if already loaded
                map.set(t.skill_name.toLowerCase(), {
                  ...t,
                  categories: existing?.categories || t.categories,
                });
              });
              return Array.from(map.values());
            });
          }
        })
        .catch((err) => console.error("Error searching skill templates:", err));
    }, 250);

    return () => clearTimeout(timer);
  }, [newSkillName]);

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

  // Get active template corresponding to selected skill
  const activeTemplate = React.useMemo(() => {
    if (!selectedSkillName) return null;
    return skillTemplates.find(
      (t) => t.skill_name.toLowerCase() === selectedSkillName.toLowerCase()
    );
  }, [selectedSkillName, skillTemplates]);

  // Compute categories to display in the table strictly for the currently selected skill
  const activeCategories: CategoryScoreItem[] = React.useMemo(() => {
    if (!selectedSkillName) return [];
    const selectedSkillLower = selectedSkillName.trim().toLowerCase();
    const templateCatNames = (activeTemplate?.categories || []).map((t: any) =>
      (t.category || "").trim().toLowerCase()
    );

    return (categoryScores || [])
      .filter((c) => {
        if (!c.category || !c.category.trim()) return false;
        const catLower = c.category.trim().toLowerCase();
        const itemSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";

        // 1. If category item has explicit skill_name, check if it matches active skill
        if (itemSkillLower) {
          return itemSkillLower === selectedSkillLower;
        }

        // 2. Fallback for untagged items: match if category belongs to activeTemplate's category list for this skill
        if (templateCatNames.includes(catLower)) {
          return true;
        }

        // 3. Fallback: if only 1 skill in skillRatings, associate it with that skill
        if (skillRatings.length === 1 && skillRatings[0].skill_name.trim().toLowerCase() === selectedSkillLower) {
          return true;
        }

        return false;
      })
      .map((c) => {
        const rating = c.rating || 1;
        const weightage = c.weightage || 0;
        const score =
          c.score !== undefined
            ? c.score
            : Math.round((rating / 5) * weightage * 10) / 10;
        return {
          ...c,
          skill_name: (c as any).skill_name || selectedSkillName,
          rating,
          weightage,
          score,
        };
      });
  }, [selectedSkillName, activeTemplate, categoryScores, skillRatings]);

  // Auto-populate category table when a skill is selected IF NO categories are already added for that skill
  useEffect(() => {
    if (!selectedSkillName || !onChangeCategoryScores) return;

    const skillLower = selectedSkillName.trim().toLowerCase();

    // Condition: IF already added any value on that skill related on table, do not add automatically values
    if (activeCategories.length > 0) {
      autoPopulatedSkillsRef.current.add(skillLower);
      return;
    }

    // Check if categoryScores array already has items for this selected skill
    const existingForSkill = (categoryScores || []).filter((c) => {
      const catName = (c.category || "").trim();
      if (!catName) return false;
      const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
      if (cSkillLower) return cSkillLower === skillLower;
      if (skillRatings.length === 1 && skillRatings[0].skill_name.trim().toLowerCase() === skillLower) return true;
      return false;
    });

    if (existingForSkill.length > 0) {
      autoPopulatedSkillsRef.current.add(skillLower);
      return;
    }

    if (autoPopulatedSkillsRef.current.has(skillLower)) {
      return;
    }

    const templateCats = activeTemplate?.categories || [];
    const selectedCats = selectCategoriesForTable(templateCats);

    if (selectedCats.length === 0) return;

    const newCategoryItems: CategoryScoreItem[] = selectedCats.map((cat) => {
      const rating = 1;
      const weightage = cat.weightage;
      const score = Math.round((rating / 5) * weightage * 10) / 10;
      return {
        skill_name: selectedSkillName,
        category: cat.category,
        weightage,
        rating,
        score,
        feedback: "",
      } as any;
    });

    autoPopulatedSkillsRef.current.add(skillLower);
    onChangeCategoryScores([...(categoryScores || []), ...newCategoryItems]);
  }, [selectedSkillName, activeTemplate, activeCategories, categoryScores, skillRatings, onChangeCategoryScores]);

  // Smart default weight capacity for new category additions
  const availableWeightCapacity = React.useMemo(() => {
    const total = activeCategories.reduce((sum, item) => sum + item.weightage, 0);
    return Math.max(0, 100 - total);
  }, [activeCategories]);

  useEffect(() => {
    if (availableWeightCapacity > 0) {
      setNewCatWeight(Math.min(25, Math.max(5, availableWeightCapacity)));
    } else {
      setNewCatWeight(10);
    }
  }, [availableWeightCapacity]);

  // Filter template categories for the active skill based on user input for suggestion dropdown
  const filteredCategorySuggestions = React.useMemo(() => {
    if (!selectedSkillName) return [];
    const templateCats = activeTemplate?.categories || [];
    const existingCatNames = activeCategories.map((c) => c.category.toLowerCase());
    const query = newCatName.trim().toLowerCase();

    return templateCats.filter((tCat: any) => {
      const isNotAdded = !existingCatNames.includes(tCat.category.toLowerCase());
      if (!isNotAdded) return false;
      if (!query) return true; // Show all available template categories on focus
      return tCat.category.toLowerCase().includes(query);
    });
  }, [selectedSkillName, activeTemplate, activeCategories, newCatName]);

  const handleSelectCatSuggestion = (catItem: { category: string; weightage?: number }) => {
    setNewCatName(catItem.category);
    if (catItem.weightage && Number(catItem.weightage) > 0) {
      setNewCatWeight(Number(catItem.weightage));
    }
    setShowCatSuggestions(false);
    setWeightError(null);
  };

  // Compute active AI Score for selected skill (direct cumulative points earned out of 100)
  const activeAiScore = React.useMemo(() => {
    if (activeCategories.length === 0) return 0;
    const totalScore = activeCategories.reduce((sum, item) => sum + (item.score || 0), 0);
    return Math.min(100, Math.round(totalScore));
  }, [activeCategories]);

  // Broadcast AI Live Score changes up to parent
  useEffect(() => {
    if (activeCategories.length === 0 || skillRatings.length === 0) {
      if (onAiScoreCalculated) {
        onAiScoreCalculated(0, "Pending");
      }
      return;
    }

    let rec = "Hire";
    if (activeAiScore >= 85) rec = "Strong Hire";
    else if (activeAiScore >= 70) rec = "Hire";
    else if (activeAiScore >= 55) rec = "Hold";
    else rec = "No Hire";

    if (onAiScoreCalculated) {
      onAiScoreCalculated(activeAiScore, rec);
    }
  }, [activeAiScore, activeCategories.length, skillRatings.length, onAiScoreCalculated]);

  const handleSaveTemplateInternal = async (skillName: string, categories: any[]) => {
    try {
      // Strictly deduplicate categories case-insensitively before sending payload
      const uniqueCats: any[] = [];
      const seenNames = new Set<string>();

      (categories || []).forEach((c: any) => {
        const catNameLower = (c.category || "").trim().toLowerCase();
        if (catNameLower && !seenNames.has(catNameLower)) {
          seenNames.add(catNameLower);
          uniqueCats.push({
            category: c.category.trim(),
            weightage: c.weightage,
          });
        }
      });

      const payload = {
        skill_name: skillName,
        categories: uniqueCats,
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
    const updated = [
      ...skillRatings,
      {
        skill_name: name,
        rating: 1,
        evaluator_name: currentLoggedInName || undefined,
      },
    ];
    onChangeSkills(updated);

    // Select the newly added skill
    setSelectedSkillIndex(updated.length - 1);
    setNewSkillName("");
    setShowSuggestions(false);
    toast(`Skill "${name}" added successfully.`, "success");
  };

  const handleSelectSuggestion = (suggestedName: string) => {
    handleAddSkill(suggestedName);
  };

  const handleRemoveSkill = async (index: number) => {
    const skillToRemove = skillRatings[index];
    if (!skillToRemove) return;

    const ok = await confirm({
      title: "Delete Skill Evaluation?",
      message: `Are you sure you want to delete the skill "${skillToRemove.skill_name}"? All associated category evaluations will also be removed.`,
      confirmLabel: "Yes, Delete",
      danger: true,
    });
    if (!ok) return;

    const updated = skillRatings.filter((_, i) => i !== index);
    onChangeSkills(updated);

    // Adjust selected index
    if (selectedSkillIndex >= updated.length) {
      setSelectedSkillIndex(Math.max(0, updated.length - 1));
    }

    if (skillToRemove && onChangeCategoryScores) {
      const nameLower = skillToRemove.skill_name.trim().toLowerCase();
      onChangeCategoryScores(
        (categoryScores || []).filter((c) => {
          const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
          return cSkillLower !== nameLower;
        })
      );
      autoPopulatedSkillsRef.current.add(nameLower);
    }
    toast(`Skill "${skillToRemove.skill_name}" removed.`, "info");
  };

  // Clear weightage error when selected skill changes
  useEffect(() => {
    setWeightError(null);
  }, [selectedSkillIndex, selectedSkillName]);

  // Helper to dynamically calculate overall skill rating from its category breakdown scores
  const calculateSkillRatingFromCategories = (
    skillName: string,
    allCategoryScores: CategoryScoreItem[]
  ): number | null => {
    if (!skillName) return null;
    const sLower = skillName.trim().toLowerCase();
    const cats = (allCategoryScores || []).filter((c) => {
      const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
      if (cSkillLower) return cSkillLower === sLower;
      if (skillRatings.length === 1 && skillRatings[0].skill_name.trim().toLowerCase() === sLower) return true;
      return false;
    });

    if (cats.length === 0) return null;

    const totalWeight = cats.reduce((sum, c) => sum + (c.weightage || 0), 0);
    if (totalWeight > 0) {
      const weightedSum = cats.reduce(
        (sum, c) => sum + ((c.rating || 0) * (c.weightage || 0)),
        0
      );
      const result = weightedSum / totalWeight;
      return Math.round(result * 10) / 10;
    } else {
      const sumRatings = cats.reduce((sum, c) => sum + (c.rating || 0), 0);
      const result = sumRatings / cats.length;
      return Math.round(result * 10) / 10;
    }
  };

  const handleCategoryRatingChange = (catName: string, newRating: number, weightage: number) => {
    if (!onChangeCategoryScores || !selectedSkillName) return;
    const newScore = Math.round((newRating / 5) * weightage * 10) / 10;
    const selectedSkillLower = selectedSkillName.trim().toLowerCase();
    const catNameLower = catName.trim().toLowerCase();

    const index = categoryScores.findIndex((c) => {
      const cCatLower = (c.category || "").trim().toLowerCase();
      const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
      return cCatLower === catNameLower && (!cSkillLower || cSkillLower === selectedSkillLower);
    });

    const updated = [...categoryScores];
    if (index > -1) {
      updated[index] = {
        ...updated[index],
        skill_name: (updated[index] as any).skill_name || selectedSkillName,
        rating: newRating,
        score: newScore,
      };
    } else {
      updated.push({
        skill_name: selectedSkillName,
        category: catName,
        weightage,
        rating: newRating,
        score: newScore,
        feedback: "",
      } as any);
    }
    onChangeCategoryScores(updated);

    // Automatically sync overall rating for the skill when category ratings update!
    const newOverall = calculateSkillRatingFromCategories(selectedSkillName, updated);
    if (newOverall !== null && onChangeSkills) {
      const updatedSkills = skillRatings.map((s, idx) => {
        if (s.skill_name.trim().toLowerCase() === selectedSkillLower || idx === selectedSkillIndex) {
          return {
            ...s,
            rating: newOverall,
            evaluator_name: s.evaluator_name || currentLoggedInName || undefined,
          };
        }
        return s;
      });
      onChangeSkills(updatedSkills);
    }
  };

  // Debounce timer for weightage input template saves
  const saveTemplateDebounceTimerRef = useRef<any>(null);

  const saveTemplateDebounced = (skillName: string, categories: any[]) => {
    if (saveTemplateDebounceTimerRef.current) {
      clearTimeout(saveTemplateDebounceTimerRef.current);
    }
    saveTemplateDebounceTimerRef.current = setTimeout(() => {
      handleSaveTemplateInternal(skillName, categories);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTemplateDebounceTimerRef.current) {
        clearTimeout(saveTemplateDebounceTimerRef.current);
      }
    };
  }, []);

  const handleCategoryWeightageChange = (catName: string, rawVal: number) => {
    if (!selectedSkillName) return;
    const selectedSkillLower = selectedSkillName.trim().toLowerCase();
    const catNameLower = catName.trim().toLowerCase();

    const otherTotal = activeCategories
      .filter((c) => (c.category || "").trim().toLowerCase() !== catNameLower)
      .reduce((sum, item) => sum + item.weightage, 0);

    const newWeight = Math.max(0, Math.min(100, isNaN(rawVal) ? 0 : rawVal));
    const newTotal = otherTotal + newWeight;

    if (newTotal > 100) {
      setWeightError(
        `Total weightage is currently ${newTotal}% (Recommended: 100%). You can balance individual category weights to reach 100%.`
      );
    } else {
      setWeightError(null);
    }

    const currentCats = activeTemplate?.categories || [];
    const updatedCats = currentCats.map((c: any) => {
      if ((c.category || "").trim().toLowerCase() === catNameLower) {
        return { ...c, weightage: newWeight };
      }
      return c;
    });

    // Debounce backend template save so typing digits does not trigger multiple API requests
    saveTemplateDebounced(selectedSkillName, updatedCats);

    if (onChangeCategoryScores) {
      const updatedScores = categoryScores.map((c) => {
        const cCatLower = (c.category || "").trim().toLowerCase();
        const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";

        if (cCatLower === catNameLower && (!cSkillLower || cSkillLower === selectedSkillLower)) {
          const rating = c.rating || 1;
          const newScore = Math.round((rating / 5) * newWeight * 10) / 10;
          return {
            ...c,
            skill_name: (c as any).skill_name || selectedSkillName,
            weightage: newWeight,
            score: newScore,
          };
        }
        return c;
      });
      onChangeCategoryScores(updatedScores);

      const newOverall = calculateSkillRatingFromCategories(selectedSkillName, updatedScores);
      if (newOverall !== null && onChangeSkills) {
        const updatedSkills = skillRatings.map((s, idx) => {
          if (s.skill_name.trim().toLowerCase() === selectedSkillLower || idx === selectedSkillIndex) {
            return {
              ...s,
              rating: newOverall,
              evaluator_name: s.evaluator_name || currentLoggedInName || undefined,
            };
          }
          return s;
        });
        onChangeSkills(updatedSkills);
      }
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim() || !selectedSkillName) return;
    const catName = newCatName.trim();
    const catNameLower = catName.toLowerCase();

    // Check duplicate in active categories currently displayed
    const exists = activeCategories.some(
      (c) => (c.category || "").trim().toLowerCase() === catNameLower
    );
    if (exists) {
      setWeightError(`Category "${catName}" is already added to this evaluation.`);
      toast(`Category "${catName}" is already added to this evaluation.`, "warning");
      return;
    }

    if (newCatWeight <= 0) {
      setWeightError("Category weightage must be greater than 0%.");
      toast("Category weightage must be greater than 0%.", "warning");
      return;
    }

    const currentTotal = activeCategories.reduce((sum, item) => sum + item.weightage, 0);
    const newTotal = currentTotal + newCatWeight;

    if (newTotal > 100) {
      setWeightError(
        `Category "${catName}" added. Total weightage is now ${newTotal}% (Recommended: 100%). You can adjust individual weights to balance to 100%.`
      );
    } else {
      setWeightError(null);
    }

    // Update backend template list without appending duplicate category names
    const currentCats = activeTemplate?.categories || [];
    const catExistsInTemplate = currentCats.some(
      (c: any) => (c.category || "").trim().toLowerCase() === catNameLower
    );

    let updatedCats: any[];
    if (catExistsInTemplate) {
      updatedCats = currentCats.map((c: any) => {
        if ((c.category || "").trim().toLowerCase() === catNameLower) {
          return { ...c, weightage: newCatWeight };
        }
        return c;
      });
    } else {
      updatedCats = [...currentCats, { category: catName, weightage: newCatWeight }];
    }

    await handleSaveTemplateInternal(selectedSkillName, updatedCats);

    // Add to parent categoryScores tagged with selectedSkillName
    if (onChangeCategoryScores) {
      const newScore = Math.round((1 / 5) * newCatWeight * 10) / 10;
      const updatedScores = [
        ...categoryScores,
        {
          skill_name: selectedSkillName,
          category: catName,
          weightage: newCatWeight,
          rating: 1,
          score: newScore,
          feedback: "",
        } as any,
      ];
      onChangeCategoryScores(updatedScores);

      const newOverall = calculateSkillRatingFromCategories(selectedSkillName, updatedScores);
      if (newOverall !== null && onChangeSkills) {
        const updatedSkills = skillRatings.map((s, idx) => {
          if (s.skill_name.trim().toLowerCase() === selectedSkillName.trim().toLowerCase() || idx === selectedSkillIndex) {
            return {
              ...s,
              rating: newOverall,
              evaluator_name: s.evaluator_name || currentLoggedInName || undefined,
            };
          }
          return s;
        });
        onChangeSkills(updatedSkills);
      }
    }

    setNewCatName("");
    toast(`Category "${catName}" added (${newCatWeight}% weightage) & saved.`, "success");
  };

  const handleRemoveCategory = async (catName: string) => {
    if (!selectedSkillName || !onChangeCategoryScores) return;
    const catItem = activeCategories.find((c) => c.category === catName);
    const weightText = catItem ? ` (${catItem.weightage}% weightage)` : "";

    const ok = await confirm({
      title: "Delete Category?",
      message: `Are you sure you want to delete the category "${catName}"${weightText}? This will remove its weightage and score from "${selectedSkillName}".`,
      confirmLabel: "Yes, Delete",
      danger: true,
    });
    if (!ok) return;

    setWeightError(null);
    const selectedSkillLower = selectedSkillName.trim().toLowerCase();
    const catNameLower = catName.trim().toLowerCase();

    // 1. Remove category only for the selected skill from parent categoryScores
    const updatedScores = categoryScores.filter((c) => {
      const cCatLower = (c.category || "").trim().toLowerCase();
      const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
      if (cCatLower === catNameLower && (!cSkillLower || cSkillLower === selectedSkillLower)) {
        return false;
      }
      return true;
    });
    onChangeCategoryScores(updatedScores);

    const newOverall = calculateSkillRatingFromCategories(selectedSkillName, updatedScores);
    if (newOverall !== null && onChangeSkills) {
      const updatedSkills = skillRatings.map((s, idx) => {
        if (s.skill_name.trim().toLowerCase() === selectedSkillLower || idx === selectedSkillIndex) {
          return {
            ...s,
            rating: newOverall,
            evaluator_name: s.evaluator_name || currentLoggedInName || undefined,
          };
        }
        return s;
      });
      onChangeSkills(updatedSkills);
    }

    // 2. Also remove from activeTemplate so it does not persist in template or reappear
    const currentCats = activeTemplate?.categories || [];
    const updatedCats = currentCats.filter(
      (c: any) => (c.category || "").trim().toLowerCase() !== catNameLower
    );
    await handleSaveTemplateInternal(selectedSkillName, updatedCats);
    toast(`Category "${catName}" deleted.`, "info");
  };

  const handleAutoBalanceWeights = async () => {
    if (activeCategories.length === 0 || !selectedSkillName) return;
    const currentTotal = activeCategories.reduce((sum, c) => sum + (c.weightage || 0), 0);
    if (currentTotal === 0) return;

    const ok = await confirm({
      title: "Auto-Balance Weightages?",
      message: `Are you sure you want to scale all category weightages proportionally so they total 100%?`,
      confirmLabel: "Balance to 100%",
    });
    if (!ok) return;

    let runningSum = 0;
    const newWeights = activeCategories.map((cat, idx) => {
      if (idx === activeCategories.length - 1) {
        return Math.max(1, 100 - runningSum);
      }
      const scaled = Math.round((cat.weightage / currentTotal) * 100);
      runningSum += scaled;
      return scaled;
    });

    const selectedSkillLower = selectedSkillName.trim().toLowerCase();
    const updated = (categoryScores || []).map((c) => {
      const cSkillLower = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
      if (
        cSkillLower === selectedSkillLower ||
        (skillRatings.length === 1 && skillRatings[0].skill_name.trim().toLowerCase() === selectedSkillLower)
      ) {
        const catIdx = activeCategories.findIndex(
          (ac) => ac.category.trim().toLowerCase() === (c.category || "").trim().toLowerCase()
        );
        if (catIdx !== -1) {
          const newWeight = newWeights[catIdx];
          const newScore = Math.round(((c.rating || 0) / 5) * newWeight * 10) / 10;
          return {
            ...c,
            weightage: newWeight,
            score: newScore,
          };
        }
      }
      return c;
    });

    if (onChangeCategoryScores) {
      onChangeCategoryScores(updated);
    }

    saveTemplateDebounced(
      selectedSkillName,
      activeCategories.map((c, i) => ({ category: c.category, weightage: newWeights[i] }))
    );
    setWeightError(null);
    toast("Category weightages balanced to 100% & saved.", "success");
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

  const availableSuggestions = React.useMemo(() => {
    const fromTemplates = skillTemplates.map((t) => t.skill_name).filter(Boolean);
    const combined = Array.from(new Set([...fromTemplates, ...DEFAULT_RECOMMENDED_SKILLS]));
    return combined
      .filter((name) => !skillRatings.some((s) => s.skill_name.toLowerCase() === name.toLowerCase()))
      .slice(0, 5);
  }, [skillTemplates, skillRatings]);

  return (
    <div className="space-y-6 font-sans text-slate-800">
      {/* SECTION 1: DYNAMIC TECH SKILL / SOFT SKILL RATINGS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        {/* Clean Header Bar */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
              Skill Assessment & Competencies
            </h4>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select or add competencies to evaluate for this candidate
            </p>
          </div>
        </div>

        {/* Dedicated Full-Width Add Custom Skill Bar */}
        {!readOnly && (
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => {
                  setNewSkillName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkill())}
                placeholder="Type custom skill to add (e.g. System Design, Communication, Python)..."
                className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
              />

              {showSuggestions && filteredSuggestions.length > 0 && (
                <ul className="absolute left-0 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto py-1 text-xs font-medium text-slate-800 animate-in fade-in duration-150">
                  {filteredSuggestions.map((template) => (
                    <li
                      key={template.id || template._id || template.skill_name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(template.skill_name);
                      }}
                      className="px-3.5 py-2 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-50 last:border-0"
                    >
                      <span className="font-bold uppercase tracking-wider">{template.skill_name}</span>
                      <span className="text-[11px] text-slate-400 font-medium">Database Skill</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleAddSkill()}
              className="h-10 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
            >
              <Plus size={14} /> Add Skill
            </button>
          </div>
        )}

        {/* Dynamic Skill Chips Strip */}
        <div className="space-y-3.5">
          {skillRatings.length === 0 ? (
            <div className="p-4 sm:p-5 bg-indigo-50/40 border border-indigo-100/80 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                <Sparkles size={14} className="text-indigo-600" />
                <span>Quick-Start: Click any recommended skill to begin scoring</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {availableSuggestions.map((recSkill, rIdx) => (
                  <button
                    key={rIdx}
                    type="button"
                    onClick={() => handleAddSkill(recSkill)}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200/90 hover:border-indigo-600 text-indigo-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer group text-left"
                  >
                    <span className="truncate">{recSkill}</span>
                    <Plus size={13} className="text-indigo-500 group-hover:text-white shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
              {skillRatings.map((skill, index) => {
                const isSelected = selectedSkillIndex === index;
                return (
                  <div
                    key={index}
                    onClick={() => setSelectedSkillIndex(index)}
                    className={`group relative flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs select-none ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                    }`}
                  >
                    <span className="uppercase tracking-wide font-extrabold whitespace-nowrap">
                      {skill.skill_name}
                    </span>

                    {/* Star rating pill */}
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black ${
                        isSelected ? "bg-white/20 text-white" : "bg-white text-slate-700 border border-slate-200"
                      }`}
                    >
                      <Star
                        size={11}
                        className={
                          skill.rating > 0
                            ? isSelected
                              ? "text-amber-300 fill-amber-300"
                              : "text-amber-500 fill-amber-500"
                            : "text-slate-300"
                        }
                      />
                      <span>{skill.rating % 1 === 0 ? skill.rating : Number(skill.rating).toFixed(1)}/5</span>
                    </div>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSkill(index);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isSelected
                            ? "text-white/70 hover:text-white hover:bg-white/20"
                            : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        }`}
                        title="Remove skill"
                        aria-label="Remove skill"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Skill Rating Sub-bar */}
          {skillRatings[selectedSkillIndex] && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-extrabold text-slate-800">
                  Overall Rating for <span className="text-indigo-600 uppercase tracking-wide">{skillRatings[selectedSkillIndex].skill_name}</span>:
                </span>

                {/* Non-editable Star Rating Display */}
                <div className="flex items-center gap-1 select-none" title="Overall rating computed from category ratings">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const currentRating = Number(skillRatings[selectedSkillIndex].rating) || 0;
                    const isFilled = currentRating >= starVal;
                    const isHalf = !isFilled && currentRating >= starVal - 0.5;

                    return (
                      <div
                        key={starVal}
                        className="p-0.5 cursor-default"
                      >
                        <Star
                          size={18}
                          className={`${
                            isFilled
                              ? "text-amber-400 fill-amber-400"
                              : isHalf
                              ? "text-amber-400 fill-amber-400/50"
                              : "text-slate-300"
                          } transition-colors`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Non-editable Rating Display Badge */}
                <div
                  className="flex items-center gap-1.5 bg-slate-100/90 px-3 py-1 rounded-xl border border-slate-200/90 shadow-2xs select-none"
                  title="Auto-calculated from category ratings"
                >
                  <span className="text-xs font-black text-slate-900 px-0.5">
                    {skillRatings[selectedSkillIndex].rating !== undefined && skillRatings[selectedSkillIndex].rating !== null && !isNaN(Number(skillRatings[selectedSkillIndex].rating))
                      ? (Number(skillRatings[selectedSkillIndex].rating) % 1 === 0
                          ? Number(skillRatings[selectedSkillIndex].rating)
                          : Number(skillRatings[selectedSkillIndex].rating).toFixed(1))
                      : "0.0"}
                  </span>
                  <span className="text-xs font-bold text-slate-400">/ 5.0</span>
                </div>
              </div>

              {(skillRatings[selectedSkillIndex].evaluator_name || currentLoggedInName) && (
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Evaluator: <strong className="text-slate-700">{skillRatings[selectedSkillIndex].evaluator_name || currentLoggedInName}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: CATEGORY-WISE WEIGHTED EVALUATION & AI SCORE (Only when skill is selected) */}
      {selectedSkillName && skillRatings.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                <Award size={18} />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Category Breakdown: "{selectedSkillName}"</span>
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Weightage must balance to 100% across categories for accurate score calculation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* AI Score Badge */}
              <div className="flex items-center gap-3 bg-slate-50/80 border border-slate-200 px-3.5 py-2 rounded-xl">
                <div className="text-center">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                    Skill Score
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {activeCategories.length === 0 ? "--" : activeAiScore} <span className="text-[10px] font-bold text-slate-400">/ 100</span>
                  </span>
                </div>

                <div className="border-l border-slate-200 pl-3 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold block">Total Weight</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      totalWeightage === 100
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : totalWeightage < 100
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}
                  >
                    {totalWeightage === 100 ? (
                      <>
                        <CheckCircle2 size={10} /> 100% Balanced
                      </>
                    ) : totalWeightage < 100 ? (
                      <>
                        <AlertCircle size={10} /> {totalWeightage}% ({100 - totalWeightage}% unassigned)
                      </>
                    ) : (
                      <>
                        <AlertCircle size={10} /> {totalWeightage}% (Over 100%)
                      </>
                    )}
                  </span>
                </div>

                <div className="border-l border-slate-200 pl-3 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-semibold block">Readiness</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      activeCategories.length === 0
                        ? "bg-slate-100 border-slate-200 text-slate-600"
                        : aiRecommendation === "Strong Hire"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : aiRecommendation === "Hire"
                        ? "bg-teal-50 border-teal-200 text-teal-700"
                        : aiRecommendation === "Hold"
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}
                  >
                    <Award size={10} /> {activeCategories.length === 0 ? "Pending" : aiRecommendation}
                  </span>
                </div>
              </div>

              {!readOnly && activeCategories.length > 0 && totalWeightage !== 100 && (
                <button
                  type="button"
                  onClick={handleAutoBalanceWeights}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-95"
                  title="Automatically scale weights proportionally so they sum to 100%"
                >
                  <Sparkles size={13} className="text-indigo-600" />
                  <span>Auto-Balance to 100%</span>
                </button>
              )}
            </div>
          </div>

          {/* SCORE BENCHMARK CRITERIA BAR (Shows what score counts as Hire / No Hire) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 px-4 bg-slate-50/90 border border-slate-200/90 rounded-xl text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <HelpCircle size={15} className="text-indigo-600 shrink-0" />
              <span>Score Benchmark Guide:</span>
              <span className="text-slate-400 font-normal">What counts as Hire or No Hire:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-bold">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                  activeCategories.length > 0 && activeAiScore >= 85
                    ? "bg-emerald-100 border-emerald-300 text-emerald-800 shadow-2xs ring-2 ring-emerald-400/40 font-black"
                    : "bg-white border-emerald-200 text-emerald-700"
                }`}
                title="Score ≥ 85 qualifies as Strong Hire"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>≥ 85 = Strong Hire</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                  activeCategories.length > 0 && activeAiScore >= 70 && activeAiScore < 85
                    ? "bg-teal-100 border-teal-300 text-teal-800 shadow-2xs ring-2 ring-teal-400/40 font-black"
                    : "bg-white border-teal-200 text-teal-700"
                }`}
                title="Score between 70 and 84 qualifies as Hire (70 and above = Hire)"
              >
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                <span>70 – 84 = Hire</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                  activeCategories.length > 0 && activeAiScore >= 55 && activeAiScore < 70
                    ? "bg-amber-100 border-amber-300 text-amber-800 shadow-2xs ring-2 ring-amber-400/40 font-black"
                    : "bg-white border-amber-200 text-amber-700"
                }`}
                title="Score between 55 and 69 requires discussion / Hold"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>55 – 69 = Hold</span>
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                  activeCategories.length > 0 && activeAiScore < 55
                    ? "bg-rose-100 border-rose-300 text-rose-800 shadow-2xs ring-2 ring-rose-400/40 font-black"
                    : "bg-white border-rose-200 text-rose-700"
                }`}
                title="Score below 55 qualifies as No Hire"
              >
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>&lt; 55 = No Hire</span>
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. Add Category Form AT THE TOP OF THE TABLE */}
            {!readOnly && (
              <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                  <div className="flex-1 min-w-[200px] space-y-1.5 relative">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      New Category Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => {
                          setNewCatName(e.target.value);
                          setShowCatSuggestions(true);
                        }}
                        onFocus={() => setShowCatSuggestions(true)}
                        onBlur={() => {
                          setTimeout(() => setShowCatSuggestions(false), 200);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCategory())}
                        placeholder={`Type or select category for ${selectedSkillName || "Skill"}`}
                        className="w-full h-10 bg-white border border-slate-300 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      />

                      {showCatSuggestions && filteredCategorySuggestions.length > 0 && (
                        <ul className="absolute left-0 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto py-1 text-xs font-medium text-slate-800 animate-in fade-in duration-150">
                          <li className="px-3.5 py-1.5 text-[11px] font-extrabold text-indigo-600 uppercase tracking-wider bg-indigo-50/60 border-b border-slate-100 flex items-center justify-between">
                            <span>Template Suggestions for {selectedSkillName}</span>
                            <span className="text-[11px] font-bold text-slate-400">Click to select</span>
                          </li>
                          {filteredCategorySuggestions.map((catItem: any, idx: number) => (
                            <li
                              key={idx}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectCatSuggestion(catItem);
                              }}
                              className="px-3.5 py-2 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-50 last:border-0"
                            >
                              <span className="font-bold text-slate-900 text-xs">{catItem.category}</span>
                              <span className="text-[11px] font-black text-indigo-700 bg-indigo-100/70 border border-indigo-200 px-2.5 py-0.5 rounded-full shrink-0 ml-2">
                                {catItem.weightage}% Weightage
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="w-full sm:w-28 shrink-0 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">
                      Weightage (%)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        value={newCatWeight}
                        onChange={(e) => setNewCatWeight(Math.max(0, Math.min(100, Number(e.target.value))))}
                        min={0}
                        max={100}
                        className="w-full h-10 bg-white border border-slate-300 rounded-xl px-3.5 pr-8 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      />
                      <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="h-10 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus size={14} /> <span>Add Category</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Persistent warning banner when weightage is not 100% */}
            {!weightError && totalWeightage > 0 && totalWeightage !== 100 && (
              <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-xs font-semibold shadow-2xs bg-amber-50/90 border border-amber-200 text-amber-900 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0" />
                  <span>
                    Warning: Total weightage is currently <strong>{totalWeightage}%</strong> ({totalWeightage < 100 ? `${100 - totalWeightage}% unassigned` : `${totalWeightage - 100}% over limit`}). Weightage must balance to 100% before saving.
                  </span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={handleAutoBalanceWeights}
                    className="shrink-0 px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Auto-Balance to 100%
                  </button>
                )}
              </div>
            )}

            {/* 2. Weightage Warning / Error Alert */}
            {weightError && (
              <div
                className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-xs font-semibold shadow-2xs animate-in fade-in ${
                  weightError.toLowerCase().includes("cannot") ||
                  weightError.toLowerCase().includes("must be") ||
                  weightError.toLowerCase().includes("already added")
                    ? "bg-rose-50 border border-rose-200 text-rose-800"
                    : "bg-amber-50 border border-amber-200 text-amber-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle
                    size={16}
                    className={`shrink-0 ${
                      weightError.toLowerCase().includes("cannot") ||
                      weightError.toLowerCase().includes("must be") ||
                      weightError.toLowerCase().includes("already added")
                        ? "text-rose-600"
                        : "text-amber-600"
                    }`}
                  />
                  <span>{weightError}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {totalWeightage > 0 && totalWeightage !== 100 && !readOnly && (
                    <button
                      type="button"
                      onClick={handleAutoBalanceWeights}
                      className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Auto-Balance to 100%
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWeightError(null)}
                    className="font-bold text-sm px-1.5 py-0.5 rounded transition-colors text-slate-500 hover:text-slate-800"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* 3. Categories Rating Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-extrabold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 w-[38%]">Evaluation Category</th>
                    <th className="py-3 px-4 w-[16%]">Weightage</th>
                    <th className="py-3 px-4 w-[18%]">Rating Score (0-5)</th>
                    <th className="py-3 px-4 w-[18%] text-center">Category Score</th>
                    {!readOnly && <th className="py-3 px-4 w-[10%] text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCategories.length === 0 ? (
                    <tr>
                      <td
                        colSpan={readOnly ? 4 : 5}
                        className="py-8 px-4 text-center text-slate-500 font-semibold"
                      >
                        No evaluation categories configured for this skill yet. Use the form above to add categories!
                      </td>
                    </tr>
                  ) : (
                    activeCategories.map((cat, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 align-middle font-bold text-slate-900 text-xs">{cat.category}</td>
                        <td className="py-3 px-4 align-middle">
                          {!readOnly ? (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={cat.weightage}
                                onChange={(e) =>
                                  handleCategoryWeightageChange(cat.category, Number(e.target.value))
                                }
                                className="w-16 h-8 bg-white border border-slate-300 rounded-lg px-2 text-xs font-bold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                              />
                              <span className="text-xs font-extrabold text-slate-500">%</span>
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-600 text-xs whitespace-nowrap">{cat.weightage}%</span>
                          )}
                        </td>
                        <td className="py-3 px-4 align-middle">
                          {!readOnly ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => handleCategoryRatingChange(cat.category, star, cat.weightage)}
                                    className="p-0.5 hover:scale-115 transition-transform cursor-pointer"
                                    title={`Rate ${star} star${star > 1 ? "s" : ""}`}
                                  >
                                    <Star
                                      size={14}
                                      className={`${
                                        (cat.rating || 0) >= star
                                          ? "text-amber-400 fill-amber-400"
                                          : (cat.rating || 0) >= star - 0.5
                                          ? "text-amber-400 fill-amber-400/50"
                                          : "text-slate-300 hover:text-amber-300"
                                      } transition-colors`}
                                    />
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  step={0.1}
                                  value={cat.rating !== undefined ? cat.rating : ""}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    handleCategoryRatingChange(cat.category, isNaN(val) ? 0 : Math.min(5, Math.max(0, val)), cat.weightage);
                                  }}
                                  className="w-14 h-8 bg-white border border-slate-300 rounded-lg px-1.5 text-xs font-bold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                />
                                <span className="text-xs font-bold text-slate-400 whitespace-nowrap">/ 5</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={13}
                                    className={`${
                                      (cat.rating || 0) >= star
                                        ? "text-amber-400 fill-amber-400"
                                        : "text-slate-200"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="font-bold text-slate-800 text-xs whitespace-nowrap">{cat.rating} / 5</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 align-middle text-center font-extrabold text-indigo-700 text-xs whitespace-nowrap">
                          <span className="inline-block bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                            {cat.score} / {cat.weightage}
                          </span>
                        </td>
                        {!readOnly && (
                          <td className="py-3 px-4 align-middle text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCategory(cat.category)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              aria-label="Remove"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 4. Total Weightage Status */}
            <div className="flex justify-between items-center bg-slate-50/80 p-3 px-4 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-600">Total Weightage & Points:</span>
              <div className="flex items-center gap-2.5">
                <span
                  className={`font-black px-3 py-1 rounded-full text-xs ${
                    totalWeightage === 100
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : totalWeightage > 100
                      ? "bg-rose-50 text-rose-700 border border-rose-200 font-extrabold"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {totalWeightage}% {totalWeightage !== 100 && `(Target: 100% · ${100 - totalWeightage}% unassigned)`}
                </span>

                {!readOnly && activeCategories.length > 0 && totalWeightage !== 100 && (
                  <button
                    type="button"
                    onClick={handleAutoBalanceWeights}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Sparkles size={11} className="text-indigo-500" />
                    <span>Auto-Balance</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
