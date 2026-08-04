import { useState, useEffect, useRef } from "react";
import {
  Filter, Search, RefreshCw, UserCheck, X, Calendar, CheckSquare, Square, FileText, CheckCircle,
  Briefcase, Clock, MapPin, ShieldCheck, Mail, Layers, AlignLeft, Sparkles, Video, Hash,
  Upload, Building2
} from "lucide-react";
import { matchResumes, getParsedResumeSummary, batchCreateInterviews, type MatchFilterParams, type InterviewTypeEnum } from "../utils/Api";

type FilterCategory = "Job Title" | "Location" | "Skill" | "Year of Passing" | "Min Exp" | "Max Exp" | "Keyword";

interface FilterPill {
  id: string;
  category: FilterCategory;
  value: string | number;
}

export default function JDMatch() {
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
  const [showFilters, setShowFilters] = useState(true);

  // Selection & Interview Modal States
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State for Global Interview Assignment
  const [interviewForm, setInterviewForm] = useState({
    job_title: "",
    job_location: "",
    job_type: "Full Time",
    interview_type: "TECHNICAL" as InterviewTypeEnum,
    round_number: 1,
    scheduled_date: new Date().toISOString().split("T")[0],
    scheduled_time: "10:00",
    duration_minutes: 60,
    interviewer_name: "",
    interviewer_email: "",
    meeting_platform: "Google Meet",
    meeting_link: "",
    location: "",
    interview_location: "",
    hr_call_verification: "Verified",
    candidate_requested_date_time: "",
    candidate_requested_date: "",
    candidate_requested_time: "",
    candidate_requested_role: "",
    salary_requested: "",
    final_fit_salary: "",
    joining_date: "",
    interview_document_files: "",
    recommendation: "Pending",
    notes: "",
  });

  // Handle local document file selection/upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileNames = Array.from(e.target.files).map((f) => f.name);
      const existing = interviewForm.interview_document_files
        ? interviewForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const combined = Array.from(new Set([...existing, ...fileNames])).join("\n");
      setInterviewForm((prev) => ({ ...prev, interview_document_files: combined }));
    }
  };

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

  // Fetch parsed resume summary dropdown values
  useEffect(() => {
    const fetchSummaryDropdowns = async () => {
      try {
        const res = await getParsedResumeSummary();
        
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
  const fetchMatchedCandidates = async () => {
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
      };

      const res = await matchResumes(params);
      const items = Array.isArray(res) ? res : res.resumes || [];
      setMatchedResumes(items);
      setSelectedCandidateIds([]); // reset selection on new fetch
    } catch (err) {
      console.error("Error matching resumes:", err);
    } finally {
      setLoading(false);
    }
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

  // Open Global Interview Assignment Modal
  const handleOpenAssignModal = () => {
    const defaultJobPill = pills.find((p) => p.category === "Job Title");
    const jobTitleVal = defaultJobPill ? String(defaultJobPill.value) : "Software Engineer";

    setInterviewForm((prev) => ({
      ...prev,
      job_title: prev.job_title || jobTitleVal,
    }));
    setIsAssignModalOpen(true);
  };

  // Submit Global Interview Assignment to Backend
  const handleAssignInterviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);
    setSuccessMessage(null);

    try {
      // Determine targets: selected candidate records, or all matched candidate records
      const targetResumes = selectedCandidateIds.length > 0
        ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
        : matchedResumes;

      if (targetResumes.length === 0) {
        alert("No candidates available to assign interview.");
        setAssignLoading(false);
        return;
      }

      const candidateItems = targetResumes.map((r) => {
        const p = r.parsed_data || {};
        return {
          candidate_id: r.id,
          candidate_name: p.full_name || p.name || r.original_filename || "Candidate",
          resume_id: r.id,
          location: p.location || interviewForm.interview_location || interviewForm.location || undefined,
          interview_location: interviewForm.interview_location || interviewForm.location || p.location || undefined,
        };
      });

      const docFilesArray = interviewForm.interview_document_files
        ? interviewForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

      // Combine requested date and time into candidate_requested_date_time string if provided separately
      const combinedReqDateTime = interviewForm.candidate_requested_date
        ? `${interviewForm.candidate_requested_date} ${interviewForm.candidate_requested_time || ""}`.trim()
        : interviewForm.candidate_requested_date_time;

      await batchCreateInterviews({
        candidates: candidateItems,
        job_title: interviewForm.job_title,
        job_location: interviewForm.job_location || undefined,
        job_type: interviewForm.job_type || undefined,
        interview_type: interviewForm.interview_type,
        round_number: Number(interviewForm.round_number),
        scheduled_date: interviewForm.scheduled_date,
        scheduled_time: interviewForm.scheduled_time,
        duration_minutes: Number(interviewForm.duration_minutes),
        interviewer_name: interviewForm.interviewer_name || "Hiring Manager",
        interviewer_email: interviewForm.interviewer_email || undefined,
        meeting_platform: interviewForm.meeting_platform,
        meeting_link: interviewForm.meeting_link || undefined,
        location: interviewForm.interview_location || interviewForm.location || undefined,
        interview_location: interviewForm.interview_location || interviewForm.location || undefined,
        hr_call_verification: interviewForm.hr_call_verification,
        candidate_requested_date_time: combinedReqDateTime || undefined,
        candidate_requested_date: interviewForm.candidate_requested_date || undefined,
        candidate_requested_time: interviewForm.candidate_requested_time || undefined,
        candidate_requested_role: interviewForm.candidate_requested_role || undefined,
        salary_requested: interviewForm.salary_requested || undefined,
        final_fit_salary: interviewForm.final_fit_salary || undefined,
        joining_date: interviewForm.joining_date || undefined,
        interview_document_files: docFilesArray,
        recommendation: interviewForm.recommendation || "Pending",
        notes: interviewForm.notes || undefined,
      });

      setIsAssignModalOpen(false);
      setSuccessMessage(
        `Successfully assigned interview session for ${candidateItems.length} candidate(s)! Saved into MongoDB Interview collection.`
      );
      setSelectedCandidateIds([]);
    } catch (err: any) {
      console.error("Global interview assignment error:", err);
      alert(err.message || "Failed to assign interview globally.");
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
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

      {/* Multi-Filter Input Card Panel */}
      {showFilters && (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <h2 className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider flex items-center gap-2">
              <Filter size={14} /> Unified JD Filter
            </h2>
            <button
              onClick={fetchMatchedCandidates}
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

            {/* Active Pills Display */}
            <div className="pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">Active Filters:</span>
                {pills.length > 0 && (
                  <button
                    onClick={clearAllPills}
                    className="text-[10px] text-rose-600 hover:underline font-semibold cursor-pointer"
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
                      <span className="opacity-70 text-[10px] uppercase tracking-wider">{pill.category}:</span>
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
              Matched Candidates ({matchedResumes.length})
            </h2>
            {selectedCandidateIds.length > 0 && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                {selectedCandidateIds.length} Selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
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
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-3 w-10">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer">
                    {selectedCandidateIds.length > 0 && selectedCandidateIds.length === matchedResumes.length ? (
                      <CheckSquare size={16} className="text-indigo-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">Candidate Name</th>
                <th className="py-3 px-3">Designation / Role</th>
                <th className="py-3 px-3">Experience</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Primary Skills</th>
                <th className="py-3 px-3">AI Tech Score</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-indigo-600" />
                      <span>Fetching matched candidates from backend API...</span>
                    </div>
                  </td>
                </tr>
              ) : matchedResumes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No matching candidate records found. Try adjusting filter parameters.
                  </td>
                </tr>
              ) : (
                matchedResumes.map((row) => {
                  const p = row.parsed_data || {};
                  const evalInfo = row.ai_evaluation || {};
                  const name = p.full_name || p.name || row.original_filename || "Candidate";
                  const role = p.designation || p.role || "Software Professional";
                  const exp = p.total_experience_years !== undefined && p.total_experience_years !== null
                    ? `${p.total_experience_years} Yrs`
                    : p.years_of_experience !== undefined
                    ? `${p.years_of_experience} Yrs`
                    : "N/A";
                  const loc = p.location || "N/A";
                  const skillsList: string[] = p.primary_skills || p.skills || [];
                  const score = evalInfo.ai_technical_score ?? 0;
                  const isSelected = selectedCandidateIds.includes(row.id);

                  return (
                    <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? "bg-indigo-50/50" : ""}`}>
                      <td className="py-3.5 px-3">
                        <button onClick={() => toggleSelectCandidate(row.id)} className="text-slate-400 hover:text-indigo-600 cursor-pointer">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-900">{name}</td>
                      <td className="py-3.5 px-3 text-slate-700 font-medium">{role}</td>
                      <td className="py-3.5 px-3 text-slate-500">{exp}</td>
                      <td className="py-3.5 px-3 text-slate-500">{loc}</td>
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {skillsList.slice(0, 4).map((s, idx) => (
                            <span key={idx} className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] px-2 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                          {skillsList.length > 4 && (
                            <span className="text-[10px] text-slate-500 font-semibold self-center">
                              +{skillsList.length - 4} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-bold text-emerald-600 text-xs">
                          {score}%
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {row.s3_url ? (
                          <a
                            href={row.s3_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                          >
                            View Resume
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">No File</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* GLOBAL INTERVIEW ASSIGNMENT MODAL (COLORFUL & USER-FRIENDLY UI) */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-600 shadow-xs">
                  <Sparkles size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Assign Global Interview Session
                    </h2>
                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                      {selectedCandidateIds.length > 0 ? selectedCandidateIds.length : matchedResumes.length} Candidate(s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Schedule and save interview records for all selected candidates into MongoDB database
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignInterviewSubmit} className="space-y-6 text-xs">
              
              {/* SECTION 1: JOB & INTERVIEW SETUP */}
              <div className="bg-slate-50 border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                    <Briefcase size={15} />
                    <span>Job Role, Location & Interview Setup</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Schema: job_location / job_type</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      Job Title / Role <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Senior Fullstack Engineer"
                      value={interviewForm.job_title}
                      onChange={(e) => setInterviewForm({ ...interviewForm, job_title: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Building2 size={13} className="text-indigo-600" /> Job Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bangalore / Remote / Hybrid"
                      value={interviewForm.job_location}
                      onChange={(e) => setInterviewForm({ ...interviewForm, job_location: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Briefcase size={13} className="text-indigo-600" /> Job Type
                    </label>
                    <select
                      value={interviewForm.job_type}
                      onChange={(e) => setInterviewForm({ ...interviewForm, job_type: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-indigo-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                    >
                      <option value="Full Time">💼 Full Time</option>
                      <option value="Part Time">⏱️ Part Time</option>
                      <option value="Contract">📄 Contract</option>
                      <option value="Hybrid">🏢 Hybrid</option>
                      <option value="Remote">🌐 Remote</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Layers size={13} className="text-indigo-600" /> Interview Type
                    </label>
                    <select
                      value={interviewForm.interview_type}
                      onChange={(e) => setInterviewForm({ ...interviewForm, interview_type: e.target.value as InterviewTypeEnum })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-indigo-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                    >
                      <option value="TECHNICAL">💻 TECHNICAL</option>
                      <option value="HR">👥 HR SCREENING</option>
                      <option value="MANAGERIAL">👔 MANAGERIAL</option>
                      <option value="CULTURE_FIT">🌟 CULTURE FIT</option>
                      <option value="FINAL_ROUND">🏆 FINAL ROUND</option>
                      <option value="INITIAL_SCREENING">📋 INITIAL SCREENING</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Hash size={13} className="text-indigo-600" /> Round Number
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={interviewForm.round_number}
                      onChange={(e) => setInterviewForm({ ...interviewForm, round_number: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: SCHEDULE & MEETING LINK */}
              <div className="bg-slate-50 border border-sky-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-sky-700 font-bold text-xs border-b border-sky-100 pb-2">
                  <Clock size={15} />
                  <span>Date, Time & Video Meeting</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Calendar size={13} className="text-sky-600" /> Scheduled Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={interviewForm.scheduled_date}
                      onChange={(e) => setInterviewForm({ ...interviewForm, scheduled_date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Clock size={13} className="text-sky-600" /> Scheduled Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={interviewForm.scheduled_time}
                      onChange={(e) => setInterviewForm({ ...interviewForm, scheduled_time: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Duration (Minutes)</label>
                    <input
                      type="number"
                      step="15"
                      value={interviewForm.duration_minutes}
                      onChange={(e) => setInterviewForm({ ...interviewForm, duration_minutes: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Video size={13} className="text-sky-600" /> Meeting Platform
                    </label>
                    <select
                      value={interviewForm.meeting_platform}
                      onChange={(e) => setInterviewForm({ ...interviewForm, meeting_platform: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sky-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium cursor-pointer"
                    >
                      <option value="Google Meet">🎥 Google Meet</option>
                      <option value="Zoom">📹 Zoom</option>
                      <option value="Microsoft Teams">💻 Microsoft Teams</option>
                      <option value="In Person">🏢 In Person / Office</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Meeting Link / Address</label>
                    <input
                      type="text"
                      placeholder="https://meet.google.com/abc-defg-hij"
                      value={interviewForm.meeting_link}
                      onChange={(e) => setInterviewForm({ ...interviewForm, meeting_link: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: INTERVIEWER & LOCATION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Interviewer Box */}
                <div className="bg-slate-50 border border-purple-200 rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-xs border-b border-purple-100 pb-2">
                    <UserCheck size={15} />
                    <span>Interviewer Details</span>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Interviewer Name <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Rivera (Tech Lead)"
                      value={interviewForm.interviewer_name}
                      onChange={(e) => setInterviewForm({ ...interviewForm, interviewer_name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Mail size={12} className="text-purple-600" /> Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="interviewer@company.com"
                      value={interviewForm.interviewer_email}
                      onChange={(e) => setInterviewForm({ ...interviewForm, interviewer_email: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>
                </div>

                {/* Location & Verification Box */}
                <div className="bg-slate-50 border border-emerald-200 rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                      <MapPin size={15} />
                      <span>Interview Location & Verification</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <MapPin size={12} className="text-emerald-600" /> Interview Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Conference Room A / Bangalore Office"
                      value={interviewForm.interview_location || interviewForm.location}
                      onChange={(e) => setInterviewForm({ ...interviewForm, interview_location: e.target.value, location: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-600" /> HR Call Verification
                    </label>
                    <select
                      value={interviewForm.hr_call_verification}
                      onChange={(e) => setInterviewForm({ ...interviewForm, hr_call_verification: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-emerald-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-bold cursor-pointer"
                    >
                      <option value="Verified">✅ Verified (Eligible)</option>
                      <option value="Pending">⏳ Pending Verification</option>
                      <option value="Needs Followup">📞 Needs Followup Call</option>
                      <option value="Not Eligible">❌ Not Eligible</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 5: DOCUMENTS & UPLOAD & NOTES */}
              <div className="bg-slate-50 border border-rose-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                    <FileText size={15} />
                    <span>Interview Document Files (URLs & Upload)</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 font-semibold flex items-center gap-1">
                      <FileText size={12} className="text-rose-600" /> Attached Document Files (URLs or Uploaded filenames)
                    </label>
                    {/* FILE UPLOAD BUTTON */}
                    <label className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs px-3 py-1 rounded-xl cursor-pointer font-bold transition-all shadow-xs">
                      <Upload size={13} />
                      <span>Browse / Attach Files</span>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <textarea
                    rows={2}
                    value={interviewForm.interview_document_files}
                    onChange={(e) => setInterviewForm({ ...interviewForm, interview_document_files: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono text-[11px]"
                    placeholder="Document names or URLs (one per line)... Use button above to attach files directly."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                    <AlignLeft size={12} className="text-rose-600" /> Notes / Special Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={interviewForm.notes}
                    onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                    placeholder="Key assessment areas, candidate prep notes, internal guidelines..."
                  />
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="flex justify-end items-center gap-4 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {assignLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Saving Interviews into MongoDB...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Save & Assign Interviews Globally</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}


