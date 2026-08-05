import { useEffect, useState } from "react";
import {
  Calendar, Edit2, Trash2, Plus, Star, X, AlertCircle, UserCheck, FileText, RefreshCw, Save, Eye,
  Briefcase, Clock, MapPin, ShieldCheck, DollarSign, TrendingUp, Mail, Layers, AlignLeft, Sparkles, Video, Hash, Upload, Building2
} from "lucide-react";
import {
  getInterviews, createInterview, updateInterview, rescheduleInterview, submitInterviewFeedback, deleteInterview, getResumes,
  sendInterviewEmail, MAIL_TEMPLATES_URL,
  type InterviewItem, type InterviewTypeEnum, type InterviewStatusEnum
} from "../utils/Api";
import { CandidateDetailsModal } from "../components/CandidateDetailsModal";
import { BulkFeedbackModal } from "../components/BulkFeedbackModal";

export default function InterviewManagement() {
  const [activeTab, setActiveTab] = useState<string>("All");
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [candidatesList, setCandidatesList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk Selection & Modal State
  const [selectedInterviewIds, setSelectedInterviewIds] = useState<string[]>([]);
  const [isBulkFeedbackOpen, setIsBulkFeedbackOpen] = useState<boolean>(false);

  // Modals state
  const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [isNextRoundOpen, setIsNextRoundOpen] = useState<boolean>(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState<string>("");

  const [selectedInterview, setSelectedInterview] = useState<InterviewItem | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

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

  const handleOpenDetails = (item: InterviewItem) => {
    setSelectedInterview(item);
    setSelectedCandidateId(item.candidate_id || null);
    setSelectedCandidateName(item.candidate_name || "");
    setIsDetailsModalOpen(true);
  };

  // Next Round form state
  const [nextRoundForm, setNextRoundForm] = useState({
    candidate_id: "",
    candidate_name: "",
    candidate_email: "",
    resume_id: "",
    job_id: "",
    job_title: "",
    job_location: "",
    job_type: "Full Time",
    interview_type: "TECHNICAL" as InterviewTypeEnum,
    round_number: 2,
    scheduled_date: new Date().toISOString().split("T")[0],
    scheduled_time: "10:00",
    timezone: "Asia/Kolkata",
    duration_minutes: 60,
    interviewer_name: "",
    interviewer_email: "",
    meeting_platform: "Google Meet",
    meeting_link: "",
    location: "",
    interview_location: "",
    hr_call_verification: "Pending",
    candidate_requested_date: "",
    candidate_requested_time: "",
    candidate_requested_role: "",
    salary_requested: "",
    final_fit_salary: "",
    joining_date: "",
    interview_document_files: "",
    client_name: "",
    client_rating: 0,
    client_feedback: "",
    client_strengths: "",
    client_weaknesses: "",
    client_recommendation: "",
    client_notes: "",
    client_feedback_date: "",
    notes: "",
  });

  // Form states
  const [scheduleForm, setScheduleForm] = useState({
    candidate_id: "",
    candidate_name: "",
    candidate_email: "",
    resume_id: "",
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
    hr_call_verification: "Pending",
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

  const [editForm, setEditForm] = useState({
    candidate_name: "",
    candidate_email: "",
    job_title: "",
    job_location: "",
    job_type: "Full Time",
    interview_type: "TECHNICAL" as InterviewTypeEnum,
    round_number: 1,
    scheduled_date: "",
    scheduled_time: "",
    interviewer_name: "",
    interviewer_email: "",
    meeting_platform: "Google Meet",
    meeting_link: "",
    location: "",
    interview_location: "",
    hr_call_verification: "Pending",
    candidate_requested_date_time: "",
    candidate_requested_date: "",
    candidate_requested_time: "",
    candidate_requested_role: "",
    salary_requested: "",
    final_fit_salary: "",
    joining_date: "",
    interview_document_files: "",
    recommendation: "Pending",
    rating: 4,
    feedback: "",
    strengths: "",
    weaknesses: "",
    // Client Feedback fields
    client_name: "",
    client_rating: 4,
    client_feedback: "",
    client_strengths: "",
    client_weaknesses: "",
    client_recommendation: "Selected",
    client_notes: "",
    client_feedback_date: "",
    status: "SCHEDULED" as InterviewStatusEnum,
    notes: "",
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    scheduled_date: "",
    scheduled_time: "",
    reason: "",
  });

  const [feedbackTab, setFeedbackTab] = useState<"INTERVIEWER" | "CLIENT">("INTERVIEWER");

  const [feedbackForm, setFeedbackForm] = useState({
    // Interviewer Round Feedback
    rating: 4,
    feedback: "",
    strengths: "",
    weaknesses: "",
    recommendation: "Selected",
    // Client Feedback
    client_name: "",
    client_rating: 4,
    client_feedback: "",
    client_strengths: "",
    client_weaknesses: "",
    client_recommendation: "Selected",
    client_notes: "",
    client_feedback_date: new Date().toISOString().split("T")[0],
    // Shared Candidate Info & Outcomes
    candidate_requested_date: "",
    candidate_requested_time: "",
    candidate_requested_role: "",
    salary_requested: "",
    final_fit_salary: "",
    joining_date: "",
    interview_document_files: "",
    notes: "",
  });

  const navTabs = ["All", "Technical", "HR", "Managerial", "Culture Fit", "Final Round", "Initial Screening"];

  // File Upload Handlers for Modals
  const handleScheduleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileNames = Array.from(e.target.files).map((f) => f.name);
      const existing = scheduleForm.interview_document_files
        ? scheduleForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const combined = Array.from(new Set([...existing, ...fileNames])).join("\n");
      setScheduleForm((prev) => ({ ...prev, interview_document_files: combined }));
    }
  };

  const handleEditFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileNames = Array.from(e.target.files).map((f) => f.name);
      const existing = editForm.interview_document_files
        ? editForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const combined = Array.from(new Set([...existing, ...fileNames])).join("\n");
      setEditForm((prev) => ({ ...prev, interview_document_files: combined }));
    }
  };

  const handleFeedbackFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileNames = Array.from(e.target.files).map((f) => f.name);
      const existing = feedbackForm.interview_document_files
        ? feedbackForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const combined = Array.from(new Set([...existing, ...fileNames])).join("\n");
      setFeedbackForm((prev) => ({ ...prev, interview_document_files: combined }));
    }
  };

  // Fetch interviews & candidates list
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [interviewData, resumesData] = await Promise.all([
        getInterviews(),
        getResumes().catch(() => []),
      ]);

      const items = Array.isArray(interviewData) ? interviewData : interviewData?.interviews || [];
      setInterviews(items);

      const resumes = Array.isArray(resumesData) ? resumesData : resumesData?.resumes || [];
      setCandidatesList(resumes);
    } catch (err: any) {
      console.error("Failed to load interview management data:", err);
      setError(err.message || "Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
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

  const filteredInterviews = latestCandidateInterviews.filter((item) => {
    if (activeTab === "All") return true;
    const tabNorm = activeTab.toUpperCase().replace(/\s+/g, "_");
    return item.interview_type === tabNorm || item.interview_type.includes(tabNorm);
  });

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


  // Calculate live stats based on current active candidate rounds
  const techCount = latestCandidateInterviews.filter((i) => i.interview_type === "TECHNICAL").length;
  const hrCount = latestCandidateInterviews.filter((i) => i.interview_type === "HR").length;
  const managerialCount = latestCandidateInterviews.filter((i) => i.interview_type === "MANAGERIAL").length;
  const scheduledCount = latestCandidateInterviews.filter((i) => i.status === "SCHEDULED" || i.status === "PENDING").length;

  const stats = [
    { label: "Technical Interviews", value: techCount, status: `${techCount} Active` },
    { label: "HR Interviews", value: hrCount, status: `${hrCount} Active` },
    { label: "Managerial Interviews", value: managerialCount, status: `${managerialCount} Active` },
    { label: "Scheduled / Pending", value: scheduledCount, status: `${scheduledCount} Upcoming` },
  ];

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

  // Schedule Submit
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.candidate_name || !scheduleForm.job_title) {
      alert("Please provide candidate name and job title.");
      return;
    }
    try {
      setActionLoading(true);
      const docFilesArray = scheduleForm.interview_document_files
        ? scheduleForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

      const combinedReqDateTime = scheduleForm.candidate_requested_date
        ? `${scheduleForm.candidate_requested_date} ${scheduleForm.candidate_requested_time || ""}`.trim()
        : scheduleForm.candidate_requested_date_time;

      await createInterview({
        candidate_id: scheduleForm.candidate_id || `cand_${Date.now()}`,
        candidate_name: scheduleForm.candidate_name,
        resume_id: scheduleForm.resume_id || undefined,
        job_title: scheduleForm.job_title,
        job_location: scheduleForm.job_location || undefined,
        job_type: scheduleForm.job_type || undefined,
        interview_type: scheduleForm.interview_type,
        round_number: Number(scheduleForm.round_number),
        scheduled_date: scheduleForm.scheduled_date,
        scheduled_time: scheduleForm.scheduled_time,
        duration_minutes: Number(scheduleForm.duration_minutes),
        interviewer_name: scheduleForm.interviewer_name || "Hiring Manager",
        interviewer_email: scheduleForm.interviewer_email || undefined,
        meeting_platform: scheduleForm.meeting_platform,
        meeting_link: scheduleForm.meeting_link || undefined,
        location: scheduleForm.interview_location || scheduleForm.location || undefined,
        interview_location: scheduleForm.interview_location || scheduleForm.location || undefined,
        hr_call_verification: scheduleForm.hr_call_verification || undefined,
        candidate_requested_date_time: combinedReqDateTime || undefined,
        candidate_requested_date: scheduleForm.candidate_requested_date || undefined,
        candidate_requested_time: scheduleForm.candidate_requested_time || undefined,
        candidate_requested_role: scheduleForm.candidate_requested_role || undefined,
        salary_requested: scheduleForm.salary_requested || undefined,
        final_fit_salary: scheduleForm.final_fit_salary || undefined,
        joining_date: scheduleForm.joining_date || undefined,
        interview_document_files: docFilesArray,
        recommendation: scheduleForm.recommendation || "Pending",
        notes: scheduleForm.notes || undefined,
      });

      setIsScheduleOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to schedule interview:", err);
      alert(err.message || "Failed to schedule interview.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (item: InterviewItem) => {
    setSelectedInterview(item);
    setEditForm({
      candidate_name: item.candidate_name || "",
      candidate_email: item.candidate_email || "",
      job_title: item.job_title || "",
      job_location: item.job_location || "",
      job_type: item.job_type || "Full Time",
      interview_type: item.interview_type || "TECHNICAL",
      round_number: item.round_number || 1,
      scheduled_date: item.scheduled_date || "",
      scheduled_time: item.scheduled_time || "",
      interviewer_name: item.interviewer_name || "",
      interviewer_email: item.interviewer_email || "",
      meeting_platform: item.meeting_platform || "Google Meet",
      meeting_link: item.meeting_link || "",
      location: item.interview_location || item.location || "",
      interview_location: item.interview_location || item.location || "",
      hr_call_verification: item.hr_call_verification || "Pending",
      candidate_requested_date_time: item.candidate_requested_date_time || "",
      candidate_requested_date: item.candidate_requested_date || "",
      candidate_requested_time: item.candidate_requested_time || "",
      candidate_requested_role: item.candidate_requested_role || "",
      salary_requested: item.salary_requested || "",
      final_fit_salary: item.final_fit_salary || "",
      joining_date: item.joining_date || "",
      interview_document_files: item.interview_document_files ? item.interview_document_files.join("\n") : "",
      recommendation: item.recommendation || "Pending",
      rating: item.rating || 4,
      feedback: item.feedback || "",
      strengths: item.strengths ? item.strengths.join(", ") : "",
      weaknesses: item.weaknesses ? item.weaknesses.join(", ") : "",
      client_name: item.client_name || "",
      client_rating: item.client_rating || 4,
      client_feedback: item.client_feedback || "",
      client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
      client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
      client_recommendation: item.client_recommendation || "Selected",
      client_notes: item.client_notes || "",
      client_feedback_date: item.client_feedback_date || "",
      status: item.status || "SCHEDULED",
      notes: item.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;
    try {
      setActionLoading(true);
      const docFilesArray = editForm.interview_document_files
        ? editForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

      const combinedReqDateTime = editForm.candidate_requested_date
        ? `${editForm.candidate_requested_date} ${editForm.candidate_requested_time || ""}`.trim()
        : editForm.candidate_requested_date_time;

      await updateInterview(selectedInterview.id, {
        candidate_name: editForm.candidate_name,
        job_title: editForm.job_title,
        job_location: editForm.job_location || undefined,
        job_type: editForm.job_type || undefined,
        interview_type: editForm.interview_type,
        round_number: Number(editForm.round_number),
        scheduled_date: editForm.scheduled_date,
        scheduled_time: editForm.scheduled_time,
        interviewer_name: editForm.interviewer_name,
        interviewer_email: editForm.interviewer_email || undefined,
        meeting_platform: editForm.meeting_platform,
        meeting_link: editForm.meeting_link || undefined,
        location: editForm.interview_location || editForm.location || undefined,
        interview_location: editForm.interview_location || editForm.location || undefined,
        hr_call_verification: editForm.hr_call_verification || undefined,
        candidate_requested_date_time: combinedReqDateTime || undefined,
        candidate_requested_date: editForm.candidate_requested_date || undefined,
        candidate_requested_time: editForm.candidate_requested_time || undefined,
        candidate_requested_role: editForm.candidate_requested_role || undefined,
        salary_requested: editForm.salary_requested || undefined,
        final_fit_salary: editForm.final_fit_salary || undefined,
        joining_date: editForm.joining_date || undefined,
        interview_document_files: docFilesArray,
        recommendation: editForm.recommendation || undefined,
        rating: editForm.rating ? Number(editForm.rating) : undefined,
        feedback: editForm.feedback || undefined,
        strengths: editForm.strengths ? editForm.strengths.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        weaknesses: editForm.weaknesses ? editForm.weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        client_name: editForm.client_name || undefined,
        client_rating: editForm.client_rating ? Number(editForm.client_rating) : undefined,
        client_feedback: editForm.client_feedback || undefined,
        client_strengths: editForm.client_strengths ? editForm.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        client_weaknesses: editForm.client_weaknesses ? editForm.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        client_recommendation: editForm.client_recommendation || undefined,
        client_notes: editForm.client_notes || undefined,
        client_feedback_date: editForm.client_feedback_date || undefined,
        status: editForm.status,
        notes: editForm.notes || undefined,
      });

      setIsEditOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to update interview:", err);
      alert(err.message || "Failed to update interview.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Reschedule Modal
  const handleOpenReschedule = (item: InterviewItem) => {
    setSelectedInterview(item);
    setRescheduleForm({
      scheduled_date: item.scheduled_date || new Date().toISOString().split("T")[0],
      scheduled_time: item.scheduled_time || "10:00",
      reason: "",
    });
    setIsRescheduleOpen(true);
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;
    try {
      setActionLoading(true);
      await rescheduleInterview(selectedInterview.id, {
        scheduled_date: rescheduleForm.scheduled_date,
        scheduled_time: rescheduleForm.scheduled_time,
        reason: rescheduleForm.reason || undefined,
      });

      setIsRescheduleOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to reschedule interview:", err);
      alert(err.message || "Failed to reschedule interview.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Feedback Modal
  const handleOpenFeedback = (item: InterviewItem) => {
    setSelectedInterview(item);
    setFeedbackTab("INTERVIEWER");
    setFeedbackForm({
      rating: item.rating || 4,
      feedback: item.feedback || "",
      strengths: item.strengths ? item.strengths.join(", ") : "",
      weaknesses: item.weaknesses ? item.weaknesses.join(", ") : "",
      recommendation: item.recommendation || "Selected",
      client_name: item.client_name || "",
      client_rating: item.client_rating || 4,
      client_feedback: item.client_feedback || "",
      client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
      client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
      client_recommendation: item.client_recommendation || "Selected",
      client_notes: item.client_notes || "",
      client_feedback_date: item.client_feedback_date || new Date().toISOString().split("T")[0],
      candidate_requested_date: item.candidate_requested_date || "",
      candidate_requested_time: item.candidate_requested_time || "",
      candidate_requested_role: item.candidate_requested_role || "",
      salary_requested: item.salary_requested || "",
      final_fit_salary: item.final_fit_salary || "",
      joining_date: item.joining_date || "",
      interview_document_files: item.interview_document_files ? item.interview_document_files.join("\n") : "",
      notes: item.notes || "",
    });
    setIsFeedbackOpen(true);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInterview) return;
    try {
      setActionLoading(true);
      const docFilesArray = feedbackForm.interview_document_files
        ? feedbackForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

      await submitInterviewFeedback(selectedInterview.id, {
        rating: Number(feedbackForm.rating),
        feedback: feedbackForm.feedback || undefined,
        strengths: feedbackForm.strengths ? feedbackForm.strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
        weaknesses: feedbackForm.weaknesses ? feedbackForm.weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
        recommendation: feedbackForm.recommendation || undefined,
        client_name: feedbackForm.client_name || undefined,
        client_rating: feedbackForm.client_rating ? Number(feedbackForm.client_rating) : undefined,
        client_feedback: feedbackForm.client_feedback || undefined,
        client_strengths: feedbackForm.client_strengths ? feedbackForm.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
        client_weaknesses: feedbackForm.client_weaknesses ? feedbackForm.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
        client_recommendation: feedbackForm.client_recommendation || undefined,
        client_notes: feedbackForm.client_notes || undefined,
        client_feedback_date: feedbackForm.client_feedback_date || undefined,
        candidate_requested_date: feedbackForm.candidate_requested_date || undefined,
        candidate_requested_time: feedbackForm.candidate_requested_time || undefined,
        candidate_requested_role: feedbackForm.candidate_requested_role || undefined,
        salary_requested: feedbackForm.salary_requested || undefined,
        final_fit_salary: feedbackForm.final_fit_salary || undefined,
        joining_date: feedbackForm.joining_date || undefined,
        interview_document_files: docFilesArray,
        notes: feedbackForm.notes || undefined,
      });

      setIsFeedbackOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to submit feedback:", err);
      alert(err.message || "Failed to submit feedback.");
    } finally {
      setActionLoading(false);
    }
  };

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
      alert(err.message || "Failed to delete interview.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Send Mail Modal
  const handleOpenSendMail = (item: InterviewItem) => {
    setSelectedInterview(item);
    setSendMailStatus(null);

    let candEmail = item.candidate_email || "";
    if (!candEmail && candidatesList && candidatesList.length > 0) {
      const matched = candidatesList.find(
        (c: any) =>
          (item.candidate_id && (c.id === item.candidate_id || c._id === item.candidate_id)) ||
          (c.candidate_name && c.candidate_name === item.candidate_name) ||
          (c.name && c.name === item.candidate_name)
      );
      if (matched) {
        candEmail = matched.email || matched.parsed_data?.email || "";
      }
    }

    setSendMailForm({
      send_to_candidate: true,
      candidate_email: candEmail,
      send_to_interviewer: true,
      interviewer_email: item.interviewer_email || "",
      template_id: "",
      custom_notes: item.notes || "",
    });
    setIsSendMailOpen(true);
    fetchMailTemplates();
  };

  const fetchMailTemplates = async () => {
    try {
      const res = await fetch(MAIL_TEMPLATES_URL);
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

    if (!sendMailForm.send_to_candidate && !sendMailForm.send_to_interviewer) {
      setSendMailStatus({ type: "error", text: "Please check at least Candidate or Interviewer email option." });
      return;
    }

    if (sendMailForm.send_to_candidate && !sendMailForm.candidate_email.trim()) {
      setSendMailStatus({ type: "error", text: "Candidate email is required to send mail to candidate." });
      return;
    }

    if (sendMailForm.send_to_interviewer && !sendMailForm.interviewer_email.trim()) {
      setSendMailStatus({ type: "error", text: "Interviewer email is required to send mail to interviewer." });
      return;
    }

    try {
      setSendMailLoading(true);
      setSendMailStatus(null);
      const res = await sendInterviewEmail(selectedInterview.id, {
        send_to_candidate: sendMailForm.send_to_candidate,
        candidate_email: sendMailForm.candidate_email.trim() || undefined,
        send_to_interviewer: sendMailForm.send_to_interviewer,
        interviewer_email: sendMailForm.interviewer_email.trim() || undefined,
        template_id: sendMailForm.template_id || undefined,
        custom_notes: sendMailForm.custom_notes || undefined,
      });

      setSendMailStatus({ type: "success", text: res.message || "Interview email sent successfully!" });
      setTimeout(() => {
        setIsSendMailOpen(false);
        setSendMailStatus(null);
      }, 1800);
    } catch (err: any) {
      console.error("Failed to send interview email:", err);
      setSendMailStatus({ type: "error", text: err.message || "Failed to send interview email." });
    } finally {
      setSendMailLoading(false);
    }
  };

  // Schedule Next Round Handlers
  const handleOpenNextRound = (item: InterviewItem) => {
    setSelectedInterview(item);
    const docsJoined = item.interview_document_files && Array.isArray(item.interview_document_files)
      ? item.interview_document_files.join("\n")
      : "";

    setNextRoundForm({
      candidate_id: item.candidate_id || "",
      candidate_name: item.candidate_name || "",
      candidate_email: item.candidate_email || "",
      resume_id: item.resume_id || "",
      job_id: item.job_id || "",
      job_title: item.job_title || "",
      job_location: item.job_location || "",
      job_type: item.job_type || "Full Time",
      interview_type: "CODING_TEST" as InterviewTypeEnum,
      round_number: (item.round_number || 1) + 1,
      scheduled_date: new Date().toISOString().split("T")[0],
      scheduled_time: "10:00",
      timezone: item.timezone || "Asia/Kolkata",
      duration_minutes: item.duration_minutes || 60,
      interviewer_name: "",
      interviewer_email: "",
      meeting_platform: "Google Meet",
      meeting_link: "",
      location: item.location || "",
      interview_location: item.interview_location || "",
      hr_call_verification: item.hr_call_verification || "Pending",
      candidate_requested_date: item.candidate_requested_date || "",
      candidate_requested_time: item.candidate_requested_time || "",
      candidate_requested_role: item.candidate_requested_role || "",
      salary_requested: item.salary_requested || "",
      final_fit_salary: item.final_fit_salary || "",
      joining_date: item.joining_date || "",
      interview_document_files: docsJoined,
      client_name: item.client_name || "",
      client_rating: item.client_rating || 0,
      client_feedback: item.client_feedback || "",
      client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
      client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
      client_recommendation: item.client_recommendation || "",
      client_notes: item.client_notes || "",
      client_feedback_date: item.client_feedback_date || "",
      notes: `Next Round (R${(item.round_number || 1) + 1}) follow-up for ${item.candidate_name}`,
    });
    setIsNextRoundOpen(true);
  };

  const handleNextRoundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextRoundForm.candidate_name || !nextRoundForm.job_title || !nextRoundForm.interviewer_name) {
      alert("Please fill candidate name, job title, and interviewer name for the next round.");
      return;
    }

    try {
      setActionLoading(true);
      const docFilesArray = nextRoundForm.interview_document_files
        ? nextRoundForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];

      await createInterview({
        candidate_id: nextRoundForm.candidate_id,
        candidate_name: nextRoundForm.candidate_name,
        resume_id: nextRoundForm.resume_id || undefined,
        job_id: nextRoundForm.job_id || undefined,
        job_title: nextRoundForm.job_title,
        job_location: nextRoundForm.job_location || undefined,
        job_type: nextRoundForm.job_type || undefined,
        interview_type: nextRoundForm.interview_type,
        round_number: Number(nextRoundForm.round_number),
        scheduled_date: nextRoundForm.scheduled_date,
        scheduled_time: nextRoundForm.scheduled_time,
        timezone: nextRoundForm.timezone,
        duration_minutes: Number(nextRoundForm.duration_minutes),
        interviewer_name: nextRoundForm.interviewer_name,
        interviewer_email: nextRoundForm.interviewer_email || undefined,
        meeting_platform: nextRoundForm.meeting_platform,
        meeting_link: nextRoundForm.meeting_link || undefined,
        location: nextRoundForm.interview_location || nextRoundForm.location || undefined,
        interview_location: nextRoundForm.interview_location || nextRoundForm.location || undefined,
        hr_call_verification: nextRoundForm.hr_call_verification || undefined,
        candidate_requested_date: nextRoundForm.candidate_requested_date || undefined,
        candidate_requested_time: nextRoundForm.candidate_requested_time || undefined,
        candidate_requested_role: nextRoundForm.candidate_requested_role || undefined,
        salary_requested: nextRoundForm.salary_requested || undefined,
        final_fit_salary: nextRoundForm.final_fit_salary || undefined,
        joining_date: nextRoundForm.joining_date || undefined,
        interview_document_files: docFilesArray,
        client_name: nextRoundForm.client_name || undefined,
        client_rating: nextRoundForm.client_rating ? Number(nextRoundForm.client_rating) : undefined,
        client_feedback: nextRoundForm.client_feedback || undefined,
        client_strengths: nextRoundForm.client_strengths ? nextRoundForm.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
        client_weaknesses: nextRoundForm.client_weaknesses ? nextRoundForm.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
        client_recommendation: nextRoundForm.client_recommendation || undefined,
        client_notes: nextRoundForm.client_notes || undefined,
        client_feedback_date: nextRoundForm.client_feedback_date || undefined,
        notes: nextRoundForm.notes || undefined,
      });

      setIsNextRoundOpen(false);
      fetchAllData();
    } catch (err: any) {
      console.error("Failed to schedule next round:", err);
      alert(err.message || "Failed to schedule next round.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Interview Management</h1>
        </div>

        <div className="flex items-center gap-3">
          {selectedInterviewIds.length > 0 && (
            <button
              onClick={() => setIsBulkFeedbackOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer animate-pulse"
            >
              <Sparkles size={16} />
              Bulk Feedback Update ({selectedInterviewIds.length})
            </button>
          )}

          <button
            onClick={() => setIsScheduleOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={16} />
            Schedule Interview
          </button>
        </div>
      </div>

      {/* 4 Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <span className="text-xs font-semibold text-slate-500 block">{stat.label}</span>
            <div className="text-3xl font-extrabold text-slate-900">{stat.value}</div>
            <span className="text-xs font-medium text-slate-500 block">{stat.status}</span>
          </div>
        ))}
      </div>

      {/* Main Table Card Wrapper */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-6">
        {/* Navigation Filter Tabs Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 overflow-x-auto gap-4">
          <div className="flex items-center gap-6 overflow-x-auto">
            {navTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-bold transition-colors whitespace-nowrap relative pb-4 -mb-4 cursor-pointer ${activeTab === tab ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                  }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"></span>
                )}
              </button>
            ))}
          </div>

          {selectedInterviewIds.length > 0 && (
            <button
              onClick={() => setIsBulkFeedbackOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Sparkles size={16} />
              Bulk Feedback Update ({selectedInterviewIds.length})
            </button>
          )}
        </div>

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
            <p>No interviews found for tab "{activeTab}".</p>
            <button
              onClick={() => setIsScheduleOpen(true)}
              className="text-indigo-600 hover:underline font-semibold cursor-pointer"
            >
              Schedule a new interview
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left border-collapse min-w-[1000px]">
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
                  <th className="py-3.5 px-4 min-w-[220px]">Candidate Details</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Role & Round</th>
                  <th className="py-3.5 px-4 min-w-[170px]">Schedule & HR Call</th>
                  <th className="py-3.5 px-4 min-w-[260px]">Feedback & Ratings</th>
                  <th className="py-3.5 px-4 min-w-[140px] text-right">Actions</th>
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
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold border ${getStatusBadge(row.status)}`}>
                              {row.status}
                            </span>
                            {row.location && (
                              <span className="text-[10px] text-indigo-600 font-medium flex items-center gap-0.5 truncate">
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
                        <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {row.interview_type.replace("_", " ")}
                        </span>
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          R{row.round_number}
                        </span>
                      </div>
                    </td>

                    {/* Schedule & HR Call */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800 text-xs">{row.scheduled_date}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{row.scheduled_time} ({row.timezone || "IST"})</div>
                      <div className="mt-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${row.hr_call_verification === "Verified"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                          HR: {row.hr_call_verification || "Pending"}
                        </span>
                      </div>
                    </td>

                    {/* Feedback & Ratings */}
                    <td className="py-4 px-4">
                      <div className="space-y-1.5">
                        {/* Interviewer */}
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                            Interviewer
                          </span>
                          <span className="text-amber-600 font-bold shrink-0">⭐ {row.rating ? `${row.rating}/5` : "-"}</span>
                          {row.recommendation && (
                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-semibold truncate max-w-[90px]">
                              {row.recommendation}
                            </span>
                          )}
                        </div>

                        {/* Client */}
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="bg-teal-50 text-teal-700 border border-teal-200 font-bold px-1.5 py-0.5 rounded shrink-0">
                            Client
                          </span>
                          {row.client_rating || row.client_recommendation || row.client_name ? (
                            <>
                              <span className="text-teal-700 font-bold truncate max-w-[100px]">
                                {row.client_name ? `${row.client_name}: ` : ""}⭐ {row.client_rating ? `${row.client_rating}/5` : "-"}
                              </span>
                              {row.client_recommendation && (
                                <span className="bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0">
                                  {row.client_recommendation}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">Pending</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-0 text-right">
                      <div className="flex items-center justify-end gap-1.5 text-indigo-600">
                        {/* Send Interview Email Button */}
                        <button
                          onClick={() => handleOpenSendMail(row)}
                          title="Send Email to Candidate & Interviewer"
                          className="p-1.5 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors border border-slate-200 cursor-pointer text-indigo-600"
                        >
                          <Mail size={14} />
                        </button>

                        {/* View Candidate Full History Button */}
                        <button
                          onClick={() => handleOpenDetails(row)}
                          title="View Candidate Full Details & All Rounds History"
                          className="p-1.5 hover:bg-sky-50 hover:text-sky-700 rounded-lg transition-colors border border-slate-200 cursor-pointer text-sky-600"
                        >
                          <Eye size={14} />
                        </button>

                        {/* Open Single Feedback Modal */}
                        <button
                          onClick={() => handleOpenFeedback(row)}
                          title="Submit Single Candidate Feedback"
                          className="p-1.5 hover:bg-amber-50 hover:text-amber-700 rounded-lg transition-colors border border-slate-200 cursor-pointer text-amber-600"
                        >
                          <Star size={14} />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEdit(row)}
                          title="Edit Interview"
                          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer text-slate-700"
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* Reschedule Button */}
                        <button
                          onClick={() => handleOpenReschedule(row)}
                          title="Reschedule Date & Time"
                          className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors border border-slate-200 cursor-pointer text-amber-600"
                        >
                          <Calendar size={14} />
                        </button>

                        {/* Schedule Next Round Button */}
                        <button
                          onClick={() => handleOpenNextRound(row)}
                          title="Schedule Next Round"
                          className="p-1.5 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors border border-slate-200 cursor-pointer text-purple-600"
                        >
                          <Layers size={14} />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleOpenDelete(row)}
                          title="Delete Interview"
                          className="p-1.5 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors border border-slate-200 cursor-pointer text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SCHEDULE INTERVIEW MODAL (EXACT 2x2 COLORFUL CARD UI) */}
      {isScheduleOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl w-[94vw] max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">

            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl shadow-md text-white">
                  <Calendar size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Schedule New Interview Session
                    </h2>
                    {scheduleForm.candidate_name && (
                      <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
                        {scheduleForm.candidate_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure interview setup, dates, interviewer, candidate requests, salary, outcome, and attached documents
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsScheduleOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-6 text-xs">
              {/* 2-COLUMN / 2x2 COLORFUL CARD GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* CARD 1 (TOP LEFT): CANDIDATE & JOB ROLE SETUP */}
                <div className="bg-indigo-50/40 border border-indigo-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs border-b border-indigo-200/70 pb-2.5">
                    <Briefcase size={16} className="text-indigo-600" />
                    <span>Candidate & Job Role Setup</span>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Select Candidate from Parsed Resumes</label>
                    <select
                      value={scheduleForm.candidate_id}
                      onChange={(e) => {
                        const selId = e.target.value;
                        const found = candidatesList.find((c) => c.id === selId || c._id === selId);
                        const parsed = found?.parsed_data || {};
                        const nameStr = parsed.full_name || parsed.name || found?.original_filename || "";
                        const emailStr = parsed.email || found?.email || "";
                        setScheduleForm({
                          ...scheduleForm,
                          candidate_id: selId,
                          candidate_name: nameStr,
                          candidate_email: emailStr,
                          resume_id: selId,
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer font-medium shadow-2xs"
                    >
                      <option value="">-- Choose Candidate from Parsed Resumes --</option>
                      {candidatesList.map((cand) => {
                        const parsed = cand.parsed_data || {};
                        const candName = parsed.full_name || parsed.name || cand.original_filename;
                        return (
                          <option key={cand.id || cand._id} value={cand.id || cand._id}>
                            {candName} {parsed.email ? `(${parsed.email})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">
                        Candidate Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Candidate Name"
                        value={scheduleForm.candidate_name}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_name: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">
                        Job Title / Role <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Full Stack Developer / Team Lead"
                        value={scheduleForm.job_title}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, job_title: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <MapPin size={13} className="text-indigo-600" /> Job Location
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Coimbatore / Remote"
                        value={scheduleForm.job_location}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, job_location: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Briefcase size={13} className="text-indigo-600" /> Job Type
                      </label>
                      <select
                        value={scheduleForm.job_type}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, job_type: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-indigo-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                      >
                        <option value="Full Time">💼 Full Time</option>
                        <option value="Part Time">⏱️ Part Time</option>
                        <option value="Contract">📄 Contract</option>
                        <option value="Hybrid">🏢 Hybrid</option>
                        <option value="Remote">🌐 Remote</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Layers size={13} className="text-indigo-600" /> Interview Type
                      </label>
                      <select
                        value={scheduleForm.interview_type}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, interview_type: e.target.value as InterviewTypeEnum })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-indigo-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
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
                        value={scheduleForm.round_number}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, round_number: Number(e.target.value) })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 2 (TOP RIGHT): CANDIDATE REQUESTS, COMPENSATION & SELECTION OUTCOME */}
                <div className="bg-amber-50/40 border border-amber-300/70 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-xs border-b border-amber-200 pb-2.5">
                    <DollarSign size={16} className="text-amber-600" />
                    <span>Candidate Requests, Compensation & Selection Outcome</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Calendar size={13} className="text-amber-600" /> Requested Date
                      </label>
                      <input
                        type="date"
                        value={scheduleForm.candidate_requested_date}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_requested_date: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Clock size={13} className="text-amber-600" /> Requested Time
                      </label>
                      <input
                        type="time"
                        value={scheduleForm.candidate_requested_time}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_requested_time: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Briefcase size={13} className="text-amber-600" /> Requested Role
                      </label>
                      <input
                        type="text"
                        placeholder="Team Lead"
                        value={scheduleForm.candidate_requested_role}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, candidate_requested_role: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <DollarSign size={13} className="text-amber-600" /> Salary Requested
                      </label>
                      <input
                        type="text"
                        placeholder="50000"
                        value={scheduleForm.salary_requested}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, salary_requested: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <TrendingUp size={13} className="text-emerald-600" /> Final Fit Salary
                      </label>
                      <input
                        type="text"
                        placeholder="30000"
                        value={scheduleForm.final_fit_salary}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, final_fit_salary: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-emerald-600 font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Calendar size={13} className="text-amber-600" /> Joining Date
                      </label>
                      <input
                        type="date"
                        value={scheduleForm.joining_date}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, joining_date: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-amber-900 mb-1 font-bold flex items-center gap-1">
                      🏆 Selection Outcome Status
                    </label>
                    <select
                      value={scheduleForm.recommendation}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, recommendation: e.target.value })}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3.5 py-2.5 text-amber-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer shadow-2xs"
                    >
                      <option value="Selected">🟢 Selected</option>
                      <option value="Rejected">🔴 Rejected</option>
                      <option value="Pending">🟡 Pending Decision</option>
                      <option value="Hold">🟣 On Hold</option>
                    </select>
                  </div>
                </div>

                {/* CARD 3 (BOTTOM LEFT): DATE, TIME & VIDEO MEETING */}
                <div className="bg-sky-50/40 border border-sky-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 text-sky-800 font-bold text-xs border-b border-sky-200 pb-2.5">
                    <Clock size={16} className="text-sky-600" />
                    <span>Date, Time & Video Meeting</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Calendar size={13} className="text-sky-600" /> Scheduled Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={scheduleForm.scheduled_date}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Clock size={13} className="text-sky-600" /> Scheduled Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={scheduleForm.scheduled_time}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_time: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">
                        Interviewer Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Interviewer Name"
                        value={scheduleForm.interviewer_name}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, interviewer_name: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">Interviewer Email</label>
                      <input
                        type="email"
                        placeholder="interviewer@company.com"
                        value={scheduleForm.interviewer_email}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, interviewer_email: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <Video size={13} className="text-sky-600" /> Meeting Platform
                      </label>
                      <select
                        value={scheduleForm.meeting_platform}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_platform: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 cursor-pointer shadow-2xs"
                      >
                        <option value="Google Meet">📹 Google Meet</option>
                        <option value="Zoom">🎥 Zoom</option>
                        <option value="Microsoft Teams">💻 Microsoft Teams</option>
                        <option value="In Person">🏢 In Person / Office</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">Meeting Link / Address</label>
                      <input
                        type="text"
                        placeholder="https://meet.google.com/..."
                        value={scheduleForm.meeting_link}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 4 (BOTTOM RIGHT): LOCATION, DOCUMENTS & FOCUS NOTES */}
                <div className="bg-emerald-50/40 border border-emerald-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs border-b border-emerald-200 pb-2.5">
                    <Building2 size={16} className="text-emerald-700" />
                    <span>Interview Location, Documents & Focus Notes</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">Interview Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Conference Room A / Coimbatore"
                        value={scheduleForm.interview_location || scheduleForm.location}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, interview_location: e.target.value, location: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">HR Call Verification</label>
                      <select
                        value={scheduleForm.hr_call_verification}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, hr_call_verification: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer shadow-2xs"
                      >
                        <option value="Verified">Verified</option>
                        <option value="Pending">Pending</option>
                        <option value="Needs Followup">Needs Followup</option>
                        <option value="Not Eligible">Not Eligible</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Interview Document Files (URLs/filenames)</label>
                      <label className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 text-[11px] px-2.5 py-0.5 rounded-lg cursor-pointer font-bold transition-all">
                        Attach Files
                        <input type="file" multiple onChange={handleScheduleFileUpload} className="hidden" />
                      </label>
                    </div>
                    <textarea
                      rows={2}
                      value={scheduleForm.interview_document_files}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, interview_document_files: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-xs shadow-2xs"
                      placeholder="One per line or click Attach Files..."
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Agenda / Focus Notes</label>
                    <textarea
                      rows={2}
                      value={scheduleForm.notes}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium shadow-2xs"
                      placeholder="Focus areas or instructions..."
                    />
                  </div>
                </div>

              </div>

              {/* Bottom Actions Bar */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200 font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Plus size={16} /> Schedule Interview
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT INTERVIEW MODAL (WIDE 2-COLUMN FULL-FEATURED UI) */}
      {isEditOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl w-[94vw] max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">

            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-600 rounded-2xl shadow-sm text-white">
                  <Edit2 size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Edit Interview Details
                    </h2>
                    <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      {editForm.candidate_name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update scheduled interview details, candidate requests, salary, outcome, and attached documents
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-6 text-xs">

              {/* 2-COLUMN GRID WRAPPER FOR WIDE SCREEN EXPANSION */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* LEFT COLUMN: SETUP, SCHEDULE & INTERVIEWER DETAILS */}
                <div className="space-y-5">
                  {/* SECTION 1: CANDIDATE & JOB SETUP */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                        <Briefcase size={15} />
                        <span>Candidate & Job Role Setup</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">
                          Candidate Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editForm.candidate_name}
                          onChange={(e) => setEditForm({ ...editForm, candidate_name: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">
                          Job Title / Role <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editForm.job_title}
                          onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Building2 size={13} className="text-indigo-600" /> Job Location
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Bangalore / Remote"
                          value={editForm.job_location}
                          onChange={(e) => setEditForm({ ...editForm, job_location: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Briefcase size={13} className="text-indigo-600" /> Job Type
                        </label>
                        <select
                          value={editForm.job_type}
                          onChange={(e) => setEditForm({ ...editForm, job_type: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-indigo-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="Full Time">💼 Full Time</option>
                          <option value="Part Time">⏱️ Part Time</option>
                          <option value="Contract">📄 Contract</option>
                          <option value="Hybrid">🏢 Hybrid</option>
                          <option value="Remote">🌐 Remote</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Layers size={13} className="text-indigo-600" /> Interview Type
                        </label>
                        <select
                          value={editForm.interview_type}
                          onChange={(e) => setEditForm({ ...editForm, interview_type: e.target.value as InterviewTypeEnum })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-indigo-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
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
                          value={editForm.round_number}
                          onChange={(e) => setEditForm({ ...editForm, round_number: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: SCHEDULE & MEETING LINK */}
                  <div className="bg-sky-50/50 border border-sky-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-sky-700 font-bold text-xs border-b border-sky-200 pb-2">
                      <Clock size={15} />
                      <span>Date, Time & Video Meeting</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Calendar size={13} className="text-sky-600" /> Scheduled Date
                        </label>
                        <input
                          type="date"
                          value={editForm.scheduled_date}
                          onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Clock size={13} className="text-sky-600" /> Scheduled Time
                        </label>
                        <input
                          type="time"
                          value={editForm.scheduled_time}
                          onChange={(e) => setEditForm({ ...editForm, scheduled_time: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Interview Status</label>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value as InterviewStatusEnum })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sky-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="SCHEDULED">🗓️ SCHEDULED</option>
                          <option value="COMPLETED">✅ COMPLETED</option>
                          <option value="RESCHEDULED">🔄 RESCHEDULED</option>
                          <option value="CANCELLED">❌ CANCELLED</option>
                          <option value="NO_SHOW">⚠️ NO SHOW</option>
                          <option value="PENDING">⏳ PENDING</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Video size={13} className="text-sky-600" /> Meeting Platform
                        </label>
                        <select
                          value={editForm.meeting_platform}
                          onChange={(e) => setEditForm({ ...editForm, meeting_platform: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
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
                          placeholder="https://meet.google.com/..."
                          value={editForm.meeting_link}
                          onChange={(e) => setEditForm({ ...editForm, meeting_link: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: INTERVIEWER & LOCATION */}
                  <div className="space-y-4">
                    {/* Interviewer Box */}
                    <div className="bg-purple-50/40 border border-purple-200 rounded-2xl p-4 space-y-3 shadow-xs">
                      <div className="flex items-center gap-2 text-purple-700 font-bold text-xs border-b border-purple-200 pb-2">
                        <UserCheck size={15} />
                        <span>Interviewer Info & Round Feedback</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Interviewer Name</label>
                          <input
                            type="text"
                            value={editForm.interviewer_name}
                            onChange={(e) => setEditForm({ ...editForm, interviewer_name: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                            <Mail size={12} className="text-purple-600" /> Email Address
                          </label>
                          <input
                            type="email"
                            value={editForm.interviewer_email}
                            onChange={(e) => setEditForm({ ...editForm, interviewer_email: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Interviewer Rating (1-5)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="5"
                            value={editForm.rating}
                            onChange={(e) => setEditForm({ ...editForm, rating: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Selection Recommendation</label>
                          <select
                            value={editForm.recommendation}
                            onChange={(e) => setEditForm({ ...editForm, recommendation: e.target.value })}
                            className="w-full bg-white border border-amber-200 rounded-xl px-3.5 py-2 text-amber-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="Selected">🟢 Selected</option>
                            <option value="Rejected">🔴 Rejected</option>
                            <option value="Pending">🟡 Pending Decision</option>
                            <option value="Hold">🟣 On Hold</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Interviewer Feedback Comments</label>
                        <textarea
                          rows={2}
                          value={editForm.feedback}
                          onChange={(e) => setEditForm({ ...editForm, feedback: e.target.value })}
                          placeholder="Provide round assessment, strengths, technical comments..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Interviewer Strengths</label>
                          <input
                            type="text"
                            placeholder="e.g. React, Problem Solving"
                            value={editForm.strengths}
                            onChange={(e) => setEditForm({ ...editForm, strengths: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Interviewer Weaknesses</label>
                          <input
                            type="text"
                            placeholder="e.g. System Design edge cases"
                            value={editForm.weaknesses}
                            onChange={(e) => setEditForm({ ...editForm, weaknesses: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Location & Verification Box */}
                    <div className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-4 space-y-3 shadow-xs">
                      <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs border-b border-emerald-200 pb-2">
                        <MapPin size={15} />
                        <span>Location & HR Verification</span>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <MapPin size={12} className="text-emerald-600" /> Interview Location
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Bangalore Office"
                          value={editForm.interview_location || editForm.location}
                          onChange={(e) => setEditForm({ ...editForm, interview_location: e.target.value, location: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <ShieldCheck size={12} className="text-emerald-600" /> HR Verification
                        </label>
                        <select
                          value={editForm.hr_call_verification}
                          onChange={(e) => setEditForm({ ...editForm, hr_call_verification: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="Verified">✅ Verified</option>
                          <option value="Pending">⏳ Pending</option>
                          <option value="Needs Followup">📞 Followup</option>
                          <option value="Not Eligible">❌ Not Eligible</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: CANDIDATE REQUESTS, CLIENT FEEDBACK & DOCUMENTS/NOTES */}
                <div className="space-y-5">
                  {/* SECTION 4: CANDIDATE REQUESTED SCHEDULE, WORK ROLE, COMPENSATION & OUTCOME */}
                  <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs border-b border-amber-200 pb-2">
                      <DollarSign size={15} />
                      <span>Candidate Requests, Compensation & Selection Outcome</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Calendar size={12} className="text-amber-700" /> Requested Date
                        </label>
                        <input
                          type="date"
                          value={editForm.candidate_requested_date}
                          onChange={(e) => setEditForm({ ...editForm, candidate_requested_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Clock size={12} className="text-amber-700" /> Requested Time
                        </label>
                        <input
                          type="time"
                          value={editForm.candidate_requested_time}
                          onChange={(e) => setEditForm({ ...editForm, candidate_requested_time: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Briefcase size={12} className="text-amber-700" /> Requested Role
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Lead Backend"
                          value={editForm.candidate_requested_role}
                          onChange={(e) => setEditForm({ ...editForm, candidate_requested_role: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <DollarSign size={12} className="text-amber-700" /> Salary Requested
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 15 LPA"
                          value={editForm.salary_requested}
                          onChange={(e) => setEditForm({ ...editForm, salary_requested: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <TrendingUp size={12} className="text-emerald-600" /> Final Fit Salary
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 14 LPA"
                          value={editForm.final_fit_salary}
                          onChange={(e) => setEditForm({ ...editForm, final_fit_salary: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-emerald-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Calendar size={12} className="text-amber-700" /> Joining Date
                        </label>
                        <input
                          type="date"
                          value={editForm.joining_date}
                          onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>

                    {/* Candidate Selection Decision Status */}
                    <div className="pt-1">
                      <label className="block text-amber-800 mb-1 font-bold flex items-center gap-1 text-xs">
                        🏆 Selection Outcome Status
                      </label>
                      <select
                        value={editForm.recommendation}
                        onChange={(e) => setEditForm({ ...editForm, recommendation: e.target.value })}
                        className="w-full bg-white border border-amber-300 rounded-xl px-3.5 py-2 text-amber-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-xs cursor-pointer"
                      >
                        <option value="Selected">🟢 Selected (Approved for Hiring)</option>
                        <option value="Rejected">🔴 Rejected (Not Suitable)</option>
                        <option value="Pending">🟡 Pending Decision</option>
                        <option value="Hold">🟣 On Hold</option>
                      </select>
                    </div>
                  </div>

                  {/* CLIENT FEEDBACK CARD IN EDIT MODAL */}
                  <div className="bg-teal-50/40 border border-teal-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-teal-800 font-bold text-xs border-b border-teal-200 pb-2">
                      <Building2 size={15} />
                      <span>Client Feedback Option Details</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Name / Evaluator</label>
                        <input
                          type="text"
                          placeholder="e.g. Acme Corp / John Client"
                          value={editForm.client_name}
                          onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Feedback Date</label>
                        <input
                          type="date"
                          value={editForm.client_feedback_date}
                          onChange={(e) => setEditForm({ ...editForm, client_feedback_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Rating (1-5)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="5"
                          value={editForm.client_rating}
                          onChange={(e) => setEditForm({ ...editForm, client_rating: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Outcome</label>
                        <select
                          value={editForm.client_recommendation}
                          onChange={(e) => setEditForm({ ...editForm, client_recommendation: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-teal-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-[11px] cursor-pointer"
                        >
                          <option value="Selected">🟢 Selected</option>
                          <option value="Rejected">🔴 Rejected</option>
                          <option value="Next Round">🔄 Next Round</option>
                          <option value="Hold">🟣 On Hold</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">Client Detailed Feedback</label>
                      <textarea
                        rows={2}
                        value={editForm.client_feedback}
                        onChange={(e) => setEditForm({ ...editForm, client_feedback: e.target.value })}
                        placeholder="Enter client detailed feedback notes..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Strengths</label>
                        <input
                          type="text"
                          placeholder="e.g. Domain knowledge, Team fit"
                          value={editForm.client_strengths}
                          onChange={(e) => setEditForm({ ...editForm, client_strengths: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Weaknesses</label>
                        <input
                          type="text"
                          placeholder="e.g. Notice period too long"
                          value={editForm.client_weaknesses}
                          onChange={(e) => setEditForm({ ...editForm, client_weaknesses: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold">Client Specific Notes</label>
                      <textarea
                        rows={2}
                        value={editForm.client_notes}
                        onChange={(e) => setEditForm({ ...editForm, client_notes: e.target.value })}
                        placeholder="Special client notes, rate negotiations, internal comments..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* SECTION 5: DOCUMENTS & UPLOAD & NOTES */}
                  <div className="bg-rose-50/40 border border-rose-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                      <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                        <FileText size={15} />
                        <span>Interview Documents & Notes</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-700 font-semibold flex items-center gap-1">
                          <FileText size={12} className="text-rose-600" /> Attached Document Files
                        </label>
                        <label className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs px-3 py-1 rounded-xl cursor-pointer font-bold transition-all shadow-xs">
                          <Upload size={13} />
                          <span>Browse / Attach</span>
                          <input
                            type="file"
                            multiple
                            onChange={handleEditFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <textarea
                        rows={2}
                        value={editForm.interview_document_files}
                        onChange={(e) => setEditForm({ ...editForm, interview_document_files: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-[11px]"
                        placeholder="Document names or URLs (one per line)..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <AlignLeft size={12} className="text-rose-600" /> Notes / Special Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        placeholder="Key assessment areas, prep notes..."
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons Footer */}
              <div className="flex justify-end items-center gap-4 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Interview Details</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {isRescheduleOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar size={18} className="text-amber-600" /> Reschedule Interview
              </h2>
              <button
                onClick={() => setIsRescheduleOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800">
              Candidate: <span className="font-bold text-slate-900">{selectedInterview.candidate_name}</span> ({selectedInterview.job_title})
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-semibold">New Scheduled Date</label>
                <input
                  type="date"
                  value={rescheduleForm.scheduled_date}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, scheduled_date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-semibold">New Scheduled Time</label>
                <input
                  type="time"
                  value={rescheduleForm.scheduled_time}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, scheduled_time: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-semibold">Reason for Rescheduling</label>
                <textarea
                  rows={3}
                  value={rescheduleForm.reason}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                  placeholder="e.g. Candidate requested time change due to conflict..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsRescheduleOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? "Rescheduling..." : "Reschedule Interview"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RATING & FEEDBACK MODAL (WIDE 2-COLUMN DUAL OPTION: INTERVIEWER ROUND FEEDBACK & CLIENT FEEDBACK) */}
      {isFeedbackOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl w-[94vw] max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">

            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600 rounded-2xl shadow-sm text-white">
                  <Star size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Submit Round & Client Feedback
                    </h2>
                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      {selectedInterview.candidate_name} ({selectedInterview.interview_type} - Round {selectedInterview.round_number})
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Evaluate candidate per interview round & type, or submit detailed client feedback
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFeedbackOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* TAB SELECTOR: INTERVIEWER ROUND FEEDBACK vs CLIENT FEEDBACK */}
            <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFeedbackTab("INTERVIEWER")}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${feedbackTab === "INTERVIEWER"
                  ? "bg-white text-emerald-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <UserCheck size={16} />
                Interviewer Round Feedback ({selectedInterview.interview_type} R{selectedInterview.round_number})
              </button>

              <button
                type="button"
                onClick={() => setFeedbackTab("CLIENT")}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${feedbackTab === "CLIENT"
                  ? "bg-white text-teal-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <Building2 size={16} />
                Client Feedback Option
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="space-y-6 text-xs">

              {/* 2-COLUMN GRID WRAPPER FOR WIDE FEEDBACK MODAL */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* LEFT COLUMN: EVALUATION CARD (INTERVIEWER OR CLIENT) */}
                <div>
                  {/* TAB 1: INTERVIEWER / ROUND EVALUATION CARD */}
                  {feedbackTab === "INTERVIEWER" && (
                    <div className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-xs h-full">
                      <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                          <Sparkles size={15} />
                          <span>{selectedInterview.interview_type.replace("_", " ")} - Round {selectedInterview.round_number} Performance Evaluation</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Interviewer Rating (1.0 to 5.0)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="5"
                            value={feedbackForm.rating}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                            🏆 Round Outcome Status
                          </label>
                          <select
                            value={feedbackForm.recommendation}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, recommendation: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="Selected">🟢 Selected (Passed Round)</option>
                            <option value="Rejected">🔴 Rejected (Not Suitable)</option>
                            <option value="Pending">🟡 Pending Decision</option>
                            <option value="Hold">🟣 On Hold</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Interviewer Round Feedback</label>
                        <textarea
                          rows={4}
                          value={feedbackForm.feedback}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                          placeholder="Provide technical round evaluation, coding skills, domain questions, communication..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Candidate Strengths (Comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. Problem Solving, React"
                            value={feedbackForm.strengths}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, strengths: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Areas for Improvement (Comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. System Design edge cases"
                            value={feedbackForm.weaknesses}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, weaknesses: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CLIENT FEEDBACK CARD */}
                  {feedbackTab === "CLIENT" && (
                    <div className="bg-teal-50/40 border border-teal-200 rounded-2xl p-5 space-y-4 shadow-xs h-full">
                      <div className="flex items-center justify-between border-b border-teal-200 pb-2">
                        <div className="flex items-center gap-2 text-teal-800 font-bold text-xs">
                          <Building2 size={15} />
                          <span>Client Evaluation & Feedback Details</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Client Company / Evaluator Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Acme Corp / John Manager"
                            value={feedbackForm.client_name}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_name: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                            <Calendar size={13} className="text-teal-600" /> Client Feedback Date
                          </label>
                          <input
                            type="date"
                            value={feedbackForm.client_feedback_date}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_feedback_date: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Client Rating Score (1.0 to 5.0)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="5"
                            value={feedbackForm.client_rating}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_rating: Number(e.target.value) })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Client Recommendation Outcome</label>
                          <select
                            value={feedbackForm.client_recommendation}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_recommendation: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-teal-700 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                          >
                            <option value="Selected">🟢 Client Approved / Selected</option>
                            <option value="Rejected">🔴 Client Rejected</option>
                            <option value="Next Round">🔄 Recommended Next Round</option>
                            <option value="Hold">🟣 Client On Hold</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Detailed Feedback</label>
                        <textarea
                          rows={3}
                          value={feedbackForm.client_feedback}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, client_feedback: e.target.value })}
                          placeholder="Enter client review comments, project fit, client rating details..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Client Strengths (Comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. Domain knowledge, Team fit"
                            value={feedbackForm.client_strengths}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_strengths: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-700 mb-1 font-semibold">Client Weaknesses (Comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. Notice period too long"
                            value={feedbackForm.client_weaknesses}
                            onChange={(e) => setFeedbackForm({ ...feedbackForm, client_weaknesses: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold">Client Specific Notes</label>
                        <textarea
                          rows={2}
                          value={feedbackForm.client_notes}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, client_notes: e.target.value })}
                          placeholder="Special client notes, rate negotiations, internal client comments..."
                          className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: CANDIDATE SCHEDULE/SALARY & DOCUMENTS/NOTES */}
                <div className="space-y-5">
                  {/* CANDIDATE REQUESTED SCHEDULE, WORK ROLE & COMPENSATION */}
                  <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs border-b border-amber-200 pb-2">
                      <DollarSign size={15} />
                      <span>Candidate Requested Schedule, Work Role & Compensation</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Calendar size={12} className="text-amber-700" /> Requested Date
                        </label>
                        <input
                          type="date"
                          value={feedbackForm.candidate_requested_date}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, candidate_requested_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Clock size={12} className="text-amber-700" /> Requested Time
                        </label>
                        <input
                          type="time"
                          value={feedbackForm.candidate_requested_time}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, candidate_requested_time: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Briefcase size={12} className="text-amber-700" /> Requested Role
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Lead Backend"
                          value={feedbackForm.candidate_requested_role}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, candidate_requested_role: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <DollarSign size={12} className="text-amber-700" /> Salary Requested
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 15 LPA"
                          value={feedbackForm.salary_requested}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, salary_requested: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <TrendingUp size={12} className="text-emerald-600" /> Final Fit Salary
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 14 LPA"
                          value={feedbackForm.final_fit_salary}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, final_fit_salary: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-emerald-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                          <Calendar size={12} className="text-amber-700" /> Joining Date
                        </label>
                        <input
                          type="date"
                          value={feedbackForm.joining_date}
                          onChange={(e) => setFeedbackForm({ ...feedbackForm, joining_date: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  {/* DOCUMENTS & UPLOAD & NOTES */}
                  <div className="bg-rose-50/40 border border-rose-200 rounded-2xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                      <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                        <FileText size={15} />
                        <span>Interview Documents & Notes</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-700 font-semibold flex items-center gap-1">
                          <FileText size={12} className="text-rose-600" /> Attached Document Files
                        </label>
                        <label className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs px-3 py-1 rounded-xl cursor-pointer font-bold transition-all shadow-xs">
                          <Upload size={13} />
                          <span>Browse / Attach</span>
                          <input
                            type="file"
                            multiple
                            onChange={handleFeedbackFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <textarea
                        rows={2}
                        value={feedbackForm.interview_document_files}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, interview_document_files: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono text-[11px]"
                        placeholder="Document names or URLs (one per line)..."
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                        <AlignLeft size={12} className="text-rose-600" /> Notes / Special Instructions
                      </label>
                      <textarea
                        rows={2}
                        value={feedbackForm.notes}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, notes: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                        placeholder="Key assessment areas, candidate prep notes..."
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Action Buttons Footer */}
              <div className="flex justify-end items-center gap-4 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFeedbackOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Submitting Feedback...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Save & Submit Feedback</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* SCHEDULE NEXT ROUND MODAL */}
      {isNextRoundOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600 rounded-2xl shadow-sm text-white">
                  <Layers size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-wide">
                      Schedule Next Interview Round
                    </h2>
                    <span className="bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      Round {nextRoundForm.round_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign next round type, interviewer details & separate schedule time for {selectedInterview.candidate_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNextRoundOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleNextRoundSubmit} className="space-y-5 text-xs">
              {/* Candidate & Job Readonly Header Card */}
              <div className="bg-purple-50/50 border border-purple-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">Candidate</span>
                  <div className="text-sm font-bold text-slate-900">{nextRoundForm.candidate_name}</div>
                </div>
                <div>
                  <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">Target Job Position</span>
                  <div className="text-sm font-bold text-purple-800">{nextRoundForm.job_title}</div>
                </div>
                <div>
                  <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">Previous Round</span>
                  <div className="text-sm font-bold text-amber-700">Round {selectedInterview.round_number} ({selectedInterview.interview_type})</div>
                </div>
              </div>

              {/* SECTION 1: ROUND SETUP & INTERVIEW TYPE */}
              <div className="bg-purple-50/30 border border-purple-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-purple-700 font-bold text-xs border-b border-purple-200 pb-2">
                  <Sparkles size={15} />
                  <span>Next Round Setup & Format</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Next Round Number</label>
                    <input
                      type="number"
                      min="1"
                      value={nextRoundForm.round_number}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, round_number: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-purple-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Next Interview Type / Format</label>
                    <select
                      value={nextRoundForm.interview_type}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, interview_type: e.target.value as InterviewTypeEnum })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="TECHNICAL">💻 TECHNICAL ROUND</option>
                      <option value="CLIENT_ROUND">🏢 CLIENT ROUND</option>
                      <option value="SYSTEM_DESIGN">🏗️ SYSTEM DESIGN</option>
                      <option value="CODING_TEST">⌨️ CODING TEST / LIVE PAIRING</option>
                      <option value="HR">👥 HR INTERVIEW</option>
                      <option value="MANAGERIAL">👔 MANAGERIAL ROUND</option>
                      <option value="CULTURE_FIT">🤝 CULTURE FIT</option>
                      <option value="BEHAVIORAL">🧠 BEHAVIORAL ASSESSMENT</option>
                      <option value="FINAL_ROUND">🏆 FINAL EXECUTIVE ROUND</option>
                      <option value="INITIAL_SCREENING">📞 INITIAL SCREENING</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Duration (Minutes)</label>
                    <input
                      type="number"
                      step="15"
                      min="15"
                      value={nextRoundForm.duration_minutes}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, duration_minutes: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: SEPARATE SCHEDULE DATE & TIME */}
              <div className="bg-sky-50/40 border border-sky-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-sky-700 font-bold text-xs border-b border-sky-200 pb-2">
                  <Clock size={15} />
                  <span>Next Round Separate Schedule Date & Time</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Calendar size={12} className="text-sky-600" /> Scheduled Date
                    </label>
                    <input
                      type="date"
                      value={nextRoundForm.scheduled_date}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, scheduled_date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Clock size={12} className="text-sky-600" /> Scheduled Time
                    </label>
                    <input
                      type="time"
                      value={nextRoundForm.scheduled_time}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, scheduled_time: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Timezone</label>
                    <input
                      type="text"
                      value={nextRoundForm.timezone}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, timezone: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: INTERVIEWER ASSIGNMENT & MEETING LOCATION */}
              <div className="bg-indigo-50/40 border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs border-b border-indigo-200 pb-2">
                  <UserCheck size={15} />
                  <span>Assign Interviewer & Meeting Platform</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Interviewer Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Sarah Connor / Tech Lead"
                      value={nextRoundForm.interviewer_name}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, interviewer_name: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold flex items-center gap-1">
                      <Mail size={12} className="text-indigo-600" /> Interviewer Email
                    </label>
                    <input
                      type="email"
                      placeholder="interviewer@company.com"
                      value={nextRoundForm.interviewer_email}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, interviewer_email: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Meeting Platform</label>
                    <select
                      value={nextRoundForm.meeting_platform}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, meeting_platform: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="Google Meet">Google Meet</option>
                      <option value="Zoom">Zoom</option>
                      <option value="Microsoft Teams">Microsoft Teams</option>
                      <option value="In Person">In Person / On-site</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Meeting Link / Address</label>
                    <input
                      type="text"
                      placeholder="https://meet.google.com/..."
                      value={nextRoundForm.meeting_link}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, meeting_link: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">Notes / Round Assessment Guidelines</label>
                  <textarea
                    rows={2}
                    value={nextRoundForm.notes}
                    onChange={(e) => setNextRoundForm({ ...nextRoundForm, notes: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Focus topics, system design questions, client prep notes..."
                  />
                </div>
              </div>

              {/* SECTION 4: INHERITED CANDIDATE DETAILS, HR VERIFICATION & COMPENSATION */}
              <div className="bg-amber-50/40 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs border-b border-amber-200 pb-2">
                  <DollarSign size={15} />
                  <span>Inherited Candidate Requests, HR Verification & Compensation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">HR Verification</label>
                    <select
                      value={nextRoundForm.hr_call_verification}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, hr_call_verification: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="Verified">✅ Verified</option>
                      <option value="Pending">⏳ Pending</option>
                      <option value="Needs Followup">📞 Followup</option>
                      <option value="Not Eligible">❌ Not Eligible</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Salary Requested</label>
                    <input
                      type="text"
                      placeholder="e.g. 50000"
                      value={nextRoundForm.salary_requested}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, salary_requested: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Final Fit Salary</label>
                    <input
                      type="text"
                      placeholder="e.g. 30000"
                      value={nextRoundForm.final_fit_salary}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, final_fit_salary: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-emerald-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Expected Joining Date</label>
                    <input
                      type="date"
                      value={nextRoundForm.joining_date}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, joining_date: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold">Attached Document Files</label>
                    <input
                      type="text"
                      placeholder="Document names/URLs..."
                      value={nextRoundForm.interview_document_files}
                      onChange={(e) => setNextRoundForm({ ...nextRoundForm, interview_document_files: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex justify-end items-center gap-4 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNextRoundOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-200 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Scheduling Round {nextRoundForm.round_number}...</span>
                    </>
                  ) : (
                    <>
                      <Layers size={16} />
                      <span>Confirm & Schedule Round {nextRoundForm.round_number}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANDIDATE FULL DETAILS MODAL */}
      <CandidateDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        candidateId={selectedCandidateId}
        candidateName={selectedCandidateName}
        fallbackInterview={selectedInterview}
      />

      {/* BULK CANDIDATE FEEDBACK UPDATE MODAL */}
      <BulkFeedbackModal
        isOpen={isBulkFeedbackOpen}
        onClose={() => setIsBulkFeedbackOpen(false)}
        selectedInterviews={filteredInterviews.filter((i) => selectedInterviewIds.includes(i.id))}
        onSuccess={() => {
          setSelectedInterviewIds([]);
          fetchAllData();
        }}
      />

      {/* SEND INTERVIEW EMAIL POPUP MODAL */}
      {isSendMailOpen && selectedInterview && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-slate-900">
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-slate-50 px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-600">
                  <Mail size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Send Interview Notification Email</h2>
                  <p className="text-xs text-slate-500">
                    Candidate: <span className="font-semibold text-slate-700">{selectedInterview.candidate_name}</span> | Role: <span className="font-semibold text-slate-700">{selectedInterview.job_title}</span>
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
            <form onSubmit={handleSendMailSubmit} className="p-6 space-y-4 text-xs">
              {sendMailStatus && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                    sendMailStatus.type === "success"
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

              {/* Recipient Indications */}
              <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-800 block">Select Email Recipients & Indications:</span>

                {/* Candidate Email Option */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendMailForm.send_to_candidate}
                      onChange={(e) => setSendMailForm({ ...sendMailForm, send_to_candidate: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Candidate Mail Indication</span>
                  </label>
                  {sendMailForm.send_to_candidate && (
                    <input
                      type="email"
                      required
                      placeholder="candidate@example.com"
                      value={sendMailForm.candidate_email}
                      onChange={(e) => setSendMailForm({ ...sendMailForm, candidate_email: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  )}
                </div>

                {/* Interviewer Email Option */}
                <div className="space-y-1.5 pt-1 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendMailForm.send_to_interviewer}
                      onChange={(e) => setSendMailForm({ ...sendMailForm, send_to_interviewer: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700">Interviewer Mail Indication ({selectedInterview.interviewer_name || "Interviewer"})</span>
                  </label>
                  {sendMailForm.send_to_interviewer && (
                    <input
                      type="email"
                      required
                      placeholder="interviewer@company.com"
                      value={sendMailForm.interviewer_email}
                      onChange={(e) => setSendMailForm({ ...sendMailForm, interviewer_email: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
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
                  rows={3}
                  placeholder="Enter specific instructions or schedule notes for candidate / interviewer..."
                  value={sendMailForm.custom_notes}
                  onChange={(e) => setSendMailForm({ ...sendMailForm, custom_notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
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


