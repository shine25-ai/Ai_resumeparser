import React, { useState, useEffect, useRef } from "react";
import {
  Calendar, Clock, CheckCircle2, UserCheck, AlertCircle,
  ChevronDown, Plus, Eye, MoreVertical, Search, ArrowRight, RefreshCw, X,
  History, Star
} from "lucide-react";
import {
  getInterviews, createInterview, getUsers, checkInterviewConflict, getInterviewTypes,
  type InterviewItem, type InterviewTypeEnum, type UserProfile, type InterviewTypeItem
} from "../utils/Api";
import { CandidateDetailsModal } from "../components/CandidateDetailsModal";

// Helper date and time formatters
const formatDateDisplay = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const formatTime12h = (timeStr?: string) => {
  if (!timeStr) return "-";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hours12 = h % 12 || 12;
  const minutesStr = parts[1] !== undefined ? parts[1] : "00";
  return `${hours12}:${minutesStr.substring(0, 2)} ${period}`;
};

// Calculate end time string e.g. 10:00 AM + 60 mins -> 11:00 AM
const calcEndTime12h = (timeStr?: string, durationMins: number = 60) => {
  if (!timeStr) return "-";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) || 0;
  if (isNaN(h)) return timeStr;

  const totalMinutes = h * 60 + m + (durationMins || 60);
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  const period = newH >= 12 ? "PM" : "AM";
  const hours12 = newH % 12 || 12;
  return `${hours12}:${newM.toString().padStart(2, "0")} ${period}`;
};

// Badge styling map for interview types
const getInterviewTypeBadgeClass = (typeStr?: string) => {
  const t = (typeStr || "").toUpperCase();
  if (t.includes("TECH")) {
    return "bg-purple-100 text-purple-700 border border-purple-200/80 font-bold";
  } else if (t.includes("HR") || t.includes("SCREEN")) {
    return "bg-amber-100 text-amber-800 border border-amber-200/80 font-bold";
  } else if (t.includes("DESIGN") || t.includes("MANAG") || t.includes("PROJECT")) {
    return "bg-sky-100 text-sky-700 border border-sky-200/80 font-bold";
  } else {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200/80 font-bold";
  }
};

const getInterviewTypeLabel = (typeStr?: string, typesList?: InterviewTypeItem[]) => {
  if (!typeStr) return "Technical Round";
  if (typesList && typesList.length > 0) {
    const matched = typesList.find(
      (t) => t.code.toUpperCase() === typeStr.toUpperCase() || t.id === typeStr || t.name.toUpperCase() === typeStr.toUpperCase()
    );
    if (matched) return matched.name;
  }
  const t = typeStr.toUpperCase();
  if (t === "TECHNICAL") return "Technical Round";
  if (t === "HR" || t === "INITIAL_SCREENING") return "HR Round";
  if (t === "MANAGERIAL") return "Managerial Round";
  if (t === "CULTURE_FIT") return "Culture Fit Round";
  if (t === "FINAL_ROUND") return "Final Round";
  if (t.includes("DESIGN")) return "Design Round";
  return typeStr.replace(/_/g, " ");
};

