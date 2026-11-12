import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar, Edit2, Trash2, Plus, Star, X, AlertCircle, UserCheck, FileText, RefreshCw, Eye, MapPin, Mail, Layers, Sparkles, Building2, Loader2, CheckCircle, Search, ChevronLeft, ChevronRight, MoreVertical, XCircle
} from "lucide-react";
import {
  getInterviews, deleteInterview, cancelInterview,
  sendInterviewEmail, getInterviewTypes, MAIL_TEMPLATES_URL,
  type InterviewItem, type UserProfile, type InterviewTypeItem, apiFetch } from "../utils/Api";
import { BulkFeedbackModal } from "../components/BulkFeedbackModal";
import { CandidateDetailsModal } from "../components/CandidateDetailsModal";
import { InterviewForm, type InterviewFormMode, type CandidatePrefill } from "../components/interview/InterviewForm";
import { getInterviewPhase, hasFeedback, VERDICTS, INTERVIEW_STAGES, getVerdictBadge } from "../utils/interviewState";
import { TodayView } from "../components/interview/TodayView";
import { ShareSummaryDialog } from "../components/interview/ShareSummaryDialog";
import { RECOMMENDATION_OPTIONS } from "../types/interview";
import { useFeedback } from "../components/ui/Feedback";

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

  // Pagination & Server Search/Filter State
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  // The search box only hits the server 300 ms after typing stops
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Specific Filters State
  const [scheduledDateFilter, setScheduledDateFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
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

  // Modals state
  // "Today and Upcoming" is the default view; "All" is the full table. Kept in the URL (?view=all).
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "today" | "all" = searchParams.get("view") === "all" ? "all" : "today";
  const setView = (next: "today" | "all") => setSearchParams(next === "all" ? { view: "all" } : {}, { replace: true });
  // Bumped after any change so the Today view reloads too
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



  // Fetch interviews & candidates list from backend with search, filters & pagination
  const fetchAllData = async (
    targetPage = page,
    targetLimit = limit,
    targetSearch = debouncedSearch,
    targetDate = scheduledDateFilter,
    targetType = typeFilter,
    targetStatus = statusFilter,
    targetRecommendation = recommendationFilter
  ) => {
    setRefreshKey((k) => k + 1);
    setLoading(true);
    setError(null);
    try {
      const activeType = targetType !== "All" ? targetType : undefined;
      const activeStatus = targetStatus !== "All" ? targetStatus : undefined;
      const activeRecommendation = targetRecommendation !== "All" ? targetRecommendation : undefined;

      const filterParams: any = {
        page: targetPage,
        limit: targetLimit,
        search: targetSearch.trim() || undefined,
        scheduled_date: targetDate.trim() || undefined,
        interview_type: activeType,
        status: activeStatus,
        // "rec:<value>" = an exact old outcome value; anything else is a Verdict
        verdict: activeRecommendation && !activeRecommendation.startsWith("rec:") ? activeRecommendation : undefined,
        recommendation: activeRecommendation?.startsWith("rec:") ? activeRecommendation.slice(4) : undefined,
        stage: stageFilter !== "All" ? stageFilter : undefined,
      };

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

      const total = typeof interviewData?.total === "number" ? interviewData.total : (interviewData?.data?.total || items.length);
      const computedTotalPages = typeof interviewData?.total_pages === "number" ? interviewData.total_pages : (interviewData?.data?.total_pages || Math.ceil(total / targetLimit) || 1);

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
    fetchAllData(page, limit, debouncedSearch, scheduledDateFilter, typeFilter, statusFilter, recommendationFilter);
  }, [page, limit, debouncedSearch, scheduledDateFilter, typeFilter, statusFilter, recommendationFilter, stageFilter]);

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

  // "Highest score first" (the old Interview Dashboard's score sort), on the rows shown
  const [sortByScore, setSortByScore] = useState(false);
  const scoreOf = (i: InterviewItem) => i.ai_score ?? ((i.rating ?? 0) > 0 ? (i.rating as number) * 20 : -1);
  const filteredInterviews = sortByScore
    ? [...latestCandidateInterviews].sort((a, b) => scoreOf(b) - scoreOf(a))
    : latestCandidateInterviews;

  // Keep totalCount state in sync with current filtered candidate rows
  useEffect(() => {
    setTotalCount(filteredInterviews.length);
  }, [filteredInterviews.length]);

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
    const list: { label: string; icon: React.ReactNode; run: () => void; danger?: boolean; primary?: boolean }[] =
      phase === "upcoming" ? [view, history, edit, reschedule, email, cancel]
      : phase === "needs-feedback" ? [{ ...feedback, primary: true }, reschedule, edit, view, history, email, cancel]
      : phase === "done" ? [{ ...nextRound, primary: true }, feedback, edit, view, history, email]
      : [again, edit, view, history, email];
    return isAdmin ? [...list, remove as (typeof list)[number]] : list;
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen px-2 py-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900">Interviews</h1>
          <div role="tablist" aria-label="Interview views" className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
            {([["today", "Today and Upcoming"], ["all", "All"]] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${view === key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setInterviewForm({ mode: "schedule" })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={16} />
            Schedule Interview
          </button>
        </div>
      </div>

      {view === "today" && (
        <TodayView
          refreshKey={refreshKey}
          onFeedback={handleOpenFeedback}
          onReschedule={(item) => setInterviewForm({ mode: "reschedule", interview: item })}
          onView={handleOpenDetails}
        />
      )}

      {/* Main Table Card Wrapper ("All" view) */}
      {view === "all" && (
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-6">
        {/* SERVER SEARCH & FILTERS BAR */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Global Search Box */}
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, email, job title, interviewer..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium placeholder-slate-400 shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} className="w-4 h-4" />
                Highest score first
              </label>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setScheduledDateFilter("");
                    setTypeFilter("All");
                    setStatusFilter("All");
                    setRecommendationFilter("All");
                    setStageFilter("All");
                    setPage(1);
                  }}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <X size={12} /> Clear Filters ({activeFilterCount})
                </button>
              )}
            </div>
          </div>

          {/* Specific Field Filters Grid (name and email are covered by the search box) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-200/80 text-xs">
            {/* Scheduled Date Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Scheduled Date</label>
              <input
                type="date"
                value={scheduledDateFilter}
                onChange={(e) => {
                  setScheduledDateFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              />
            </div>

            {/* Interview Type Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Interview Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              >
                <option value="All">All Types</option>
                {interviewTypes && interviewTypes.filter((t) => t.is_active !== false).map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Interview Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="RESCHEDULED">Rescheduled</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Verdict Filter */}
            <div>
              <label htmlFor="filter-verdict" className="block text-[11px] font-semibold text-slate-600 mb-1">Verdict</label>
              <select
                id="filter-verdict"
                value={recommendationFilter}
                onChange={(e) => {
                  setRecommendationFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              >
                <option value="All">All verdicts</option>
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

            {/* Stage Filter */}
            <div>
              <label htmlFor="filter-stage" className="block text-[11px] font-semibold text-slate-600 mb-1">Stage</label>
              <select
                id="filter-stage"
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
              >
                <option value="All">All stages</option>
                {INTERVIEW_STAGES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {/* Bulk Actions Header if candidates selected */}
        {selectedInterviewIds.length > 0 && (
          <div className="flex justify-end pt-2 pb-1">
            <button
              onClick={() => setFeedbackTargets(filteredInterviews.filter((i) => selectedInterviewIds.includes(i.id)))}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Sparkles size={16} />
              Bulk Feedback Update ({selectedInterviewIds.length})
            </button>
            {/* Was "Email Interview Status" on the old Interview Dashboard */}
            <button
              onClick={() => setShareOpen(true)}
              className="ml-2 flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              <Mail size={16} />
              Email summary ({selectedInterviewIds.length})
            </button>
          </div>
        )}

        {/* Interviews Data Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-xs">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
            Loading interviews...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold">
            {error}
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs space-y-2">
            <p>No interviews found matching criteria.</p>
            <button
              onClick={() => setInterviewForm({ mode: "schedule" })}
              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              Schedule a new interview
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm min-h-[340px]">
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
                  <th className="py-3.5 px-4 min-w-[200px]">Candidate Details</th>
                  <th className="py-3.5 px-4 min-w-[160px]">Role & Round</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Schedule & HR Call</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Feedback & Ratings</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Verdict &amp; Stage</th>
                  <th className="py-3.5 px-2 min-w-[140px] text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-sans">
                {filteredInterviews.map((row) => (
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
                          <div className="font-bold text-slate-900 truncate text-xs">{row.candidate_name}</div>
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

                    {/* Role & Round */}
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-800 text-xs truncate max-w-[160px]">{row.job_title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {row.interview_type.replace("_", " ")}
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[11px] font-bold">
                          R{row.round_number}
                        </span>
                      </div>
                    </td>

                    {/* Schedule & HR Call */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800 text-xs">{row.scheduled_date}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{row.scheduled_time} ({row.timezone || "IST"})</div>
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
                    <td className="py-4 px-4">
                      <div className="space-y-1.5">
                        {/* Interviewer Rating */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                            Interviewer
                          </span>
                          <span className="text-amber-600 font-bold shrink-0">
                            ⭐ {row.rating ? `${row.rating}/5` : "-"}
                          </span>
                        </div>

                        {/* Client Rating */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="bg-teal-50 text-teal-700 border border-teal-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                            Client
                          </span>
                          {row.client_rating || row.client_name ? (
                            <span className="text-teal-700 font-bold truncate max-w-[140px]">
                              {row.client_name ? `${row.client_name}: ` : ""}⭐ {row.client_rating ? `${row.client_rating}/5` : "-"}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Pending</span>
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
                      <div className="relative inline-block text-left mgm-action-menu-container">
                        {/* 3-Dots Button */}
                        <button
                          onClick={() => setOpenActionMenuId(openActionMenuId === row.id ? null : row.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer shadow-2xs"
                          title="Actions Menu"
                         aria-label="More actions">
                          <MoreVertical size={16} />
                        </button>

                        {/* Action Dropdown Popup */}
                        {openActionMenuId === row.id && (
                          <div className="absolute right-0 top-8 z-50 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 text-left text-sm">
                            {/* Only the actions that fit this interview's state */}
                            {rowActions(row).map((action) => (
                              <button
                                key={action.label}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Backend Server Pagination Footer Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span>
              Showing <strong className="font-semibold text-slate-800">{totalCount > 0 ? (page - 1) * limit + 1 : 0}</strong> to{" "}
              <strong className="font-semibold text-slate-800">{Math.min(page * limit, totalCount)}</strong> of{" "}
              <strong className="font-semibold text-slate-900">{totalCount}</strong> interviews
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
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer text-slate-700"
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
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer text-slate-700"
              title="Next Page"
             aria-label="Next">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
      )}

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
        onSaved={() => fetchAllData()}
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
          toast("Feedback saved.", "success");
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


