import { useState, useEffect } from "react";
import { Search, Filter, Download, FileText, User, ChevronLeft, ChevronRight, X, SlidersHorizontal, Edit3, Calendar } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CompanyFilter, CompanyPills, appliedCompanies, useCompanies } from "../components/CompanyTags";
import { getResumes, exportResumesApi, type CandidateQueryParams, type SortOption, SORT_OPTION_LABELS } from "../utils/Api";
import { getCandidateRole, formatExperience } from "../utils/candidateFields";
import { CANDIDATE_STAGES } from "../utils/interviewState";
import { CandidateEditModal } from "../components/CandidateEditModal";
import { useFeedback } from "../components/ui/Feedback";

export default function CandidateDatabase() {
  const { toast } = useFeedback();

  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Candidate Edit Modal State
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Pagination & Server Search/Filter State
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  // The Dashboard search box opens this page with ?search=<text>
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get("search") || "");
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const companies = useCompanies();
  const [companyFilter, setCompanyFilter] = useState<string>(() => searchParams.get("company") || "");

  // Advanced Specific Field Filters State
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [nameFilter, setNameFilter] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [expFilter, setExpFilter] = useState<string>("");

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
  }, [page, limit, sortBy, stageFilter, companyFilter]);

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
      const params: CandidateQueryParams = {
        page: targetPage,
        limit: targetLimit,
        search: searchVal,
        name: nVal,
        email: eVal,
        role: rVal,
        experience: expVal ? Number(expVal) : undefined,
        sort_by: sortBy,
        stage: stageFilter,
        company_id: companyFilter,
      };

      const resData = await getResumes(params);
      const items = resData.resumes || [];

      const mapped = items.map((item: any) => ({
        id: item.candidate_id || `CND-${item.id.substring(0, 6).toUpperCase()}`,
        realId: item.id,
        name: item.parsed_data?.full_name || item.parsed_data?.name || item.original_filename || "Candidate",
        candidateName: item.parsed_data?.full_name || item.parsed_data?.name || item.original_filename || "Candidate",
        email: item.parsed_data?.email || item.email || "N/A",
        role: getCandidateRole(item.parsed_data, "Role not specified"),
        targetRole: getCandidateRole(item.parsed_data, "N/A"),
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
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Candidate Database</h1>
          <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
            Total: {totalCount} Candidates
          </span>
        </div>
      </div>

      {/* Main Table Card Wrapper */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Hiring stage filter */}
        <div role="radiogroup" aria-label="Filter by hiring stage" className="flex flex-wrap gap-2">
          {["All", ...CANDIDATE_STAGES].map((st) => (
            <button
              key={st}
              role="radio"
              aria-checked={stageFilter === st}
              onClick={() => {
                setStageFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border cursor-pointer ${
                stageFilter === st ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        {/* Search Input Bar & Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by candidate name, email, role, ID..."
              className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
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
              className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm cursor-pointer focus:outline-none focus:border-indigo-500"
            >
              {SORT_OPTION_LABELS.map((o) => (
                <option key={o.value} value={o.value}>Sort: {o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setShowFilterModal(!showFilterModal)}
              className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer ${nameFilter || emailFilter || roleFilter || expFilter
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
            >
              <Filter size={14} />
              <span>Filters</span>
              {(nameFilter || emailFilter || roleFilter || expFilter) && (
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              )}
            </button>

            {/* Resume templates moved here from the sidebar */}
            <button
              onClick={() => navigate("/resume-templates")}
              className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer"
            >
              <FileText size={14} />
              <span>Resume templates</span>
            </button>

            <button
              onClick={handleExportZIP}
              disabled={exportLoading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Download size={14} />
              <span>{exportLoading ? "Exporting ZIP..." : "Export Resumes (ZIP)"}</span>
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
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 font-semibold">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === candidates.length && candidates.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 bg-white accent-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Name & Email</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Exp & AI Score</th>
                <th className="py-3 px-3">Interview Status</th>
                <th className="py-3 px-3">Stage</th>
                <th className="py-3 px-3">Last Updated</th>
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
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
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
                        <span className="text-slate-800 font-bold">{row.role}</span>
                        <div className="flex flex-wrap gap-1 items-center">
                          <CompanyPills companies={row.companies} />
                          {row.category && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 w-fit font-semibold">
                              {row.category}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5 w-fit font-medium">
                            Source: {row.source}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 w-fit font-medium">
                            Uploaded By: {row.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </td>
                    {/* Combined Experience & AI Score Column */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-800">{row.experience}</span>
                        <span className={`font-bold text-[11px] ${row.match === "Not scored" ? "text-slate-400" : "text-emerald-600"}`}>{row.match}</span>
                      </div>
                    </td>
                    {/* Interview Assignment Status */}
                    <td className="py-3.5 px-3">
                      {row.interviewAssigned ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                            Interview Assigned
                          </span>
                          {row.lastInterviewAssignedDate && (
                            <span className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
                              <Calendar size={12} className="text-indigo-600 shrink-0" />
                              {row.lastInterviewAssignedDate}
                            </span>
                          )}
                          {row.latestInterview?.job_title && (
                            <span className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]" title={row.latestInterview.job_title}>
                              Role: {row.latestInterview.job_title}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-500 w-fit">
                          Not Assigned
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-indigo-50 border-indigo-200 text-indigo-700">
                        {row.stage}
                      </span>
                      {/* Parse status only matters when parsing did not finish */}
                      {row.status !== "PARSED" && (
                        <span className="block mt-1 text-xs font-semibold text-amber-700">Parse: {row.status.toLowerCase()}</span>
                      )}
                    </td>
                    {/* Last Updated Column containing Upload Date */}
                    <td className="py-3.5 px-3 text-slate-500 font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-700 font-medium text-xs">
                          {row.lastUpdated}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          (Upload Date)
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2 text-indigo-600">
                        <button
                          onClick={() => {
                            navigate("/interviews", {
                              state: {
                                scheduleCandidate: {
                                  candidate_id: row.realId || row.id,
                                  candidate_name: row.candidateName,
                                  candidate_email: row.email !== "N/A" ? row.email : "",
                                  resume_id: row.realId || row.id,
                                  job_title: row.targetRole !== "N/A" ? row.targetRole : "",
                                },
                              },
                            });
                          }}
                          className="p-1.5 hover:bg-indigo-50 rounded-md transition-colors border border-slate-200 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          title="Assign / Schedule New Interview Session"
                         aria-label="Schedule interview">
                          <Calendar size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setEditCandidateId(row.realId);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer"
                          title="Edit Candidate Resume & Evaluation Details"
                         aria-label="Edit">
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => navigate(`/candidates/${row.realId}`)}
                          className="p-1.5 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer"
                          title="View Candidate Full Evaluation Page"
                         aria-label="View profile">
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
                          className="p-1.5 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Open PDF Resume Document (New Tab)"
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
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span>
              Showing <strong className="font-semibold text-slate-800">{startRecord}</strong> to{" "}
              <strong className="font-semibold text-slate-800">{endRecord}</strong> of{" "}
              <strong className="font-semibold text-slate-900">{totalCount}</strong> candidates
            </span>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  const newLimit = Number(e.target.value);
                  setLimit(newLimit);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mr-2 text-slate-500 font-medium">
              Page <strong className="font-semibold text-slate-800">{page}</strong> of{" "}
              <strong className="font-semibold text-slate-800">{totalPages}</strong>
            </span>

            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              title="Previous Page"
             aria-label="Previous">
              <ChevronLeft size={16} />
            </button>

            {/* Page number buttons */}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && page > 3) {
                pageNum = page - 3 + i;
                if (pageNum > totalPages) pageNum = totalPages - (4 - i);
              }
              if (pageNum <= 0) return null;

              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${page === pageNum
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              title="Next Page"
             aria-label="Next">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

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
