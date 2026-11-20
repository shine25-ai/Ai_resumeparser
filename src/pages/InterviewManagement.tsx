import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar, Edit2, Trash2, Plus, Star, X, AlertCircle, UserCheck, FileText, RefreshCw, Eye, MapPin, Mail, Layers, Sparkles, Building2, Loader2, CheckCircle, Search, ChevronLeft, ChevronRight, MoreVertical, XCircle, Video, Clock, Filter, ArrowRight, SlidersHorizontal, Briefcase
} from "lucide-react";
import {
  getInterviews, getInterviewById, deleteInterview, cancelInterview,
  sendInterviewEmail, getInterviewTypes, MAIL_TEMPLATES_URL,
  type InterviewItem, type UserProfile, type InterviewTypeItem, apiFetch } from "../utils/Api";
import { BulkFeedbackModal } from "../components/BulkFeedbackModal";
import { CandidateDetailsModal } from "../components/CandidateDetailsModal";
import { InterviewForm, type InterviewFormMode, type CandidatePrefill } from "../components/interview/InterviewForm";
import { getInterviewPhase, hasFeedback, VERDICTS, INTERVIEW_STAGES, getVerdictBadge, todayIso } from "../utils/interviewState";
import { ShareSummaryDialog } from "../components/interview/ShareSummaryDialog";
import { RECOMMENDATION_OPTIONS } from "../types/interview";
import { useFeedback } from "../components/ui/Feedback";

export type InterviewTab = "today" | "upcoming" | "needs-feedback" | "all";

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayLabel = (iso?: string, todayStr: string = todayIso()) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  const text = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (iso === todayStr) return `Today, ${text}`;
  if (iso === shiftDays(todayStr, 1)) return `Tomorrow, ${text}`;
  return text;
};

const byDateTime = (a: InterviewItem, b: InterviewItem) =>
  `${a.scheduled_date || ""} ${a.scheduled_time || ""}`.localeCompare(`${b.scheduled_date || ""} ${b.scheduled_time || ""}`);

const panelNames = (item: InterviewItem) =>
  (item.interviewers?.length ? item.interviewers.map((i) => i.interviewer_name) : [item.interviewer_name]).filter(Boolean).join(", ");

const formatTimeTo12Hour = (timeStr?: string) => {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hours12 = h % 12 || 12;
  const minutesStr = parts[1] !== undefined ? parts[1] : "00";
  return `${hours12}:${minutesStr} ${period}`;
};

