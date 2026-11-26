import { useEffect, useState, useMemo } from "react";
import JobMatchBadge from "../components/JobMatchBadge";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import {
  Users,
  Send,
  Search,
  UserCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Plus,
  MoreVertical,
  Clock,
  ChevronRight,
  MoveRight,
  Settings2,
  List,
  Columns,
  BarChart2,
  Check,
  AlertCircle,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { fetchJobOpenings, type JobOpening } from "../utils/jobsApi";
import {
  getKanbanBoardApi,
  moveCandidateStageApi,
  bulkMoveCandidatesApi,
  saveWorkflowApi,
  deleteWorkflowStageApi,
  type KanbanBoardData,
  type PipelineCard,
  type PipelineColumn,
  type WorkflowStage,
  type WorkflowDocument,
  type StageType,
} from "../utils/pipelineApi";

const REJECTION_REASONS = [
  "Skill Mismatch",
  "Experience Gap",
  "Salary Expectation",
  "Cultural Fit",
  "Not a Fit",
  "Compromised Background Check",
  "Offer Declined",
  "Other",
];

export default function RecruitmentPipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const feedback = useFeedback();

  // Active view tab: pipeline | list | analytics | stages
  const activeTab = searchParams.get("tab") || "pipeline";
  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "pipeline") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next);
  };

  // User & permissions
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const isViewer = useMemo(() => {
    const role = (currentUser.role || "").toLowerCase();
    if (role === "admin" || role === "superadmin" || currentUser.is_superadmin) return false;
    const perms = currentUser.permissions || [];
    return perms.includes("pipeline:view") && !perms.includes("pipeline:edit") && !perms.includes("pipeline");
  }, [currentUser]);

  // Filters
  const [jobId, setJobId] = useState<string>(searchParams.get("job_id") || "all");
  const [recruiterId, setRecruiterId] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("applied_date");

  // Data states
  const [boardData, setBoardData] = useState<KanbanBoardData | null>(null);
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Drag and drop states
  const [draggingCard, setDraggingCard] = useState<PipelineCard | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Reason modal state
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    cardId: string;
    cardName: string;
    targetStageId: string;
    targetStageName: string;
    isBulk?: boolean;
    bulkIds?: string[];
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0]);
  const [rejectionComment, setRejectionComment] = useState("");
  const [submittingMove, setSubmittingMove] = useState(false);

  // List view multi-select
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [bulkTargetStage, setBulkTargetStage] = useState<string>("");

  // Workflow settings state
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDocument | null>(null);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [deleteStageModal, setDeleteStageModal] = useState<{
    stageId: string;
    stageName: string;
    reassignTo: string;
  } | null>(null);

  // Quick Move dropdown for keyboard accessibility
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);

  // Load jobs list
  useEffect(() => {
    fetchJobOpenings()
      .then((data) => setJobs(data || []))
      .catch((err) => console.error("Error loading jobs:", err));
  }, []);

  // Fetch board data
  const loadBoard = async () => {
    setLoading(true);
    try {
      const data = await getKanbanBoardApi({
        job_id: jobId !== "all" ? jobId : undefined,
        recruiter_id: recruiterId !== "all" ? recruiterId : undefined,
        source: source !== "all" ? source : undefined,
        search: searchQuery.trim() || undefined,
        sort_by: sortBy,
      });
      setBoardData(data);
      if (data.workflow) {
        setEditingWorkflow(JSON.parse(JSON.stringify(data.workflow)));
      }
    } catch (err: any) {
      feedback.toast(err.message || "Failed to load pipeline", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [jobId, recruiterId, source, sortBy]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadBoard();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute stage move
  const executeStageMove = async (
    applicationId: string,
    toStageId: string,
    reason?: string,
    comment?: string
  ) => {
    try {
      await moveCandidateStageApi(applicationId, {
        to_stage_id: toStageId,
        reason,
        comment,
      });
      feedback.toast("Candidate stage updated successfully", "success");
      loadBoard();
    } catch (err: any) {
      feedback.toast(err.message || "Could not move candidate", "error");
    }
  };

  // Handle stage move initiation (drag drop or menu selection)
  const handleInitiateMove = (card: PipelineCard, targetColumn: PipelineColumn) => {
    if (isViewer) {
      feedback.toast("Viewers do not have permission to move candidates", "warning");
      return;
    }

    if (card.stage_id === targetColumn.id) return;

    // Validate transition
    if (card.allowed_transitions.length > 0 && !card.allowed_transitions.includes(targetColumn.id)) {
      feedback.toast(`Cannot move directly from '${card.stage_name}' to '${targetColumn.name}'. Transition not allowed.`, "warning");
      return;
    }

    // Check if terminal/requires reason
    if (targetColumn.requires_reason || targetColumn.type === "rejected" || targetColumn.type === "withdrawn") {
      setPendingMove({
        cardId: card.application_id,
        cardName: card.candidate_name,
        targetStageId: targetColumn.id,
        targetStageName: targetColumn.name,
      });
      setSelectedReason(REJECTION_REASONS[0]);
      setRejectionComment("");
      setReasonModalOpen(true);
      return;
    }

    // Otherwise direct move
    executeStageMove(card.application_id, targetColumn.id);
  };

  // Submit Reason Modal
  const handleConfirmReasonMove = async () => {
    if (!pendingMove) return;
    setSubmittingMove(true);
    try {
      if (pendingMove.isBulk && pendingMove.bulkIds) {
        const res = await bulkMoveCandidatesApi({
          application_ids: pendingMove.bulkIds,
          to_stage_id: pendingMove.targetStageId,
          reason: selectedReason,
          comment: rejectionComment,
        });
        feedback.toast(`Moved ${res.moved_count} candidate(s)`, "success");
        setSelectedAppIds([]);
      } else {
        await moveCandidateStageApi(pendingMove.cardId, {
          to_stage_id: pendingMove.targetStageId,
          reason: selectedReason,
          comment: rejectionComment,
        });
        feedback.toast(`Moved ${pendingMove.cardName} to ${pendingMove.targetStageName}`, "success");
      }
      setReasonModalOpen(false);
      setPendingMove(null);
      loadBoard();
    } catch (err: any) {
      feedback.toast(err.message || "Failed to update stage", "error");
    } finally {
      setSubmittingMove(false);
    }
  };

  // Bulk move execute
  const handleBulkMove = async () => {
    if (!bulkTargetStage || selectedAppIds.length === 0) return;
    const targetCol = boardData?.columns.find((c) => c.id === bulkTargetStage);
    if (!targetCol) return;

    if (targetCol.requires_reason || targetCol.type === "rejected" || targetCol.type === "withdrawn") {
      setPendingMove({
        cardId: "",
        cardName: `${selectedAppIds.length} candidates`,
        targetStageId: targetCol.id,
        targetStageName: targetCol.name,
        isBulk: true,
        bulkIds: selectedAppIds,
      });
      setSelectedReason(REJECTION_REASONS[0]);
      setRejectionComment("");
      setReasonModalOpen(true);
      return;
    }

    try {
      const res = await bulkMoveCandidatesApi({
        application_ids: selectedAppIds,
        to_stage_id: bulkTargetStage,
      });
      feedback.toast(`Moved ${res.moved_count} candidate(s) to ${targetCol.name}`, "success");
      setSelectedAppIds([]);
      setBulkTargetStage("");
      loadBoard();
    } catch (err: any) {
      feedback.toast(err.message || "Failed bulk move", "error");
    }
  };

  // Workflow Stage Settings Handlers
  const handleMoveStageOrder = (index: number, direction: "up" | "down") => {
    if (!editingWorkflow) return;
    const stages = [...editingWorkflow.stages];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;
    const temp = stages[index];
    stages[index] = stages[targetIdx];
    stages[targetIdx] = temp;
    stages.forEach((s, i) => (s.order = i + 1));
    setEditingWorkflow({ ...editingWorkflow, stages });
  };

  const handleUpdateStageProp = (index: number, key: keyof WorkflowStage, value: any) => {
    if (!editingWorkflow) return;
    const stages = [...editingWorkflow.stages];
    stages[index] = { ...stages[index], [key]: value };
    setEditingWorkflow({ ...editingWorkflow, stages });
  };

  const handleAddStage = () => {
    if (!editingWorkflow) return;
    const stages = [...editingWorkflow.stages];
    const newId = `stage_${Date.now().toString().slice(-4)}`;
    const newStage: WorkflowStage = {
      id: newId,
      name: "New Stage",
      colour: "#6366f1",
      type: "active",
      order: stages.length + 1,
      requires_reason: false,
      allowed_transitions: [],
    };
    stages.push(newStage);
    setEditingWorkflow({ ...editingWorkflow, stages });
  };

  const handleSaveWorkflowSettings = async () => {
    if (!editingWorkflow) return;
    setSavingWorkflow(true);
    try {
      await saveWorkflowApi({
        id: editingWorkflow.id,
        job_id: editingWorkflow.job_id || (jobId !== "all" ? jobId : null),
        name: editingWorkflow.name,
        is_default: editingWorkflow.is_default,
        stages: editingWorkflow.stages,
      });
      feedback.toast("Workflow configuration saved successfully", "success");
      loadBoard();
    } catch (err: any) {
      feedback.toast(err.message || "Failed to save workflow", "error");
    } finally {
      setSavingWorkflow(false);
    }
  };

  const handleConfirmDeleteStage = async () => {
    if (!deleteStageModal || !editingWorkflow) return;
    try {
      const res = await deleteWorkflowStageApi(
        editingWorkflow.id,
        deleteStageModal.stageId,
        deleteStageModal.reassignTo || undefined
      );
      feedback.toast(
        `Stage deleted successfully${res.reassigned_count ? ` (${res.reassigned_count} candidates reassigned)` : ""}`,
        "success"
      );
      setDeleteStageModal(null);
      loadBoard();
    } catch (err: any) {
      feedback.toast(err.message || "Failed to delete stage", "error");
    }
  };

  // Close card menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".card-quick-menu")) {
        setOpenCardMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedJobTitle = useMemo(() => {
    if (jobId === "all") return "All Job Openings";
    const found = jobs.find((j) => j.id === jobId || j.code === jobId);
    return found ? `${found.title} (${found.code || found.id})` : "Selected Job";
  }, [jobId, jobs]);

  // Compute funnel max count for proportional bar rendering
  const funnelMaxCount = useMemo(() => {
    if (!boardData?.funnel?.length) return 1;
    return Math.max(...boardData.funnel.map((f) => f.count), 1);
  }, [boardData]);

  return (
    <div className="flex flex-col gap-6 max-w-full pb-16">
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>Recruitment Pipeline</span>
            <ChevronRight size={14} className="text-slate-400" />
            <span className="text-indigo-600">Pipeline (Kanban)</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Recruitment Pipeline <span className="text-slate-400 font-normal">(Kanban)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track and manage candidate progress across the entire hiring workflow with a visual, drag-and-drop pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Job Filter Dropdown */}
          <div className="relative min-w-[240px]">
            <select
              value={jobId}
              onChange={(e) => {
                setJobId(e.target.value);
                const next = new URLSearchParams(searchParams);
                if (e.target.value === "all") next.delete("job_id");
                else next.set("job_id", e.target.value);
                setSearchParams(next);
              }}
              className="w-full h-10 pl-3 pr-8 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition-colors cursor-pointer appearance-none font-medium truncate"
            >
              <option value="all">Job: All Openings</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  Job: {j.title} {j.code ? `(${j.code})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
          </div>

          {/* Recruiter Filter */}
          <div className="relative min-w-[150px]">
            <select
              value={recruiterId}
              onChange={(e) => setRecruiterId(e.target.value)}
              className="w-full h-10 pl-3 pr-8 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition-colors cursor-pointer appearance-none font-medium"
            >
              <option value="all">All Recruiters</option>
              <option value="current">Assigned to Me</option>
            </select>
            <ChevronDown size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
          </div>

          {/* Add Candidate Action */}
          <button
            type="button"
            onClick={() => navigate("/upload")}
            className="flex items-center gap-2 h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors shrink-0"
          >
            <Plus size={16} />
            <span>Add Candidate</span>
          </button>
        </div>
      </div>

      {/* ── 8 KPI Cards Row (Matching Mockup Screen 14) ──────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* 1. Total Candidates */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.total_candidates ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Total Candidates</div>
          </div>
        </div>

        {/* 2. Applied (This Week) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Send size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.applied_this_week ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Applied (This Week)</div>
          </div>
        </div>

        {/* 3. Screening */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Search size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.screening ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Screening</div>
          </div>
        </div>

        {/* 4. Shortlisted */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <UserCheck size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.shortlisted ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Shortlisted</div>
          </div>
        </div>

        {/* 5. Interviewing */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Calendar size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.interviewing ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Interviewing</div>
          </div>
        </div>

        {/* 6. Selected */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.selected ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Selected</div>
          </div>
        </div>

        {/* 7. Rejected */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.rejected ?? "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Rejected</div>
          </div>
        </div>

        {/* 8. Conversion Rate */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp size={19} />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold text-slate-900 leading-tight">
              {boardData?.kpis.conversion_rate != null ? `${boardData.kpis.conversion_rate}%` : "—"}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate">Conversion Rate</div>
          </div>
        </div>
      </div>

      {/* ── View Tabs & Secondary Filter Bar ────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Left View Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("pipeline")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "pipeline"
                ? "bg-emerald-600 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Columns size={15} />
            <span>Pipeline View</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "list"
                ? "bg-emerald-600 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <List size={15} />
            <span>List View</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "analytics"
                ? "bg-emerald-600 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <BarChart2 size={15} />
            <span>Analytics</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stages")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all ${
              activeTab === "stages"
                ? "bg-emerald-600 text-white shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Settings2 size={15} />
            <span>Stage Settings</span>
          </button>
        </div>

        {/* Right Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Source Filter */}
          <div className="relative">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9 pl-3 pr-7 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer appearance-none font-medium"
            >
              <option value="all">Source: All</option>
              <option value="career_page">Career Page</option>
              <option value="referral">Referral</option>
              <option value="linkedin">LinkedIn</option>
              <option value="portal_upload">Direct Upload</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Sort By Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 pl-3 pr-7 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer appearance-none font-medium"
            >
              <option value="applied_date">Sort: Applied Date ↓</option>
              <option value="match">Sort: Job Match %</option>
              <option value="rating">Sort: Star Rating ★</option>
              <option value="days">Sort: Days in Stage</option>
              <option value="name">Sort: Candidate Name</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Main Tab Contents ─────────────────────────────────────────── */}
      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 text-slate-400 gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading recruitment pipeline...</p>
        </div>
      ) : activeTab === "pipeline" ? (
        /* ── TAB 1: KANBAN PIPELINE VIEW ──────────────────────────────── */
        <div className="flex flex-col gap-6">
          {/* Kanban Columns Horizontal Board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-[1250px] items-start">
              {boardData?.columns.map((column) => {
                const isDragTarget = dragOverColumn === column.id;
                return (
                  <div
                    key={column.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverColumn !== column.id) setDragOverColumn(column.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverColumn === column.id) setDragOverColumn(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverColumn(null);
                      if (draggingCard) {
                        handleInitiateMove(draggingCard, column);
                      }
                    }}
                    className={`flex-1 min-w-[220px] max-w-[280px] bg-slate-50/70 rounded-2xl border transition-all ${
                      isDragTarget
                        ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/30"
                        : "border-slate-200/90 shadow-2xs"
                    }`}
                  >
                    {/* Column Header */}
                    <div className="p-3.5 border-b border-slate-200/80 bg-white rounded-t-2xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: column.colour || "#6366f1" }}
                        />
                        <span className="font-semibold text-slate-800 text-sm tracking-tight truncate">
                          {column.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {column.count}
                      </span>
                    </div>

                    {/* Column Cards Container */}
                    <div className="p-2.5 flex flex-col gap-2.5 min-h-[360px] max-h-[640px] overflow-y-auto">
                      {column.cards.length === 0 ? (
                        <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded-xl text-slate-400">
                          <p className="text-xs font-medium">No candidates</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Drag cards here</p>
                        </div>
                      ) : (
                        column.cards.map((card) => {
                          const isBeingDragged = draggingCard?.id === card.id;
                          return (
                            <div
                              key={card.id}
                              draggable={!isViewer}
                              onDragStart={(e) => {
                                setDraggingCard(card);
                                e.dataTransfer.setData("text/plain", card.id);
                              }}
                              onDragEnd={() => {
                                setDraggingCard(null);
                                setDragOverColumn(null);
                              }}
                              className={`bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all relative group ${
                                isBeingDragged ? "opacity-40 ring-2 ring-indigo-400" : ""
                              } ${!isViewer ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                            >
                              {/* Card Header: Avatar, Name, Rating */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {card.photo_url ? (
                                    <img
                                      src={card.photo_url}
                                      alt={card.candidate_name}
                                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                      {card.candidate_name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <Link
                                      to={`/candidates/${card.candidate_id || card.application_id}`}
                                      className="font-bold text-sm text-slate-900 hover:text-indigo-600 transition-colors truncate block"
                                      title={card.candidate_name}
                                    >
                                      {card.candidate_name}
                                    </Link>
                                    <div className="text-[11px] text-slate-400 font-mono tracking-tight">
                                      {card.candidate_code}
                                    </div>
                                  </div>
                                </div>

                                {/* Star Rating Pill */}
                                {card.rating != null ? (
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold shrink-0">
                                    <span>★</span>
                                    <span>{card.rating.toFixed(1)}</span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-medium italic shrink-0">
                                    No rating
                                  </span>
                                )}
                              </div>

                              {/* Status Pill (if interview or rejected) */}
                              {card.status_pill && (
                                <div className="mb-2">
                                  {column.type === "rejected" ? (
                                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
                                      <XCircle size={12} className="shrink-0 text-rose-500" />
                                      <span className="truncate">{card.status_pill}</span>
                                    </div>
                                  ) : column.type === "hired" || card.stage_id === "selected" ? (
                                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                      <CheckCircle2 size={12} className="shrink-0 text-emerald-500" />
                                      <span>{card.status_pill}</span>
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200/60">
                                      <Clock size={12} className="shrink-0 text-sky-500" />
                                      <span className="truncate">{card.status_pill}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Job match % (Phase 9) */}
                              {card.match_pct != null && (
                                <div className="mb-2">
                                  <JobMatchBadge pct={card.match_pct} gaps={card.match_gaps} />
                                </div>
                              )}

                              {/* Skills Badges */}
                              {card.skills && card.skills.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                  {card.skills.map((skill, sIdx) => (
                                    <span
                                      key={sIdx}
                                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 truncate max-w-[100px]"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Card Footer: Days in Stage & Accessible Move-To Menu */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                                <div className="flex items-center gap-1">
                                  <Clock size={12} />
                                  <span>
                                    {card.days_in_stage === 0 ? "Today" : `${card.days_in_stage}d in stage`}
                                  </span>
                                </div>

                                {/* Accessible "Move To" Dropdown */}
                                {!isViewer && (
                                  <div className="relative card-quick-menu">
                                    <button
                                      type="button"
                                      aria-label={`Move ${card.candidate_name} to next stage`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenCardMenuId(openCardMenuId === card.id ? null : card.id);
                                      }}
                                      className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                      title="Move stage"
                                    >
                                      <MoreVertical size={14} />
                                    </button>

                                    {openCardMenuId === card.id && (
                                      <div className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95">
                                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                          Move To
                                        </div>
                                        {boardData.columns
                                          .filter((col) => col.id !== card.stage_id)
                                          .map((targetCol) => {
                                            const isAllowed =
                                              card.allowed_transitions.length === 0 ||
                                              card.allowed_transitions.includes(targetCol.id);
                                            return (
                                              <button
                                                key={targetCol.id}
                                                type="button"
                                                disabled={!isAllowed}
                                                onClick={() => {
                                                  setOpenCardMenuId(null);
                                                  handleInitiateMove(card, targetCol);
                                                }}
                                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                                                  isAllowed
                                                    ? "hover:bg-slate-50 text-slate-700"
                                                    : "opacity-40 cursor-not-allowed text-slate-400"
                                                }`}
                                              >
                                                <span className="flex items-center gap-1.5">
                                                  <span
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: targetCol.colour }}
                                                  />
                                                  {targetCol.name}
                                                </span>
                                                <MoveRight size={11} className="text-slate-400" />
                                              </button>
                                            );
                                          })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Column Footer */}
                    {column.cards.length > 5 && (
                      <div className="p-2 text-center text-xs text-indigo-600 font-semibold bg-white rounded-b-2xl border-t border-slate-100">
                        + {column.cards.length - 5} more candidates
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Bottom Pipeline Analytics Panel (Matching Mockup Screen 14) ─── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
            <h3 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
              <span>Pipeline Analytics</span>
              <span className="text-slate-400 font-normal">—</span>
              <span className="text-indigo-600 font-medium">{selectedJobTitle}</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Visual Funnel (4 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-2.5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Recruitment Funnel
                </div>
                {boardData?.funnel.map((item) => {
                  const barWidthPct = Math.max(12, Math.round((item.count / funnelMaxCount) * 100));
                  return (
                    <div key={item.stage_id} className="flex items-center gap-3">
                      <div className="w-28 text-xs font-semibold text-slate-700 truncate text-right">
                        {item.stage_name}
                      </div>
                      <div className="flex-1 bg-slate-100 h-6 rounded-lg overflow-hidden flex items-center">
                        <div
                          className="h-full rounded-lg flex items-center px-2 text-[11px] font-bold text-white transition-all duration-500"
                          style={{
                            width: `${barWidthPct}%`,
                            backgroundColor: item.colour || "#6366f1",
                          }}
                        >
                          <span className="truncate">{item.count}</span>
                        </div>
                      </div>
                      <div className="w-16 text-right text-xs font-bold text-slate-700 font-mono">
                        {item.percentage}%
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Center Column: Stage Conversion Rate Progress Bars (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-3.5 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-8 pt-6 lg:pt-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Stage Conversion Rate
                </div>
                {boardData?.stage_conversions.map((conv, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                      <span>
                        {conv.from_name} → {conv.to_name}
                      </span>
                      <span className="font-bold text-slate-900">{conv.rate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, conv.rate)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: Circular Progress Ring & Vacancies (3 cols) */}
              <div className="lg:col-span-3 flex flex-col items-center justify-center border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6 pt-6 lg:pt-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Hiring Progress
                </div>

                {/* SVG Gauge */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  {(() => {
                    const target = boardData?.hiring_progress.target_vacancies || 1;
                    const hired = boardData?.hiring_progress.hired || 0;
                    const pct = Math.min(100, Math.round((hired / target) * 100));
                    const radius = 50;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (pct / 100) * circumference;
                    return (
                      <>
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            className="stroke-slate-100"
                            strokeWidth="10"
                            fill="transparent"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            className="stroke-emerald-500 transition-all duration-700 ease-out"
                            strokeWidth="10"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            fill="transparent"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-bold text-slate-900 leading-tight">
                            {hired} / {target}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-600">Hired</span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Metric Summary List */}
                <div className="w-full mt-4 flex flex-col gap-1 text-xs text-slate-600">
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Target Vacancies</span>
                    <span className="font-bold text-slate-800">
                      {boardData?.hiring_progress.target_vacancies ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Hired</span>
                    <span className="font-bold text-emerald-600">
                      {boardData?.hiring_progress.hired ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">In Process</span>
                    <span className="font-bold text-indigo-600">
                      {boardData?.hiring_progress.in_process ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-500">Pending</span>
                    <span className="font-bold text-amber-600">
                      {boardData?.hiring_progress.pending ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "list" ? (
        /* ── TAB 2: CANDIDATE APPLICATIONS LIST VIEW ──────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Bulk Action Bar */}
          {selectedAppIds.length > 0 && !isViewer && (
            <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-3 flex items-center justify-between gap-4 animate-in fade-in">
              <div className="text-sm font-semibold text-indigo-900">
                {selectedAppIds.length} candidate(s) selected
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={bulkTargetStage}
                  onChange={(e) => setBulkTargetStage(e.target.value)}
                  className="h-9 px-3 bg-white border border-indigo-200 text-xs rounded-xl font-medium text-slate-800"
                >
                  <option value="">Move selected to...</option>
                  {boardData?.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bulkTargetStage}
                  onClick={handleBulkMove}
                  className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                >
                  Apply Move
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  {!isViewer && (
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          selectedAppIds.length > 0 &&
                          selectedAppIds.length ===
                            (boardData?.columns.flatMap((c) => c.cards).length || 0)
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAppIds(
                              boardData?.columns.flatMap((c) => c.cards.map((k) => k.application_id)) || []
                            );
                          } else {
                            setSelectedAppIds([]);
                          }
                        }}
                        className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Job Opening</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Match</th>
                  <th className="py-3.5 px-4">Rating</th>
                  <th className="py-3.5 px-4">Days in Stage</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boardData?.columns.flatMap((col) => col.cards).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No candidates found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  boardData?.columns
                    .flatMap((col) => col.cards)
                    .map((card) => {
                      const isChecked = selectedAppIds.includes(card.application_id);
                      return (
                        <tr key={card.id} className="hover:bg-slate-50/70 transition-colors">
                          {!isViewer && (
                            <td className="py-3.5 px-4">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAppIds((prev) => [...prev, card.application_id]);
                                  } else {
                                    setSelectedAppIds((prev) =>
                                      prev.filter((id) => id !== card.application_id)
                                    );
                                  }
                                }}
                                className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                          )}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {card.photo_url ? (
                                <img
                                  src={card.photo_url}
                                  alt={card.candidate_name}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                  {card.candidate_name.charAt(0)}
                                </div>
                              )}
                              <div>
                                <Link
                                  to={`/candidates/${card.candidate_id || card.application_id}`}
                                  className="font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                                >
                                  {card.candidate_name}
                                </Link>
                                <div className="text-xs text-slate-400">{card.candidate_code}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-700">
                            {card.job_title || "General Application"}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: `${
                                  boardData.columns.find((c) => c.id === card.stage_id)?.colour || "#6366f1"
                                }15`,
                                color:
                                  boardData.columns.find((c) => c.id === card.stage_id)?.colour || "#6366f1",
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    boardData.columns.find((c) => c.id === card.stage_id)?.colour || "#6366f1",
                                }}
                              />
                              {card.stage_name}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <JobMatchBadge pct={card.match_pct} gaps={card.match_gaps} compact />
                          </td>
                          <td className="py-3.5 px-4">
                            {card.rating != null ? (
                              <span className="font-semibold text-amber-700 text-xs">
                                ★ {card.rating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No rating</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 font-medium">
                            {card.days_in_stage} days
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              to={`/candidates/${card.candidate_id || card.application_id}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                              <span>View Profile</span>
                              <ChevronRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "analytics" ? (
        /* ── TAB 3: DETAILED FUNNEL ANALYTICS ─────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Stage-by-Stage Funnel Velocity</h3>
            <div className="space-y-4">
              {boardData?.funnel.map((item) => (
                <div key={item.stage_id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-slate-800">{item.stage_name}</span>
                    <span className="text-xs font-mono font-bold text-indigo-600">
                      {item.count} Candidates ({item.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200/80 h-3 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.colour || "#6366f1",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4">Average Time in Stage</h3>
            <div className="space-y-4">
              {boardData?.columns.map((col) => (
                <div
                  key={col.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: col.colour }} />
                    <span className="font-semibold text-sm text-slate-800">{col.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">
                      {col.avg_days_in_stage != null ? `${col.avg_days_in_stage} days` : "0 days"}
                    </div>
                    <div className="text-[11px] text-slate-400">average duration</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── TAB 4: WORKFLOW STAGE SETTINGS ───────────────────────────── */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Hiring Workflow Stages</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure your pipeline stages, visual colors, terminal conditions, and transition rules.
              </p>
            </div>
            {!isViewer && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                >
                  <Plus size={14} />
                  <span>Add Stage</span>
                </button>
                <button
                  type="button"
                  disabled={savingWorkflow}
                  onClick={handleSaveWorkflowSettings}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  <Check size={14} />
                  <span>{savingWorkflow ? "Saving..." : "Save Workflow"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Stages List */}
          <div className="space-y-3">
            {editingWorkflow?.stages.map((stage, idx) => (
              <div
                key={stage.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-6 text-center text-xs font-bold text-slate-400">
                    {idx + 1}
                  </span>

                  {/* Stage Colour Picker */}
                  <div className="relative shrink-0">
                    <input
                      type="color"
                      disabled={isViewer}
                      value={stage.colour || "#6366f1"}
                      onChange={(e) => handleUpdateStageProp(idx, "colour", e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                  </div>

                  {/* Stage Name */}
                  <input
                    type="text"
                    disabled={isViewer}
                    value={stage.name}
                    onChange={(e) => handleUpdateStageProp(idx, "name", e.target.value)}
                    className="flex-1 max-w-[200px] h-9 px-3 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />

                  {/* Stage Type */}
                  <select
                    disabled={isViewer}
                    value={stage.type}
                    onChange={(e) =>
                      handleUpdateStageProp(idx, "type", e.target.value as StageType)
                    }
                    className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-700"
                  >
                    <option value="active">Active Stage</option>
                    <option value="hired">Hired (Terminal)</option>
                    <option value="rejected">Rejected (Terminal)</option>
                    <option value="withdrawn">Withdrawn (Terminal)</option>
                  </select>

                  {/* Requires Reason Toggle */}
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isViewer}
                      checked={!!stage.requires_reason}
                      onChange={(e) => handleUpdateStageProp(idx, "requires_reason", e.target.checked)}
                      className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Requires Reason</span>
                  </label>
                </div>

                {/* Reorder and Delete Actions */}
                {!isViewer && (
                  <div className="flex items-center gap-1.5 self-end md:self-auto">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveStageOrder(idx, "up")}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600"
                      title="Move up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === editingWorkflow.stages.length - 1}
                      onClick={() => handleMoveStageOrder(idx, "down")}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600"
                      title="Move down"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fallback = editingWorkflow.stages.find((s) => s.id !== stage.id);
                        setDeleteStageModal({
                          stageId: stage.id,
                          stageName: stage.name,
                          reassignTo: fallback?.id || "",
                        });
                      }}
                      className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600"
                      title="Delete stage"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── REASON REQUIREMENT MODAL (Terminal / Rejection / Withdrawal) ─── */}
      {reasonModalOpen && pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Stage Change Reason Required</h3>
                <p className="text-xs text-slate-500">
                  Moving candidate to <span className="font-semibold text-rose-600">{pendingMove.targetStageName}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Reason *
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Additional Recruiter Comment (Optional)
                </label>
                <textarea
                  rows={3}
                  value={rejectionComment}
                  onChange={(e) => setRejectionComment(e.target.value)}
                  placeholder="Provide context or specific feedback notes for this decision..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-hidden resize-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setReasonModalOpen(false);
                  setPendingMove(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingMove || !selectedReason}
                onClick={handleConfirmReasonMove}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {submittingMove ? "Updating..." : "Confirm Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAFE DELETE STAGE MODAL ────────────────────────────────────── */}
      {deleteStageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <h3 className="font-bold text-slate-900 text-base mb-1">
              Delete Stage &quot;{deleteStageModal.stageName}&quot;?
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              If any candidates are currently in this stage, select a destination stage to reassign them safely.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Reassign Active Candidates To
              </label>
              <select
                value={deleteStageModal.reassignTo}
                onChange={(e) =>
                  setDeleteStageModal({ ...deleteStageModal, reassignTo: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800"
              >
                {editingWorkflow?.stages
                  .filter((s) => s.id !== deleteStageModal.stageId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteStageModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStage}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                Delete Stage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
