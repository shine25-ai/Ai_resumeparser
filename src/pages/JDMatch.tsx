import { useState, useEffect, useRef } from "react";
import {
  Filter, Search, RefreshCw, UserCheck, X, Calendar, CheckSquare, Square, FileText, CheckCircle, Clock, MapPin, Sparkles, AlertCircle, Plus
} from "lucide-react";
import { matchResumes, promptMatch, type SearchPlan, type CandidateMatch, getParsedResumeSummary, type MatchFilterParams, type SortOption, SORT_OPTION_LABELS } from "../utils/Api";
import { getCandidateRole, formatExperience, getAllSkills } from "../utils/candidateFields";
import { InterviewForm } from "../components/interview/InterviewForm";
import { useFeedback } from "../components/ui/Feedback";
import type { CandidateInterviewItem } from "../types/interview";

type FilterCategory = "Job Title" | "Location" | "Skill" | "Year of Passing" | "Min Exp" | "Max Exp" | "Keyword";

interface FilterPill {
  id: string;
  category: FilterCategory;
  value: string | number;
}

export default function JDMatch() {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(false);

  // Dynamic dropdown options state fetched from /api/v1/resumes/parsed-summary
  const [summaryOptions, setSummaryOptions] = useState<{
    locations: string[];
    total_experience_years: number[];
    primary_skills: string[];
    frameworks: string[];
    databases: string[];
    designations: string[];
    roles: string[];
    year_of_passing: string[];
    experience_levels: string[];
    ai_technical_scores: number[];
  }>({
    locations: [],
    total_experience_years: [],
    primary_skills: [],
    frameworks: [],
    databases: [],
    designations: [],
    roles: [],
    year_of_passing: [],
    experience_levels: [],
    ai_technical_scores: [],
  });

  // Filter States (Unified)
  const [pills, setPills] = useState<FilterPill[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [matchedResumes, setMatchedResumes] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>("ai_score");
  const [skillMode, setSkillMode] = useState<"all" | "any">("all");
  const [showFilters, setShowFilters] = useState(true);

  // Prompt mode: the recruiter describes the role; the AI turns it into a search plan once.
  const [searchMode, setSearchMode] = useState<"filters" | "prompt">("filters");
  const [promptText, setPromptText] = useState("");
  const [plan, setPlan] = useState<SearchPlan | null>(null);
  const [matchNotes, setMatchNotes] = useState<string[]>([]);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [newPlanSkill, setNewPlanSkill] = useState("");
  // Phase 2: the AI scores the top 25 against the request and explains each. Off until the recruiter asks.
  const [explainOn, setExplainOn] = useState(false);
  const [reranked, setReranked] = useState(false);
  const [explainWaiting, setExplainWaiting] = useState(false);
  // Phase 3: meaning-based search. Available when an admin turned it on in Settings; recruiters can leave it out of a search.
  const [includeMeaning, setIncludeMeaning] = useState(true);
  const [meaningAvailable, setMeaningAvailable] = useState(false);

  // Selection & Interview Modal States
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Toast Notification State

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch parsed resume summary dropdown values & registered system users
  useEffect(() => {
    const fetchSummaryDropdowns = async () => {
      try {
        const res = await getParsedResumeSummary().catch(() => null);

        if (res) {
          setSummaryOptions({
            locations: res.locations || [],
            total_experience_years: res.total_experience_years || [],
            primary_skills: res.primary_skills || [],
            frameworks: res.frameworks || [],
            databases: res.databases || [],
            designations: res.designations || [],
            roles: res.roles || [],
            year_of_passing: res.year_of_passing || [],
            experience_levels: res.experience_levels || [],
            ai_technical_scores: res.ai_technical_scores || [],
          });
        }
      } catch (err) {
        console.error("Failed to load parsed resume summary options:", err);
      }
    };

    fetchSummaryDropdowns();
  }, []);

  // Fetch matched resumes whenever search button is clicked or initial load
  const fetchMatchedCandidates = async (
    opts: { page?: number; limit?: number; sort?: SortOption; mode?: "all" | "any" } = {}
  ) => {
    const targetPage = opts.page ?? 1;
    const targetLimit = opts.limit ?? pageSize;
    setLoading(true);
    try {
      const getValues = (cat: FilterCategory) => pills.filter((p) => p.category === cat).map((p) => String(p.value));

      const params: MatchFilterParams = {
        job_title: getValues("Job Title").length > 0 ? getValues("Job Title") : undefined,
        min_experience: pills.find(p => p.category === "Min Exp")?.value as number | undefined,
        max_experience: pills.find(p => p.category === "Max Exp")?.value as number | undefined,
        location: getValues("Location").length > 0 ? getValues("Location") : undefined,
        year_of_passing: getValues("Year of Passing").length > 0 ? getValues("Year of Passing") : undefined,
        skills: getValues("Skill").length > 0 ? getValues("Skill") : undefined,
        keywords: getValues("Keyword").length > 0 ? getValues("Keyword") : undefined,
        skill_mode: opts.mode ?? skillMode,
        sort_by: opts.sort ?? sortBy,
        page: targetPage,
        limit: targetLimit,
      };

      const res = await matchResumes(params);
      const items = Array.isArray(res) ? res : res.resumes || [];
      const total = Array.isArray(res) ? items.length : res.total ?? items.length;
      setMatchedResumes(items);
      setPage(targetPage);
      setTotalCount(total);
      setTotalPages(Array.isArray(res) ? 1 : res.total_pages || Math.ceil(total / targetLimit) || 1);
      setSelectedCandidateIds([]); // reset selection on new fetch
    } catch (err) {
      console.error("Error matching resumes:", err);
    } finally {
      setLoading(false);
    }
  };

  // Prompt mode search. With `plan` the edited plan is searched again and the AI is not called.
  const runPromptSearch = async (opts: { page?: number; limit?: number; plan?: SearchPlan; explain?: boolean; meaning?: boolean } = {}) => {
    const targetPage = opts.page ?? 1;
    const targetLimit = opts.limit ?? pageSize;
    // A new request starts without explanations; paging and chip edits keep the current choice.
    const explain = opts.explain ?? (opts.plan ? explainOn : false);
    const meaning = opts.meaning ?? includeMeaning;
    if (!opts.plan && !promptText.trim()) {
      setPromptError("Describe the role or paste a job description.");
      return;
    }
    setLoading(true);
    setExplainWaiting(explain);
    setPromptError(null);
    try {
      const res = await promptMatch(
        opts.plan
          ? { plan: opts.plan, prompt: promptText.trim() || undefined, page: targetPage, limit: targetLimit, rerank: explain, meaning }
          : { prompt: promptText, page: targetPage, limit: targetLimit, rerank: explain, meaning }
      );
      setExplainOn(explain);
      setReranked(!!res.reranked);
      setIncludeMeaning(meaning);
      setMeaningAvailable(!!res.meaning_available);
      setPlan(res.plan);
      setMatchNotes(res.notes || []);
      setMatchedResumes(res.resumes || []);
      setPage(res.page);
      setTotalCount(res.total);
      setTotalPages(res.total_pages || 1);
      setSelectedCandidateIds([]);
    } catch (err: any) {
      setPromptError(err.message || "Search failed. Try again, or use Filters.");
    } finally {
      setLoading(false);
      setExplainWaiting(false);
    }
  };

  // Paging and page size work in both modes.
  const loadPage = (opts: { page?: number; limit?: number }) => {
    if (searchMode === "prompt") {
      if (plan) runPromptSearch({ ...opts, plan });
    } else {
      fetchMatchedCandidates(opts);
    }
  };

  const switchMode = (mode: "filters" | "prompt") => {
    if (mode === searchMode) return;
    setSearchMode(mode);
    setPromptError(null);
    setMatchedResumes([]);
    setTotalCount(0);
    setTotalPages(1);
    setSelectedCandidateIds([]);
    if (mode === "filters") {
      fetchMatchedCandidates({ page: 1 });
    } else if (plan) {
      runPromptSearch({ plan });
    }
  };

  const editPlan = (change: Partial<SearchPlan>) => {
    if (!plan) return;
    const next = { ...plan, ...change };
    setPlan(next);
    runPromptSearch({ plan: next });
  };

  const addPlanSkill = () => {
    const skill = newPlanSkill.trim();
    if (!plan || !skill) return;
    setNewPlanSkill("");
    if (plan.must_have_skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    editPlan({ must_have_skills: [...plan.must_have_skills, skill] });
  };

  useEffect(() => {
    fetchMatchedCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to add a pill and replace if singular category
  const addPill = (category: FilterCategory, value: string | number) => {
    setPills((prev) => {
      if (category === "Min Exp" || category === "Max Exp") {
        const filtered = prev.filter((p) => p.category !== category);
        return [...filtered, { id: `${category}-${value}-${Date.now()}`, category, value }];
      }
      if (prev.some((p) => p.category === category && p.value === value)) {
        return prev;
      }
      return [...prev, { id: `${category}-${value}-${Date.now()}`, category, value }];
    });
    setSearchInput("");
    setIsDropdownOpen(false);
  };

  const removePill = (id: string) => {
    setPills((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAllPills = () => {
    setPills([]);
  };

  // Generate suggestions based on search input
  const getSuggestions = () => {
    const lowerInput = searchInput.toLowerCase().trim();

    const filterOpts = (opts: (string | number)[], category: FilterCategory) => {
      return Array.from(new Set(opts))
        .filter(opt => String(opt).toLowerCase().includes(lowerInput))
        .map(opt => ({ category, value: opt }));
    };

    const suggestions: { category: FilterCategory, value: string | number }[] = [
      ...filterOpts([...summaryOptions.roles, ...summaryOptions.designations], "Job Title"),
      ...filterOpts(summaryOptions.locations, "Location"),
      ...filterOpts([...summaryOptions.primary_skills, ...summaryOptions.frameworks, ...summaryOptions.databases], "Skill"),
      ...filterOpts(summaryOptions.year_of_passing, "Year of Passing"),
    ];

    const numMatch = lowerInput.match(/\d+(\.\d+)?/);
    if (numMatch) {
      const num = Number(numMatch[0]);
      if (lowerInput.includes("min") || lowerInput.includes(">")) {
        suggestions.push({ category: "Min Exp", value: num });
      } else if (lowerInput.includes("max") || lowerInput.includes("<")) {
        suggestions.push({ category: "Max Exp", value: num });
      } else {
        suggestions.push({ category: "Min Exp", value: num });
        suggestions.push({ category: "Max Exp", value: num });
      }
    } else {
      suggestions.push(...filterOpts(summaryOptions.total_experience_years, "Min Exp"));
      suggestions.push(...filterOpts(summaryOptions.total_experience_years, "Max Exp"));
    }

    if (searchInput.trim().length > 0) {
      suggestions.push({ category: "Keyword", value: searchInput.trim() });
    }

    const uniqueSuggestions = suggestions.filter((v, i, a) => a.findIndex(t => (t.category === v.category && t.value === v.value)) === i);
    return uniqueSuggestions.slice(0, 15);
  };

  const suggestions = getSuggestions();

  // Candidate Selection Logic
  const handleSelectAll = () => {
    if (selectedCandidateIds.length === matchedResumes.length) {
      setSelectedCandidateIds([]);
    } else {
      setSelectedCandidateIds(matchedResumes.map((r) => r.id));
    }
  };

  const toggleSelectCandidate = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Candidates the assign form will book: the selected rows, or every match when none are selected
  const assignTargets: CandidateInterviewItem[] = (
    selectedCandidateIds.length > 0 ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id)) : matchedResumes
  ).map((r) => {
    const p = r.parsed_data || {};
    return {
      candidate_id: r.id,
      candidate_name: p.full_name || p.name || r.original_filename || "Candidate",
      resume_id: r.id,
      location: p.location || undefined,
    };
  });
  const assignJobTitle = String(pills.find((p) => p.category === "Job Title")?.value || "");

  const handleOpenAssignModal = () => {
    if (assignTargets.length === 0) {
      toast("No candidates to assign an interview to.", "warning");
      return;
    }
    setIsAssignModalOpen(true);
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-2 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Success Banner */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-600" />
            <span className="text-xs font-semibold">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">JD Matching & Candidate Filter</h1>
          <p className="text-xs text-slate-500">Match resume documents in MongoDB against Job Description parameters</p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 bg-white border border-indigo-200 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors shadow-xs cursor-pointer"
        >
          <Filter size={14} />
          {showFilters ? "Hide Filter Panel" : "Show Filter Panel"}
        </button>
      </div>

      {/* Search mode toggle */}
      {showFilters && (
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {([["filters", "Filters", Filter], ["prompt", "Describe the role", Sparkles]] as const).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => switchMode(mode)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${searchMode === mode ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Prompt mode panel */}
      {showFilters && searchMode === "prompt" && (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <h2 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} /> Describe the role
            </h2>
            <button
              onClick={() => runPromptSearch({ page: 1 })}
              disabled={loading || !promptText.trim()}
              className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50 w-full md:w-auto"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Find candidates
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="jd-prompt" className="text-[11px] font-semibold text-slate-600 block">
              Type what you need, or paste the full job description
            </label>
            <textarea
              id="jd-prompt"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && promptText.trim()) runPromptSearch({ page: 1 });
              }}
              rows={promptText.length > 300 ? 8 : 3}
              maxLength={15000}
              placeholder="e.g. Senior Java developer with Spring Boot and Kafka, 5-8 years, Chennai or remote. AWS is a plus."
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-slate-400 resize-y"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Ctrl/Cmd + Enter to search. Age, gender and similar details are ignored.</span>
              <span>{promptText.length.toLocaleString()} / 15,000</span>
            </div>
          </div>

          {promptError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-2">
              <AlertCircle size={14} /> {promptError}
            </div>
          )}

          {plan && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <span className="text-[11px] font-semibold text-slate-600">We understood (remove anything that's wrong; the search updates without calling the AI again):</span>
              <div className="flex flex-wrap gap-2">
                {plan.role_titles.map((t) => (
                  <PlanChip key={`t-${t}`} label="Role" value={t} onRemove={() => editPlan({ role_titles: plan.role_titles.filter((x) => x !== t) })} />
                ))}
                {plan.must_have_skills.map((sk) => (
                  <PlanChip key={`m-${sk}`} label="Must have" value={sk} tone="strong" onRemove={() => editPlan({ must_have_skills: plan.must_have_skills.filter((x) => x !== sk) })} />
                ))}
                {plan.nice_to_have_skills.map((sk) => (
                  <PlanChip key={`n-${sk}`} label="Nice to have" value={sk} onRemove={() => editPlan({ nice_to_have_skills: plan.nice_to_have_skills.filter((x) => x !== sk) })} />
                ))}
                {plan.min_experience != null && (
                  <PlanChip label="Min Exp" value={`${plan.min_experience} Yrs`} onRemove={() => editPlan({ min_experience: null })} />
                )}
                {plan.max_experience != null && (
                  <PlanChip label="Max Exp" value={`${plan.max_experience} Yrs`} onRemove={() => editPlan({ max_experience: null })} />
                )}
                {plan.locations.map((l) => (
                  <PlanChip key={`l-${l}`} label="Location" value={l} onRemove={() => editPlan({ locations: plan.locations.filter((x) => x !== l) })} />
                ))}
                {plan.education.map((ed) => (
                  <PlanChip key={`e-${ed}`} label="Education" value={ed} onRemove={() => editPlan({ education: plan.education.filter((x) => x !== ed) })} />
                ))}
                {plan.keywords.map((k) => (
                  <PlanChip key={`k-${k}`} label="Keyword" value={k} onRemove={() => editPlan({ keywords: plan.keywords.filter((x) => x !== k) })} />
                ))}
                <span className="flex items-center gap-1 bg-white border border-dashed border-slate-300 rounded-xl px-2 py-1">
                  <input
                    value={newPlanSkill}
                    onChange={(e) => setNewPlanSkill(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addPlanSkill(); }}
                    placeholder="Add must-have skill"
                    aria-label="Add must-have skill"
                    className="w-32 bg-transparent text-xs focus:outline-none placeholder-slate-400"
                  />
                  <button type="button" onClick={addPlanSkill} disabled={!newPlanSkill.trim()} className="text-indigo-600 disabled:opacity-30 cursor-pointer" aria-label="Add skill">
                    <Plus size={13} />
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {explainOn ? (
                  <>
                    <span className="text-[11px] font-semibold text-violet-700 flex items-center gap-1.5">
                      <Sparkles size={12} /> {reranked ? "Top 25 re-ranked and explained by AI" : "AI explanations requested"}
                    </span>
                    <button
                      type="button"
                      onClick={() => runPromptSearch({ plan, explain: false })}
                      disabled={loading}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer disabled:opacity-50"
                    >
                      Show match score only
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runPromptSearch({ plan, explain: true })}
                    disabled={loading}
                    className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer shadow-sm disabled:opacity-50"
                    title="The AI reads the top 25 candidates against your request, adjusts their order and writes why each fits (up to about 40 seconds the first time; repeat searches are quick)"
                  >
                    {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Explain top results
                  </button>
                )}
                {meaningAvailable && (
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none"
                    title="Also match resumes by meaning, not only by exact words, and add candidates the keyword search missed"
                  >
                    <input
                      type="checkbox"
                      checked={includeMeaning}
                      disabled={loading}
                      onChange={(e) => runPromptSearch({ plan, meaning: e.target.checked })}
                      className="accent-indigo-600 cursor-pointer"
                    />
                    Include meaning match
                  </label>
                )}
                {explainWaiting && !reranked && (
                  <span className="text-[11px] text-slate-500">
                    The AI is reading the top 25 candidates. This can take up to about 40 seconds the first time; repeat searches are quick.
                  </span>
                )}
              </div>
              {matchNotes.length > 0 && (
                <ul className="text-[11px] text-slate-500 space-y-0.5">
                  {matchNotes.map((n) => (
                    <li key={n} className="flex items-center gap-1.5"><AlertCircle size={11} className="text-amber-500 flex-shrink-0" /> {n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Multi-Filter Input Card Panel */}
      {showFilters && searchMode === "filters" && (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <h2 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
              <Filter size={14} /> Unified JD Filter
            </h2>
            <button
              onClick={() => fetchMatchedCandidates({ page: 1 })}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50 w-full md:w-auto"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Apply & Search
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-semibold text-slate-600 block">
              Search by Skills, Location, Role, Experience, or Year of Passing
            </label>

            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                <Search size={16} className="text-slate-400 mr-2" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchInput.trim()) {
                      addPill("Keyword", searchInput.trim());
                    }
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="e.g. 'React', 'New York', 'Software Engineer'..."
                  className="w-full bg-transparent text-sm text-slate-800 focus:outline-none placeholder-slate-400"
                />
                {searchInput && (
                  <button onClick={() => setSearchInput("")} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isDropdownOpen && searchInput && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                  {suggestions.length > 0 ? (
                    <ul className="py-2">
                      {suggestions.map((s, idx) => (
                        <li
                          key={idx}
                          onClick={() => addPill(s.category, s.value)}
                          className="px-4 py-2 hover:bg-indigo-50 cursor-pointer flex flex-col group transition-colors"
                        >
                          <span className="text-xs font-bold text-indigo-600">
                            {s.category}
                          </span>
                          <span className="text-sm text-slate-800 group-hover:text-indigo-900 font-medium">
                            {s.value} {s.category.includes("Exp") ? "Yrs" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      No matching options found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Skill match mode */}
            {pills.filter((p) => p.category === "Skill").length > 1 && (
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <span>Candidates must have:</span>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                  {(["all", "any"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setSkillMode(mode);
                        fetchMatchedCandidates({ page: 1, mode });
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${skillMode === mode ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                    >
                      {mode === "all" ? "All selected skills" : "Any selected skill"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Pills Display */}
            <div className="pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">Active Filters:</span>
                {pills.length > 0 && (
                  <button
                    onClick={clearAllPills}
                    className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {pills.length > 0 ? (
                  pills.map((pill) => (
                    <span
                      key={pill.id}
                      className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 group transition-colors"
                    >
                      <span className="opacity-70 text-[11px] uppercase tracking-wider">{pill.category}:</span>
                      <span>{pill.value} {pill.category.includes("Exp") ? "Yrs" : ""}</span>
                      <button
                        type="button"
                        onClick={() => removePill(pill.id)}
                        className="text-indigo-600 hover:text-indigo-900 font-bold ml-1 flex items-center bg-indigo-100 rounded-full p-0.5 transition-colors cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic mt-1">No filters selected. All candidates will be shown.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Matched Results Table Section */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <UserCheck size={18} className="text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Matched Candidates ({totalCount})
            </h2>
            {selectedCandidateIds.length > 0 && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                {selectedCandidateIds.length} Selected
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {searchMode === "prompt" ? (
              <span className="text-[11px] font-semibold text-slate-500">Sorted by best match</span>
            ) : (
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              Sort by
              <select
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value as SortOption;
                  setSortBy(next);
                  fetchMatchedCandidates({ page: 1, sort: next });
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {SORT_OPTION_LABELS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            )}
            <button
              onClick={handleOpenAssignModal}
              disabled={matchedResumes.length === 0}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 w-full sm:w-auto"
            >
              <Calendar size={15} />
              Assign Interview Globally ({selectedCandidateIds.length > 0 ? selectedCandidateIds.length : matchedResumes.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 font-bold uppercase tracking-wider bg-slate-50/70">
                <th className="py-3 px-3.5 w-10">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer">
                    {selectedCandidateIds.length > 0 && selectedCandidateIds.length === matchedResumes.length ? (
                      <CheckSquare size={16} className="text-indigo-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                {searchMode === "prompt" && <th className="py-3 px-3.5">Match</th>}
                <th className="py-3 px-3.5">Candidate & Role</th>
                <th className="py-3 px-3.5">Experience & Location</th>
                <th className="py-3 px-3.5">Primary Skills</th>
                <th className="py-3 px-3.5">AI Tech Score</th>
                <th className="py-3 px-3.5">Last Interview Date</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={searchMode === "prompt" ? 8 : 7} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-indigo-600" />
                      <span>Fetching matched candidates from backend API...</span>
                    </div>
                  </td>
                </tr>
              ) : matchedResumes.length === 0 ? (
                <tr>
                  <td colSpan={searchMode === "prompt" ? 8 : 7} className="py-12 text-center text-slate-500">
                    {searchMode === "prompt" && !plan
                      ? "Describe the role above and click Find candidates."
                      : "No matching candidate records found. Try adjusting filter parameters."}
                  </td>
                </tr>
              ) : (
                matchedResumes.map((row) => {
                  const p = row.parsed_data || {};
                  const evalInfo = row.ai_evaluation || {};
                  const name = p.full_name || p.name || row.original_filename || "Candidate";
                  const role = getCandidateRole(p);
                  const exp = formatExperience(p);
                  const loc = p.location || "N/A";
                  const skillsList: string[] = getAllSkills(p);
                  const score: number | null = typeof evalInfo.ai_technical_score === "number" ? evalInfo.ai_technical_score : null;
                  const isSelected = selectedCandidateIds.includes(row.id);
                  const match: CandidateMatch | undefined = row.match;

                  return (
                    <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-indigo-50/40" : ""}`}>
                      <td className="py-3.5 px-3.5">
                        <button onClick={() => toggleSelectCandidate(row.id)} className="text-slate-400 hover:text-indigo-600 cursor-pointer">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                        </button>
                      </td>

                      {searchMode === "prompt" && (
                        <td className="py-3.5 px-3.5 align-top">
                          {match ? (
                            <div className="space-y-1.5 min-w-[160px] max-w-[260px]">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border ${match.match_score >= 75
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                  : match.match_score >= 50
                                    ? "bg-amber-50 border-amber-200 text-amber-700"
                                    : "bg-slate-100 border-slate-200 text-slate-600"
                                }`} title={match.ai_fit_score !== undefined
                                  ? `Match score ${match.code_score} and AI fit ${match.ai_fit_score}, combined 70/30`
                                  : "How well this candidate fits the request (0-100)"}>
                                {match.match_score}% match
                                {match.ai_fit_score !== undefined && <Sparkles size={11} className="ml-1 text-violet-500" />}
                              </span>
                              {match.why && <div className="text-[11px] text-slate-700 leading-snug">{match.why}</div>}
                              {match.gaps && <div className="text-[11px] text-amber-700 leading-snug">Gaps: {match.gaps}</div>}
                              <div className="flex flex-wrap gap-1">
                                {match.matched_skills.map((sk) => (
                                  <span key={`ok-${sk}`} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-1.5 py-0.5 rounded-md">{sk}</span>
                                ))}
                                {match.missing_skills.map((sk) => (
                                  <span key={`no-${sk}`} className="bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-bold px-1.5 py-0.5 rounded-md line-through" title="Must-have skill not found">{sk}</span>
                                ))}
                                {match.nice_to_have_matched.map((sk) => (
                                  <span key={`nice-${sk}`} className="bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-semibold px-1.5 py-0.5 rounded-md" title="Nice-to-have skill">+{sk}</span>
                                ))}
                              </div>
                              {match.role_match === "different specialism" ? (
                                <div className="text-[11px] text-amber-700">Different specialism from the role asked for</div>
                              ) : match.role_match ? (
                                <div className="text-[11px] text-slate-500">Title fits: {match.role_match}</div>
                              ) : null}
                              {match.meaning_score !== undefined && (
                                <div className="text-[11px] text-slate-500" title="How close the resume is to the request by meaning, compared with the other candidates (adds up to 10 points)">
                                  Meaning match: {match.meaning_score}%
                                  {match.found_by_meaning && (
                                    <span className="ml-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-semibold px-1.5 py-0.5 rounded-md" title="Not found by the keyword search; added because the resume matches the request by meaning">
                                      Found by meaning
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">-</span>
                          )}
                        </td>
                      )}

                      {/* Candidate Name & Designation / Role */}
                      <td className="py-3.5 px-3.5">
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                            <span>{name}</span>
                            {p.email && (
                              <span className="text-[11px] text-slate-400 font-normal font-mono hidden xl:inline">
                                ({p.email})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[11px] px-2 py-0.5 rounded-md inline-block">
                              {role}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Combined Experience & Location */}
                      <td className="py-3.5 px-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                            <Clock size={13} className="text-indigo-600 flex-shrink-0" />
                            <span>{exp}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                            <MapPin size={13} className="text-rose-500 flex-shrink-0" />
                            <span className="truncate max-w-[190px]" title={loc}>{loc}</span>
                          </div>
                        </div>
                      </td>

                      {/* Primary Skills (2-3 per row horizontal pills) */}
                      <td className="py-3.5 px-3.5">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-xs sm:max-w-sm">
                          {skillsList.slice(0, 3).map((s, idx) => (
                            <span key={idx} className="bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-bold text-[11px] px-2.5 py-0.5 rounded-lg shadow-2xs">
                              {s}
                            </span>
                          ))}
                          {skillsList.length > 3 && (
                            <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-extrabold px-2 py-0.5 rounded-md shadow-2xs">
                              +{skillsList.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* AI Tech Score */}
                      <td className="py-3.5 px-3.5">
                        {score === null ? (
                          <span className="text-[11px] font-semibold text-slate-400">Not scored</span>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${score >= 70
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : score >= 40
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-slate-100 border-slate-200 text-slate-600"
                            }`}>
                            {score}%
                          </span>
                        )}
                      </td>

                      {/* Last Interview Update Date */}
                      <td className="py-3.5 px-3.5">
                        {row.interview_assigned || row.last_interview_assigned_date || row.last_interview_updated_at || row.latest_interview ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                              <Calendar size={13} className="text-indigo-600 flex-shrink-0" />
                              <span>
                                {row.last_interview_updated_at
                                  ? row.last_interview_updated_at.includes("T")
                                    ? new Date(row.last_interview_updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                    : row.last_interview_updated_at
                                  : row.last_interview_assigned_date
                                    ? row.last_interview_assigned_date.includes("T")
                                      ? new Date(row.last_interview_assigned_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                      : row.last_interview_assigned_date
                                    : row.latest_interview?.scheduled_date || "N/A"}
                              </span>
                            </div>
                            {row.interview_status && (
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border inline-block ${
                                row.interview_status === "COMPLETED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : row.interview_status === "SCHEDULED" || row.interview_status === "ASSIGNED"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}>
                                {row.interview_status}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">Not Assigned</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3.5 text-right">
                        {row.s3_url ? (
                          <a
                            href={row.s3_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-1 rounded-xl text-xs font-bold transition-all shadow-2xs"
                          >
                            <FileText size={13} />
                            <span>View Resume</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs font-medium">No File</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} candidates
            </span>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPageSize(next);
                  loadPage({ page: 1, limit: next });
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              <button
                onClick={() => loadPage({ page: page - 1 })}
                disabled={loading || page <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-semibold">Page {page} of {totalPages}</span>
              <button
                onClick={() => loadPage({ page: page + 1 })}
                disabled={loading || page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 font-bold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Same interview form as the Interviews page, for every selected candidate at once */}
      <InterviewForm
        mode="bulk"
        isOpen={isAssignModalOpen}
        bulkCandidates={assignTargets}
        bulkJobTitle={assignJobTitle}
        onClose={() => setIsAssignModalOpen(false)}
        onSaved={() => setSelectedCandidateIds([])}
      />

    </div>
  );
}

/** One item of the understood search plan, removable. */
function PlanChip({ label, value, onRemove, tone }: { label: string; value: string; onRemove: () => void; tone?: "strong" }) {
  return (
    <span className={`text-xs px-3 py-1.5 rounded-xl font-semibold flex items-center gap-2 border ${tone === "strong" ? "bg-indigo-600 border-indigo-600 text-white" : "bg-indigo-50 border-indigo-200 text-indigo-700"}`}>
      <span className="opacity-70 text-[11px] uppercase tracking-wider">{label}:</span>
      <span>{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} ${value}`}
        className={`font-bold ml-1 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${tone === "strong" ? "bg-indigo-500 hover:bg-indigo-400" : "bg-indigo-100 text-indigo-600 hover:text-indigo-900"}`}
      >
        <X size={12} />
      </button>
    </span>
  );
}