export default function InterviewManagement() {
  const { toast } = useFeedback();
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [interviewTypes, setInterviewTypes] = useState<InterviewTypeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & URL params state
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: "today" | "upcoming" | "needs-feedback" | "all"
  const getInitialTab = (): InterviewTab => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "today" || tabParam === "upcoming" || tabParam === "needs-feedback" || tabParam === "all") {
      return tabParam;
    }
    const filterParam = searchParams.get("filter");
    if (filterParam === "awaiting_feedback") return "needs-feedback";
    const viewParam = searchParams.get("view");
    if (viewParam === "all") return "all";
    if (viewParam === "today") return "today";
    return "all";
  };

  const [activeTab, setActiveTab] = useState<InterviewTab>(getInitialTab);
  const [showFilterBar, setShowFilterBar] = useState<boolean>(false);

  // Summary counts & Next Up state
  const [counts, setCounts] = useState<{
    all: number;
    today: number;
    upcoming: number;
    needsFeedback: number;
    completed: number;
    selected: number;
  }>({
    all: 0,
    today: 0,
    upcoming: 0,
    needsFeedback: 0,
    completed: 0,
    selected: 0,
  });
  const [nextUpSession, setNextUpSession] = useState<InterviewItem | null>(null);

  const initialSearchParam = searchParams.get("search") || "";
  const initialAwaitingFeedback = searchParams.get("filter") === "awaiting_feedback";

  // Pagination & Server Search/Filter State
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchParam);
  // The search box only hits the server 300 ms after typing stops
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initialSearchParam);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Specific Filters State
  const [scheduledDateFilter, setScheduledDateFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>(initialAwaitingFeedback ? "COMPLETED" : "All");
  // Verdict (how the interview went) and Stage (where the candidate is), worked out by the server
  const [recommendationFilter, setRecommendationFilter] = useState<string>("All");
  const [stageFilter, setStageFilter] = useState<string>("All");

  const activeFilterCount = [
    searchTerm.trim() !== "",
    scheduledDateFilter !== "",
    typeFilter !== "All",
    statusFilter !== "All",
    recommendationFilter !== "All",
    stageFilter !== "All",
  ].filter(Boolean).length;

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setScheduledDateFilter("");
    setTypeFilter("All");
    setStatusFilter("All");
    setRecommendationFilter("All");
    setStageFilter("All");
    setPage(1);
  };

  // Bulk Selection & Modal State
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<string[]>([]);
  // Interviews open in the feedback panel (null = closed)
  const [feedbackTargets, setFeedbackTargets] = useState<InterviewItem[] | null>(null);

  // Actions 3-Dots Menu State
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Close actions popup menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openActionMenuId && !(event.target as HTMLElement).closest(".mgm-action-menu-container")) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openActionMenuId]);

  const handleTabChange = (nextTab: InterviewTab) => {
    setActiveTab(nextTab);
    setPage(1);
    setSelectedInterviewIds([]);
    if (nextTab !== "all") {
      setStatusFilter("All");
      setRecommendationFilter("All");
      setScheduledDateFilter("");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", nextTab);
        next.delete("view");
        if (nextTab !== "needs-feedback") next.delete("filter");
        return next;
      },
      { replace: true }
    );
  };

  // Bumped after any change so summary stats and table reload
  const [refreshKey, setRefreshKey] = useState(0);

  // Which mode the shared interview form is open in (null = closed)
  const [interviewForm, setInterviewForm] = useState<{ mode: InterviewFormMode; interview?: InterviewItem | null; candidate?: CandidatePrefill | null } | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);

  const [selectedInterview, setSelectedInterview] = useState<InterviewItem | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // User Authentication & Role Detection
  const userStr = localStorage.getItem("user");
  const currentUser: UserProfile | null = userStr ? JSON.parse(userStr) : null;
  const userRole = (currentUser?.role || "").toLowerCase();
  const isClientUser = userRole.includes("client");
  const isInterviewerUser = userRole.includes("interviewer");

  const isInterviewAssignedToCurrentUser = (item: InterviewItem): boolean => {
    if (!currentUser) return true;
    if (!isClientUser && !isInterviewerUser) return true;

    const uId = currentUser.id || (currentUser as any)._id || "";
    const uEmail = (currentUser.email || "").trim().toLowerCase();
    const uName = (currentUser.full_name || "").trim().toLowerCase();

    if (isClientUser) {
      const matchTop =
        (item.client_id && item.client_id === uId) ||
        (item.client_email && item.client_email.trim().toLowerCase() === uEmail) ||
        (item.client_name && item.client_name.trim().toLowerCase() === uName);
      if (matchTop) return true;

      if (item.clients && item.clients.length > 0) {
        return item.clients.some(
          (c) =>
            (c.client_id && c.client_id === uId) ||
            (c.client_email && c.client_email.trim().toLowerCase() === uEmail) ||
            (c.client_name && c.client_name.trim().toLowerCase() === uName)
        );
      }
      return false;
    }

    if (isInterviewerUser) {
      const matchTop =
        (item.interviewer_id && item.interviewer_id === uId) ||
        (item.interviewer_email && item.interviewer_email.trim().toLowerCase() === uEmail) ||
        (item.interviewer_name && item.interviewer_name.trim().toLowerCase() === uName);
      if (matchTop) return true;

      if (item.interviewers && item.interviewers.length > 0) {
        return item.interviewers.some(
          (i) =>
            (i.interviewer_id && i.interviewer_id === uId) ||
            (i.interviewer_email && i.interviewer_email.trim().toLowerCase() === uEmail) ||
            (i.interviewer_name && i.interviewer_name.trim().toLowerCase() === uName)
        );
      }
      return false;
    }

    return true;
  };

  // Send Mail Popup Modal State
  const [isSendMailOpen, setIsSendMailOpen] = useState<boolean>(false);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [sendMailForm, setSendMailForm] = useState({
    send_to_candidate: true,
    candidate_email: "",
    send_to_interviewer: true,
    interviewer_email: "",
    template_id: "",
    custom_notes: "",
  });
  const [sendMailLoading, setSendMailLoading] = useState<boolean>(false);
  const [sendMailStatus, setSendMailStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cancel Interview Modal States
  const [cancelTargetInterview, setCancelTargetInterview] = useState<InterviewItem | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelSendEmail, setCancelSendEmail] = useState<boolean>(true);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const handleOpenCancelModal = (interview: InterviewItem) => {
    setCancelTargetInterview(interview);
    setCancelReason("");
    setCancelSendEmail(true);
  };

  const handleConfirmCancelInterview = async () => {
    if (!cancelTargetInterview) return;
    setIsCancelling(true);
    try {
      await cancelInterview(cancelTargetInterview.id, {
        send_email: cancelSendEmail,
        reason: cancelReason,
      });
      toast(`Successfully cancelled interview session for ${cancelTargetInterview.candidate_name}!`, "success");
      setCancelTargetInterview(null);
      setRefreshKey((k) => k + 1);
      fetchAllData();
    } catch (err: any) {
      console.error("Cancel interview error:", err);
      toast(err.message || "Failed to cancel interview.", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  // Send Email Modal Multiple Recipients States
  const [interviewerMailRecipients, setInterviewerMailRecipients] = useState<
    Array<{ name: string; email: string; send: boolean }>
  >([]);
  const [clientMailRecipients, setClientMailRecipients] = useState<
    Array<{ name: string; email: string; send: boolean }>
  >([]);

  // Floating Toast Notification State

  const handleAddInterviewerMailRecipient = () => {
    setInterviewerMailRecipients((prev) => [
      ...prev,
      { send: true, name: `Interviewer ${prev.length + 1}`, email: "" },
    ]);
  };

  const handleRemoveInterviewerMailRecipient = (index: number) => {
    setInterviewerMailRecipients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleInterviewerMailRecipientChange = (index: number, field: string, value: any) => {
    setInterviewerMailRecipients((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleAddClientMailRecipient = () => {
    setClientMailRecipients((prev) => [
      ...prev,
      { send: true, name: `Client Evaluator ${prev.length + 1}`, email: "" },
    ]);
  };

  const handleRemoveClientMailRecipient = (index: number) => {
    setClientMailRecipients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClientMailRecipientChange = (index: number, field: string, value: any) => {
    setClientMailRecipients((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  // "View candidate" opens the one candidate profile page
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  // "Interview history": every round with all its captured details
  const [historyFor, setHistoryFor] = useState<InterviewItem | null>(null);
  const handleOpenDetails = (item: InterviewItem) => {
    const id = item.resume_id || item.candidate_id;
    if (id) navigate(`/candidates/${id}`);
  };



  // Load KPI totals and identify the "Next Up" live interview session
  const fetchSummaryStats = async () => {
    const today = todayIso();
    const listOf = (data: any): InterviewItem[] =>
      Array.isArray(data) ? data : data?.interviews || data?.data?.interviews || [];
    const totalOf = (data: any): number => data?.total ?? data?.data?.total ?? 0;

    try {
      const [allRes, completedRes, selectedRes, nextRes, pastRes] = await Promise.all([
        getInterviews({ limit: 1 }),
        getInterviews({ status: "COMPLETED", limit: 1 }),
        getInterviews({ verdict: "Selected", limit: 1 }),
        getInterviews({ date_from: today, date_to: shiftDays(today, 14), limit: 200 }),
        getInterviews({ date_from: shiftDays(today, -30), date_to: shiftDays(today, -1), limit: 200 }),
      ]);

      let nextItems = listOf(nextRes);
      let pastItems = listOf(pastRes);

      if (isClientUser || isInterviewerUser) {
        nextItems = nextItems.filter(isInterviewAssignedToCurrentUser);
        pastItems = pastItems.filter(isInterviewAssignedToCurrentUser);
      }

      const upcomingList = nextItems
        .filter((i) => getInterviewPhase(i, today) === "upcoming")
        .sort(byDateTime);

      const needsFeedbackList = [...pastItems, ...nextItems]
        .filter((i) => getInterviewPhase(i, today) === "needs-feedback")
        .sort(byDateTime)
        .reverse();

      const todayList = [...nextItems, ...pastItems]
        .filter((i) => i.scheduled_date === today)
        .sort(byDateTime);

      const nextSession = upcomingList.length > 0 ? upcomingList[0] : (todayList.length > 0 ? todayList[0] : null);

      setNextUpSession(nextSession);
      setCounts({
        all: totalOf(allRes),
        today: todayList.length,
        upcoming: upcomingList.length,
        needsFeedback: needsFeedbackList.length,
        completed: totalOf(completedRes),
        selected: totalOf(selectedRes),
      });
    } catch (err) {
      console.error("Failed to load interview summary stats:", err);
    }
  };

  // Fetch interviews & candidates list from backend with search, filters & pagination
  const fetchAllData = async (
    targetTab = activeTab,
    targetPage = page,
    targetLimit = limit,
    targetSearch = debouncedSearch,
    targetDate = scheduledDateFilter,
    targetType = typeFilter,
    targetStatus = statusFilter,
    targetRecommendation = recommendationFilter,
    targetStage = stageFilter
  ) => {
    setLoading(true);
    setError(null);
    try {
      const activeType = targetType !== "All" ? targetType : undefined;
      const activeStatus = targetStatus !== "All" ? targetStatus : undefined;
      const activeRecommendation = targetRecommendation !== "All" ? targetRecommendation : undefined;
      const today = todayIso();

      const filterParams: any = {
        page: targetTab === "all" ? targetPage : 1,
        limit: targetTab === "all" ? targetLimit : 200,
        search: targetSearch.trim() || undefined,
        interview_type: activeType,
        status: activeStatus,
        // "rec:<value>" = an exact old outcome value; anything else is a Verdict
        verdict: activeRecommendation && !activeRecommendation.startsWith("rec:") ? activeRecommendation : undefined,
        recommendation: activeRecommendation?.startsWith("rec:") ? activeRecommendation.slice(4) : undefined,
        stage: targetStage !== "All" ? targetStage : undefined,
      };

      if (targetTab === "today") {
        filterParams.scheduled_date = targetDate.trim() || today;
      } else if (targetTab === "upcoming") {
        filterParams.date_from = targetDate.trim() || today;
        filterParams.date_to = shiftDays(today, 14);
      } else if (targetTab === "needs-feedback") {
        filterParams.date_from = shiftDays(today, -30);
        filterParams.date_to = today;
      } else if (targetDate.trim()) {
        filterParams.scheduled_date = targetDate.trim();
      }

      if (isClientUser && currentUser) {
        filterParams.client_id = currentUser.id || currentUser.email || currentUser.full_name;
      } else if (isInterviewerUser && currentUser) {
        filterParams.interviewer_id = currentUser.id || currentUser.email || currentUser.full_name;
      }

      const interviewData = await getInterviews(filterParams);

      let items: InterviewItem[] = Array.isArray(interviewData) ? interviewData : interviewData?.interviews || interviewData?.data?.interviews || [];
      if (isClientUser || isInterviewerUser) {
        items = items.filter(isInterviewAssignedToCurrentUser);
      }

      if (targetTab === "today") {
        items = items.filter((item) => item.scheduled_date === today);
        items.sort(byDateTime);
      } else if (targetTab === "upcoming") {
        items = items.filter((item) => getInterviewPhase(item, today) === "upcoming");
        items.sort(byDateTime);
      } else if (targetTab === "needs-feedback") {
        items = items.filter((item) => getInterviewPhase(item, today) === "needs-feedback");
        items.sort(byDateTime).reverse();
      }

      const total = targetTab === "all"
        ? (typeof interviewData?.total === "number" ? interviewData.total : (interviewData?.data?.total || items.length))
        : items.length;

      const computedTotalPages = targetTab === "all"
        ? (typeof interviewData?.total_pages === "number" ? interviewData.total_pages : (interviewData?.data?.total_pages || Math.ceil(total / targetLimit) || 1))
        : Math.max(1, Math.ceil(items.length / targetLimit));

      setInterviews(items);
      setTotalCount(items.length < total && (isClientUser || isInterviewerUser) ? items.length : total);
      setTotalPages(computedTotalPages);
    } catch (err: any) {
      console.error("Failed to load interview management data:", err);
      setError(err.message || "Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  };

  const location = useLocation();

  useEffect(() => {
    fetchAllData(
      activeTab,
      page,
      limit,
      debouncedSearch,
      scheduledDateFilter,
      typeFilter,
      statusFilter,
      recommendationFilter,
      stageFilter
    );
  }, [
    activeTab,
    page,
    limit,
    debouncedSearch,
    scheduledDateFilter,
    typeFilter,
    statusFilter,
    recommendationFilter,
    stageFilter,
  ]);

  useEffect(() => {
    fetchSummaryStats();
  }, [refreshKey]);

  // Handle direct deep-links from Dashboard (?action=schedule, ?reschedule=<id>, ?filter=awaiting_feedback, ?search=<name>, ?tab=<name>, ?view=<name>)
  useEffect(() => {
    const action = searchParams.get("action");
    const rescheduleId = searchParams.get("reschedule");
    const filterParam = searchParams.get("filter");
    const searchParam = searchParams.get("search");
    const tabParam = searchParams.get("tab");
    const viewParam = searchParams.get("view");

    if (filterParam === "awaiting_feedback") {
      setActiveTab("needs-feedback");
    } else if (tabParam && (tabParam === "today" || tabParam === "upcoming" || tabParam === "needs-feedback" || tabParam === "all")) {
      setActiveTab(tabParam as InterviewTab);
    } else if (viewParam === "all") {
      setActiveTab("all");
    } else if (viewParam === "today") {
      setActiveTab("today");
    }

    if (searchParam) {
      setSearchTerm(searchParam);
      setDebouncedSearch(searchParam);
    }

    if (action === "schedule") {
      setInterviewForm({ mode: "schedule" });
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
      return;
    }

    if (rescheduleId) {
      let cancelled = false;
      getInterviewById(rescheduleId)
        .then((inv) => {
          if (!cancelled && inv) {
            setInterviewForm({ mode: "reschedule", interview: inv });
          }
        })
        .catch((err) => {
          console.error("Could not load interview to reschedule:", err);
          toast("Could not load that interview for rescheduling.", "error");
        })
        .finally(() => {
          if (!cancelled) {
            const next = new URLSearchParams(searchParams);
            next.delete("reschedule");
            setSearchParams(next, { replace: true });
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [searchParams, setSearchParams, toast]);

  // Other pages (Candidates, Interview Dashboard) open the form here with a candidate already chosen
  useEffect(() => {
    const cand = location.state?.scheduleCandidate;
    if (cand) {
      setInterviewForm({
        mode: "schedule",
        candidate: {
          candidate_id: cand.candidate_id || "",
          candidate_name: cand.candidate_name || "",
          candidate_email: cand.candidate_email || "",
          resume_id: cand.resume_id || "",
          job_title: cand.job_title || "",
        },
      });
    }
  }, [location.state]);

  // Interview types rarely change: load them once per visit, not on every search
  useEffect(() => {
    getInterviewTypes()
      .then((typesData) => setInterviewTypes(Array.isArray(typesData) ? typesData : []))
      .catch(() => setInterviewTypes([]));
  }, []);

  // Group and extract only the latest/current round for each candidate
  const getLatestInterviewsPerCandidate = (items: InterviewItem[]) => {
    const map = new Map<string, InterviewItem>();
    items.forEach((item) => {
      const key = item.candidate_id ? item.candidate_id : `${item.candidate_name}_${item.job_title}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
      } else {
        const existingRound = existing.round_number || 1;
        const currentRound = item.round_number || 1;
        if (currentRound > existingRound) {
          map.set(key, item);
        } else if (currentRound === existingRound) {
          if (new Date(item.created_at || 0) > new Date(existing.created_at || 0)) {
            map.set(key, item);
          }
        }
      }
    });
    return Array.from(map.values());
  };

  // Filtered interviews showing current round only per candidate
  const latestCandidateInterviews = getLatestInterviewsPerCandidate(interviews);

  const [currentRoundOnly, setCurrentRoundOnly] = useState(false);
  // "Highest score first" (the old Interview Dashboard's score sort), on the rows shown
  const [sortByScore, setSortByScore] = useState(false);
  const scoreOf = (i: InterviewItem) => i.ai_score ?? ((i.rating ?? 0) > 0 ? (i.rating as number) * 20 : -1);
  const baseItems = activeTab === "all" && currentRoundOnly ? latestCandidateInterviews : interviews;
  const filteredInterviews = sortByScore
    ? [...baseItems].sort((a, b) => scoreOf(b) - scoreOf(a))
    : baseItems;

  const displayRows = activeTab === "all" ? filteredInterviews : filteredInterviews.slice((page - 1) * limit, page * limit);
  const currentTotal = activeTab === "all" ? totalCount : filteredInterviews.length;
  const currentTotalPages = activeTab === "all" ? totalPages : Math.max(1, Math.ceil(filteredInterviews.length / limit));

  // Checkbox Selection Handlers for Bulk Feedback Update
  const isAllSelected = filteredInterviews.length > 0 && filteredInterviews.every((i) => selectedInterviewIds.includes(i.id));

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedInterviewIds([]);
    } else {
      setSelectedInterviewIds(filteredInterviews.map((i) => i.id));
    }
  };

  const handleSelectRowToggle = (id: string) => {
    setSelectedInterviewIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };




  // Helper for Status Badge Styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return "bg-sky-50 border-sky-200 text-sky-700 font-bold";
      case "COMPLETED":
        return "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold";
      case "RESCHEDULED":
        return "bg-indigo-50 border-indigo-200 text-indigo-700 font-bold";
      case "CANCELLED":
        return "bg-rose-50 border-rose-200 text-rose-700 font-bold";
      case "NO_SHOW":
        return "bg-slate-100 border-slate-200 text-slate-700 font-bold";
      default:
        return "bg-amber-50 border-amber-200 text-amber-700 font-bold";
    }
  };

  // Open Feedback Modal
  const handleOpenFeedback = (item: InterviewItem) => setFeedbackTargets([item]);

  // Delete Interview
  const handleOpenDelete = (item: InterviewItem) => {
    setSelectedInterview(item);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedInterview) return;
    try {
      setActionLoading(true);
      await deleteInterview(selectedInterview.id);
      setIsDeleteOpen(false);
      setRefreshKey((k) => k + 1);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to delete interview:", err);
      toast(err.message || "Failed to delete interview.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Send Mail Modal
  const handleOpenSendMail = (item: InterviewItem) => {
    setSelectedInterview(item);
    setSendMailStatus(null);

    const candEmail = item.candidate_email || "";

    setSendMailForm({
      send_to_candidate: true,
      candidate_email: candEmail,
      send_to_interviewer: true,
      interviewer_email: item.interviewer_email || "",
      template_id: "",
      custom_notes: item.notes || "",
    });

    // Initialize interviewer mail recipient list
    const initInts =
      item.interviewers && item.interviewers.length > 0
        ? item.interviewers.map((i) => ({
          send: true,
          name: i.interviewer_name || "Interviewer",
          email: i.interviewer_email || "",
        }))
        : item.interviewer_name || item.interviewer_email
          ? [
            {
              send: true,
              name: item.interviewer_name || "Interviewer",
              email: item.interviewer_email || "",
            },
          ]
          : [];
    setInterviewerMailRecipients(initInts);

    // Initialize client evaluator mail recipient list
    const initClients =
      item.clients && item.clients.length > 0
        ? item.clients.map((c) => ({
          send: true,
          name: c.client_name || "Client Evaluator",
          email: c.client_email || "",
        }))
        : item.client_name || item.client_email
          ? [
            {
              send: true,
              name: item.client_name || "Client Evaluator",
              email: item.client_email || "",
            },
          ]
          : [];
    setClientMailRecipients(initClients);

    setIsSendMailOpen(true);
    fetchMailTemplates();
  };

  const fetchMailTemplates = async () => {
    try {
      const res = await apiFetch(MAIL_TEMPLATES_URL);
      if (res.ok) {
        const data = await res.json();
        setAvailableTemplates(data);
        if (data.length > 0) {
          const defaultTemp = data.find((t: any) => t.name.toLowerCase().includes("interview")) || data[0];
          setSendMailForm((prev) => ({ ...prev, template_id: defaultTemp.id || defaultTemp._id }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch mail templates:", e);
    }
  };

  const handleSendMailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;

    const activeInterviewerEmails = interviewerMailRecipients
      .filter((i) => i.send && i.email && i.email.trim())
      .map((i) => i.email.trim());

    const activeClientEmails = clientMailRecipients
      .filter((c) => c.send && c.email && c.email.trim())
      .map((c) => c.email.trim());

    if (!sendMailForm.send_to_candidate && activeInterviewerEmails.length === 0 && activeClientEmails.length === 0) {
      setSendMailStatus({ type: "error", text: "Please select at least one recipient (Candidate, Interviewer, or Client)." });
      return;
    }

    if (sendMailForm.send_to_candidate && !sendMailForm.candidate_email.trim()) {
      setSendMailStatus({ type: "error", text: "Candidate email is required to send mail to candidate." });
      return;
    }

    try {
      setSendMailLoading(true);
      setSendMailStatus(null);

      const allPanelEmails = [...activeInterviewerEmails, ...activeClientEmails];
      const combinedPanelEmailStr = allPanelEmails.join(", ") || sendMailForm.interviewer_email.trim() || undefined;

      const res = await sendInterviewEmail(selectedInterview.id, {
        send_to_candidate: sendMailForm.send_to_candidate,
        candidate_email: sendMailForm.candidate_email.trim() || undefined,
        send_to_interviewer: allPanelEmails.length > 0 ? true : sendMailForm.send_to_interviewer,
        interviewer_email: combinedPanelEmailStr,
        template_id: sendMailForm.template_id || undefined,
        custom_notes: sendMailForm.custom_notes || undefined,
      });

      const successMsg = res.message || `Interview notification email successfully sent to ${selectedInterview.candidate_name}!`;
      setSendMailStatus({ type: "success", text: successMsg });
      toast(successMsg, "success");
      setRefreshKey((k) => k + 1);
      fetchAllData();
      setTimeout(() => {
        setIsSendMailOpen(false);
        setSendMailStatus(null);
      }, 1500);
    } catch (err: any) {
      console.error("Failed to send interview email:", err);
      setSendMailStatus({ type: "error", text: err.message || "Failed to send interview email." });
    } finally {
      setSendMailLoading(false);
    }
  };

  const isAdmin = userRole === "admin" || userRole === "superadmin";

  // The row menu lists only the actions that make sense for where the interview stands
  const rowActions = (row: InterviewItem) => {
    const phase = getInterviewPhase(row);
    const view = { label: "View candidate", icon: <Eye size={14} />, run: () => handleOpenDetails(row) };
    const history = { label: "Interview history", icon: <Layers size={14} />, run: () => setHistoryFor(row) };
    const email = { label: "Send email", icon: <Mail size={14} />, run: () => handleOpenSendMail(row) };
    const feedback = { label: hasFeedback(row) ? "Update feedback" : "Give feedback", icon: <Star size={14} />, run: () => handleOpenFeedback(row) };
    const nextRound = { label: "Schedule next round", icon: <Layers size={14} />, run: () => setInterviewForm({ mode: "next-round", interview: row }) };
    const reschedule = { label: "Reschedule and notify", icon: <Calendar size={14} />, run: () => setInterviewForm({ mode: "reschedule", interview: row }) };
    const edit = { label: "Edit details", icon: <Edit2 size={14} />, run: () => setInterviewForm({ mode: "edit", interview: row }) };
    const cancel = { label: "Cancel interview", icon: <XCircle size={14} />, run: () => handleOpenCancelModal(row), danger: true };
    const remove = { label: "Delete", icon: <Trash2 size={14} />, run: () => handleOpenDelete(row), danger: true };
    const again = {
      label: "Schedule again",
      icon: <Plus size={14} />,
      primary: true,
      run: () =>
        setInterviewForm({
          mode: "schedule",
          candidate: { candidate_id: row.candidate_id, candidate_name: row.candidate_name, candidate_email: row.candidate_email, resume_id: row.resume_id, job_title: row.job_title },
        }),
    };
    const join = row.meeting_link
      ? {
          label: "Join meeting",
          icon: <Video size={14} />,
          primary: true,
          run: () => window.open(row.meeting_link, "_blank", "noopener,noreferrer"),
        }
      : null;
    type RowAction = { label: string; icon: React.ReactNode; run: () => void; danger?: boolean; primary?: boolean };
    // Most useful first for the interview's state; every action from the old menu stays available
    const first: RowAction[] =
      phase === "upcoming" ? ([join, view, history, edit, reschedule, cancel].filter(Boolean) as RowAction[])
      : phase === "needs-feedback" ? [{ ...feedback, primary: true }, nextRound, reschedule, cancel]
      : phase === "done" ? [{ ...nextRound, primary: true }, feedback]
      : [again];
    // Cancel sits right after Reschedule
    const all: RowAction[] = [feedback, nextRound, ...(join ? [join] : []), view, history, edit, reschedule, ...(row.status === "CANCELLED" ? [] : [cancel]), email];
    const list: RowAction[] = [...first, ...all.filter((a) => !first.some((f) => f.label === a.label))];
    return isAdmin ? [...list, remove as (typeof list)[number]] : list;
  };

  return (
    <div className="max-w-[1380px] mx-auto space-y-5 pb-10 font-sans text-slate-900">
      {/* 1. Header Bar: Title (Left) + Action (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900 tracking-[-0.02em] leading-tight">
            Interviews
          </h1>
          <p className="text-xs font-medium text-slate-600 mt-0.5">
            Schedule, conduct, and evaluate candidate interview rounds
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setInterviewForm({ mode: "schedule" })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={15} />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* 2. "Next Up" Live Banner (if session is scheduled today or upcoming) */}
      {nextUpSession && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 border border-indigo-500/25 shadow-md">
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  NEXT UP
                </span>
                <span className="text-xs text-indigo-200 font-semibold flex items-center gap-1.5">
                  <Calendar size={13} className="text-indigo-400" />
                  {dayLabel(nextUpSession.scheduled_date, todayIso())}, {formatTimeTo12Hour(nextUpSession.scheduled_time)} ({nextUpSession.timezone || "IST"})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenDetails(nextUpSession)}
                  className="text-lg font-bold tracking-tight text-white hover:text-indigo-200 transition-colors text-left cursor-pointer flex items-center gap-2"
                >
                  <span>{nextUpSession.candidate_name}</span>
                </button>
                <span className="text-xs text-slate-300 font-medium">
                  • {nextUpSession.job_title}
                </span>
                <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded text-[11px] font-semibold">
                  {nextUpSession.interview_type.replace(/_/g, " ")} • Round {nextUpSession.round_number || 1}
                </span>
              </div>

              <div className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400">Evaluators:</span>
                <span className="font-medium text-slate-200">
                  {panelNames(nextUpSession) || nextUpSession.interviewer_name || "Assigned Panel"}
                </span>
                {nextUpSession.location && (
                  <span className="text-slate-400 flex items-center gap-1 ml-2">
                    <MapPin size={11} /> {nextUpSession.location}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {nextUpSession.meeting_link && (
                <a
                  href={nextUpSession.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
                >
                  <Video size={15} />
                  <span>Join Meeting</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => handleOpenFeedback(nextUpSession)}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 rounded-xl text-xs backdrop-blur-xs border border-white/15 transition-colors cursor-pointer"
              >
                <Star size={14} className="text-amber-400" />
                <span>Feedback</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenDetails(nextUpSession)}
                className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 rounded-xl text-xs backdrop-blur-xs border border-white/15 transition-colors cursor-pointer"
              >
                <Eye size={14} />
                <span>Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive KPI / Metric Summary Cards (6 1-click preset filter cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* All Interviews */}
        <button
          type="button"
          onClick={() => {
            handleTabChange("all");
            setStatusFilter("All");
            setRecommendationFilter("All");
          }}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "all" && statusFilter === "All" && recommendationFilter === "All"
              ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate">All</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.all}</span>
                <span className="text-[10px] text-slate-400 font-medium">interviews</span>
              </div>
            </div>
          </div>
        </button>

        {/* Today */}
        <button
          type="button"
          onClick={() => handleTabChange("today")}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "today"
              ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Calendar size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate">Today</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.today}</span>
                <span className="text-[10px] text-slate-400 font-medium">sessions</span>
              </div>
            </div>
          </div>
        </button>

        {/* Upcoming */}
        <button
          type="button"
          onClick={() => handleTabChange("upcoming")}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "upcoming"
              ? "bg-sky-50/70 border-sky-300 ring-2 ring-sky-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Clock size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate">Upcoming</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.upcoming}</span>
                <span className="text-[10px] text-slate-400 font-medium">next 14d</span>
              </div>
            </div>
          </div>
        </button>

        {/* Needs Feedback */}
        <button
          type="button"
          onClick={() => handleTabChange("needs-feedback")}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "needs-feedback"
              ? "bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 relative">
              <AlertCircle size={17} />
              {counts.needsFeedback > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white animate-pulse" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1.5">
                <span>Needs Feedback</span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.needsFeedback}</span>
                <span className="text-[10px] text-slate-400 font-medium">pending</span>
              </div>
            </div>
          </div>
        </button>

        {/* Completed */}
        <button
          type="button"
          onClick={() => {
            handleTabChange("all");
            setStatusFilter("COMPLETED");
            setRecommendationFilter("All");
          }}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "all" && statusFilter === "COMPLETED"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate">Completed</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.completed}</span>
                <span className="text-[10px] text-slate-400 font-medium">finished</span>
              </div>
            </div>
          </div>
        </button>

        {/* Selected */}
        <button
          type="button"
          onClick={() => {
            handleTabChange("all");
            setStatusFilter("All");
            setRecommendationFilter("Selected");
          }}
          className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
            activeTab === "all" && recommendationFilter === "Selected"
              ? "bg-teal-50/70 border-teal-300 ring-2 ring-teal-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <UserCheck size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-slate-500 truncate">Selected</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-bold text-slate-900 tracking-tight">{counts.selected}</span>
                <span className="text-[10px] text-slate-400 font-medium">recommended</span>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* 4. Unified Master Table Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        {/* Card Header: View Title on Left + Search & Action Controls on Right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-slate-800">
              {activeTab === "today"
                ? "Today's Interviews"
                : activeTab === "upcoming"
                ? "Upcoming Interviews"
                : activeTab === "needs-feedback"
                ? "Interviews Awaiting Feedback"
                : statusFilter === "COMPLETED"
                ? "Completed Interviews"
                : recommendationFilter === "Selected"
                ? "Selected Candidates"
                : "All Interviews"}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 border border-slate-200 text-slate-600">
              {currentTotal} {currentTotal === 1 ? "interview" : "interviews"}
            </span>
          </div>

          {/* Right Toolbar: Search, Filters toggle, Top Score sort */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search candidate, role, interviewer..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl pl-8.5 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                showFilterBar || activeFilterCount > 0
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort by Score Toggle */}
            <button
              type="button"
              onClick={() => setSortByScore(!sortByScore)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                sortByScore
                  ? "bg-amber-50/80 border-amber-300 text-amber-800 shadow-2xs"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              title="Sort by highest interview rating first"
            >
              <Star size={13} className={sortByScore ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
              <span>Top Score</span>
            </button>
          </div>
        </div>

        {/* Collapsible Filter Panel (opens when toggled or when active filters exist) */}
        {(showFilterBar || activeFilterCount > 0) && (
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Filter size={13} className="text-slate-500" />
                <span>Filter Records</span>
                {activeFilterCount > 0 && (
                  <span className="text-[11px] font-medium text-slate-500">
                    ({activeFilterCount} active)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeTab === "all" && (
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentRoundOnly}
                      onChange={(e) => setCurrentRoundOnly(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Current round only
                  </label>
                )}
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-700 font-semibold px-2 py-0.5 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <X size={11} /> Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDateFilter}
                  onChange={(e) => {
                    setScheduledDateFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Interview Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="All">All Types</option>
                  {interviewTypes && interviewTypes.filter((t) => t.is_active !== false).map((t) => (
                    <option key={t.id} value={t.code}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="RESCHEDULED">Rescheduled</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label htmlFor="filter-verdict" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Verdict</label>
                <select
                  id="filter-verdict"
                  value={recommendationFilter}
                  onChange={(e) => {
                    setRecommendationFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="All">All Verdicts</option>
                  {VERDICTS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                  <optgroup label="Exact outcome">
                    {RECOMMENDATION_OPTIONS.map((r) => (
                      <option key={r} value={`rec:${r}`}>{r}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label htmlFor="filter-stage" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Stage</label>
                <select
                  id="filter-stage"
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                >
                  <option value="All">All Stages</option>
                  {INTERVIEW_STAGES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Needs Feedback Alert Ribbon */}
        {activeTab === "needs-feedback" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-semibold">Showing completed &amp; concluded interviews missing evaluation feedback</span>
              <span className="text-amber-700">({currentTotal} matching)</span>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-800 hover:bg-amber-100/60 font-medium transition-colors cursor-pointer"
            >
              <X size={12} />
              <span>Show All</span>
            </button>
          </div>
        )}

        {/* Bulk Selection Header */}
        {selectedInterviewIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-200/80 px-4 py-2.5 rounded-xl">
            <div className="text-xs font-bold text-indigo-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                {selectedInterviewIds.length}
              </span>
              <span>Candidates selected for bulk action</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFeedbackTargets(filteredInterviews.filter((i) => selectedInterviewIds.includes(i.id)))}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap"
              >
                <Sparkles size={14} />
                Bulk Feedback Update ({selectedInterviewIds.length})
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs"
              >
                <Mail size={14} />
                Email Summary ({selectedInterviewIds.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedInterviewIds([])}
                className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-2 py-1 cursor-pointer"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* Interviews Data Table or Modern Empty State */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500 text-xs">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
            Loading interviews...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold">
            {error}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              {activeTab === "needs-feedback" ? (
                <CheckCircle size={22} className="text-emerald-500" />
              ) : activeTab === "today" ? (
                <Calendar size={22} className="text-indigo-600" />
              ) : (
                <Clock size={22} className="text-slate-400" />
              )}
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <p className="font-bold text-slate-800 text-sm">
                {activeTab === "today"
                  ? "No interviews scheduled for today"
                  : activeTab === "upcoming"
                  ? "No upcoming interviews in the next 14 days"
                  : activeTab === "needs-feedback"
                  ? "All caught up! No interviews awaiting feedback"
                  : "No interviews found"}
              </p>
              <p className="text-slate-500 text-xs">
                {activeTab === "today"
                  ? `You have ${counts.needsFeedback > 0 ? `${counts.needsFeedback} interviews awaiting feedback and ` : ""}${counts.all} total interviews across all rounds.`
                  : activeTab === "upcoming"
                  ? `There are ${counts.all} total interview records across the talent pipeline.`
                  : activeTab === "needs-feedback"
                  ? "All completed sessions have evaluation scorecards submitted."
                  : "Try adjusting your search query or clearing applied filters."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {activeTab === "today" && counts.needsFeedback > 0 && (
                <button
                  type="button"
                  onClick={() => handleTabChange("needs-feedback")}
                  className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  <AlertCircle size={13} className="text-amber-600" />
                  <span>Review Needs Feedback ({counts.needsFeedback})</span>
                </button>
              )}
              {activeTab !== "all" && counts.all > 0 && (
                <button
                  type="button"
                  onClick={() => handleTabChange("all")}
                  className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-2xs cursor-pointer"
                >
                  <span>View All {counts.all} Interviews</span>
                  <ArrowRight size={13} className="text-slate-400" />
                </button>
              )}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-rose-600 border border-rose-200 font-semibold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  <X size={11} /> Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => setInterviewForm({ mode: "schedule" })}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                <Plus size={14} /> Schedule Interview
              </button>
            </div>
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm min-h-[340px] ${openActionMenuId ? "pb-96" : ""}`}>
            <table className="w-full text-left border-collapse min-w-[1150px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAllToggle}
                      className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                      title="Select / Deselect all candidates"
                    />
                  </th>
                  <th className="py-3.5 px-4 min-w-[210px]">Candidate Details</th>
                  <th className="py-3.5 px-4 min-w-[200px]">Applied Role &amp; Round</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Schedule &amp; Joining</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Feedback &amp; Ratings</th>
                  <th className="py-3.5 px-4 min-w-[160px]">Verdict &amp; Stage</th>
                  <th className="py-3.5 px-2 min-w-[120px] text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-sans">
                {displayRows.map((row) => (
                  <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${selectedInterviewIds.includes(row.id) ? "bg-indigo-50/50" : ""}`}>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedInterviewIds.includes(row.id)}
                        onChange={() => handleSelectRowToggle(row.id)}
                        className="rounded border-slate-300 bg-white text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                      />
                    </td>

                    {/* Candidate Details & Status */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                          {row.candidate_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(row)}
                            className="font-bold text-slate-900 hover:text-indigo-600 truncate text-xs text-left cursor-pointer transition-colors block"
                            title="View candidate profile"
                          >
                            {row.candidate_name}
                          </button>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-extrabold border ${getStatusBadge(row.status)}`}>
                              {row.status}
                            </span>
                            {row.location && (
                              <span className="text-[11px] text-indigo-600 font-medium flex items-center gap-0.5 truncate">
                                <MapPin size={10} />
                                {row.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Applied Role & Round */}
                    <td className="py-4 px-4 min-w-[200px]">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Briefcase size={13} className="text-indigo-600 shrink-0" />
                          <span
                            className="font-bold text-slate-900 text-xs truncate max-w-[200px] block"
                            title={row.job_title ? `Applied Role: ${row.job_title}` : "General Application"}
                          >
                            {row.job_title || row.candidate_requested_role || "General Application"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                            Round {row.round_number || 1}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                            {row.interview_type ? row.interview_type.replace(/_/g, " ") : "Technical"}
                          </span>
                          {row.job_type && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              • {row.job_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Schedule & Joining */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800 text-xs">{row.scheduled_date}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{formatTimeTo12Hour(row.scheduled_time)} ({row.timezone || "IST"})</div>
                      {row.meeting_link && (
                        <div className="mt-1">
                          <a
                            href={row.meeting_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 px-2 py-0.5 rounded-md transition-colors"
                            title="Join video meeting"
                          >
                            <Video size={11} className="text-emerald-600" />
                            <span>Join</span>
                          </a>
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${row.hr_call_verification === "Verified"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                          HR: {row.hr_call_verification || "Pending"}
                        </span>
                        {row.email_sent_count && row.email_sent_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border bg-cyan-50 text-cyan-700 border-cyan-200" title={`Last email sent at: ${row.last_email_sent_at || 'N/A'}`}>
                            <Mail size={10} /> Mail Sent ({row.email_sent_count})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border bg-slate-50 text-slate-400 border-slate-200">
                            <Mail size={10} /> Not Sent
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Feedback & Ratings */}
                    <td className="py-4 px-4 min-w-[220px]">
                      <div className="space-y-2">
                        {/* Interviewer Rating & Evaluator */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                              Interviewer
                            </span>
                            {row.rating ? (
                              <span className="text-amber-700 font-bold shrink-0">
                                ★ {Number(row.rating).toFixed(1)} / 5.0
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unrated</span>
                            )}
                          </div>

                          {(row.interviewer_name || row.feedback || row.rating) && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                              <span>By <strong className="text-slate-700">{row.interviewer_name || "Interviewer"}</strong></span>
                              {(row.updated_at || row.scheduled_date) && (
                                <span className="text-slate-400">
                                  • {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : row.scheduled_date}
                                </span>
                              )}
                            </div>
                          )}

                          {row.feedback && (
                            <p
                              className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 line-clamp-2 italic leading-relaxed"
                              title={`Feedback by ${row.interviewer_name || 'Interviewer'}: ${row.feedback}`}
                            >
                              "{row.feedback}"
                            </p>
                          )}
                        </div>

                        {/* Client Rating & Evaluator */}
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="bg-teal-50 text-teal-700 border border-teal-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                              Client
                            </span>
                            {row.client_rating ? (
                              <span className="text-teal-700 font-bold truncate max-w-[140px]">
                                ★ {Number(row.client_rating).toFixed(1)} / 5.0
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Pending</span>
                            )}
                          </div>

                          {(row.client_name || row.client_feedback || row.client_rating) && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                              <span>By <strong className="text-teal-800">{row.client_name || "Client Evaluator"}</strong></span>
                              {(row.client_feedback_date || row.updated_at) && (
                                <span className="text-slate-400">
                                  • {row.client_feedback_date || new Date(row.updated_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          )}

                          {row.client_feedback && (
                            <p
                              className="text-[11px] text-slate-700 bg-teal-50/50 border border-teal-100 rounded px-2 py-1 line-clamp-2 italic leading-relaxed"
                              title={`Client feedback by ${row.client_name || 'Client'}: ${row.client_feedback}`}
                            >
                              "{row.client_feedback}"
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Verdict (how it went) and Stage (where the candidate is) */}
                    <td className="py-4 px-4">
                      <div className="space-y-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${getVerdictBadge(row.verdict || "Pending")}`}>
                          {row.verdict || "Pending"}
                        </span>
                        <div className="text-xs text-slate-500">
                          Stage: <span className="font-semibold text-slate-700">{row.stage || "Interviewing"}</span>
                        </div>
                        {row.client_recommendation && row.client_recommendation !== "Pending" && (
                          <div className="text-xs text-slate-500">Client: {row.client_recommendation}</div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-2 text-left relative">
                      {activeTab === "needs-feedback" || getInterviewPhase(row) === "needs-feedback" ? (
                        <button
                          type="button"
                          onClick={() => handleOpenFeedback(row)}
                          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap active:scale-95"
                          title="Open evaluation scorecard & feedback"
                        >
                          <Star size={13} className="text-amber-300 fill-amber-300" />
                          <span>Give Feedback</span>
                        </button>
                      ) : (
                        <div className="relative inline-block text-left mgm-action-menu-container">
                          <button
                            type="button"
                            onClick={() => setOpenActionMenuId(openActionMenuId === row.id ? null : row.id)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer shadow-2xs"
                            title="Actions Menu"
                            aria-label="More actions"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {/* Action Dropdown Popup */}
                          {openActionMenuId === row.id && (
                            <div className="absolute right-0 top-8 z-50 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 text-left text-sm">
                              {rowActions(row).map((action) => (
                                <button
                                  key={action.label}
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    action.run();
                                  }}
                                  className={`w-full px-3.5 py-2 font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                                    action.danger ? "text-rose-700 hover:bg-rose-50" : action.primary ? "text-indigo-700 hover:bg-indigo-50" : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {action.icon}
                                  <span>{action.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span>
              Showing <strong className="font-semibold text-slate-800">{currentTotal > 0 ? (page - 1) * limit + 1 : 0}</strong> to{" "}
              <strong className="font-semibold text-slate-800">{Math.min(page * limit, currentTotal)}</strong> of{" "}
              <strong className="font-semibold text-slate-900">{currentTotal}</strong> interviews
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
              <strong className="font-semibold text-slate-800">{currentTotalPages}</strong>
            </span>

            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer text-slate-700"
              title="Previous Page"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page number buttons */}
            {Array.from({ length: Math.min(currentTotalPages, 5) }, (_, i) => {
              let pageNum = i + 1;
              if (currentTotalPages > 5 && page > 3) {
                pageNum = page - 3 + i;
                if (pageNum > currentTotalPages) pageNum = currentTotalPages - (4 - i);
              }
              if (pageNum <= 0) return null;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    page === pageNum
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={page >= currentTotalPages || loading}
              onClick={() => setPage((prev) => Math.min(prev + 1, currentTotalPages))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer text-slate-700"
              title="Next Page"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* CANCEL INTERVIEW CONFIRMATION POPUP MODAL */}
      {cancelTargetInterview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative text-slate-900">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-600 rounded-2xl">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Cancel Interview Session</h3>
                  <p className="text-xs text-slate-500">Confirm cancellation of scheduled interview round</p>
                </div>
              </div>
              <button
                onClick={() => setCancelTargetInterview(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Candidate & Session Info Details */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="font-extrabold text-slate-900 text-sm">{cancelTargetInterview.candidate_name}</span>
                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold text-[11px]">
                  Round {cancelTargetInterview.round_number} ({cancelTargetInterview.interview_type || "Technical"})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-bold">Email</span>
                  <span className="font-semibold text-slate-900 truncate block">{cancelTargetInterview.candidate_email || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-bold">Job Role</span>
                  <span className="font-semibold text-slate-900 truncate block">{cancelTargetInterview.job_title}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-bold">Scheduled Date & Time</span>
                  <span className="font-semibold text-indigo-600">
                    {cancelTargetInterview.scheduled_date} at {formatTimeTo12Hour(cancelTargetInterview.scheduled_time)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] uppercase font-bold">Interviewer</span>
                  <span className="font-semibold text-slate-900 truncate block">{cancelTargetInterview.interviewer_name || "Assigned Manager"}</span>
                </div>
              </div>
            </div>

            {/* Cancellation Reason Textarea */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-slate-800">
                Reason for Cancellation <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                placeholder="Enter cancellation reason (e.g. Candidate requested reschedule, Position filled, Profile mismatch)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-xs font-medium"
              />
            </div>

            {/* Send Email Checkbox */}
            <div className="bg-rose-50/50 border border-rose-200 p-3.5 rounded-2xl flex items-center gap-3">
              <input
                type="checkbox"
                id="cancelSendEmail"
                checked={cancelSendEmail}
                onChange={(e) => setCancelSendEmail(e.target.checked)}
                className="w-4 h-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500 cursor-pointer shrink-0"
              />
              <label htmlFor="cancelSendEmail" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                Dispatch Cancellation Email Notification
                {cancelTargetInterview.candidate_email && (
                  <span className="block text-[11px] font-normal text-slate-500">
                    Will send email to <strong className="text-rose-700">{cancelTargetInterview.candidate_email}</strong> & interviewer
                  </span>
                )}
              </label>
            </div>

            {/* Action Buttons: Cancel vs Confirm OK */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelTargetInterview(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel / Keep Session
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelInterview}
                disabled={isCancelling}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isCancelling ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Cancelling Session...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    <span>Confirm Cancellation (OK)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One form for schedule, edit, reschedule and next round */}
      <InterviewForm
        mode={interviewForm?.mode || "schedule"}
        isOpen={interviewForm !== null}
        interview={interviewForm?.interview}
        candidate={interviewForm?.candidate}
        onClose={() => setInterviewForm(null)}
        onSaved={() => {
          setRefreshKey((k) => k + 1);
          fetchAllData();
        }}
      />




      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-rose-600 flex items-center gap-2">
                <AlertCircle size={18} /> Delete Interview Record
              </h2>
              <button
                onClick={() => setIsDeleteOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete the scheduled interview for{" "}
              <span className="font-bold text-slate-900">{selectedInterview.candidate_name}</span> ({selectedInterview.job_title})?
              This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={actionLoading}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* CANDIDATE FULL DETAILS MODAL */}

      {/* BULK CANDIDATE FEEDBACK UPDATE MODAL */}
      {shareOpen && (
        <ShareSummaryDialog
          interviewIds={selectedInterviewIds}
          onClose={() => setShareOpen(false)}
          onSent={() => setSelectedInterviewIds([])}
        />
      )}

      <CandidateDetailsModal
        isOpen={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        candidateId={historyFor?.candidate_id || null}
        candidateName={historyFor?.candidate_name || ""}
        fallbackInterview={historyFor}
      />

      {/* One feedback panel, for a single interview or several selected ones */}
      <BulkFeedbackModal
        isOpen={feedbackTargets !== null}
        onClose={() => setFeedbackTargets(null)}
        selectedInterviews={feedbackTargets || []}
        onSuccess={() => {
          if ((feedbackTargets?.length || 0) > 1) setSelectedInterviewIds([]);
          setRefreshKey((k) => k + 1);
          fetchAllData();
        }}
      />

      {/* SEND INTERVIEW EMAIL POPUP MODAL */}
      {isSendMailOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-900 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-slate-50 px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-600">
                  <Mail size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Send Interview Notification Email</h2>
                  <p className="text-xs text-slate-500">
                    Dispatch notifications to Candidate, Panel Interviewers & Client Evaluators
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSendMailOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSendMailSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {sendMailStatus && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${sendMailStatus.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                    }`}
                >
                  {sendMailStatus.type === "success" ? (
                    <UserCheck size={16} className="shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 text-rose-600" />
                  )}
                  <span>{sendMailStatus.text}</span>
                </div>
              )}

              {/* Session Overview Box */}
              <div className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-100 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-indigo-900 font-bold text-xs border-b border-indigo-100/80 pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-indigo-600" />
                    Interview Session Summary
                  </span>
                  <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-extrabold text-[11px]">
                    {selectedInterview.interview_type} (Round {selectedInterview.round_number || 1})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-500">Candidate:</span>{" "}
                    <span className="font-bold text-slate-900">{selectedInterview.candidate_name}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Job Title:</span>{" "}
                    <span className="font-bold text-slate-900">{selectedInterview.job_title}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Scheduled Date & Time:</span>{" "}
                    <span className="font-bold text-slate-900">
                      {selectedInterview.scheduled_date} at {selectedInterview.scheduled_time} ({selectedInterview.duration_minutes || 60} mins)
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Platform / Link:</span>{" "}
                    <span className="font-bold text-slate-900">
                      {selectedInterview.meeting_platform || "Google Meet"} {selectedInterview.meeting_link ? `(${selectedInterview.meeting_link})` : ""}
                    </span>
                  </div>
                </div>

                {((selectedInterview.interview_document_files && selectedInterview.interview_document_files.length > 0) ||
                  (selectedInterview.interview_feedback_files && selectedInterview.interview_feedback_files.length > 0)) && (
                    <div className="pt-2 border-t border-indigo-100/80 space-y-1.5">
                      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                        📎 Attached Session Files & S3 Resources (Included in Email)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set([...(selectedInterview.interview_document_files || []), ...(selectedInterview.interview_feedback_files || [])])).map((fileUrl: string, fIdx: number) => {
                          const isUrl = fileUrl.startsWith("http://") || fileUrl.startsWith("https://");
                          const rawName = fileUrl.split("/").pop() || fileUrl;
                          const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                          return (
                            <div key={fIdx} className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-[11px] shadow-2xs">
                              <FileText size={12} className="text-indigo-600 shrink-0" />
                              <span className="font-semibold text-slate-800 max-w-[170px] truncate" title={fileUrl}>
                                {displayName}
                              </span>
                              {isUrl && (
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] px-1.5 py-0.2 rounded font-bold transition-all"
                                >
                                  <Eye size={10} />
                                  <span>View</span>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>

              {/* Recipient Indications Section */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Select Email Recipients & Indications:</span>

                {/* Candidate Mail Option */}
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendMailForm.send_to_candidate}
                      onChange={(e) => setSendMailForm({ ...sendMailForm, send_to_candidate: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-800">Candidate Email Notification</span>
                  </label>
                  {sendMailForm.send_to_candidate && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <input
                        type="text"
                        disabled
                        value={selectedInterview.candidate_name || "Candidate"}
                        className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 font-medium"
                      />
                      <input
                        type="email"
                        required
                        placeholder="candidate@example.com"
                        value={sendMailForm.candidate_email}
                        onChange={(e) => setSendMailForm({ ...sendMailForm, candidate_email: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      />
                    </div>
                  )}
                </div>

                {/* Panel Interviewers Recipients Box */}
                <div className="bg-purple-50/50 border border-purple-200 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-100 pb-1.5">
                    <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <UserCheck size={14} className="text-purple-600" />
                      Interviewer Panel Recipients ({interviewerMailRecipients.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddInterviewerMailRecipient}
                      className="flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      <Plus size={12} /> Add Interviewer Email
                    </button>
                  </div>

                  {interviewerMailRecipients.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No interviewers specified. Click "+ Add Interviewer Email" to add one.</p>
                  ) : (
                    interviewerMailRecipients.map((int, idx) => (
                      <div key={idx} className="p-2.5 bg-white border border-purple-100 rounded-lg space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={int.send}
                              onChange={(e) => handleInterviewerMailRecipientChange(idx, "send", e.target.checked)}
                              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-purple-900 uppercase">
                              Interviewer #{idx + 1}: {int.name}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveInterviewerMailRecipient(idx)}
                            className="text-rose-500 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                        {int.send && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Interviewer Name"
                              value={int.name}
                              onChange={(e) => handleInterviewerMailRecipientChange(idx, "name", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium"
                            />
                            <input
                              type="email"
                              placeholder="interviewer@company.com"
                              value={int.email}
                              onChange={(e) => handleInterviewerMailRecipientChange(idx, "email", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Client Evaluators Recipients Box */}
                <div className="bg-teal-50/50 border border-teal-200 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-teal-100 pb-1.5">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <Building2 size={14} className="text-teal-600" />
                      Client Evaluator Panel Recipients ({clientMailRecipients.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddClientMailRecipient}
                      className="flex items-center gap-1 bg-teal-100 hover:bg-teal-200 text-teal-800 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      <Plus size={12} /> Add Client Email
                    </button>
                  </div>

                  {clientMailRecipients.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No client evaluators specified. Click "+ Add Client Email" to add one.</p>
                  ) : (
                    clientMailRecipients.map((cli, idx) => (
                      <div key={idx} className="p-2.5 bg-white border border-teal-100 rounded-lg space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cli.send}
                              onChange={(e) => handleClientMailRecipientChange(idx, "send", e.target.checked)}
                              className="rounded border-teal-300 text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-teal-900 uppercase">
                              Client Evaluator #{idx + 1}: {cli.name}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveClientMailRecipient(idx)}
                            className="text-rose-500 hover:text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                        {cli.send && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Client Name / Company"
                              value={cli.name}
                              onChange={(e) => handleClientMailRecipientChange(idx, "name", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium"
                            />
                            <input
                              type="email"
                              placeholder="client@company.com"
                              value={cli.email}
                              onChange={(e) => handleClientMailRecipientChange(idx, "email", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Template Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Mail Template</label>
                <select
                  value={sendMailForm.template_id}
                  onChange={(e) => setSendMailForm({ ...sendMailForm, template_id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer font-medium"
                >
                  <option value="">Default (Auto-select Interview Template)</option>
                  {availableTemplates.map((t: any) => (
                    <option key={t.id || t._id} value={t.id || t._id}>
                      {t.name} - {t.subject}
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule Notes / Custom Content */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Interview Schedule Notes <span className="text-slate-400 font-normal font-mono">(Replaces {'{{notes}}'} in template)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter specific instructions or schedule notes for candidate / interviewer / client..."
                  value={sendMailForm.custom_notes}
                  onChange={(e) => setSendMailForm({ ...sendMailForm, custom_notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSendMailOpen(false)}
                  className="px-4 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendMailLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {sendMailLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <Mail size={14} />
                      <span>OK / Send Email</span>
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


