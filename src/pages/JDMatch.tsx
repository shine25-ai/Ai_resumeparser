import { useState, useEffect, useRef } from "react";
import {
  Filter, Search, RefreshCw, UserCheck, X, Calendar, CheckSquare, Square, FileText, CheckCircle,
  Briefcase, Clock, MapPin, ShieldCheck, Layers, AlignLeft, Sparkles, Video, Hash,
  Upload, Building2, AlertCircle, UserX, Plus, Trash2, Loader2, Eye
} from "lucide-react";
import { matchResumes, getParsedResumeSummary, batchCreateInterviews, checkCandidateActiveInterviewStatus, getUsers, uploadInterviewDocument, checkInterviewConflict, getInterviewTypes, type MatchFilterParams, type InterviewTypeEnum, type UserProfile, type InterviewerItem, type ClientFeedbackItem, type InterviewTypeItem } from "../utils/Api";

type FilterCategory = "Job Title" | "Location" | "Skill" | "Year of Passing" | "Min Exp" | "Max Exp" | "Keyword";

interface FilterPill {
  id: string;
  category: FilterCategory;
  value: string | number;
}

export default function JDMatch() {
  const [loading, setLoading] = useState(false);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [interviewTypes, setInterviewTypes] = useState<InterviewTypeItem[]>([]);

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
  const [blockedCandidatesList, setBlockedCandidatesList] = useState<any[]>([]);
  const [ignoredCandidateIds, setIgnoredCandidateIds] = useState<string[]>([]);
  const [checkingActiveStatus, setCheckingActiveStatus] = useState<boolean>(false);

  // Ignore single blocked candidate from batch assignment
  const handleIgnoreCandidate = (candidateId: string) => {
    setBlockedCandidatesList((prev) => prev.filter((b) => b.candidate_id !== candidateId));
    const newIgnored = [...new Set([...ignoredCandidateIds, candidateId])];
    setIgnoredCandidateIds(newIgnored);

    // Calculate remaining active target candidates count
    const baseTargets = selectedCandidateIds.length > 0
      ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
      : matchedResumes;
    const remainingCount = baseTargets.filter((r) => !newIgnored.includes(r.id)).length;

    if (remainingCount <= 0) {
      setIsAssignModalOpen(false);
    }
  };

  // Skip & Exclude all blocked candidates at once
  const handleIgnoreAllBlockedCandidates = () => {
    const blockedIds = blockedCandidatesList.map((b) => b.candidate_id);
    const newIgnored = [...new Set([...ignoredCandidateIds, ...blockedIds])];
    setIgnoredCandidateIds(newIgnored);
    setBlockedCandidatesList([]);

    // Calculate remaining active target candidates count
    const baseTargets = selectedCandidateIds.length > 0
      ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
      : matchedResumes;
    const remainingCount = baseTargets.filter((r) => !newIgnored.includes(r.id)).length;

    if (remainingCount <= 0) {
      setIsAssignModalOpen(false);
    }
  };

  // Form State for Global Interview Assignment
  const [interviewForm, setInterviewForm] = useState({
    job_title: "",
    job_location: "",
    job_type: "Full Time",
    interview_type: "TECHNICAL" as InterviewTypeEnum,
    interview_type_id: "",
    round_number: 1,
    scheduled_date: new Date().toISOString().split("T")[0],
    scheduled_time: "10:00",
    duration_minutes: 60,
    interviewer_id: "",
    interviewer_name: "",
    interviewer_email: "",
    client_id: "",
    client_name: "",
    client_email: "",
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

  // Multi Interviewer Panel State
  const [interviewersList, setInterviewersList] = useState<InterviewerItem[]>([
    { interviewer_name: "", interviewer_email: "" },
  ]);

  // Multi Client Panel State
  const [clientsList, setClientsList] = useState<ClientFeedbackItem[]>([
    { client_name: "", client_email: "" },
  ]);

  const handleAddInterviewer = () => {
    setInterviewersList((prev) => [...prev, { interviewer_name: "", interviewer_email: "" }]);
  };

  const handleRemoveInterviewer = (index: number) => {
    if (interviewersList.length <= 1) return;
    setInterviewersList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleInterviewerChange = (index: number, field: keyof InterviewerItem, val: any) => {
    setInterviewersList((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: val };
      }
      setTimeout(() => {
        checkScheduleTimeConflict({ interviewers: updated });
      }, 50);
      return updated;
    });
  };

  const handleAddClient = () => {
    setClientsList((prev) => [...prev, { client_name: "", client_email: "" }]);
  };

  const handleRemoveClient = (index: number) => {
    if (clientsList.length <= 1) return;
    setClientsList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClientChange = (index: number, field: keyof ClientFeedbackItem, val: any) => {
    setClientsList((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: val };
      }
      setTimeout(() => {
        checkScheduleTimeConflict({ clients: updated });
      }, 50);
      return updated;
    });
  };

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error" | "info" | "warning"; text: string } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (text: string, type: "success" | "error" | "info" | "warning" = "success", durationMs: number = 4000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage({ type, text });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
  };

  // Real-time Schedule Conflict Check state
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const checkScheduleTimeConflict = async (params?: {
    scheduled_date?: string;
    scheduled_time?: string;
    interviewer_id?: string;
    interviewer_name?: string;
    client_id?: string;
    client_name?: string;
    interviewers?: InterviewerItem[];
    clients?: ClientFeedbackItem[];
  }) => {
    const sDate = params?.scheduled_date ?? interviewForm.scheduled_date;
    const sTime = params?.scheduled_time ?? interviewForm.scheduled_time;
    const intId = params?.interviewer_id ?? interviewForm.interviewer_id;
    const intName = params?.interviewer_name ?? interviewForm.interviewer_name;
    const cliId = params?.client_id ?? interviewForm.client_id;
    const cliName = params?.client_name ?? interviewForm.client_name;
    const intList = params?.interviewers ?? interviewersList;
    const cliList = params?.clients ?? clientsList;

    const filteredInterviewers = intList ? intList.filter((i) => i.interviewer_name && i.interviewer_name.trim()) : [];
    const filteredClients = cliList ? cliList.filter((c) => c.client_name && c.client_name.trim()) : [];

    const hasInterviewer = intId || (intName && intName.trim()) || filteredInterviewers.length > 0;
    const hasClient = cliId || (cliName && cliName.trim()) || filteredClients.length > 0;

    if (!sDate || !sTime || (!hasInterviewer && !hasClient)) {
      setConflictWarning(null);
      return;
    }

    try {
      const res = await checkInterviewConflict({
        scheduled_date: sDate,
        scheduled_time: sTime,
        interviewer_id: intId,
        interviewer_name: intName,
        client_id: cliId,
        client_name: cliName,
        interviewers: filteredInterviewers.length > 0 ? filteredInterviewers : undefined,
        clients: filteredClients.length > 0 ? filteredClients : undefined,
      });

      if (res.has_conflict && res.conflict_message) {
        setConflictWarning(res.conflict_message);
        showToast(res.conflict_message, "warning");
      } else {
        setConflictWarning(null);
        showToast(`Time slot ${sTime} on ${sDate} is available`, "info");
      }
    } catch (err: any) {
      console.error("Conflict check error:", err);
    }
  };

  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Handle document file upload to AWS S3
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setIsUploadingFile(true);
      try {
        const uploadedUrls: string[] = [];
        for (const file of files) {
          const res = await uploadInterviewDocument(file);
          if (res?.s3_url) {
            uploadedUrls.push(res.s3_url);
          }
        }
        if (uploadedUrls.length > 0) {
          const existing = interviewForm.interview_document_files
            ? interviewForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
            : [];
          const combined = Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
          setInterviewForm((prev) => ({ ...prev, interview_document_files: combined }));
        }
      } catch (err: any) {
        console.error("Failed to upload file to S3:", err);
        alert(`Failed to upload document to S3: ${err.message || "Unknown error"}`);
      } finally {
        setIsUploadingFile(false);
        e.target.value = "";
      }
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

  // Fetch parsed resume summary dropdown values & registered system users
  useEffect(() => {
    const fetchSummaryDropdowns = async () => {
      try {
        const [res, usersData, typesData] = await Promise.all([
          getParsedResumeSummary().catch(() => null),
          getUsers().catch(() => []),
          getInterviewTypes().catch(() => []),
        ]);

        setInterviewTypes(Array.isArray(typesData) ? typesData : []);

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
        const userList = Array.isArray(usersData) ? usersData : (usersData as any)?.users || [];
        setSystemUsers(userList);
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

  // Open Global Interview Assignment Modal with Backend API Check
  const handleOpenAssignModal = async () => {
    const defaultJobPill = pills.find((p) => p.category === "Job Title");
    const jobTitleVal = defaultJobPill ? String(defaultJobPill.value) : "Software Engineer";

    setInterviewForm((prev) => ({
      ...prev,
      job_title: prev.job_title || jobTitleVal,
    }));

    setIsAssignModalOpen(true);
    setCheckingActiveStatus(true);
    setBlockedCandidatesList([]);
    setIgnoredCandidateIds([]);

    // Determine target candidate records
    const targetResumes = selectedCandidateIds.length > 0
      ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
      : matchedResumes;

    const blocked: any[] = [];
    for (const r of targetResumes) {
      const p = r.parsed_data || {};
      const nameStr = p.full_name || p.name || r.original_filename || "Candidate";
      try {
        const res = await checkCandidateActiveInterviewStatus(r.id, nameStr);
        if (res && res.has_active_interview) {
          blocked.push({
            candidate_id: r.id,
            candidate_name: nameStr,
            status: res.status,
            message: res.message,
          });
        }
      } catch (err) {
        console.warn("Failed to check active interview status from backend:", r.id, err);
      }
    }

    setBlockedCandidatesList(blocked);
    setCheckingActiveStatus(false);
  };

  // Submit Global Interview Assignment to Backend
  const handleAssignInterviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);
    setSuccessMessage(null);

    try {
      if (blockedCandidatesList.length > 0) {
        setAssignLoading(false);
        return;
      }

      // Determine targets: selected candidate records, or all matched candidate records (excluding ignored candidates)
      const targetResumes = (
        selectedCandidateIds.length > 0
          ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
          : matchedResumes
      ).filter((r) => !ignoredCandidateIds.includes(r.id));

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

      const primaryInt: Partial<InterviewerItem> = interviewersList[0] || {};
      const primaryClient: Partial<ClientFeedbackItem> = clientsList[0] || {};

      const filteredInterviewers = interviewersList.filter((i) => i.interviewer_name && i.interviewer_name.trim());
      const filteredClients = clientsList.filter((c) => c.client_name && c.client_name.trim());

      await batchCreateInterviews({
        candidates: candidateItems,
        job_title: interviewForm.job_title,
        job_location: interviewForm.job_location || undefined,
        job_type: interviewForm.job_type || undefined,
        interview_type: interviewForm.interview_type,
        interview_type_id: interviewForm.interview_type_id || undefined,
        round_number: Number(interviewForm.round_number),
        scheduled_date: interviewForm.scheduled_date,
        scheduled_time: interviewForm.scheduled_time,
        duration_minutes: Number(interviewForm.duration_minutes),
        interviewer_id: primaryInt.interviewer_id || interviewForm.interviewer_id || undefined,
        interviewer_name: primaryInt.interviewer_name || interviewForm.interviewer_name || "Hiring Manager",
        interviewer_email: primaryInt.interviewer_email || interviewForm.interviewer_email || undefined,
        client_id: primaryClient.client_id || interviewForm.client_id || undefined,
        client_name: primaryClient.client_name || interviewForm.client_name || undefined,
        client_email: primaryClient.client_email || interviewForm.client_email || undefined,
        interviewers: filteredInterviewers.length > 0 ? filteredInterviewers : undefined,
        clients: filteredClients.length > 0 ? filteredClients : undefined,
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
                <th className="py-3 px-3.5">Candidate & Role</th>
                <th className="py-3 px-3.5">Experience & Location</th>
                <th className="py-3 px-3.5">Primary Skills</th>
                <th className="py-3 px-3.5">AI Tech Score</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-indigo-600" />
                      <span>Fetching matched candidates from backend API...</span>
                    </div>
                  </td>
                </tr>
              ) : matchedResumes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
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
                    <tr key={row.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-indigo-50/40" : ""}`}>
                      <td className="py-3.5 px-3.5">
                        <button onClick={() => toggleSelectCandidate(row.id)} className="text-slate-400 hover:text-indigo-600 cursor-pointer">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                        </button>
                      </td>

                      {/* Candidate Name & Designation / Role */}
                      <td className="py-3.5 px-3.5">
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                            <span>{name}</span>
                            {p.email && (
                              <span className="text-[10px] text-slate-400 font-normal font-mono hidden xl:inline">
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
                            <span key={idx} className="bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-bold text-[10px] px-2.5 py-0.5 rounded-lg shadow-2xs">
                              {s}
                            </span>
                          ))}
                          {skillsList.length > 3 && (
                            <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-2xs">
                              +{skillsList.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* AI Tech Score */}
                      <td className="py-3.5 px-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border shadow-2xs ${score >= 70
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : score >= 40
                              ? "bg-amber-50 border-amber-200 text-amber-700"
                              : "bg-slate-100 border-slate-200 text-slate-600"
                          }`}>
                          {score}%
                        </span>
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
      </div>

      {/* GLOBAL INTERVIEW ASSIGNMENT MODAL (COLORFUL & USER-FRIENDLY FULL PAGE UI) */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl w-[94vw] max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">

            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-md text-white">
                  <Sparkles size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Assign Global Interview Session
                    </h2>
                    {(() => {
                      const baseTargets = selectedCandidateIds.length > 0
                        ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
                        : matchedResumes;
                      const activeCount = baseTargets.filter((r) => !ignoredCandidateIds.includes(r.id)).length;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                            {activeCount} Candidate(s) Selected
                          </span>
                          {ignoredCandidateIds.length > 0 && (
                            <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                              ({ignoredCandidateIds.length} Excluded / Ignored)
                            </span>
                          )}
                        </div>
                      );
                    })()}
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

            {/* Warning Banner for Candidates with Active Pending Interviews */}
            {blockedCandidatesList.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl space-y-3 text-xs font-semibold shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
                  <div className="flex items-center gap-2 text-amber-950 font-extrabold text-xs">
                    <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
                    <span>Active Interview Session Pending Feedback ({blockedCandidatesList.length} Candidate(s) Verified from DB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleIgnoreAllBlockedCandidates}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 self-start sm:self-auto"
                    title="Remove all blocked candidates from interview assignment and enable schedule submit"
                  >
                    <UserX size={14} />
                    <span>Skip & Exclude All Blocked ({blockedCandidatesList.length})</span>
                  </button>
                </div>
                <ul className="space-y-1.5 text-slate-800">
                  {blockedCandidatesList.map((b, idx) => (
                    <li key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/80 border border-amber-200 p-2.5 rounded-xl shadow-2xs">
                      <span>
                        • Candidate <span className="font-extrabold text-indigo-700">'{b.candidate_name}'</span> already has an assigned interview (Status: <span className="font-black text-amber-800 uppercase">{b.status}</span>) that is not yet completed.
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIgnoreCandidate(b.candidate_id)}
                        className="inline-flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer border border-amber-300 shadow-2xs shrink-0"
                        title="Exclude this candidate from interview assignment"
                      >
                        <UserX size={12} />
                        <span>Ignore / Exclude</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleAssignInterviewSubmit} className="space-y-6 text-xs">
              {/* 2-COLUMN / FULL-PAGE COLORFUL CARD GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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
                        onChange={(e) => {
                          const selectedVal = e.target.value;
                          const matched = interviewTypes.find((t) => t.code === selectedVal || t.id === selectedVal || t.name === selectedVal);
                          setInterviewForm({
                            ...interviewForm,
                            interview_type: (matched ? matched.code : selectedVal) as InterviewTypeEnum,
                            interview_type_id: matched ? matched.id : "",
                          });
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-indigo-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                      >
                        {interviewTypes && interviewTypes.length > 0 ? (
                          interviewTypes.filter((t) => t.is_active !== false).map((t) => (
                            <option key={t.id} value={t.code}>
                              {t.name} ({t.code})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="TECHNICAL">💻 TECHNICAL</option>
                            <option value="HR">👥 HR SCREENING</option>
                            <option value="MANAGERIAL">👔 MANAGERIAL</option>
                            <option value="CULTURE_FIT">🌟 CULTURE FIT</option>
                            <option value="FINAL_ROUND">🏆 FINAL ROUND</option>
                            <option value="INITIAL_SCREENING">📋 INITIAL SCREENING</option>
                          </>
                        )}
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

                {/* TIME SLOT CONFLICT WARNING BANNER */}
                {conflictWarning && (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5 shadow-xs animate-in fade-in duration-200">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-amber-950">Schedule Time Slot Warning</span>
                      <p className="font-medium mt-0.5 text-amber-900">{conflictWarning}</p>
                    </div>
                  </div>
                )}

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
                        onChange={(e) => {
                          const val = e.target.value;
                          setInterviewForm((prev) => ({ ...prev, scheduled_date: val }));
                          checkScheduleTimeConflict({ scheduled_date: val });
                        }}
                        onBlur={() => checkScheduleTimeConflict()}
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
                        onChange={(e) => {
                          const val = e.target.value;
                          setInterviewForm((prev) => ({ ...prev, scheduled_time: val }));
                          checkScheduleTimeConflict({ scheduled_time: val });
                        }}
                        onBlur={() => checkScheduleTimeConflict()}
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

                {/* SECTION 3: MULTI-INTERVIEWER & MULTI-CLIENT SELECTION PANEL */}
                <div className="space-y-4">
                  {/* Multi-Interviewer Panel Section */}
                  <div className="bg-slate-50 border border-purple-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                      <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
                        <UserCheck size={15} />
                        <span>Interviewer Panel Selection ({interviewersList.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddInterviewer}
                        className="flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Plus size={13} /> Add Interviewer
                      </button>
                    </div>

                    {interviewersList.map((interviewer, idx) => (
                      <div key={idx} className="p-3 bg-white border border-purple-100 rounded-xl space-y-2 relative shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-purple-900 uppercase">
                            Interviewer #{idx + 1}
                          </label>
                          {interviewersList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveInterviewer(idx)}
                              className="text-rose-500 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <select
                              value={interviewer.interviewer_id || (interviewer.interviewer_name ? "custom" : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "custom" || !val) {
                                  handleInterviewerChange(idx, "interviewer_id", undefined);
                                } else {
                                  const u = systemUsers.find((user) => user.id === val);
                                  if (u) {
                                    handleInterviewerChange(idx, "interviewer_id", u.id);
                                    handleInterviewerChange(idx, "interviewer_name", u.full_name);
                                    handleInterviewerChange(idx, "interviewer_email", u.email);
                                  }
                                }
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-purple-500 cursor-pointer"
                            >
                              <option value="">-- Choose Registered User --</option>
                              {systemUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name} ({u.role || u.email})
                                </option>
                              ))}
                              <option value="custom">+ External / Custom</option>
                            </select>
                          </div>

                          <div>
                            <input
                              type="text"
                              placeholder="Interviewer Name *"
                              value={interviewer.interviewer_name}
                              onChange={(e) => handleInterviewerChange(idx, "interviewer_name", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-purple-500 font-medium"
                              required={idx === 0}
                            />
                          </div>

                          <div>
                            <input
                              type="email"
                              placeholder="interviewer@company.com"
                              value={interviewer.interviewer_email || ""}
                              onChange={(e) => handleInterviewerChange(idx, "interviewer_email", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-purple-500 font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Multi-Client Panel Section */}
                  <div className="bg-slate-50 border border-teal-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-teal-100 pb-2">
                      <div className="flex items-center gap-2 text-teal-700 font-bold text-xs">
                        <Building2 size={15} />
                        <span>Client Evaluator Panel Selection ({clientsList.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddClient}
                        className="flex items-center gap-1 bg-teal-100 hover:bg-teal-200 text-teal-800 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Plus size={13} /> Add Client
                      </button>
                    </div>

                    {clientsList.map((client, idx) => (
                      <div key={idx} className="p-3 bg-white border border-teal-100 rounded-xl space-y-2 relative shadow-xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-bold text-teal-900 uppercase">
                            Client Evaluator #{idx + 1}
                          </label>
                          {clientsList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveClient(idx)}
                              className="text-rose-500 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <select
                              value={client.client_id || (client.client_name ? "custom" : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "custom" || !val) {
                                  handleClientChange(idx, "client_id", undefined);
                                } else {
                                  const u = systemUsers.find((user) => user.id === val);
                                  if (u) {
                                    handleClientChange(idx, "client_id", u.id);
                                    handleClientChange(idx, "client_name", u.full_name);
                                    handleClientChange(idx, "client_email", u.email);
                                  }
                                }
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-teal-500 cursor-pointer"
                            >
                              <option value="">-- Choose Registered User --</option>
                              {systemUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name} ({u.role || u.email})
                                </option>
                              ))}
                              <option value="custom">+ External / Custom</option>
                            </select>
                          </div>

                          <div>
                            <input
                              type="text"
                              placeholder="Client Name / Company"
                              value={client.client_name}
                              onChange={(e) => handleClientChange(idx, "client_name", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                            />
                          </div>

                          <div>
                            <input
                              type="email"
                              placeholder="client@company.com"
                              value={client.client_email || ""}
                              onChange={(e) => handleClientChange(idx, "client_email", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500 font-medium"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 4: LOCATION & VERIFICATION */}
                <div className="bg-slate-50 border border-emerald-200 rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                    <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                      <MapPin size={15} />
                      <span>Interview Location & HR Verification</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <label className={`inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs px-3 py-1 rounded-xl cursor-pointer font-bold transition-all shadow-xs ${isUploadingFile ? "opacity-60 pointer-events-none" : ""}`}>
                        {isUploadingFile ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-rose-600" />
                            <span>Uploading to S3...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Browse / Attach Files</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          disabled={isUploadingFile}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* ATTACHED FILES LIST CARDS WITH VIEW BUTTON */}
                    {(() => {
                      const attachedList = interviewForm.interview_document_files
                        ? interviewForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
                        : [];
                      if (attachedList.length === 0) return null;
                      return (
                        <div className="space-y-1.5 mb-2.5 mt-1">
                          {attachedList.map((fileStr, idx) => {
                            const isUrl = fileStr.startsWith("http://") || fileStr.startsWith("https://");
                            const rawName = fileStr.split("/").pop() || fileStr;
                            const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                            return (
                              <div key={idx} className="flex items-center justify-between gap-2 bg-white border border-rose-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText size={14} className="text-rose-600 shrink-0" />
                                  <span className="text-xs font-semibold text-slate-800 truncate" title={fileStr}>
                                    {displayName}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isUrl && (
                                    <a
                                      href={fileStr}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all shadow-2xs"
                                    >
                                      <Eye size={12} />
                                      <span>View</span>
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = attachedList.filter((_, i) => i !== idx).join("\n");
                                      setInterviewForm((prev) => ({ ...prev, interview_document_files: updated }));
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                                    title="Remove attachment"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Attached files chips are displayed above, no raw link textarea */}
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
                  disabled={blockedCandidatesList.length > 0 || checkingActiveStatus || assignLoading}
                  title={
                    blockedCandidatesList.length > 0
                      ? `Cannot assign: ${blockedCandidatesList.length} candidate(s) already have an active pending interview.`
                      : "Save & Assign Interviews Globally"
                  }
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${blockedCandidatesList.length > 0 || checkingActiveStatus || assignLoading
                      ? "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none opacity-60"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer active:scale-95"
                    }`}
                >
                  {checkingActiveStatus ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Checking Candidate DB Status...</span>
                    </>
                  ) : assignLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Saving Interviews into MongoDB...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>
                        Save & Assign Interviews Globally ({
                          (selectedCandidateIds.length > 0
                            ? matchedResumes.filter((r) => selectedCandidateIds.includes(r.id))
                            : matchedResumes
                          ).filter((r) => !ignoredCandidateIds.includes(r.id)).length
                        })
                      </span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold tracking-wide backdrop-blur-md ${
              toastMessage.type === "success"
                ? "bg-slate-900/95 text-emerald-400 border-emerald-500/40 shadow-emerald-950/30"
                : toastMessage.type === "error"
                ? "bg-slate-900/95 text-rose-400 border-rose-500/40 shadow-rose-950/30"
                : toastMessage.type === "warning"
                ? "bg-amber-950/95 text-amber-300 border-amber-500/50 shadow-amber-950/40"
                : "bg-slate-900/95 text-indigo-300 border-indigo-500/40"
            }`}
          >
            {toastMessage.type === "success" ? (
              <div className="p-1 bg-emerald-500/20 rounded-full text-emerald-400">
                <CheckCircle size={16} />
              </div>
            ) : toastMessage.type === "warning" ? (
              <div className="p-1 bg-amber-500/20 rounded-full text-amber-300">
                <AlertCircle size={16} />
              </div>
            ) : (
              <div className="p-1 bg-rose-500/20 rounded-full text-rose-400">
                <AlertCircle size={16} />
              </div>
            )}
            <span className="text-white font-semibold">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



