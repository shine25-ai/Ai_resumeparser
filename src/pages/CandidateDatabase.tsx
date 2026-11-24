import { useState, useEffect } from "react";
import { Search, Filter, Download, FileText, User, ChevronLeft, ChevronRight, X, SlidersHorizontal, Edit3, Calendar, Briefcase } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CompanyFilter, CompanyPills, appliedCompanies, useCompanies } from "../components/CompanyTags";
import { getResumes, exportResumesApi, type CandidateQueryParams, type SortOption, SORT_OPTION_LABELS } from "../utils/Api";
import { getCandidateRole, formatExperience } from "../utils/candidateFields";
import { CANDIDATE_STAGES, getVerdictBadge, getStageBadge } from "../utils/interviewState";
import { CandidateEditModal } from "../components/CandidateEditModal";
import { useFeedback } from "../components/ui/Feedback";

function getPaginationPages(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 3) {
    return [1, 2, 3, 4, "...", totalPages];
  }
  if (currentPage >= totalPages - 2) {
    return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export default function CandidateDatabase() {
  const { toast } = useFeedback();

  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});

  // Candidate Edit Modal State
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Pagination & Server Search/Filter State
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  // URL-driven dashboard filters (?stage=, ?attention=, ?days=, ?seniority=, ?skill=, ?city=, ?source=, ?domain=, ?sort=)
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get("search") || "");
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const s = searchParams.get("sort");
    return (s && ["latest", "oldest", "ai_score", "experience_desc", "experience_asc", "name"].includes(s))
      ? (s as SortOption)
      : "latest";
  });
  const [stageFilter, setStageFilter] = useState<string>(() => {
    const st = searchParams.get("stage");
    return st && CANDIDATE_STAGES.includes(st as any) ? st : "All";
  });
  const companies = useCompanies();
  const [companyFilter, setCompanyFilter] = useState<string>(() => searchParams.get("company") || "");
  const [attentionFilter, setAttentionFilter] = useState<string>(() => searchParams.get("attention") || "");
  const [stuckDaysFilter, setStuckDaysFilter] = useState<number>(() => {
    const d = Number(searchParams.get("days"));
    return Number.isFinite(d) && d > 0 ? d : 7;
  });
  const [seniorityFilter, setSeniorityFilter] = useState<string>(() => searchParams.get("seniority") || "");
  const [skillFilter, setSkillFilter] = useState<string>(() => searchParams.get("skill") || "");
  const [cityFilter, setCityFilter] = useState<string>(() => searchParams.get("city") || "");
  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get("source") || "");
  const [domainFilter, setDomainFilter] = useState<string>(() => searchParams.get("domain") || "");

  // Sync if user navigates to /database with new query params
  useEffect(() => {
    const st = searchParams.get("stage");
    if (st && CANDIDATE_STAGES.includes(st as any)) setStageFilter(st);
    setAttentionFilter(searchParams.get("attention") || "");
    const d = Number(searchParams.get("days"));
    if (Number.isFinite(d) && d > 0) setStuckDaysFilter(d);
    setSeniorityFilter(searchParams.get("seniority") || "");
    setSkillFilter(searchParams.get("skill") || "");
    setCityFilter(searchParams.get("city") || "");
    setSourceFilter(searchParams.get("source") || "");
    setDomainFilter(searchParams.get("domain") || "");
    const q = searchParams.get("search");
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

  // Advanced Specific Field Filters State
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [nameFilter, setNameFilter] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [expFilter, setExpFilter] = useState<string>("");

  const getSeniorityBounds = (tier: string): { min?: number; max?: number } => {
    if (tier === "Junior") return { min: 0, max: 2 };
    if (tier === "Mid") return { min: 2, max: 5 };
    if (tier === "Senior") return { min: 5, max: 8 };
    if (tier === "Lead / Architect") return { min: 8 };
    return {};
  };

  const getDomainKeyword = (dom: string): string => {
    const d = dom.toLowerCase();
    if (d.includes("data")) return "data";
    if (d.includes("support") || d.includes("security")) return "support";
    if (d.includes("software")) return "developer";
    if (d.includes("project") || d.includes("product")) return "manager";
    if (d.includes("cloud") || d.includes("devops")) return "cloud";
    if (d.includes("qa") || d.includes("test")) return "qa";
    return dom;
  };

  const clearDashboardFilter = () => {
    setAttentionFilter("");
    setSeniorityFilter("");
    setSkillFilter("");
    setCityFilter("");
    setSourceFilter("");
    setDomainFilter("");
    setStageFilter("All");
    setSearchTerm("");
    setPage(1);
    setSearchParams({}, { replace: true });
  };

  const activeDashboardFilterLabel = (() => {
    const parts: string[] = [];
    if (attentionFilter === "unreviewed") parts.push("Resumes waiting for review");
    else if (attentionFilter === "low_confidence") parts.push("Resumes needing manual check");
    else if (attentionFilter === "stuck") parts.push(`Candidates waiting over ${stuckDaysFilter} days`);
    else if (attentionFilter === "selected") parts.push("Selected & Offer candidates");
    if (seniorityFilter) parts.push(`Experience: ${seniorityFilter}`);
    if (skillFilter) parts.push(`Skill: ${skillFilter}`);
    if (cityFilter) parts.push(`City: ${cityFilter}`);
    if (sourceFilter) parts.push(`Source: ${sourceFilter}`);
    if (domainFilter) parts.push(`Category: ${domainFilter}`);
    return parts.join(" · ");
  })();

  // Export State & Handlers
  const [exportLoading, setExportLoading] = useState<boolean>(false);

  const handleExportZIP = async () => {
    try {
      setExportLoading(true);
      await exportResumesApi("zip", {
        search: searchTerm,
        name: nameFilter,
        email: emailFilter,
        role: roleFilter,
      });
    } catch (err: any) {
      console.error("ZIP export failed:", err);
      toast(err.message || "Failed to download candidate ZIP archive from S3.", "error");
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates(page, limit, searchTerm, nameFilter, emailFilter, roleFilter, expFilter);
  }, [
    page,
    limit,
    sortBy,
    stageFilter,
    companyFilter,
    attentionFilter,
    stuckDaysFilter,
    seniorityFilter,
    skillFilter,
    cityFilter,
    sourceFilter,
    domainFilter,
  ]);

  // Debounced search on typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchCandidates(1, limit, searchTerm, nameFilter, emailFilter, roleFilter, expFilter);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCandidates = async (
    targetPage: number = page,
    targetLimit: number = limit,
    searchVal: string = searchTerm,
    nVal: string = nameFilter,
    eVal: string = emailFilter,
    rVal: string = roleFilter,
    expVal: string = expFilter
  ) => {
    setLoading(true);
    try {
      const senBounds = getSeniorityBounds(seniorityFilter);
      const effectiveRole = rVal || (domainFilter ? getDomainKeyword(domainFilter) : "");

      const params: CandidateQueryParams = {
        page: targetPage,
        limit: targetLimit,
        search: searchVal,
        name: nVal,
        email: eVal,
        role: effectiveRole,
        experience: expVal ? Number(expVal) : undefined,
        min_experience: senBounds.min,
        max_experience: senBounds.max,
        sort_by: sortBy,
        stage: stageFilter,
        company_id: companyFilter,
        attention: attentionFilter || undefined,
        stuck_days: attentionFilter === "stuck" ? stuckDaysFilter : undefined,
        source: sourceFilter || undefined,
        skills: skillFilter ? [skillFilter] : undefined,
        location: cityFilter ? [cityFilter] : undefined,
      };

      const resData = await getResumes(params);
      const items = resData.resumes || [];

      const mapped = items.map((item: any) => ({
        id: item.candidate_id || `CND-${item.id.substring(0, 6).toUpperCase()}`,
        realId: item.id,
        name: item.parsed_data?.full_name || item.parsed_data?.name || item.original_filename || "Candidate",
        candidateName: item.parsed_data?.full_name || item.parsed_data?.name || item.original_filename || "Candidate",
        email: item.parsed_data?.email || item.email || "N/A",
        candidateRole: getCandidateRole(item.parsed_data, "Role not specified"),
        appliedJob: item.job_title || item.applied_jobs?.[0]?.job_title || item.latest_interview?.job_title || null,
        appliedJobs: Array.isArray(item.applied_jobs) ? item.applied_jobs : [],
        role: getCandidateRole(item.parsed_data, "Role not specified"),
        targetRole: item.job_title || item.applied_jobs?.[0]?.job_title || getCandidateRole(item.parsed_data, "N/A"),
        source: item.resume_source || "N/A",
        category: item.category || "",
        companies: appliedCompanies(item),
        uploadedBy: item.uploaded_by_name || item.uploaded_by_email || "System / HR",
        experience: formatExperience(item.parsed_data),
        match: typeof item.ai_evaluation?.ai_technical_score === "number"
          ? `${item.ai_evaluation.ai_technical_score}%`
          : "Not scored",
        status: item.status ? String(item.status).toUpperCase() : "PARSED",
        stage: item.stage || "Screening",
        statusBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        s3Url: item.s3_url,
        lastUpdated: item.upload_date
          ? new Date(item.upload_date).toLocaleDateString()
          : new Date().toLocaleDateString(),
        interviewAssigned: Boolean(item.interview_assigned),
        interviewStatus: item.interview_status || (item.interview_assigned ? "ASSIGNED" : "NOT_ASSIGNED"),
        lastInterviewAssignedDate: item.last_interview_assigned_date
          ? new Date(item.last_interview_assigned_date).toLocaleDateString()
          : null,
        latestInterview: item.latest_interview || null,
        rawData: item,
      }));

      setCandidates(mapped);
      setTotalCount(resData.total || 0);
      setTotalPages(resData.total_pages || Math.ceil((resData.total || 0) / targetLimit) || 1);
      if (resData.stage_counts) {
        setStageCounts(resData.stage_counts);
      }
    } catch (err) {
      console.error("Failed to fetch candidates from backend API:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAdvancedFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCandidates(1, limit, searchTerm, nameFilter, emailFilter, roleFilter, expFilter);
    setShowFilterModal(false);
  };

  const handleResetFilters = () => {
    setNameFilter("");
    setEmailFilter("");
    setRoleFilter("");
    setExpFilter("");
    setSearchTerm("");
    setPage(1);
    fetchCandidates(1, limit, "", "", "", "", "");
    setShowFilterModal(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === candidates.length && candidates.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(candidates.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const startRecord = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, totalCount);

  return (
    <div className="max-w-[1380px] mx-auto space-y-5 pb-10 font-sans text-slate-900">
      {/* 1. Unified Page Header matching Dashboard layout */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-slate-900 tracking-[-0.02em] leading-tight">
              Candidate Database
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
              {totalCount} Candidates
            </span>
          </div>
          <p className="text-xs font-medium text-slate-600 mt-0.5">
            Search, filter, and review candidate talent profiles and application statuses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => navigate("/resume-templates")}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-2xs cursor-pointer"
          >
            <FileText size={14} className="text-slate-500" />
            <span>Resume templates</span>
          </button>

          <button
            onClick={handleExportZIP}
            disabled={exportLoading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            <span>{exportLoading ? "Exporting ZIP..." : "Export Resumes (ZIP)"}</span>
          </button>
        </div>
      </div>

      {/* Main Table Card (Single Layer, Full Width, matching Dashboard Cards) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        {/* Active Dashboard Drill-Down Filter Chip */}
        {activeDashboardFilterLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-indigo-50/80 border border-indigo-200/80 text-xs text-indigo-800">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              <span className="font-medium">Showing:</span>
              <span className="font-semibold">{activeDashboardFilterLabel}</span>
              <span className="text-indigo-600">({totalCount} matching)</span>
            </div>
            <button
              type="button"
              onClick={clearDashboardFilter}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100/60 font-medium transition-colors"
            >
              <X size={12} />
              <span>Clear filter</span>
            </button>
          </div>
        )}

        {/* Modern Segmented Stage Tabs with Live Count Badges */}
        <div role="radiogroup" aria-label="Filter by hiring stage" className="flex items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto scrollbar-none shadow-2xs">
          {["All", ...CANDIDATE_STAGES].map((st) => {
            const hasCounts = Object.keys(stageCounts).length > 0;
            const fallbackCount = st === "All"
              ? totalCount
              : candidates.filter((c) => (c.stage || "Screening").toLowerCase() === st.toLowerCase()).length;
            const count = stageCounts[st] !== undefined
              ? stageCounts[st]
              : (hasCounts ? 0 : (candidates.length > 0 ? fallbackCount : (st === "All" ? totalCount : undefined)));
            const isActive = stageFilter === st;
            return (
              <button
                key={st}
                role="radio"
                aria-checked={isActive}
                onClick={() => {
                  setStageFilter(st);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-indigo-700 shadow-xs border border-slate-200/90"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <span>{st}</span>
                {count !== undefined && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight ${
                      isActive
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-200/80 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input Bar & Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by candidate name, email, role, ID..."
              className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <CompanyFilter
              companies={companies}
              value={companyFilter}
              onChange={(value) => {
                setPage(1);
                setCompanyFilter(value);
              }}
            />
            <select
              value={sortBy}
              onChange={(e) => {
                setPage(1);
                setSortBy(e.target.value as SortOption);
              }}
              aria-label="Sort candidates"
              className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:border-indigo-500 hover:bg-slate-50 transition-colors"
            >
              {SORT_OPTION_LABELS.map((o) => (
                <option key={o.value} value={o.value}>Sort: {o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilterModal(!showFilterModal)}
              className={`flex items-center gap-2 border px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                nameFilter || emailFilter || roleFilter || expFilter
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter size={14} />
              <span>Filters</span>
              {(nameFilter || emailFilter || roleFilter || expFilter) && (
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
              )}
            </button>
          </div>
        </div>

        {/* Advanced Field Filters Expandable Panel */}
        {showFilterModal && (
          <form
            onSubmit={handleApplyAdvancedFilters}
            className="p-4 bg-slate-50/80 border border-indigo-100 rounded-2xl space-y-4 animate-fadeIn"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <SlidersHorizontal size={14} className="text-indigo-600" />
                <span>Backend Candidate Filters</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Candidate Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="text"
                  placeholder="candidate@gmail.com"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Role / Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Frontend Engineer"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Min Experience (Yrs)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="e.g. 3"
                  value={expFilter}
                  onChange={(e) => setExpFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Reset Filters
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Apply Backend Filters
              </button>
            </div>
          </form>
        )}

        {/* Database Candidates Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-y border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === candidates.length && candidates.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 bg-white accent-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Candidate</th>
                <th className="py-3 px-3">Role & Applied Job</th>
                <th className="py-3 px-3">Exp & AI Fit</th>
                <th className="py-3 px-3">Interview Status</th>
                <th className="py-3 px-3">Stage</th>
                <th className="py-3 px-3">Date Added</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading candidate pages from database...</span>
                    </div>
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                    No candidate records found matching current query.
                  </td>
                </tr>
              ) : (
                candidates.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="rounded border-slate-300 bg-white accent-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-900">{row.name}</span>
                        <span className="text-[11px] text-slate-500">{row.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1">
                        {/* Primary: Job Applied For (or Direct Intake General Pool) */}
                        {row.appliedJob ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Briefcase size={13} className="text-indigo-600 shrink-0" />
                            <span className="text-slate-900 font-bold text-xs" title={`Applied for: ${row.appliedJob}`}>
                              {row.appliedJob}
                            </span>
                            {row.appliedJobs.length > 1 && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 cursor-help"
                                title={`Applied to ${row.appliedJobs.length} roles: ${row.appliedJobs.map((j: any) => j.job_title).filter(Boolean).join(", ")}`}
                              >
                                +{row.appliedJobs.length - 1} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 w-fit">
                              Direct Intake (General Pool)
                            </span>
                          </div>
                        )}

                        {/* Subtext: Candidate's Parsed Resume Designation */}
                        {row.candidateRole && (!row.appliedJob || row.candidateRole.toLowerCase() !== row.appliedJob.toLowerCase()) && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            Profile: <span className="text-slate-700 font-semibold">{row.candidateRole}</span>
                          </div>
                        )}

                        {/* Clean Metadata Line */}
                        <div className="flex flex-wrap gap-1.5 items-center text-[11px] text-slate-500 mt-0.5">
                          <CompanyPills companies={row.companies} />
                          {row.category && (
                            <span className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2 text-[10px] font-bold">
                              {row.category}
                            </span>
                          )}
                          {row.source && row.source !== "N/A" && (
                            <span className="text-slate-500 text-[10px] font-medium">
                              • Source: <span className="text-slate-700 font-semibold">{row.source}</span>
                            </span>
                          )}
                          {row.uploadedBy && (
                            <span className="text-slate-400 text-[10px]">
                              • By {row.uploadedBy}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Combined Experience & AI Score Column */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-900 text-xs">{row.experience}</span>
                        {row.match !== "Not scored" ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {row.match} Fit
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400">Not scored</span>
                        )}
                      </div>
                    </td>
                    {/* Interview Assignment Status */}
                    <td className="py-3.5 px-3 min-w-[200px]">
                      {row.interviewAssigned ? (
                        <div className="flex flex-col gap-1.5">
                          {(() => {
                            const rawRec = row.latestInterview?.recommendation;
                            const verdict = row.latestInterview?.verdict || 
                              (rawRec && rawRec !== "Pending"
                                ? (["Selected", "Recommended", "Strong Hire", "Hire", "Offer to Be Released", "Offer Accepted"].some((v) => v.toLowerCase() === rawRec.toLowerCase()) ? "Selected" :
                                   ["Rejected", "Not Recommended", "No Hire", "Offer Rejected"].some((v) => v.toLowerCase() === rawRec.toLowerCase()) ? "Rejected" :
                                   ["On Hold", "Hold", "Need Further Evaluation"].some((v) => v.toLowerCase() === rawRec.toLowerCase()) ? "On Hold" : rawRec)
                                : null);

                            if (verdict && verdict !== "Pending") {
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border w-fit ${getVerdictBadge(verdict)}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${verdict === "Selected" ? "bg-emerald-600" : verdict === "Rejected" ? "bg-rose-600" : "bg-amber-600"}`}></span>
                                  {verdict}
                                </span>
                              );
                            }

                            // If feedback or rating is already submitted but no explicit decision picked yet
                            if (
                              row.latestInterview?.status === "COMPLETED" ||
                              (row.latestInterview?.rating && Number(row.latestInterview.rating) > 0) ||
                              (row.latestInterview?.client_rating && Number(row.latestInterview.client_rating) > 0) ||
                              row.latestInterview?.feedback ||
                              row.latestInterview?.client_feedback
                            ) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-teal-50 border border-teal-200 text-teal-700 w-fit">
                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
                                  Feedback Submitted
                                </span>
                              );
                            }

                            return (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                Interview Assigned
                              </span>
                            );
                          })()}
                          {row.lastInterviewAssignedDate && (
                            <span className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
                              <Calendar size={12} className="text-indigo-600 shrink-0" />
                              {row.lastInterviewAssignedDate}
                            </span>
                          )}
                          {row.latestInterview?.job_title && (
                            <span className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]" title={row.latestInterview.job_title}>
                              Role: {row.latestInterview.job_title}
                            </span>
                          )}

                          {/* Saved Evaluation Feedback snippet */}
                          {row.latestInterview && (row.latestInterview.feedback || row.latestInterview.rating || row.latestInterview.client_feedback) && (
                            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] space-y-1 mt-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-800 truncate">
                                  By {row.latestInterview.interviewer_name || row.latestInterview.client_name || "Evaluator"}
                                </span>
                                {(row.latestInterview.rating || row.latestInterview.client_rating) && (
                                  <span className="text-amber-800 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] shrink-0">
                                    ★ {row.latestInterview.rating || row.latestInterview.client_rating} / 5
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Date: {row.latestInterview.client_feedback_date ||
                                  (row.latestInterview.updated_at
                                    ? new Date(row.latestInterview.updated_at).toLocaleDateString()
                                    : row.latestInterview.scheduled_date || "N/A")}
                              </div>
                              {(row.latestInterview.feedback || row.latestInterview.client_feedback) && (
                                <p
                                  className="text-[11px] text-slate-600 line-clamp-2 italic leading-snug"
                                  title={row.latestInterview.feedback || row.latestInterview.client_feedback}
                                >
                                  "{row.latestInterview.feedback || row.latestInterview.client_feedback}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-500 w-fit">
                          Not Assigned
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStageBadge(row.stage)}`}>
                        {row.stage}
                      </span>
                      {/* Parse status only matters when parsing did not finish */}
                      {row.status !== "PARSED" && (
                        <span className="block mt-1 text-xs font-semibold text-amber-700">Parse: {row.status.toLowerCase()}</span>
                      )}
                    </td>
                    {/* Date Column */}
                    <td className="py-3.5 px-3 text-slate-500 font-medium whitespace-nowrap">
                      <span className="text-slate-700 font-semibold text-xs">
                        {row.lastUpdated}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80 shadow-2xs">
                        <button
                          onClick={() => {
                            navigate("/interviews", {
                              state: {
                                scheduleCandidate: {
                                  candidate_id: row.realId || row.id,
                                  candidate_name: row.candidateName,
                                  candidate_email: row.email !== "N/A" ? row.email : "",
                                  resume_id: row.realId || row.id,
                                  job_title: row.appliedJob || (row.targetRole !== "N/A" ? row.targetRole : row.candidateRole),
                                },
                              },
                            });
                          }}
                          className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors text-slate-500 cursor-pointer"
                          title="Assign / Schedule New Interview Session"
                          aria-label="Schedule interview"
                        >
                          <Calendar size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditCandidateId(row.realId);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-white hover:text-slate-900 hover:shadow-2xs rounded-lg transition-colors text-slate-500 cursor-pointer"
                          title="Edit Candidate Resume & Evaluation Details"
                          aria-label="Edit candidate"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/candidates/${row.realId}`)}
                          className="p-1.5 hover:bg-white hover:text-indigo-600 hover:shadow-2xs rounded-lg transition-colors text-slate-500 cursor-pointer"
                          title="View Candidate Full Evaluation Page"
                          aria-label="View profile"
                        >
                          <User size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (row.s3Url) {
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <!DOCTYPE html>
                                  <html>
                                    <head>
                                      <title>Resume Preview</title>
                                      <style>
                                        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #ffffff; }
                                        iframe { width: 100%; height: 100%; border: none; }
                                      </style>
                                    </head>
                                    <body>
                                      <iframe src="${row.s3Url}"></iframe>
                                    </body>
                                  </html>
                                `);
                              } else {
                                window.location.href = row.s3Url;
                              }
                            } else {
                              toast("S3 Resume link is not available for this candidate.", "warning");
                            }
                          }}
                          className="p-1.5 hover:bg-white hover:text-slate-900 hover:shadow-2xs rounded-lg transition-colors text-slate-500 cursor-pointer"
                          title="Open PDF Resume Document (New Tab)"
                          aria-label="Open PDF resume"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Backend Pagination Footer Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200/90 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="font-semibold text-slate-900">{startRecord}</strong>–<strong className="font-semibold text-slate-900">{endRecord}</strong> of{" "}
              <strong className="font-bold text-slate-900">{totalCount}</strong> candidates
            </span>

            <span className="h-3.5 w-px bg-slate-200 hidden sm:inline" />

            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="font-medium">Per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  const newLimit = Number(e.target.value);
                  setLimit(newLimit);
                  setPage(1);
                }}
                aria-label="Candidates per page"
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Previous page"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex items-center gap-0.5 mx-1">
              {getPaginationPages(page, totalPages).map((item, idx) => {
                if (item === "...") {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      className="w-8 h-8 flex items-center justify-center text-slate-400 text-xs font-bold select-none"
                    >
                      •••
                    </span>
                  );
                }
                const pageNum = Number(item);
                const isActive = page === pageNum;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    disabled={loading}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                    aria-label={`Page ${pageNum}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Next page"
              title="Next Page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Multi-Select Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-4 animate-fadeIn">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{selectedIds.length} candidate{selectedIds.length > 1 ? "s" : ""} selected</span>
          </div>
          <div className="h-4 w-px bg-slate-700"></div>
          <button
            onClick={handleExportZIP}
            disabled={exportLoading}
            className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download size={13} />
            <span>Export ZIP</span>
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Candidate Edit Modal Component */}
      <CandidateEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditCandidateId(null);
        }}
        candidateId={editCandidateId}
        onSuccess={() => {
          fetchCandidates(page, limit, searchTerm, nameFilter, emailFilter, roleFilter, expFilter);
        }}
      />
    </div>
  );
}
