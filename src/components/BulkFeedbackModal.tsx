import React, { useState, useEffect, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, UserCheck,
  Building2, DollarSign, Sparkles, HelpCircle, Plus, Trash2,
  Star, FileText, Upload, Calendar, RefreshCw, ShieldCheck,
  AlignLeft, Briefcase, TrendingUp, Eye, Loader2
} from "lucide-react";
import {
  bulkSubmitInterviewFeedback,
  getUsers,
  uploadInterviewDocument,
  RECOMMENDATION_OPTIONS,
  type InterviewItem,
  type BulkFeedbackItemPayload,
  type InterviewerItem,
  type ClientFeedbackItem,
  type UserProfile,
} from "../utils/Api";
import type { CategoryScoreItem } from "../types/interview";
import { SkillRatingsEvaluation } from "./SkillRatingsEvaluation";
import { getFeedbackQuestionsAsync, getAutoRatingOutcome } from "../utils/feedbackHelpers";
import { useFeedback } from "./ui/Feedback";
import { RoundsTracker } from "./interview/RoundsTracker";

interface BulkFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInterviews: InterviewItem[];
  onSuccess: () => void;
}

interface SingleCandidateFeedbackForm {
  interview_id: string;
  candidate_name: string;
  candidate_email?: string;
  job_title: string;
  interview_type: string;
  round_number: number;
  scheduled_date?: string;
  scheduled_time?: string;
  meeting_platform?: string;
  meeting_link?: string;

  feedbackTab: "INTERVIEWER" | "CLIENT";
  
  // Single Primary Interviewer Feedback (Top level sync)
  rating: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  recommendation: string;
  
  // Multi Interviewer Panel List
  interviewersList: InterviewerItem[];

  // Single Primary Client Feedback (Top level sync)
  client_name: string;
  client_rating: number;
  client_feedback: string;
  client_strengths: string;
  client_weaknesses: string;
  client_recommendation: string;
  client_notes: string;
  client_feedback_date: string;
  
  // Multi Client Panel List
  clientsList: ClientFeedbackItem[];

  // Skill Ratings & AI Score
  skill_ratings: { skill_name: string; rating: number }[];
  category_scores: CategoryScoreItem[];
  ai_score: number;
  ai_recommendation: string;

  // Shared Candidate Info & Outcomes
  candidate_requested_date: string;
  candidate_requested_time: string;
  candidate_requested_role: string;
  salary_requested: string;
  final_fit_salary: string;
  joining_date: string;
  interview_document_files: string;
  interview_feedback_files: string;
  notes: string;
}

// The panel shows an empty "Client Evaluator 1" / "Interviewer 1" row so people can fill it in.
// Rows nobody filled in (no person, rating, comments or verdict) are not saved; they used to be
// stored as if a client or interviewer had given feedback.
const hasPerson = (id?: string, email?: string) => !!(id || (email && email.trim()));
const isFilledClient = (c: ClientFeedbackItem) =>
  hasPerson(c.client_id, c.client_email) ||
  !!c.client_rating ||
  !!(c.client_feedback && c.client_feedback.trim()) ||
  (c.client_strengths?.length ?? 0) > 0 ||
  (c.client_weaknesses?.length ?? 0) > 0 ||
  !!(c.client_recommendation && c.client_recommendation !== "Pending");
const isFilledInterviewer = (i: InterviewerItem) =>
  hasPerson(i.interviewer_id, i.interviewer_email) ||
  !!i.rating ||
  !!(i.feedback && i.feedback.trim()) ||
  (i.strengths?.length ?? 0) > 0 ||
  (i.weaknesses?.length ?? 0) > 0 ||
  !!(i.recommendation && i.recommendation !== "Pending") ||
  !/^Interviewer \d+$/.test(i.interviewer_name || "");