export default function InterviewDashboard() {
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("This Month");

  // Archive Filter state for completed/past grid
  const [archiveFilter, setArchiveFilter] = useState<"ALL" | "COMPLETED" | "PAST">("ALL");

  // Candidate Details Modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState<string>("");
  const [selectedInterview, setSelectedInterview] = useState<InterviewItem | null>(null);

  // Action Menu Dropdown state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Schedule Interview Modal State
  const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [interviewTypes, setInterviewTypes] = useState<InterviewTypeItem[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Floating Toast State
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error" | "info" | "warning"; text: string } | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (text: string, type: "success" | "error" | "info" | "warning" = "success", durationMs: number = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ type, text });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, durationMs);
  };

  // Conflict Check state
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const [scheduleForm, setScheduleForm] = useState({
    candidate_id: `cand-${Date.now()}`,
    candidate_name: "",
    candidate_email: "",
    job_title: "",
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
    notes: "",
  });

  // Fetch interviews from backend
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const data = await getInterviews({ limit: 100 });
      const fetchedList: InterviewItem[] = Array.isArray(data)
        ? data
        : (data.interviews || data.items || []);
      setInterviews(fetchedList);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    getUsers().then(setSystemUsers).catch(() => {});
    getInterviewTypes().then((types) => {
      if (Array.isArray(types) && types.length > 0) {
        setInterviewTypes(types);
        const first = types[0];
        setScheduleForm((prev) => ({
          ...prev,
          interview_type: first.code,
          interview_type_id: first.id,
        }));
      }
    }).catch(() => {});
  }, []);

  // Close action popup menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId && !(event.target as HTMLElement).closest(".action-menu-container")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. UPCOMING INTERVIEWS: scheduled_date >= todayStr & status !== COMPLETED & status !== CANCELLED
  const upcomingInterviews = interviews.filter((item) => {
    const isFutureOrToday = !item.scheduled_date || item.scheduled_date >= todayStr;
    const isNotCompleted = item.status !== "COMPLETED" && item.status !== "CANCELLED";
    const nameMatch = (item.candidate_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const jobMatch = (item.job_title || "").toLowerCase().includes(searchQuery.toLowerCase());
    const interviewerMatch = (item.interviewer_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    return isFutureOrToday && isNotCompleted && (nameMatch || jobMatch || interviewerMatch);
  });

  // 2. TODAY'S SCHEDULE: scheduled_date === todayStr & status !== COMPLETED & status !== CANCELLED
  const todaysSchedule = interviews.filter(
    (item) => item.scheduled_date === todayStr && item.status !== "COMPLETED" && item.status !== "CANCELLED"
  );

  // 3. COMPLETED INTERVIEWS: status === COMPLETED
  const completedInterviews = interviews.filter((item) => item.status === "COMPLETED");

  // 4. PAST / MISSED INTERVIEWS: scheduled_date < todayStr & status !== COMPLETED
  const pastOrMissedInterviews = interviews.filter(
    (item) => item.scheduled_date && item.scheduled_date < todayStr && item.status !== "COMPLETED"
  );

  // Archive sessions combined (Completed + Past/Missed)
  const archiveList = interviews.filter((item) => {
    const isCompleted = item.status === "COMPLETED";
    const isPast = item.scheduled_date && item.scheduled_date < todayStr && item.status !== "COMPLETED";
    if (archiveFilter === "COMPLETED") return isCompleted;
    if (archiveFilter === "PAST") return isPast;
    return isCompleted || isPast;
  });

  // Calculate top metric card values dynamically
  const totalInterviewsCount = interviews.length;
  const scheduledCount = upcomingInterviews.length;
  const completedCount = completedInterviews.length;
  const pastMissedCount = pastOrMissedInterviews.length;
  const selectedCount = interviews.filter(
    (i) => i.recommendation === "Selected" || i.recommendation === "Hire" || i.recommendation === "Strong Hire" || i.client_recommendation === "Selected"
  ).length;

  const handleOpenDetails = (item: InterviewItem) => {
    setSelectedInterview(item);
    setSelectedCandidateId(item.candidate_id || item.id);
    setSelectedCandidateName(item.candidate_name);
    setIsDetailsModalOpen(true);
    setOpenMenuId(null);
  };

  const checkScheduleTimeConflict = async (params: {
    scheduled_date: string;
    scheduled_time: string;
    interviewer_id?: string;
    interviewer_name?: string;
    client_id?: string;
    client_name?: string;
  }) => {
    const { scheduled_date, scheduled_time, interviewer_id, interviewer_name, client_id, client_name } = params;
    if (!scheduled_date || !scheduled_time || (!interviewer_name && !client_name && !interviewer_id && !client_id)) {
      setConflictWarning(null);
      return;
    }
    try {
      const res = await checkInterviewConflict({
        scheduled_date,
        scheduled_time,
        interviewer_id,
        interviewer_name,
        client_id,
        client_name,
      });
      if (res.has_conflict && res.conflict_message) {
        setConflictWarning(res.conflict_message);
        showToast(res.conflict_message, "warning");
      } else {
        setConflictWarning(null);
        showToast(`Time slot ${scheduled_time} on ${scheduled_date} is available`, "info");
      }
    } catch (err: any) {
      console.error("Conflict check error:", err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await createInterview({
        candidate_id: scheduleForm.candidate_id || `cand-${Date.now()}`,
        candidate_name: scheduleForm.candidate_name || "New Candidate",
        candidate_email: scheduleForm.candidate_email || undefined,
        job_title: scheduleForm.job_title,
        interview_type: scheduleForm.interview_type,
        interview_type_id: scheduleForm.interview_type_id || undefined,
        round_number: scheduleForm.round_number,
        scheduled_date: scheduleForm.scheduled_date,
        scheduled_time: scheduleForm.scheduled_time,
        duration_minutes: scheduleForm.duration_minutes,
        interviewer_id: scheduleForm.interviewer_id || undefined,
        interviewer_name: scheduleForm.interviewer_name || "Interviewer",
        interviewer_email: scheduleForm.interviewer_email || undefined,
        client_id: scheduleForm.client_id || undefined,
        client_name: scheduleForm.client_name || undefined,
        client_email: scheduleForm.client_email || undefined,
        meeting_platform: scheduleForm.meeting_platform,
        meeting_link: scheduleForm.meeting_link || undefined,
        notes: scheduleForm.notes || undefined,
      });

      showToast("Interview scheduled successfully!", "success");
      setIsScheduleOpen(false);
      fetchDashboardData();
    } catch (err: any) {
      showToast(err.message || "Failed to schedule interview", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-slate-50/60 min-h-screen p-3 sm:p-4 font-sans space-y-3.5 text-slate-900">
      
      {/* HEADER BAR & TOP ACTION BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3.5 px-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Interview Dashboard
            <span className="bg-indigo-50 border border-indigo-200/70 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              Live Tracker
            </span>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            Monitor real-time hiring metrics, candidate pipeline, and daily interview schedules
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Refresh Button */}
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-indigo-600" : ""} />
          </button>

          {/* Time Period Filter Pill Dropdown */}
          <div className="relative">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="appearance-none bg-white border border-slate-200/90 text-slate-700 font-bold text-xs px-3 py-1.5 pr-7 rounded-xl shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="This Month">This Month</option>
              <option value="This Week">This Week</option>
              <option value="Today">Today</option>
              <option value="All Time">All Time</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-2 text-slate-400 pointer-events-none" />
          </div>

          {/* Primary Action Button (+ Schedule Interview) */}
          <button
            onClick={() => setIsScheduleOpen(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <Plus size={15} className="stroke-[2.5]" />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* TOP ROW: 5 COMPACT METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        
        {/* Card 1: Total Interviews */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-xs shadow-indigo-500/20">
              <Calendar size={16} />
            </div>
            <span className="text-[10px] font-bold text-slate-400">Total</span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Total Interviews</span>
            <div className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {totalInterviewsCount}
            </div>
          </div>
        </div>

        {/* Card 2: Upcoming / Scheduled */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-xs shadow-blue-500/20">
              <Clock size={16} />
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
              Upcoming
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Upcoming / Scheduled</span>
            <div className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {scheduledCount}
            </div>
          </div>
        </div>

        {/* Card 3: Completed */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-xs shadow-emerald-500/20">
              <CheckCircle2 size={16} />
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              Done
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Completed</span>
            <div className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {completedCount}
            </div>
          </div>
        </div>

        {/* Card 4: Past / Missed */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-xs shadow-amber-500/20">
              <History size={16} />
            </div>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
              Passed
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Past / Missed</span>
            <div className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {pastMissedCount}
            </div>
          </div>
        </div>

        {/* Card 5: Selected */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-1.5 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 bg-purple-500 text-white rounded-xl flex items-center justify-center shadow-xs shadow-purple-500/20">
              <UserCheck size={16} />
            </div>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md">
              Hired
            </span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">Selected</span>
            <div className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {selectedCount}
            </div>
          </div>
        </div>

      </div>

      {/* MIDDLE CONTENT GRID: 2 COLS LEFT (UPCOMING INTERVIEWS) & 1 COL RIGHT (TODAY'S SCHEDULE) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        
        {/* LEFT SECTION (2 COLS WIDE): UPCOMING INTERVIEWS TABLE (ONLY TRUE UPCOMING SESSIONS >= TODAY) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
          
          {/* Card Header */}
          <div className="p-3 px-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                Upcoming Interviews
              </h2>
              <span className="bg-blue-50 border border-blue-200/70 text-blue-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                {upcomingInterviews.length} Sessions
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search Box */}
              <div className="relative w-full sm:w-44">
                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter candidate..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/90 rounded-xl pl-7 pr-2.5 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <button
                onClick={() => setSearchQuery("")}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] px-2.5 py-1 rounded-xl border border-slate-200 transition-colors shrink-0 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto flex-1 min-h-[160px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-3">Job Title</th>
                  <th className="py-2.5 px-3">Interview Type</th>
                  <th className="py-2.5 px-3">Interviewer</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="p-3"><div className="h-7 w-32 bg-slate-100 rounded-lg"></div></td>
                      <td className="p-3"><div className="h-4 w-24 bg-slate-100 rounded-lg"></div></td>
                      <td className="p-3"><div className="h-5 w-20 bg-slate-100 rounded-md"></div></td>
                      <td className="p-3"><div className="h-4 w-20 bg-slate-100 rounded-lg"></div></td>
                      <td className="p-3"><div className="h-6 w-24 bg-slate-100 rounded-lg"></div></td>
                      <td className="p-3"><div className="h-6 w-10 bg-slate-100 rounded-lg mx-auto"></div></td>
                    </tr>
                  ))
                ) : upcomingInterviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      <Calendar size={28} className="mx-auto text-slate-300 mb-2" />
                      <p className="font-extrabold text-slate-700 text-xs">No upcoming interviews scheduled</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Click "+ Schedule Interview" to set up future interview slots</p>
                    </td>
                  </tr>
                ) : (
                  upcomingInterviews.map((item, idx) => {
                    const candidateName = item.candidate_name || "Unknown Candidate";
                    const candidateEmail = item.candidate_email || "-";
                    const jobTitle = item.job_title || "-";
                    const interviewerName = item.interviewer_name || "-";
                    const roundLabel = getInterviewTypeLabel(item.interview_type);
                    const badgeClass = getInterviewTypeBadgeClass(item.interview_type);
                    const formattedDate = formatDateDisplay(item.scheduled_date);
                    const formattedTime = formatTime12h(item.scheduled_time);

                    const initialChar = candidateName.charAt(0).toUpperCase();

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/90 transition-colors">
                        {/* Candidate Column */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-2xs">
                              {initialChar}
                            </div>
                            <div className="min-w-0">
                              <span className="font-extrabold text-slate-900 text-xs block truncate">
                                {candidateName}
                              </span>
                              {candidateEmail !== "-" && (
                                <span className="text-[10px] text-slate-400 font-medium block truncate">
                                  {candidateEmail}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Job Title Column */}
                        <td className="py-2.5 px-3 text-slate-800 font-semibold text-xs">
                          {jobTitle}
                        </td>

                        {/* Interview Type Column */}
                        <td className="py-2.5 px-3">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-md ${badgeClass}`}>
                            {roundLabel}
                          </span>
                        </td>

                        {/* Interviewer Column */}
                        <td className="py-2.5 px-3 text-slate-700 font-medium text-xs">
                          {interviewerName}
                        </td>

                        {/* Date & Time Column */}
                        <td className="py-2.5 px-3">
                          <div className="text-slate-900 font-bold text-xs leading-tight">
                            {formattedDate}
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            {formattedTime}
                          </div>
                        </td>

                        {/* Actions Column */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 relative action-menu-container">
                            {/* View Eye Button */}
                            <button
                              onClick={() => handleOpenDetails(item)}
                              className="p-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg transition-all cursor-pointer text-slate-600"
                              title="View Details"
                            >
                              <Eye size={13} />
                            </button>

                            {/* 3-Dots Dropdown Menu Toggle */}
                            <button
                              onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                              className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-slate-700"
                            >
                              <MoreVertical size={13} />
                            </button>

                            {/* Dropdown Menu Popup */}
                            {openMenuId === item.id && (
                              <div className="absolute right-0 top-7 z-30 w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-left animate-in fade-in duration-150">
                                <button
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleOpenDetails(item);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye size={13} /> View Details
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* RIGHT SECTION (1 COL WIDE): TODAY'S SCHEDULE (ONLY SESSIONS FOR TODAY) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-3.5 flex flex-col justify-between space-y-3">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2.5">
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Today's Schedule
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
              </h2>
              <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                {formatDateDisplay(todayStr)}
              </span>
            </div>

            {/* Timeline List */}
            <div className="space-y-2 min-h-[140px]">
              {todaysSchedule.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-1">
                  <Clock size={24} className="mx-auto text-slate-300 mb-1" />
                  <p className="text-xs font-bold text-slate-700">No interviews scheduled for today</p>
                  <p className="text-[10px] text-slate-400">Today's date is {formatDateDisplay(todayStr)}</p>
                </div>
              ) : (
                todaysSchedule.map((item, idx) => {
                  const startTime = formatTime12h(item.scheduled_time);
                  const endTime = calcEndTime12h(item.scheduled_time, item.duration_minutes || 60);
                  const roundLabel = getInterviewTypeLabel(item.interview_type);
                  const badgeClass = getInterviewTypeBadgeClass(item.interview_type);

                  const dotColors = ["bg-indigo-600", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];
                  const dotColor = dotColors[idx % dotColors.length];

                  return (
                    <div key={item.id || idx} className="flex items-center justify-between gap-2 p-2 hover:bg-slate-50 rounded-xl transition-all border border-slate-100/70">
                      
                      {/* Left: Timeline indicator & Times */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className={`w-2 h-2 rounded-full ${dotColor} shrink-0`}></div>
                        <div className="text-[10px] font-bold text-slate-900 leading-tight">
                          <div>{startTime}</div>
                          <div className="text-[9px] text-slate-400 font-medium">{endTime}</div>
                        </div>
                      </div>

                      {/* Middle: Candidate & Job Title */}
                      <div className="min-w-0 flex-1">
                        <h4 className="font-extrabold text-xs text-slate-900 truncate">
                          {item.candidate_name || "Candidate"}
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium truncate">
                          {item.job_title || "-"}
                        </p>
                      </div>

                      {/* Right: Round Pill & Action */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${badgeClass}`}>
                          {roundLabel}
                        </span>
                        <button
                          onClick={() => handleOpenDetails(item)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors"
                        >
                          <MoreVertical size={13} />
                        </button>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Navigation Link */}
          <div className="border-t border-slate-100 pt-2">
            <button
              onClick={() => showToast("Viewing full interview schedule", "info")}
              className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              <span>View Full Schedule</span>
              <ArrowRight size={13} />
            </button>
          </div>

        </div>

      </div>

      {/* NEW GRID UI SECTION: COMPLETED & PAST / MISSED INTERVIEWS ARCHIVE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-3">
        
        {/* Archive Section Header & Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-100 text-slate-700 rounded-xl">
              <History size={16} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight">
                Completed & Past Session History
              </h2>
              <p className="text-[10px] text-slate-500">
                View past evaluation records, ratings, recommendations, and missed session logs
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setArchiveFilter("ALL")}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                archiveFilter === "ALL"
                  ? "bg-white text-indigo-600 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All History ({completedCount + pastMissedCount})
            </button>

            <button
              onClick={() => setArchiveFilter("COMPLETED")}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                archiveFilter === "COMPLETED"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Completed ({completedCount})
            </button>

            <button
              onClick={() => setArchiveFilter("PAST")}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                archiveFilter === "PAST"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Past / Missed ({pastMissedCount})
            </button>
          </div>
        </div>

        {/* Card Grid Container */}
        {archiveList.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-1">
            <History size={26} className="mx-auto text-slate-300" />
            <p className="text-xs font-bold text-slate-700">No session records in this filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {archiveList.map((item, idx) => {
              const isCompleted = item.status === "COMPLETED";
              const candidateName = item.candidate_name || "Unknown Candidate";
              const candidateEmail = item.candidate_email || "-";
              const jobTitle = item.job_title || "-";
              const interviewerName = item.interviewer_name || item.client_name || "-";
              const roundLabel = getInterviewTypeLabel(item.interview_type);
              const formattedDate = formatDateDisplay(item.scheduled_date);
              const formattedTime = formatTime12h(item.scheduled_time);
              const initialChar = candidateName.charAt(0).toUpperCase();

              const rating = item.rating || item.client_rating;
              const recommendation = item.recommendation || item.client_recommendation || item.ai_recommendation;

              return (
                <div
                  key={item.id || idx}
                  className={`border rounded-2xl p-3.5 transition-all flex flex-col justify-between space-y-3 ${
                    isCompleted
                      ? "bg-emerald-50/20 border-emerald-200/80 hover:border-emerald-300 hover:shadow-xs"
                      : "bg-amber-50/20 border-amber-200/80 hover:border-amber-300 hover:shadow-xs"
                  }`}
                >
                  {/* Card Header: Candidate & Status Pill */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 shadow-2xs ${
                        isCompleted ? "bg-gradient-to-tr from-emerald-600 to-teal-600" : "bg-gradient-to-tr from-amber-500 to-orange-500"
                      }`}>
                        {initialChar}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-xs text-slate-900 truncate">
                          {candidateName}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-medium truncate">
                          {jobTitle} {candidateEmail !== "-" ? `• ${candidateEmail}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                        <CheckCircle2 size={11} /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 shrink-0">
                        <History size={11} /> Past Slot
                      </span>
                    )}
                  </div>

                  {/* Body Info */}
                  <div className="space-y-1.5 text-[11px] text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-semibold text-[10px]">Round:</span>
                      <span className="font-bold text-slate-900">{roundLabel}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-semibold text-[10px]">Scheduled:</span>
                      <span className="font-bold text-slate-800">{formattedDate} ({formattedTime})</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-semibold text-[10px]">Interviewer:</span>
                      <span className="font-semibold text-slate-800">{interviewerName}</span>
                    </div>

                    {/* Evaluation Details if completed */}
                    {isCompleted && (
                      <div className="pt-1 mt-1 border-t border-slate-100 flex items-center justify-between">
                        {rating ? (
                          <div className="flex items-center gap-1 text-amber-500 font-extrabold text-[11px]">
                            <Star size={12} className="fill-amber-400" />
                            <span>{rating} / 5</span>
                          </div>
                        ) : <span className="text-[10px] text-slate-400">No Rating</span>}

                        {recommendation && (
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            ["Selected", "Hire", "Strong Hire", "Recommended", "Offer Accepted", "Offer to Be Released", "Shortlisted"].includes(recommendation)
                              ? "bg-emerald-100 text-emerald-800"
                              : ["Hold", "On Hold", "Pending", "Need Further Evaluation", "Reschedule Required"].includes(recommendation)
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}>
                            {recommendation}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Button */}
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">
                      ID: {item.id?.substring(0, 8)}...
                    </span>
                    <button
                      onClick={() => handleOpenDetails(item)}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200/80 px-2.5 py-1 rounded-xl transition-all cursor-pointer"
                    >
                      <Eye size={13} />
                      <span>View Details</span>
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* SCHEDULE INTERVIEW MODAL POPUP */}
      {isScheduleOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl relative text-slate-900">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
                  <Calendar size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Schedule New Interview</h2>
                  <p className="text-[11px] text-slate-500">Set up a session with real-time conflict checking</p>
                </div>
              </div>
              <button
                onClick={() => setIsScheduleOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conflict warning banner */}
            {conflictWarning && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2 shadow-2xs">
                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="font-semibold">{conflictWarning}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Candidate Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Candidate Name"
                    value={scheduleForm.candidate_name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Candidate Email</label>
                  <input
                    type="email"
                    placeholder="Candidate Email"
                    value={scheduleForm.candidate_email}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Job Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Job Title"
                    value={scheduleForm.job_title}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, job_title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Interview Type</label>
                  <select
                    value={scheduleForm.interview_type_id || scheduleForm.interview_type}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matched = interviewTypes.find(t => t.id === val || t.code === val);
                      setScheduleForm((prev) => ({
                        ...prev,
                        interview_type: matched ? matched.code : val,
                        interview_type_id: matched ? matched.id : "",
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-indigo-700 font-bold focus:outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                  >
                    {interviewTypes.length > 0 ? (
                      interviewTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))
                    ) : (
                      <option value="TECHNICAL">Technical Round</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.scheduled_date}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScheduleForm((prev) => ({ ...prev, scheduled_date: val }));
                      checkScheduleTimeConflict({ scheduled_date: val, scheduled_time: scheduleForm.scheduled_time, interviewer_name: scheduleForm.interviewer_name });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Scheduled Time *</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.scheduled_time}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScheduleForm((prev) => ({ ...prev, scheduled_time: val }));
                      checkScheduleTimeConflict({ scheduled_date: scheduleForm.scheduled_date, scheduled_time: val, interviewer_name: scheduleForm.interviewer_name });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Interviewer</label>
                  {systemUsers.length > 0 && (
                    <select
                      value={scheduleForm.interviewer_id || ""}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const u = systemUsers.find((user) => user.id === uid);
                        const iName = u ? u.full_name : scheduleForm.interviewer_name;
                        const iEmail = u ? u.email : scheduleForm.interviewer_email;
                        setScheduleForm((prev) => ({
                          ...prev,
                          interviewer_id: uid,
                          interviewer_name: iName,
                          interviewer_email: iEmail,
                        }));
                        checkScheduleTimeConflict({
                          scheduled_date: scheduleForm.scheduled_date,
                          scheduled_time: scheduleForm.scheduled_time,
                          interviewer_id: uid,
                          interviewer_name: iName,
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-800 font-semibold mb-1 focus:outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Choose Registered User --</option>
                      {systemUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role || u.email})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="or Type Interviewer Name..."
                    value={scheduleForm.interviewer_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScheduleForm((prev) => ({ ...prev, interviewer_name: val }));
                      checkScheduleTimeConflict({ scheduled_date: scheduleForm.scheduled_date, scheduled_time: scheduleForm.scheduled_time, interviewer_name: val, interviewer_id: scheduleForm.interviewer_id });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Client Evaluator</label>
                  {systemUsers.length > 0 && (
                    <select
                      value={scheduleForm.client_id || ""}
                      onChange={(e) => {
                        const uid = e.target.value;
                        const u = systemUsers.find((user) => user.id === uid);
                        const cName = u ? u.full_name : scheduleForm.client_name;
                        const cEmail = u ? u.email : scheduleForm.client_email;
                        setScheduleForm((prev) => ({
                          ...prev,
                          client_id: uid,
                          client_name: cName,
                          client_email: cEmail,
                        }));
                        checkScheduleTimeConflict({
                          scheduled_date: scheduleForm.scheduled_date,
                          scheduled_time: scheduleForm.scheduled_time,
                          client_id: uid,
                          client_name: cName,
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-800 font-semibold mb-1 focus:outline-none focus:bg-white focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Choose Registered User --</option>
                      {systemUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role || u.email})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="or Type Client Evaluator Name..."
                    value={scheduleForm.client_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setScheduleForm((prev) => ({ ...prev, client_name: val }));
                      checkScheduleTimeConflict({ scheduled_date: scheduleForm.scheduled_date, scheduled_time: scheduleForm.scheduled_time, client_name: val, client_id: scheduleForm.client_id });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? "Scheduling..." : "Save Interview"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* CANDIDATE DETAILS MODAL */}
      <CandidateDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        candidateId={selectedCandidateId}
        candidateName={selectedCandidateName}
        fallbackInterview={selectedInterview}
      />

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300 font-sans">
          <div
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-xl border text-xs font-bold tracking-wide backdrop-blur-md ${
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
              <div className="p-0.5 bg-emerald-500/20 rounded-full text-emerald-400">
                <CheckCircle2 size={15} />
              </div>
            ) : (
              <div className="p-0.5 bg-amber-500/20 rounded-full text-amber-300">
                <AlertCircle size={15} />
              </div>
            )}
            <span className="text-white font-semibold">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-1 text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
