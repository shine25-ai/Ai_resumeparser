import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Layers,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Tag,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { StatCard } from "../components/companies/companyForm";
import { useFeedback } from "../components/ui/Feedback";
import {
  bulkCandidateAction,
  exportCandidatesCsv,
  fetchCandidates,
  fetchCandidateStats,
  fetchDuplicateCandidates,
  mergeCandidatesApi,
  type CandidateItem,
  type CandidateSummaryStats,
  type DuplicateGroup,
} from "../utils/candidatesApi";
import { fetchJobOpenings, type JobOpening } from "../utils/jobsApi";
import { apiFetch } from "../utils/Api";

const STAGES = [
  "All",
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "SELECTED",
  "OFFER",
  "HIRED",
  "REJECTED",
];

const SOURCES = ["All", "Careers page", "Direct upload", "Referral", "LinkedIn", "Agency"];

const getInitials = (name?: string) => {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function CandidateDatabase() {
  const { toast, confirm } = useFeedback();
  const [searchParams] = useSearchParams();

  // Data states
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [stats, setStats] = useState<CandidateSummaryStats>({
    total_candidates: 0,
    active_pipeline: 0,
    hired: 0,
    possible_duplicates: 0,
  });
  const [loading, setLoading] = useState(true);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; full_name?: string; name?: string; email: string }[]>([]);

  // Pagination & sorting
  const [page, setPage] = useState<number>(() => Number(searchParams.get("page")) || 1);
  const [limit] = useState<number>(20);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>(() => searchParams.get("q") || "");
  const [jobFilter, setJobFilter] = useState<string>(() => searchParams.get("job_id") || "");
  const [stageFilter, setStageFilter] = useState<string>(() => searchParams.get("stage") || "All");
  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get("source") || "All");
  const [locationFilter, setLocationFilter] = useState<string>(() => searchParams.get("location") || "");
  const [expRange, setExpRange] = useState<string>(() => searchParams.get("exp") || "All");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "experience_desc" | "experience_asc" | "name">("latest");
  const [showFilters, setShowFilters] = useState(false);

  // Selection & Bulk
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkOwnerModalOpen, setBulkOwnerModalOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");

  // Slide-over preview
  const [previewCandidate, setPreviewCandidate] = useState<CandidateItem | null>(null);

  // Duplicates review modal
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  // Load Openings & Users for filters
  useEffect(() => {
    fetchJobOpenings()
      .then((res: any) => setOpenings(Array.isArray(res) ? res : res.items || []))
      .catch(() => {});
    apiFetch("/users")
      .then((res) => res.json())
      .then((data) => setCompanyUsers(data?.data?.items || data?.data || []))
      .catch(() => {});
  }, []);

  // Main loader
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      let minExp: number | undefined;
      let maxExp: number | undefined;
      if (expRange === "0-2") {
        minExp = 0;
        maxExp = 2;
      } else if (expRange === "2-5") {
        minExp = 2;
        maxExp = 5;
      } else if (expRange === "5-8") {
        minExp = 5;
        maxExp = 8;
      } else if (expRange === "8+") {
        minExp = 8;
      }

      const [res, statsRes] = await Promise.all([
        fetchCandidates({
          q: searchTerm,
          job_id: jobFilter,
          stage: stageFilter === "All" ? undefined : stageFilter,
          source: sourceFilter === "All" ? undefined : sourceFilter,
          location: locationFilter,
          min_experience: minExp,
          max_experience: maxExp,
          sort: sortBy,
          page,
          limit,
        }),
        fetchCandidateStats().catch(() => ({
          total_candidates: 0,
          active_pipeline: 0,
          hired: 0,
          possible_duplicates: 0,
        })),
      ]);

      setCandidates(res.items || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.total_pages || 1);
      setStats(statsRes);
    } catch (err: any) {
      toast(err.message || "Failed to load candidates", "error");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, jobFilter, stageFilter, sourceFilter, locationFilter, expRange, sortBy, page, limit, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open duplicate review
  const handleOpenDuplicates = async () => {
    try {
      setDuplicatesLoading(true);
      setDuplicateModalOpen(true);
      const groups = await fetchDuplicateCandidates();
      setDuplicateGroups(groups);
    } catch (err: any) {
      toast(err.message || "Failed to load duplicate groups", "error");
    } finally {
      setDuplicatesLoading(false);
    }
  };

  // Perform merge
  const handleMerge = async (primaryId: string, secondaryId: string, secondaryName: string) => {
    const ok = await confirm({
      title: "Merge duplicate candidates?",
      message: `Are you sure you want to merge ${secondaryName} into this profile? This action consolidates all applications, documents, notes, and tags and cannot be undone.`,
      confirmLabel: "Merge Profiles",
      danger: true,
    });
    if (!ok) return;

    try {
      await mergeCandidatesApi(primaryId, secondaryId);
      toast("Candidate profiles successfully merged.", "success");
      const groups = await fetchDuplicateCandidates();
      setDuplicateGroups(groups);
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to merge candidates.", "error");
    }
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(candidates.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Bulk tag
  const handleApplyBulkTag = async () => {
    if (!bulkTagInput.trim()) return;
    try {
      await bulkCandidateAction(selectedIds, "add_tags", [bulkTagInput.trim()]);
      toast(`Added tag "${bulkTagInput.trim()}" to ${selectedIds.length} candidates.`, "success");
      setBulkTagModalOpen(false);
      setBulkTagInput("");
      setSelectedIds([]);
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to apply tags.", "error");
    }
  };

  // Bulk assign owner
  const handleApplyBulkOwner = async () => {
    const owner = companyUsers.find((u) => u.id === selectedOwnerId);
    if (!owner) return;
    try {
      await bulkCandidateAction(selectedIds, "assign_owner", {
        owner_id: owner.id,
        owner_name: owner.full_name || owner.name || owner.email,
      });
      toast(`Assigned recruiter to ${selectedIds.length} candidates.`, "success");
      setBulkOwnerModalOpen(false);
      setSelectedIds([]);
      loadData();
    } catch (err: any) {
      toast(err.message || "Failed to assign owner.", "error");
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      toast("Preparing CSV export...", "info");
      await exportCandidatesCsv({
        q: searchTerm,
        job_id: jobFilter,
        stage: stageFilter === "All" ? undefined : stageFilter,
        source: sourceFilter === "All" ? undefined : sourceFilter,
        location: locationFilter,
      });
      toast("Candidate export downloaded.", "success");
    } catch (err: any) {
      toast(err.message || "Failed to export candidates.", "error");
    }
  };

  const stageBadgeTone = (stage?: string) => {
    const s = (stage || "").toUpperCase();
    if (s.includes("HIRED")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s.includes("OFFER")) return "bg-purple-50 text-purple-700 border-purple-200";
    if (s.includes("INTERVIEW")) return "bg-blue-50 text-blue-700 border-blue-200";
    if (s.includes("SHORTLIST")) return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (s.includes("REJECT") || s.includes("CLOSED")) return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  return (
    <div className="space-y-6 pb-24">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidate Management</h1>
          <p className="text-sm text-slate-500">
            Search, filter, and review candidates across jobs, pipelines, and interviews.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {stats.possible_duplicates > 0 && (
            <button
              onClick={handleOpenDuplicates}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
            >
              <AlertTriangle size={16} className="text-amber-600" />
              <span>{stats.possible_duplicates} Duplicates Found</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Candidates" value={stats.total_candidates} icon={<Users size={20} />} tone="blue" />
        <StatCard label="In Pipeline" value={stats.active_pipeline} icon={<Layers size={20} />} tone="violet" />
        <StatCard label="Hired" value={stats.hired} icon={<UserCheck size={20} />} tone="green" />
        <div
          onClick={handleOpenDuplicates}
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-400 hover:shadow"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm font-medium">Possible Duplicates</span>
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{stats.possible_duplicates}</div>
          <div className="mt-1 text-xs text-amber-600 font-medium hover:underline">Review &amp; merge &rarr;</div>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by candidate name, email, phone number, or skill..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
                showFilters || jobFilter || stageFilter !== "All" || sourceFilter !== "All" || locationFilter || expRange !== "All"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter size={16} />
              <span>Filters</span>
            </button>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="latest">Newest Added</option>
              <option value="oldest">Oldest Added</option>
              <option value="experience_desc">Experience: High to Low</option>
              <option value="experience_asc">Experience: Low to High</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Expandable Multi-field filter options */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Job Opening</label>
              <select
                value={jobFilter}
                onChange={(e) => {
                  setJobFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">All Jobs</option>
                {openings.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Hiring Stage</label>
              <select
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Source</label>
              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Location</label>
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => {
                  setLocationFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. Chennai, Remote..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Experience</label>
              <select
                value={expRange}
                onChange={(e) => {
                  setExpRange(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="All">All Experience</option>
                <option value="0-2">0 - 2 Years</option>
                <option value="2-5">2 - 5 Years</option>
                <option value="5-8">5 - 8 Years</option>
                <option value="8+">8+ Years</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Candidate Table ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-12 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={candidates.length > 0 && selectedIds.length === candidates.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3.5">Candidate</th>
                <th className="px-4 py-3.5">Role &amp; Experience</th>
                <th className="px-4 py-3.5">Location</th>
                <th className="px-4 py-3.5">Latest Applied Job</th>
                <th className="px-4 py-3.5">Tags</th>
                <th className="px-4 py-3.5">Owner</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RefreshCw className="mx-auto mb-2 animate-spin" size={24} />
                    Loading candidates...
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <User className="mx-auto mb-2 text-slate-300" size={36} />
                    No candidates found matching the active filters.
                  </td>
                </tr>
              ) : (
                candidates.map((c) => {
                  const isChecked = selectedIds.includes(c.id);
                  const latestJob = c.latest_application?.opening_title || (c.applications?.[0]?.opening_title) || "—";
                  const stage = c.stage || c.latest_application?.stage || "APPLIED";

                  return (
                    <tr
                      key={c.id}
                      className={`transition hover:bg-slate-50/80 ${isChecked ? "bg-indigo-50/40" : ""}`}
                    >
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(c.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>

                      {/* Candidate Avatar & Details */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                            {getInitials(c.full_name)}
                          </div>
                          <div>
                            <button
                              onClick={() => setPreviewCandidate(c)}
                              className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline text-left"
                            >
                              {c.full_name}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{c.email}</span>
                              {c.phone && <span>&middot; {c.phone}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Experience */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-800">{c.current_role || "Candidate"}</div>
                        <div className="text-xs text-slate-500">
                          {c.total_experience_years != null ? `${c.total_experience_years} yrs exp` : "Experience unlisted"}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5 text-slate-600">
                        {c.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={13} className="text-slate-400" />
                            {c.location}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Latest Applied Job & Stage Pill */}
                      <td className="px-4 py-3.5">
                        <div className="text-xs font-semibold text-slate-900">{latestJob}</div>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${stageBadgeTone(
                            stage
                          )}`}
                        >
                          {stage}
                        </span>
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {c.tags && c.tags.length > 0 ? (
                            c.tags.slice(0, 3).map((t, idx) => (
                              <span
                                key={idx}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 font-medium"
                              >
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                          {c.tags && c.tags.length > 3 && (
                            <span className="text-xs text-slate-400">+{c.tags.length - 3}</span>
                          )}
                        </div>
                      </td>

                      {/* Recruiter / Owner */}
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {c.owner_name ? (
                          <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                            <User size={13} className="text-slate-400" />
                            {c.owner_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>

                      {/* Row Action */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/candidates/${c.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Eye size={13} />
                            <span>View 360</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold">{candidates.length}</span> of{" "}
            <span className="font-semibold">{totalCount}</span> candidates
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm disabled:opacity-50"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-sm disabled:opacity-50"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Bulk Actions Floating Toolbar ── */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-slate-300 bg-slate-900 px-6 py-3 text-white shadow-2xl animate-in slide-in-from-bottom-6">
          <span className="text-sm font-semibold">{selectedIds.length} candidates selected</span>
          <div className="h-4 w-px bg-slate-700" />
          <button
            onClick={() => setBulkTagModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white"
          >
            <Tag size={14} /> Add Tag
          </button>
          <button
            onClick={() => setBulkOwnerModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white"
          >
            <UserPlus size={14} /> Assign Owner
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white"
          >
            <Download size={14} /> Export
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Slide-Over Quick Preview Side Panel ── */}
      {previewCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="relative w-full max-w-md bg-white p-6 shadow-2xl flex flex-col h-full animate-in slide-in-from-right">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Candidate Quick View</h2>
              <button
                onClick={() => setPreviewCandidate(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {/* Profile header */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-700">
                  {getInitials(previewCandidate.full_name)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{previewCandidate.full_name}</h3>
                  <p className="text-sm text-slate-600">{previewCandidate.current_role || "Role unlisted"}</p>
                  <p className="text-xs text-slate-400">ID: {previewCandidate.id}</p>
                </div>
              </div>

              {/* Contact info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail size={14} className="text-slate-400" />
                  <span>{previewCandidate.email}</span>
                </div>
                {previewCandidate.phone && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone size={14} className="text-slate-400" />
                    <span>{previewCandidate.phone}</span>
                  </div>
                )}
                {previewCandidate.location && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin size={14} className="text-slate-400" />
                    <span>{previewCandidate.location}</span>
                  </div>
                )}
              </div>

              {/* Skills */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {previewCandidate.skills && previewCandidate.skills.length > 0 ? (
                    previewCandidate.skills.map((s, idx) => (
                      <span key={idx} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No skills listed</span>
                  )}
                </div>
              </div>

              {/* Applied jobs */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Applied Roles</h4>
                {previewCandidate.applications && previewCandidate.applications.length > 0 ? (
                  <div className="space-y-2">
                    {previewCandidate.applications.map((app) => (
                      <div key={app.id} className="rounded-lg border border-slate-200 p-2.5 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-slate-800">{app.opening_title}</div>
                          <div className="text-slate-400 text-[11px]">{app.submitted_at?.slice(0, 10)}</div>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageBadgeTone(app.stage)}`}>
                          {app.stage}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No active applications</p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex gap-3">
              <Link
                to={`/candidates/${previewCandidate.id}`}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <span>Open Full 360&deg; Profile</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicates Review Modal ── */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl bg-white p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-amber-500" />
                  <span>Duplicate Candidate Review</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Detected candidate records with matching normalized email or phone number.
                </p>
              </div>
              <button
                onClick={() => setDuplicateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {duplicatesLoading ? (
                <div className="py-16 text-center text-slate-400">
                  <RefreshCw className="mx-auto mb-2 animate-spin" size={24} />
                  Scanning for duplicate candidate records...
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={36} />
                  No duplicate candidate records found!
                </div>
              ) : (
                duplicateGroups.map((group) => {
                  const primary = group.candidates[0];
                  const others = group.candidates.slice(1);

                  return (
                    <div key={group.id} className="rounded-xl border border-amber-200 bg-amber-50/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                          {group.reason}
                        </span>
                        <span className="text-xs text-slate-500">{group.candidates.length} matching records</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Primary profile card */}
                        <div className="rounded-lg border-2 border-indigo-500 bg-white p-3.5 shadow-xs relative">
                          <span className="absolute top-2.5 right-2.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                            PRIMARY (NEWEST)
                          </span>
                          <div className="font-bold text-slate-900">{primary.full_name}</div>
                          <div className="text-xs text-slate-500">{primary.email}</div>
                          <div className="text-xs text-slate-500">{primary.phone || "No phone"}</div>
                          <div className="mt-2 text-xs text-slate-700">
                            <strong>Role:</strong> {primary.current_role || "Unlisted"} &middot; {primary.total_experience_years || 0} yrs
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {primary.skills.slice(0, 4).map((s, i) => (
                              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Secondary candidates */}
                        <div className="space-y-3">
                          {others.map((sec) => (
                            <div key={sec.id} className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xs flex flex-col justify-between">
                              <div>
                                <div className="font-bold text-slate-900">{sec.full_name}</div>
                                <div className="text-xs text-slate-500">{sec.email}</div>
                                <div className="text-xs text-slate-500">{sec.phone || "No phone"}</div>
                                <div className="mt-1 text-xs text-slate-700">
                                  <strong>Role:</strong> {sec.current_role || "Unlisted"} &middot; {sec.total_experience_years || 0} yrs
                                </div>
                              </div>
                              <button
                                onClick={() => handleMerge(primary.id, sec.id, sec.full_name)}
                                className="mt-3 w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 text-center"
                              >
                                Merge into Primary &rarr;
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end">
              <button
                onClick={() => setDuplicateModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Tag Modal ── */}
      {bulkTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Tag to Selected</h3>
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="e.g. Priority, Campus2026..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkTagModalOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkTag}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Apply Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Owner Modal ── */}
      {bulkOwnerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Assign Recruiter Owner</h3>
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            >
              <option value="">Select Recruiter...</option>
              {companyUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.name || u.email}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkOwnerModalOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkOwner}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