export const BulkFeedbackModal: React.FC<BulkFeedbackModalProps> = ({
  isOpen,
  onClose,
  selectedInterviews,
  onSuccess,
}) => {
  const { toast } = useFeedback();

  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);
  const [formsData, setFormsData] = useState<SingleCandidateFeedbackForm[]>([]);
  // Verdicts the evaluator chose by hand, per candidate ("0:top", "0:int:1", ...)
  const pickedVerdictsRef = useRef<Set<string>>(new Set());
  // Candidates whose offer details were opened by hand before a Selected verdict
  const [offerOpened, setOfferOpened] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  const [questionOptions, setQuestionOptions] = useState<string[]>([]);
  const [isUploadingDocFile, setIsUploadingDocFile] = useState<boolean>(false);
  const [isUploadingFeedbackReportFile, setIsUploadingFeedbackReportFile] = useState<boolean>(false);

  // User Authentication & Role Detection
  const userStr = localStorage.getItem("user");
  const currentUser: UserProfile | null = userStr ? JSON.parse(userStr) : null;
  const userRole = (currentUser?.role || "").toLowerCase();
  const isClientUser = userRole.includes("client");
  const isInterviewerUser = userRole.includes("interviewer");

  useEffect(() => {
    if (isOpen) {
      getUsers().then((users) => setSystemUsers(users)).catch(() => setSystemUsers([]));
    }
  }, [isOpen]);

  // Initialize form state when selectedInterviews change or modal opens
  useEffect(() => {
    if (selectedInterviews && selectedInterviews.length > 0) {
      const initialForms: SingleCandidateFeedbackForm[] = selectedInterviews.map((item) => {
        const uId = currentUser?.id || (currentUser as any)?._id || "";
        const uEmail = (currentUser?.email || "").trim().toLowerCase();
        const uName = (currentUser?.full_name || "").trim().toLowerCase();

        let initInterviewers: InterviewerItem[] = [];
        if (isInterviewerUser && currentUser) {
          const matched = (item.interviewers || []).filter((i) => {
            return (
              (i.interviewer_id && i.interviewer_id === uId) ||
              (i.interviewer_email && i.interviewer_email.trim().toLowerCase() === uEmail) ||
              (i.interviewer_name && i.interviewer_name.trim().toLowerCase() === uName)
            );
          });
          initInterviewers = matched.length > 0 ? matched : [{
            interviewer_id: uId,
            interviewer_name: currentUser.full_name || item.interviewer_name || "Interviewer 1",
            interviewer_email: currentUser.email || item.interviewer_email || "",
            rating: item.rating ?? undefined,
            feedback: item.feedback || "",
            recommendation: item.recommendation || "Pending",
            strengths: item.strengths || [],
            weaknesses: item.weaknesses || [],
          }];
        } else {
          initInterviewers = item.interviewers && item.interviewers.length > 0
            ? item.interviewers
            : [
                {
                  interviewer_name: item.interviewer_name || "Interviewer 1",
                  interviewer_email: item.interviewer_email || "",
                  rating: item.rating ?? undefined,
                  feedback: item.feedback || "",
                  recommendation: item.recommendation || "Pending",
                  strengths: item.strengths || [],
                  weaknesses: item.weaknesses || [],
                },
              ];
        }

        let initClients: ClientFeedbackItem[] = [];
        if (isClientUser && currentUser) {
          const matched = (item.clients || []).filter((c) => {
            return (
              (c.client_id && c.client_id === uId) ||
              (c.client_email && c.client_email.trim().toLowerCase() === uEmail) ||
              (c.client_name && c.client_name.trim().toLowerCase() === uName)
            );
          });
          initClients = matched.length > 0 ? matched : [{
            client_id: uId,
            client_name: currentUser.full_name || item.client_name || "Client Evaluator 1",
            client_email: currentUser.email || item.client_email || "",
            client_rating: item.client_rating ?? undefined,
            client_feedback: item.client_feedback || "",
            client_recommendation: item.client_recommendation || "Pending",
            client_notes: item.client_notes || "",
          }];
        } else {
          initClients = item.clients && item.clients.length > 0
            ? item.clients
            : [
                {
                  client_name: item.client_name || "Client Evaluator 1",
                  client_rating: item.client_rating ?? undefined,
                  client_feedback: item.client_feedback || "",
                  client_recommendation: item.client_recommendation || "Pending",
                  client_notes: item.client_notes || "",
                },
              ];
        }

        const initSkills =
          item.skill_ratings && item.skill_ratings.length > 0
            ? item.skill_ratings
            : [];

        return {
          interview_id: item.id,
          candidate_name: item.candidate_name,
          candidate_email: item.candidate_email,
          job_title: item.job_title,
          interview_type: item.interview_type,
          round_number: item.round_number || 1,
          scheduled_date: item.scheduled_date,
          scheduled_time: item.scheduled_time,
          meeting_platform: item.meeting_platform,
          meeting_link: item.meeting_link,

          feedbackTab: isClientUser ? "CLIENT" : "INTERVIEWER",
          
          // 0 = not rated yet; only real ratings are saved
          rating: item.rating ?? 0,
          feedback: item.feedback || "",
          strengths: item.strengths ? item.strengths.join(", ") : "",
          weaknesses: item.weaknesses ? item.weaknesses.join(", ") : "",
          recommendation: item.recommendation || "Pending",
          interviewersList: initInterviewers,

          client_name: item.client_name || "",
          client_rating: item.client_rating ?? 0,
          client_feedback: item.client_feedback || "",
          client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
          client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
          client_recommendation: item.client_recommendation || "Pending",
          client_notes: item.client_notes || "",
          client_feedback_date: item.client_feedback_date || new Date().toISOString().split("T")[0],
          clientsList: initClients,

          skill_ratings: initSkills,
          category_scores: item.category_scores || [],
          ai_score: item.ai_score || 21,
          ai_recommendation: item.ai_recommendation || "No Hire",

          candidate_requested_date: item.candidate_requested_date || "",
          candidate_requested_time: item.candidate_requested_time || "",
          candidate_requested_role: item.candidate_requested_role || "",
          salary_requested: item.salary_requested || "",
          final_fit_salary: item.final_fit_salary || "",
          joining_date: item.joining_date || "",
          interview_document_files: item.interview_document_files ? Array.from(new Set(item.interview_document_files)).join("\n") : "",
          interview_feedback_files: item.interview_feedback_files ? Array.from(new Set(item.interview_feedback_files)).join("\n") : "",
          notes: item.notes || "",
        };
      });
      setFormsData(initialForms);
      pickedVerdictsRef.current = new Set();
      setOfferOpened(new Set());
      setActiveCandidateIndex(0);
    }
  }, [selectedInterviews, isOpen]);

  // Only load questions while the modal is open (it stays mounted while closed)
  const activeInterviewType = isOpen ? selectedInterviews?.[activeCandidateIndex]?.interview_type : undefined;
  useEffect(() => {
    if (activeInterviewType) {
      getFeedbackQuestionsAsync(activeInterviewType).then((opts) => setQuestionOptions(opts));
    }
  }, [activeInterviewType]);

  if (!isOpen || selectedInterviews.length === 0) return null;

  const currentForm = formsData[activeCandidateIndex] || formsData[0];
  const OFFER_VERDICTS = ["Selected", "Offer to Be Released", "Offer Accepted", "Offer Rejected", "Recommended", "Strong Hire", "Hire"];
  const showOfferDetails =
    !!currentForm &&
    (OFFER_VERDICTS.includes(currentForm.recommendation) ||
      OFFER_VERDICTS.includes(currentForm.client_recommendation) ||
      offerOpened.has(activeCandidateIndex) ||
      !!(currentForm.salary_requested || currentForm.final_fit_salary || currentForm.joining_date ||
        currentForm.candidate_requested_date || currentForm.candidate_requested_role));

  // A rating suggests a verdict, but never overwrites one the evaluator picked by hand
  const pickedVerdicts = pickedVerdictsRef.current;
  const pickKey = (part: string) => `${activeCandidateIndex}:${part}`;

  const handleCurrentFormChange = (field: keyof SingleCandidateFeedbackForm, value: any) => {
    setFormsData((prev) => {
      const updated = [...prev];
      if (updated[activeCandidateIndex]) {
        const item = {
          ...updated[activeCandidateIndex],
          [field]: value,
        };

        if (field === "recommendation") pickedVerdicts.add(pickKey("top"));
        if (field === "client_recommendation") pickedVerdicts.add(pickKey("client"));

        if (field === "rating" && !pickedVerdicts.has(pickKey("top"))) {
          const outcome = getAutoRatingOutcome(Number(value));
          item.recommendation = outcome.recommendation;
        }

        if (field === "client_rating" && !pickedVerdicts.has(pickKey("client"))) {
          const outcome = getAutoRatingOutcome(Number(value));
          item.client_recommendation = outcome.clientRecommendation;
        }

        updated[activeCandidateIndex] = item;
      }
      return updated;
    });
  };

  // Multi Interviewers Handlers
  const handleAddInterviewer = () => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form) {
        const newInt: InterviewerItem = {
          interviewer_name: `Interviewer ${form.interviewersList.length + 1}`,
          rating: 4,
          feedback: "",
          recommendation: "Selected",
        };
        form.interviewersList = [...form.interviewersList, newInt];
      }
      return updated;
    });
  };

  const handleRemoveInterviewer = (intIdx: number) => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form && form.interviewersList.length > 1) {
        form.interviewersList = form.interviewersList.filter((_, idx) => idx !== intIdx);
      }
      return updated;
    });
  };

  const handleInterviewerItemChange = (intIdx: number, field: keyof InterviewerItem, val: any) => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form && form.interviewersList[intIdx]) {
        const item = { ...form.interviewersList[intIdx], [field]: val };
        if (field === "recommendation") pickedVerdicts.add(pickKey(`int:${intIdx}`));
        if (field === "rating" && val !== undefined && !pickedVerdicts.has(pickKey(`int:${intIdx}`))) {
          const outcome = getAutoRatingOutcome(Number(val));
          item.recommendation = outcome.recommendation;
        }
        form.interviewersList[intIdx] = item;

        if (intIdx === 0) {
          form.rating = Number(item.rating ?? 0);
          form.recommendation = item.recommendation || "Selected";
        }
      }
      return updated;
    });
  };

  // Multi Client Handlers
  const handleAddClient = () => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form) {
        const newClient: ClientFeedbackItem = {
          client_name: `Client ${form.clientsList.length + 1}`,
          client_rating: 4,
          client_feedback: "",
          client_recommendation: "Selected",
        };
        form.clientsList = [...form.clientsList, newClient];
      }
      return updated;
    });
  };

  const handleRemoveClient = (clientIdx: number) => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form && form.clientsList.length > 1) {
        form.clientsList = form.clientsList.filter((_, idx) => idx !== clientIdx);
      }
      return updated;
    });
  };

  const handleClientItemChange = (clientIdx: number, field: keyof ClientFeedbackItem, val: any) => {
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form && form.clientsList[clientIdx]) {
        const item = { ...form.clientsList[clientIdx], [field]: val };
        if (field === "client_recommendation") pickedVerdicts.add(pickKey(`cli:${clientIdx}`));
        if (field === "client_rating" && val !== undefined && !pickedVerdicts.has(pickKey(`cli:${clientIdx}`))) {
          const outcome = getAutoRatingOutcome(Number(val));
          item.client_recommendation = outcome.clientDecision;
        }
        form.clientsList[clientIdx] = item;

        if (clientIdx === 0) {
          form.client_rating = Number(item.client_rating ?? 0);
          form.client_name = item.client_name || "";
          form.client_recommendation = item.client_recommendation || "Selected";
        }
      }
      return updated;
    });
  };

  // Document Upload Handler (Uploads directly to AWS S3)
  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingDocFile(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadInterviewDocument(file);
        if (res?.s3_url) {
          uploadedUrls.push(res.s3_url);
        }
      }
      if (uploadedUrls.length > 0) {
        setFormsData((prev) => {
          const updated = [...prev];
          const form = updated[activeCandidateIndex];
          if (form) {
            const existing = form.interview_document_files
              ? form.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
              : [];
            const combined = Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
            form.interview_document_files = combined;
          }
          return updated;
        });
      }
    } catch (err: any) {
      console.error("Failed to upload document to S3:", err);
      toast(`Failed to upload document to S3: ${err.message || "Upload error"}`, "error");
    } finally {
      setIsUploadingDocFile(false);
      e.target.value = "";
    }
  };

  // Feedback Report Upload Handler (Uploads directly to AWS S3)
  const handleFeedbackReportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingFeedbackReportFile(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadInterviewDocument(file);
        if (res?.s3_url) {
          uploadedUrls.push(res.s3_url);
        }
      }
      if (uploadedUrls.length > 0) {
        setFormsData((prev) => {
          const updated = [...prev];
          const form = updated[activeCandidateIndex];
          if (form) {
            const existing = form.interview_feedback_files
              ? form.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)
              : [];
            const combined = Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
            form.interview_feedback_files = combined;
          }
          return updated;
        });
      }
    } catch (err: any) {
      console.error("Failed to upload feedback report to S3:", err);
      toast(`Failed to upload feedback report to S3: ${err.message || "Upload error"}`, "error");
    } finally {
      setIsUploadingFeedbackReportFile(false);
      e.target.value = "";
    }
  };

  const handleSubmitAll = async () => {
    try {
      setLoading(true);
      setError(null);

      const uId = currentUser?.id || (currentUser as any)?._id || "";
      const uEmail = (currentUser?.email || "").trim().toLowerCase();
      const uName = (currentUser?.full_name || "").trim().toLowerCase();

      const itemsPayload: BulkFeedbackItemPayload[] = formsData.map((f) => {
        const docFilesArray = f.interview_document_files
          ? Array.from(new Set(f.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)))
          : [];
        const feedbackReportFilesArray = f.interview_feedback_files
          ? Array.from(new Set(f.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)))
          : [];

        const origItem = selectedInterviews.find((i) => i.id === f.interview_id);

        let finalClientsList = f.clientsList;
        if (isClientUser && currentUser && origItem?.clients && origItem.clients.length > 0) {
          const otherClients = origItem.clients.filter((c) => {
            const matchId = c.client_id && c.client_id === uId;
            const matchEmail = c.client_email && c.client_email.trim().toLowerCase() === uEmail;
            const matchName = c.client_name && c.client_name.trim().toLowerCase() === uName;
            return !matchId && !matchEmail && !matchName;
          });
          finalClientsList = [...otherClients, ...(f.clientsList || [])];
        }

        let finalInterviewersList = f.interviewersList;
        if (isInterviewerUser && currentUser && origItem?.interviewers && origItem.interviewers.length > 0) {
          const otherInterviewers = origItem.interviewers.filter((i) => {
            const matchId = i.interviewer_id && i.interviewer_id === uId;
            const matchEmail = i.interviewer_email && i.interviewer_email.trim().toLowerCase() === uEmail;
            const matchName = i.interviewer_name && i.interviewer_name.trim().toLowerCase() === uName;
            return !matchId && !matchEmail && !matchName;
          });
          finalInterviewersList = [...otherInterviewers, ...(f.interviewersList || [])];
        }

        return {
          interview_id: f.interview_id,
          rating: f.rating ? Number(f.rating) : undefined,
          feedback: f.feedback || undefined,
          strengths: f.strengths ? f.strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          weaknesses: f.weaknesses ? f.weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          recommendation: f.recommendation || undefined,
          interviewers: (finalInterviewersList || []).filter(isFilledInterviewer),

          client_name: f.client_name || undefined,
          client_rating: f.client_rating ? Number(f.client_rating) : undefined,
          client_feedback: f.client_feedback || undefined,
          client_strengths: f.client_strengths ? f.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_weaknesses: f.client_weaknesses ? f.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_recommendation: f.client_recommendation || undefined,
          client_notes: f.client_notes || undefined,
          client_feedback_date: f.client_feedback_date || undefined,
          clients: (finalClientsList || []).filter(isFilledClient),

          skill_ratings: f.skill_ratings,
          category_scores: f.category_scores,
          ai_score: f.ai_score,
          ai_recommendation: f.ai_recommendation,

          candidate_requested_date: f.candidate_requested_date || undefined,
          candidate_requested_time: f.candidate_requested_time || undefined,
          candidate_requested_role: f.candidate_requested_role || undefined,
          salary_requested: f.salary_requested || undefined,
          final_fit_salary: f.final_fit_salary || undefined,
          joining_date: f.joining_date || undefined,
          interview_document_files: docFilesArray,
          interview_feedback_files: feedbackReportFilesArray,
          notes: f.notes || undefined,
        };
      });

      await bulkSubmitInterviewFeedback({ items: itemsPayload });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Bulk Feedback Submission Failed:", err);
      setError(err.message || "Failed to submit bulk interview feedback.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-2 md:p-4 font-sans animate-in fade-in duration-300">
      <div className="bg-slate-50 border border-slate-200/80 rounded-3xl w-full max-w-[98vw] h-[95vh] flex flex-col shadow-2xl overflow-hidden relative text-slate-900">
        
        {/* 1. TOP STICKY WORKSPACE HEADER BAR */}
        <header className="flex flex-nowrap items-center justify-between gap-3 px-5 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex-shrink-0 sticky top-0 z-20">
          {/* Left Title & Stepper info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl shadow-xs">
              <Sparkles size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight whitespace-nowrap">
                  {selectedInterviews.length === 1
                    ? `Feedback: ${selectedInterviews[0].candidate_name}`
                    : `Feedback for ${selectedInterviews.length} candidates`}
                </h2>
                {formsData.length > 1 && (
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                    Candidate {activeCandidateIndex + 1} of {formsData.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                Assess individual candidate technical round, panel interviewers & client evaluators
              </p>
            </div>
          </div>

          {/* Right Panel Tab Switcher & Actions */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {currentForm && (
              isClientUser ? (
                <div className="px-3 py-1 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-2xs">
                  <Building2 size={14} />
                  <span>Client Evaluator Feedback</span>
                </div>
              ) : isInterviewerUser ? (
                <div className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-2xs">
                  <UserCheck size={14} />
                  <span>Panel Interviewer Feedback</span>
                </div>
              ) : (
                <div className="flex items-center p-0.5 bg-slate-100/80 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleCurrentFormChange("feedbackTab", "INTERVIEWER")}
                    className={`px-3 py-1 rounded-lg font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      currentForm.feedbackTab === "INTERVIEWER"
                        ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <UserCheck size={14} />
                    Panel Interviewers
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCurrentFormChange("feedbackTab", "CLIENT")}
                    className={`px-3 py-1 rounded-lg font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      currentForm.feedbackTab === "CLIENT"
                        ? "bg-white text-teal-700 shadow-xs border border-slate-200/80"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Building2 size={14} />
                    Client Evaluators
                  </button>
                </div>
              )
            )}

            <div className="flex items-center gap-2 border-l border-slate-200 pl-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg font-extrabold transition-all cursor-pointer text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitAll}
                disabled={loading}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white rounded-lg font-extrabold shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-95 text-xs"
              >
                {loading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Submitting All...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>{selectedInterviews.length === 1 ? "Save feedback" : `Save feedback for ${selectedInterviews.length}`}</span>
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-800 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer shadow-xs"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* 2. CANDIDATE STEPPER / TABS NAVIGATION BAR */}
        <div className="bg-slate-100/90 px-5 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            {formsData.map((f, idx) => {
              const isActive = idx === activeCandidateIndex;
              return (
                <button
                  key={f.interview_id}
                  type="button"
                  onClick={() => setActiveCandidateIndex(idx)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm scale-[1.02]"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-extrabold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[130px]">{f.candidate_name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={activeCandidateIndex === 0}
              onClick={() => setActiveCandidateIndex((prev) => prev - 1)}
              className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <span className="text-[11px] font-bold text-slate-500">
              {activeCandidateIndex + 1} / {formsData.length}
            </span>
            <button
              type="button"
              disabled={activeCandidateIndex === formsData.length - 1}
              onClick={() => setActiveCandidateIndex((prev) => prev + 1)}
              className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold disabled:opacity-40 hover:bg-slate-50 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* 3. MAIN DASHBOARD CONTENT AREA FOR CURRENT CANDIDATE */}
        {currentForm && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold flex items-center gap-2">
                <span>⚠️ {error}</span>
              </div>
            )}

            {/* CANDIDATE PROFILE BANNER */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 text-white font-black text-sm flex items-center justify-center shadow-xs">
                  {currentForm.candidate_name ? currentForm.candidate_name.charAt(0).toUpperCase() : "C"}
                </div>

                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      {currentForm.candidate_name}
                    </h3>
                    <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      currentForm.ai_recommendation === "Strong Hire" || currentForm.ai_recommendation === "Selected"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : currentForm.ai_recommendation === "Hire"
                        ? "bg-teal-50 border-teal-200 text-teal-700"
                        : currentForm.ai_recommendation === "Hold"
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}>
                      {currentForm.ai_recommendation} ({currentForm.ai_score}/100)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-[11px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">
                      {currentForm.job_title} ({currentForm.interview_type} - R{currentForm.round_number})
                    </span>
                    {currentForm.scheduled_date && (
                      <span className="bg-slate-100 border border-slate-200/80 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                        <Calendar size={11} className="text-slate-500" />
                        {currentForm.scheduled_date} at {currentForm.scheduled_time || "10:00"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3-COLUMN WORKSPACE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* LEFT SIDEBAR NAVIGATION (2 COLS) */}
              <div className="lg:col-span-2 hidden lg:block space-y-1.5 sticky top-0 self-start">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-3 block mb-2">
                  Evaluation Workspace
                </span>
                
                {!isClientUser && (
                  <a
                    href="#sec-interviewer"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                  >
                    <UserCheck size={15} className="text-indigo-600" />
                    <span>Panel Feedback</span>
                  </a>
                )}

                {isClientUser && (
                  <a
                    href="#sec-interviewer"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-teal-600 border border-transparent hover:border-slate-200/80 transition-all"
                  >
                    <Building2 size={15} className="text-teal-600" />
                    <span>Client Feedback</span>
                  </a>
                )}

                <a
                  href="#sec-skills"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                >
                  <Star size={15} className="text-amber-500" />
                  <span>Skill Assessment</span>
                </a>

                {showOfferDetails && (
                  <a
                    href="#sec-compensation"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                  >
                    <DollarSign size={15} className="text-emerald-600" />
                    <span>Offer details</span>
                  </a>
                )}

                <a
                  href="#sec-documents"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                >
                  <FileText size={15} className="text-rose-600" />
                  <span>Documents & Notes</span>
                </a>
              </div>

              {/* MAIN CONTENT AREA (7 COLS) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* SECTION 1: PANEL INTERVIEWER / CLIENT CARDS SECTION */}
                <div id="sec-interviewer" className="space-y-4">
                  {currentForm.feedbackTab === "INTERVIEWER" && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <UserCheck size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-900">Panel Interviewers Evaluation</h3>
                            <p className="text-[11px] text-slate-500 font-medium">Record individual ratings & observations</p>
                          </div>
                        </div>
                          {!isInterviewerUser && (
                            <button
                              type="button"
                              onClick={handleAddInterviewer}
                              className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-sm active:scale-95"
                            >
                              <Plus size={14} /> Add Interviewer
                            </button>
                          )}
                        </div>

                        {currentForm.interviewersList.map((interviewer, intIdx) => (
                          <div key={intIdx} className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm relative hover:border-indigo-200 transition-all">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center justify-center">
                                  {interviewer.interviewer_name ? interviewer.interviewer_name.charAt(0).toUpperCase() : "I"}
                                </div>
                                <span className="font-extrabold text-slate-900 text-sm">Interviewer #{intIdx + 1}</span>
                              </div>
                              {!isInterviewerUser && currentForm.interviewersList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInterviewer(intIdx)}
                                  className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Remove
                                </button>
                              )}
                            </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Select Registered User</label>
                              <select
                                value={interviewer.interviewer_id || (interviewer.interviewer_name ? "custom" : "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "custom" || !val) {
                                    handleInterviewerItemChange(intIdx, "interviewer_id", undefined);
                                    handleInterviewerItemChange(intIdx, "interviewer_email", undefined);
                                  } else {
                                    const u = systemUsers.find((user) => user.id === val);
                                    if (u) {
                                      handleInterviewerItemChange(intIdx, "interviewer_id", u.id);
                                      handleInterviewerItemChange(intIdx, "interviewer_name", u.full_name);
                                      handleInterviewerItemChange(intIdx, "interviewer_email", u.email);
                                    }
                                  }
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                              >
                                <option value="">-- Choose Interviewer User --</option>
                                {systemUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.full_name} ({u.role || u.email})
                                  </option>
                                ))}
                                <option value="custom">+ External / Custom</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Interviewer Name *</label>
                              <input
                                type="text"
                                value={interviewer.interviewer_name}
                                onChange={(e) => handleInterviewerItemChange(intIdx, "interviewer_name", e.target.value)}
                                placeholder="Interviewer Name"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Interviewer Email</label>
                              <input
                                type="email"
                                value={interviewer.interviewer_email || ""}
                                onChange={(e) => handleInterviewerItemChange(intIdx, "interviewer_email", e.target.value)}
                                placeholder="interviewer@company.com"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Interviewer Rating (1-5)</label>
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="5"
                                value={interviewer.rating ?? ""}
                                placeholder="Not rated"
                                onChange={(e) => handleInterviewerItemChange(intIdx, "rating", e.target.value === "" ? undefined : Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Recommendation</label>
                              <select
                                value={interviewer.recommendation || "Pending"}
                                onChange={(e) => handleInterviewerItemChange(intIdx, "recommendation", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-emerald-700 focus:bg-white focus:outline-none cursor-pointer"
                              >
                                {RECOMMENDATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Conditional Multiple-Selection Observation Reasons Dropdown for Interviewer Rating < 5 */}
                          {(interviewer.rating ?? 0) < 5 && (
                            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fadeIn">
                              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <HelpCircle size={14} className="text-amber-600" />
                                Select Observations for Rating below 5/5 (Interview Type: {currentForm.interview_type})
                              </label>
                              <div className="max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                {questionOptions
                                  .filter(opt => opt && !opt.startsWith("--"))
                                  .map((opt, optIdx) => {
                                    const isChecked = interviewer.feedback?.includes(opt);
                                    return (
                                      <label key={optIdx} className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            let currentFeedback = interviewer.feedback || "";
                                            if (e.target.checked) {
                                              if (!currentFeedback.includes(opt)) {
                                                currentFeedback = currentFeedback ? `${currentFeedback}\n- ${opt}` : `- ${opt}`;
                                              }
                                            } else {
                                              currentFeedback = currentFeedback
                                                .replace(new RegExp(`\\n?- ${opt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g'), "")
                                                .replace(new RegExp(`- ${opt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\n?`, 'g'), "")
                                                .trim();
                                            }
                                            handleInterviewerItemChange(intIdx, "feedback", currentFeedback);
                                          }}
                                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {/* SELECTABLE OBSERVATION CHIPS */}
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-600 block">Quick Observation Reasons (Click to append)</label>
                            <div className="flex flex-wrap gap-1.5">
                              {["Technical Skills", "Communication", "System Design", "Problem Solving", "Architecture", "Culture Fit", "Behavior"].map((chip, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => {
                                    const newFb = interviewer.feedback ? `${interviewer.feedback}\nObservation: ${chip}` : chip;
                                    handleInterviewerItemChange(intIdx, "feedback", newFb);
                                  }}
                                  className="bg-slate-100 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-slate-700 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                >
                                  + {chip}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Strengths (Comma-separated)</label>
                              <input
                                type="text"
                                value={interviewer.strengths ? (Array.isArray(interviewer.strengths) ? interviewer.strengths.join(", ") : interviewer.strengths) : ""}
                                onChange={(e) => {
                                  const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                  handleInterviewerItemChange(intIdx, "strengths", list);
                                }}
                                placeholder="e.g. Problem Solving, React"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Weaknesses / Areas for Improvement</label>
                              <input
                                type="text"
                                value={interviewer.weaknesses ? (Array.isArray(interviewer.weaknesses) ? interviewer.weaknesses.join(", ") : interviewer.weaknesses) : ""}
                                onChange={(e) => {
                                  const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                  handleInterviewerItemChange(intIdx, "weaknesses", list);
                                }}
                                placeholder="e.g. System Design edge cases"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Interviewer Round Feedback Comments</label>
                            <textarea
                              rows={2}
                              value={interviewer.feedback || ""}
                              onChange={(e) => handleInterviewerItemChange(intIdx, "feedback", e.target.value)}
                              placeholder="Provide technical evaluation feedback..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none resize-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentForm.feedbackTab === "CLIENT" && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-900">Client Panel Evaluators</h3>
                            <p className="text-[11px] text-slate-500 font-medium">Manage client team feedback</p>
                          </div>
                        </div>
                          {!isClientUser && (
                            <button
                              type="button"
                              onClick={handleAddClient}
                              className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-sm active:scale-95"
                            >
                              <Plus size={14} /> Add Client Evaluator
                            </button>
                          )}
                        </div>

                        {currentForm.clientsList.map((client, clientIdx) => (
                          <div key={clientIdx} className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm relative hover:border-teal-200 transition-all">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 font-bold text-xs flex items-center justify-center">
                                  {client.client_name ? client.client_name.charAt(0).toUpperCase() : "C"}
                                </div>
                                <span className="font-extrabold text-slate-900 text-sm">Client Evaluator #{clientIdx + 1}</span>
                              </div>
                              {!isClientUser && currentForm.clientsList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClient(clientIdx)}
                                  className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Remove
                                </button>
                              )}
                            </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Select Registered User</label>
                              <select
                                value={client.client_id || (client.client_name ? "custom" : "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "custom" || !val) {
                                    handleClientItemChange(clientIdx, "client_id", undefined);
                                    handleClientItemChange(clientIdx, "client_email", undefined);
                                  } else {
                                    const u = systemUsers.find((user) => user.id === val);
                                    if (u) {
                                      handleClientItemChange(clientIdx, "client_id", u.id);
                                      handleClientItemChange(clientIdx, "client_name", u.full_name);
                                      handleClientItemChange(clientIdx, "client_email", u.email);
                                    }
                                  }
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-teal-500 cursor-pointer"
                              >
                                <option value="">-- Choose Client User --</option>
                                {systemUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.full_name} ({u.role || u.email})
                                  </option>
                                ))}
                                <option value="custom">+ External / Custom</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Client Name / Company</label>
                              <input
                                type="text"
                                value={client.client_name}
                                onChange={(e) => handleClientItemChange(clientIdx, "client_name", e.target.value)}
                                placeholder="Client Evaluator Name"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Client Email</label>
                              <input
                                type="email"
                                value={client.client_email || ""}
                                onChange={(e) => handleClientItemChange(clientIdx, "client_email", e.target.value)}
                                placeholder="client@company.com"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Client Rating (1-5)</label>
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="5"
                                value={client.client_rating ?? ""}
                                placeholder="Not rated"
                                onChange={(e) => handleClientItemChange(clientIdx, "client_rating", e.target.value === "" ? undefined : Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Client Recommendation</label>
                              <select
                                value={client.client_recommendation || "Pending"}
                                onChange={(e) => handleClientItemChange(clientIdx, "client_recommendation", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-teal-700 focus:bg-white focus:outline-none cursor-pointer"
                              >
                                {RECOMMENDATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Conditional Multiple-Selection Observation Reasons Dropdown for Client Rating < 5 */}
                          {(client.client_rating ?? 0) < 5 && (
                            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fadeIn">
                              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                <HelpCircle size={14} className="text-amber-600" />
                                Select Observations for Client Rating below 5/5 (Interview Type: {currentForm.interview_type})
                              </label>
                              <div className="max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                {questionOptions
                                  .filter(opt => opt && !opt.startsWith("--"))
                                  .map((opt, optIdx) => {
                                    const isChecked = client.client_feedback?.includes(opt);
                                    return (
                                      <label key={optIdx} className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            let currentFeedback = client.client_feedback || "";
                                            if (e.target.checked) {
                                              if (!currentFeedback.includes(opt)) {
                                                currentFeedback = currentFeedback ? `${currentFeedback}\n- ${opt}` : `- ${opt}`;
                                              }
                                            } else {
                                              currentFeedback = currentFeedback
                                                .replace(new RegExp(`\\n?- ${opt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g'), "")
                                                .replace(new RegExp(`- ${opt.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\n?`, 'g'), "")
                                                .trim();
                                            }
                                            handleClientItemChange(clientIdx, "client_feedback", currentFeedback);
                                          }}
                                          className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Strengths (Comma-separated)</label>
                              <input
                                type="text"
                                value={client.client_strengths ? (Array.isArray(client.client_strengths) ? client.client_strengths.join(", ") : client.client_strengths) : ""}
                                onChange={(e) => {
                                  const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                  handleClientItemChange(clientIdx, "client_strengths", list);
                                }}
                                placeholder="e.g. Domain knowledge, Communication"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Weaknesses / Areas for Improvement</label>
                              <input
                                type="text"
                                value={client.client_weaknesses ? (Array.isArray(client.client_weaknesses) ? client.client_weaknesses.join(", ") : client.client_weaknesses) : ""}
                                onChange={(e) => {
                                  const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                  handleClientItemChange(clientIdx, "client_weaknesses", list);
                                }}
                                placeholder="e.g. English fluency"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Client Detailed Feedback Comments</label>
                            <textarea
                              rows={2}
                              value={client.client_feedback || ""}
                              onChange={(e) => handleClientItemChange(clientIdx, "client_feedback", e.target.value)}
                              placeholder="Provide client detailed feedback notes..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none resize-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SKILL ASSESSMENT DASHBOARD SECTION (CATEGORY-WISE WEIGHTED EVALUATION) */}
                <div id="sec-skills">
                  <SkillRatingsEvaluation
                    skillRatings={currentForm.skill_ratings}
                    onChangeSkills={(newSkills) => handleCurrentFormChange("skill_ratings", newSkills)}
                    categoryScores={currentForm.category_scores}
                    onChangeCategoryScores={(newCatScores) => handleCurrentFormChange("category_scores", newCatScores)}
                    currentRoundNumber={currentForm.round_number}
                    currentInterviewType={currentForm.interview_type}
                    hrCallVerification={selectedInterviews[activeCandidateIndex]?.hr_call_verification}
                    onAiScoreCalculated={(score, rec) => {
                      setFormsData((prev) => {
                        const updated = [...prev];
                        const form = updated[activeCandidateIndex];
                        if (form) {
                          form.ai_score = score;
                          form.ai_recommendation = rec;
                        }
                        return updated;
                      });
                    }}
                  />
                </div>

                {/* Offer details open by themselves after a Selected verdict (or when already filled),
                    and can always be opened by hand so nothing is out of reach */}
                {!showOfferDetails && (
                  <button
                    type="button"
                    onClick={() => setOfferOpened((prev) => new Set(prev).add(activeCandidateIndex))}
                    className="w-full text-left px-4 py-3 rounded-2xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-white cursor-pointer"
                  >
                    + Add offer and candidate request details (salary, joining date, requested slot and role)
                  </button>
                )}
                {showOfferDetails && (
                <div id="sec-compensation" className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
                    <DollarSign size={18} className="text-emerald-600" />
                    <h3 className="text-sm font-extrabold text-slate-900">Offer details</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* KPI Card 1: Requested Salary */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                        <DollarSign size={14} className="text-amber-600" /> Requested Salary
                      </span>
                      <input
                        type="text"
                        value={currentForm.salary_requested}
                        onChange={(e) => handleCurrentFormChange("salary_requested", e.target.value)}
                        placeholder="e.g. 50000"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-extrabold text-amber-700 focus:bg-white focus:outline-none"
                      />
                    </div>

                    {/* Candidate's requested interview slot (was in the old single-interview form) */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700">Candidate's requested date and time</span>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          aria-label="Candidate's requested date"
                          value={currentForm.candidate_requested_date}
                          onChange={(e) => handleCurrentFormChange("candidate_requested_date", e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-none"
                        />
                        <input
                          type="time"
                          aria-label="Candidate's requested time"
                          value={currentForm.candidate_requested_time}
                          onChange={(e) => handleCurrentFormChange("candidate_requested_time", e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* KPI Card 2: Final Fit Salary */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-emerald-600" /> Final Fit Salary
                      </span>
                      <input
                        type="text"
                        value={currentForm.final_fit_salary}
                        onChange={(e) => handleCurrentFormChange("final_fit_salary", e.target.value)}
                        placeholder="e.g. 45000"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-extrabold text-emerald-600 focus:bg-white focus:outline-none"
                      />
                    </div>

                    {/* KPI Card 3: Requested Work Role */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[11px] font-bold text-indigo-800 flex items-center gap-1.5">
                        <Briefcase size={14} className="text-indigo-600" /> Requested Work Role
                      </span>
                      <input
                        type="text"
                        value={currentForm.candidate_requested_role}
                        onChange={(e) => handleCurrentFormChange("candidate_requested_role", e.target.value)}
                        placeholder="e.g. Senior Tech Lead"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>

                    {/* KPI Card 4: Expected Joining Date */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
                      <span className="text-[11px] font-bold text-indigo-800 flex items-center gap-1.5">
                        <Calendar size={14} className="text-indigo-600" /> Expected Joining Date
                      </span>
                      <input
                        type="date"
                        value={currentForm.joining_date}
                        onChange={(e) => handleCurrentFormChange("joining_date", e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                )}

                {/* DOCUMENTS & NOTES SECTION */}
                <div id="sec-documents" className="space-y-4">
                  {/* CARD 1: SESSION & CANDIDATE ATTACHED DOCUMENTS */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-rose-600" />
                        <h3 className="text-sm font-extrabold text-slate-900">Session & Candidate Attached Documents</h3>
                      </div>
                      <label className={`inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3.5 py-1.5 rounded-xl cursor-pointer font-bold transition-all shadow-xs ${isUploadingDocFile ? "opacity-60 pointer-events-none" : ""}`}>
                        {isUploadingDocFile ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-indigo-600" />
                            <span>Uploading to S3...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Browse / Attach File</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          onChange={handleDocFileUpload}
                          disabled={isUploadingDocFile}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* ATTACHED FILES LIST CARDS WITH VIEW BUTTON */}
                    {(() => {
                      const attachedList = currentForm.interview_document_files
                        ? Array.from(new Set(currentForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)))
                        : [];
                      if (attachedList.length === 0) return null;
                      return (
                        <div className="space-y-1.5 mb-2 mt-1">
                          {attachedList.map((fileStr, idx) => {
                            const isUrl = fileStr.startsWith("http://") || fileStr.startsWith("https://");
                            const rawName = fileStr.split("/").pop() || fileStr;
                            const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                            return (
                              <div key={idx} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText size={15} className="text-rose-600 shrink-0" />
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
                                      className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3 py-1 rounded-lg font-bold transition-all shadow-2xs"
                                    >
                                      <Eye size={13} />
                                      <span>View</span>
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = attachedList.filter((_, i) => i !== idx).join("\n");
                                      handleCurrentFormChange("interview_document_files", updated);
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                                    title="Remove attachment"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* CARD 2: INTERVIEW FEEDBACK & ROUND ASSESSMENT REPORTS */}
                  <div className="bg-amber-50/40 border border-amber-200/90 rounded-2xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                      <div className="flex items-center gap-2 text-amber-900">
                        <ShieldCheck size={18} className="text-amber-600" />
                        <h3 className="text-sm font-extrabold">Interview Feedback & Round Assessment Reports</h3>
                      </div>
                      <label className={`inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs px-3.5 py-1.5 rounded-xl cursor-pointer font-bold transition-all shadow-xs ${isUploadingFeedbackReportFile ? "opacity-60 pointer-events-none" : ""}`}>
                        {isUploadingFeedbackReportFile ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-amber-700" />
                            <span>Uploading to S3...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Browse / Attach Feedback File</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          onChange={handleFeedbackReportFileUpload}
                          disabled={isUploadingFeedbackReportFile}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* FEEDBACK REPORT FILES CARDS WITH VIEW BUTTON */}
                    {(() => {
                      const feedbackReportList = currentForm.interview_feedback_files
                        ? Array.from(new Set(currentForm.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)))
                        : [];
                      if (feedbackReportList.length === 0) return null;
                      return (
                        <div className="space-y-1.5 mb-2 mt-1">
                          {feedbackReportList.map((fileStr, idx) => {
                            const isUrl = fileStr.startsWith("http://") || fileStr.startsWith("https://");
                            const rawName = fileStr.split("/").pop() || fileStr;
                            const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                            return (
                              <div key={idx} className="flex items-center justify-between gap-2 bg-white border border-amber-200/90 rounded-xl px-3.5 py-2 shadow-2xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText size={15} className="text-amber-600 shrink-0" />
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
                                      className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-lg font-bold transition-all shadow-2xs"
                                    >
                                      <Eye size={13} />
                                      <span>View</span>
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = feedbackReportList.filter((_, i) => i !== idx).join("\n");
                                      handleCurrentFormChange("interview_feedback_files", updated);
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                                    title="Remove attachment"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <AlignLeft size={16} className="text-indigo-600" /> Special Prep Notes & Instructions
                    </span>
                    <textarea
                      rows={3}
                      value={currentForm.notes}
                      onChange={(e) => handleCurrentFormChange("notes", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none"
                      placeholder="Enter candidate prep notes or internal evaluator instructions..."
                    />
                  </div>
                </div>

              </div>

              {/* RIGHT FLOATING STICKY AI SUMMARY PANEL (3 COLS) */}
              <div className="lg:col-span-3 space-y-5 sticky top-0 self-start">
                
                {/* STICKY AI DASHBOARD SCORE GAUGE CARD */}
                <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-4 border border-indigo-700/50">
                  <div className="flex items-center justify-between border-b border-indigo-700/50 pb-3">
                    <span className="text-xs font-extrabold text-indigo-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sparkles size={16} className="text-cyan-400" /> AI Evaluation Index
                    </span>
                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                      currentForm.ai_recommendation === "Strong Hire" || currentForm.ai_recommendation === "Selected"
                        ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                        : currentForm.ai_recommendation === "Hire"
                        ? "bg-teal-500/20 border-teal-400/40 text-teal-300"
                        : currentForm.ai_recommendation === "Hold"
                        ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                        : "bg-rose-500/20 border-rose-400/40 text-rose-300"
                    }`}>
                      {currentForm.ai_recommendation}
                    </span>
                  </div>

                  <div className="text-center py-2 space-y-1">
                    <div className="text-4xl font-black tracking-tight text-white">
                      {currentForm.ai_score} <span className="text-sm font-bold text-indigo-300">/ 100</span>
                    </div>
                    <span className="text-[11px] text-indigo-200 font-semibold uppercase tracking-widest block">
                      Live Weighted Score
                    </span>
                  </div>

                  {/* LIVE METRICS SUMMARY LIST */}
                  <div className="space-y-2 pt-2 border-t border-indigo-700/50 text-xs">
                    <div className="flex justify-between items-center text-indigo-200">
                      <span>Panel Interviewers:</span>
                      <span className="font-bold text-white">{currentForm.interviewersList.length} Member(s)</span>
                    </div>

                    <div className="flex justify-between items-center text-indigo-200">
                      <span>Client Evaluators:</span>
                      <span className="font-bold text-white">{currentForm.clientsList.length} Member(s)</span>
                    </div>

                    <div className="flex justify-between items-center text-indigo-200">
                      <span>AI Hiring Readiness:</span>
                      <span className={`font-bold ${
                        currentForm.ai_recommendation === "Strong Hire" || currentForm.ai_recommendation === "Hire"
                          ? "text-emerald-400"
                          : currentForm.ai_recommendation === "Hold"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}>{currentForm.ai_recommendation}</span>
                    </div>
                  </div>
                </div>

                {/* The candidate's real rounds (was a hard-coded HR / Technical / Managerial list) */}
                <RoundsTracker
                  candidateId={selectedInterviews[activeCandidateIndex]?.candidate_id}
                  currentInterviewId={currentForm.interview_id}
                />

              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
};
