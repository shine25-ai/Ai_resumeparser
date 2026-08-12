import React, { useState, useEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, UserCheck,
  Building2, DollarSign, Sparkles, HelpCircle, Plus, Trash2,
  Star, FileText, Upload, Calendar, RefreshCw, ShieldCheck,
  AlignLeft, Briefcase, TrendingUp
} from "lucide-react";
import {
  bulkSubmitInterviewFeedback,
  getUsers,
  type InterviewItem,
  type BulkFeedbackItemPayload,
  type InterviewerItem,
  type ClientFeedbackItem,
  type UserProfile,
} from "../utils/Api";
import type { CategoryScoreItem } from "../types/interview";
import { SkillRatingsEvaluation } from "./SkillRatingsEvaluation";
import { getFeedbackQuestionsAsync, getAutoRatingOutcome } from "../utils/feedbackHelpers";

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
  notes: string;
}

export const BulkFeedbackModal: React.FC<BulkFeedbackModalProps> = ({
  isOpen,
  onClose,
  selectedInterviews,
  onSuccess,
}) => {
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);
  const [formsData, setFormsData] = useState<SingleCandidateFeedbackForm[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  const [questionOptions, setQuestionOptions] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      getUsers().then((users) => setSystemUsers(users)).catch(() => setSystemUsers([]));
    }
  }, [isOpen]);

  // Initialize form state when selectedInterviews change or modal opens
  useEffect(() => {
    if (selectedInterviews && selectedInterviews.length > 0) {
      const initialForms: SingleCandidateFeedbackForm[] = selectedInterviews.map((item) => {
        const initInterviewers: InterviewerItem[] =
          item.interviewers && item.interviewers.length > 0
            ? item.interviewers
            : [
                {
                  interviewer_name: item.interviewer_name || "Interviewer 1",
                  interviewer_email: item.interviewer_email || "",
                  rating: item.rating || 4,
                  feedback: item.feedback || "",
                  recommendation: item.recommendation || "Selected",
                  strengths: item.strengths || [],
                  weaknesses: item.weaknesses || [],
                },
              ];

        const initClients: ClientFeedbackItem[] =
          item.clients && item.clients.length > 0
            ? item.clients
            : [
                {
                  client_name: item.client_name || "Client Evaluator 1",
                  client_rating: item.client_rating || 4,
                  client_feedback: item.client_feedback || "",
                  client_recommendation: item.client_recommendation || "Selected",
                  client_notes: item.client_notes || "",
                },
              ];

        const initSkills =
          item.skill_ratings && item.skill_ratings.length > 0
            ? item.skill_ratings
            : [
                { skill_name: "Java", rating: 1 },
                { skill_name: "SQL", rating: 1 },
                { skill_name: "DATA BRICKS", rating: 1 },
              ];

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

          feedbackTab: "INTERVIEWER",
          
          rating: item.rating || 4,
          feedback: item.feedback || "",
          strengths: item.strengths ? item.strengths.join(", ") : "",
          weaknesses: item.weaknesses ? item.weaknesses.join(", ") : "",
          recommendation: item.recommendation || "Selected",
          interviewersList: initInterviewers,

          client_name: item.client_name || "",
          client_rating: item.client_rating || 4,
          client_feedback: item.client_feedback || "",
          client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
          client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
          client_recommendation: item.client_recommendation || "Selected",
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
          interview_document_files: item.interview_document_files ? item.interview_document_files.join("\n") : "",
          notes: item.notes || "",
        };
      });
      setFormsData(initialForms);
      setActiveCandidateIndex(0);
    }
  }, [selectedInterviews, isOpen]);

  useEffect(() => {
    if (selectedInterviews && selectedInterviews[activeCandidateIndex]) {
      const type = selectedInterviews[activeCandidateIndex].interview_type;
      getFeedbackQuestionsAsync(type).then((opts) => setQuestionOptions(opts));
    }
  }, [activeCandidateIndex, selectedInterviews]);

  if (!isOpen || selectedInterviews.length === 0) return null;

  const currentForm = formsData[activeCandidateIndex] || formsData[0];

  const handleCurrentFormChange = (field: keyof SingleCandidateFeedbackForm, value: any) => {
    setFormsData((prev) => {
      const updated = [...prev];
      if (updated[activeCandidateIndex]) {
        const item = {
          ...updated[activeCandidateIndex],
          [field]: value,
        };

        if (field === "rating") {
          const outcome = getAutoRatingOutcome(Number(value));
          item.recommendation = outcome.recommendation;
        }

        if (field === "client_rating") {
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
        if (field === "rating") {
          const outcome = getAutoRatingOutcome(Number(val));
          item.recommendation = outcome.recommendation;
        }
        form.interviewersList[intIdx] = item;

        if (intIdx === 0) {
          form.rating = Number(item.rating || 4);
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
        if (field === "client_rating") {
          const outcome = getAutoRatingOutcome(Number(val));
          item.client_recommendation = outcome.clientDecision;
        }
        form.clientsList[clientIdx] = item;

        if (clientIdx === 0) {
          form.client_rating = Number(item.client_rating || 4);
          form.client_name = item.client_name || "";
          form.client_recommendation = item.client_recommendation || "Selected";
        }
      }
      return updated;
    });
  };

  // Document Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileNames = Array.from(files).map((f) => f.name).join("\n");
    setFormsData((prev) => {
      const updated = [...prev];
      const form = updated[activeCandidateIndex];
      if (form) {
        form.interview_document_files = form.interview_document_files
          ? `${form.interview_document_files}\n${fileNames}`
          : fileNames;
      }
      return updated;
    });
  };

  const handleSubmitAll = async () => {
    try {
      setLoading(true);
      setError(null);

      const itemsPayload: BulkFeedbackItemPayload[] = formsData.map((f) => {
        const docFilesArray = f.interview_document_files
          ? f.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];

        return {
          interview_id: f.interview_id,
          rating: Number(f.rating),
          feedback: f.feedback || undefined,
          strengths: f.strengths ? f.strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          weaknesses: f.weaknesses ? f.weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          recommendation: f.recommendation || undefined,
          interviewers: f.interviewersList,

          client_name: f.client_name || undefined,
          client_rating: f.client_rating ? Number(f.client_rating) : undefined,
          client_feedback: f.client_feedback || undefined,
          client_strengths: f.client_strengths ? f.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_weaknesses: f.client_weaknesses ? f.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_recommendation: f.client_recommendation || undefined,
          client_notes: f.client_notes || undefined,
          client_feedback_date: f.client_feedback_date || undefined,
          clients: f.clientsList,

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
                  Bulk Feedback Workspace ({selectedInterviews.length} Candidates)
                </h2>
                <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  Candidate {activeCandidateIndex + 1} of {formsData.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                Assess individual candidate technical round, panel interviewers & client evaluators
              </p>
            </div>
          </div>

          {/* Right Panel Tab Switcher & Actions */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {currentForm && (
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
                    <span>Save & Submit All Bulk Feedback</span>
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
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-extrabold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
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
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border whitespace-nowrap ${
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
                    <span className="bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap">
                      {currentForm.job_title} ({currentForm.interview_type} - R{currentForm.round_number})
                    </span>
                    {currentForm.scheduled_date && (
                      <span className="bg-slate-100 border border-slate-200/80 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 block mb-2">
                  Evaluation Workspace
                </span>
                
                <a
                  href="#sec-interviewer"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                >
                  <UserCheck size={15} className="text-indigo-600" />
                  <span>Panel Feedback</span>
                </a>

                <a
                  href="#sec-skills"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                >
                  <Star size={15} className="text-amber-500" />
                  <span>Skill Assessment</span>
                </a>

                <a
                  href="#sec-compensation"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200/80 transition-all"
                >
                  <DollarSign size={15} className="text-emerald-600" />
                  <span>Compensation & Role</span>
                </a>

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
                        <button
                          type="button"
                          onClick={handleAddInterviewer}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          <Plus size={14} /> Add Interviewer
                        </button>
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
                            {currentForm.interviewersList.length > 1 && (
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
                                value={interviewer.rating || 4}
                                onChange={(e) => handleInterviewerItemChange(intIdx, "rating", Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Recommendation</label>
                              <select
                                value={interviewer.recommendation || "Selected"}
                                onChange={(e) => handleInterviewerItemChange(intIdx, "recommendation", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-emerald-700 focus:bg-white focus:outline-none cursor-pointer"
                              >
                                <option value="Selected">🟢 Selected</option>
                                <option value="Rejected">🔴 Rejected</option>
                                <option value="Pending">🟡 Pending</option>
                                <option value="Hold">Hold</option>
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
                        <button
                          type="button"
                          onClick={handleAddClient}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          <Plus size={14} /> Add Client Evaluator
                        </button>
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
                            {currentForm.clientsList.length > 1 && (
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
                                value={client.client_rating || 4}
                                onChange={(e) => handleClientItemChange(clientIdx, "client_rating", Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">Client Recommendation</label>
                              <select
                                value={client.client_recommendation || "Selected"}
                                onChange={(e) => handleClientItemChange(clientIdx, "client_recommendation", e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-teal-700 focus:bg-white focus:outline-none cursor-pointer"
                              >
                                <option value="Selected">🟢 Selected</option>
                                <option value="Rejected">🔴 Rejected</option>
                                <option value="Next Round">🔄 Next Round</option>
                                <option value="Hold">Hold</option>
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

                {/* COMPENSATION & ROLE KPI CARDS SECTION */}
                <div id="sec-compensation" className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2">
                    <DollarSign size={18} className="text-emerald-600" />
                    <h3 className="text-sm font-extrabold text-slate-900">Compensation & Role Details</h3>
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

                {/* DOCUMENTS & NOTES SECTION */}
                <div id="sec-documents" className="space-y-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-rose-600" />
                        <h3 className="text-sm font-extrabold text-slate-900">Attached Documents & Media</h3>
                      </div>
                      <label className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3.5 py-1.5 rounded-xl cursor-pointer font-bold transition-all shadow-xs">
                        <Upload size={13} />
                        <span>Browse / Attach File</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <textarea
                      rows={2}
                      value={currentForm.interview_document_files}
                      onChange={(e) => handleCurrentFormChange("interview_document_files", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none font-mono text-xs"
                      placeholder="Document names or URLs (one per line)..."
                    />
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

                {/* HIRING WORKFLOW STAGE PROGRESS CARD */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
                  <span className="text-xs font-extrabold text-slate-900 block uppercase tracking-wider">
                    Hiring Stage Tracker
                  </span>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold border border-emerald-200">
                      <ShieldCheck size={14} /> HR Screening (Verified)
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-indigo-50 text-indigo-700 rounded-xl font-bold border border-indigo-200">
                      <UserCheck size={14} /> Technical Round {currentForm.round_number || 1} (In Progress)
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-slate-50 text-slate-400 rounded-xl font-medium border border-slate-200">
                      Managerial Round (Upcoming)
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
};
