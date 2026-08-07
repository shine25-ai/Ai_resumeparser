import React, { useState, useEffect } from "react";
import {
  X, Save, ChevronLeft, ChevronRight, UserCheck,
  Building2, DollarSign, Sparkles, HelpCircle, Plus, Trash2
} from "lucide-react";
import {
  bulkSubmitInterviewFeedback,
  type InterviewItem,
  type BulkFeedbackItemPayload,
  type InterviewerItem,
  type ClientFeedbackItem,
} from "../utils/Api";
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

  const [questionOptions, setQuestionOptions] = useState<string[]>([]);

  // Initialize form state when selectedInterviews change or modal opens
  useEffect(() => {
    if (selectedInterviews && selectedInterviews.length > 0) {
      const initialForms = selectedInterviews.map((item) => {
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

        return {
          interview_id: item.id,
          candidate_name: item.candidate_name,
          candidate_email: item.candidate_email,
          job_title: item.job_title,
          interview_type: item.interview_type,
          round_number: item.round_number,
          
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
        
        {/* MODAL HEADER */}
        <div className="flex justify-between items-center bg-slate-50 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600 shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Bulk Feedback Entry ({selectedInterviews.length} Candidates Selected)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Provide round assessment, panel interviewers & client reviews in a single submission.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* CANDIDATE STEPPER / TABS BAR */}
        <div className="bg-slate-100/80 px-6 py-3 border-b border-slate-200 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {formsData.map((f, idx) => {
            const isActive = idx === activeCandidateIndex;
            return (
              <button
                key={f.interview_id}
                onClick={() => setActiveCandidateIndex(idx)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm scale-[1.02]"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {idx + 1}
                </span>
                <span className="truncate max-w-[140px]">{f.candidate_name}</span>
              </button>
            );
          })}
        </div>

        {/* MODAL MAIN BODY SCROLLABLE */}
        {currentForm && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl font-bold flex items-center gap-2">
                <span>⚠️ {error}</span>
              </div>
            )}

            {/* CANDIDATE HEADER INFO BANNER */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 font-extrabold flex items-center justify-center text-sm shadow-xs">
                  {currentForm.candidate_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{currentForm.candidate_name}</h3>
                  <p className="text-xs text-slate-500 font-medium">{currentForm.job_title} | {currentForm.interview_type} (Round {currentForm.round_number})</p>
                </div>
              </div>

              {/* Step Navigation Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeCandidateIndex === 0}
                  onClick={() => setActiveCandidateIndex((prev) => prev - 1)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-slate-100 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <span className="text-xs font-bold text-slate-500">
                  {activeCandidateIndex + 1} / {formsData.length}
                </span>
                <button
                  type="button"
                  disabled={activeCandidateIndex === formsData.length - 1}
                  onClick={() => setActiveCandidateIndex((prev) => prev + 1)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-slate-100 flex items-center gap-1 transition-all cursor-pointer"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* SECTION 1: INTERVIEWER FEEDBACK (MULTI PANEL) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-indigo-600" />
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Interviewer Panel Feedback ({currentForm.interviewersList.length})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleAddInterviewer}
                  className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus size={14} /> Add Interviewer
                </button>
              </div>

              {currentForm.interviewersList.map((interviewer, intIdx) => (
                <div key={intIdx} className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-4 relative">
                  <div className="flex justify-between items-center">
                    <input
                      type="text"
                      value={interviewer.interviewer_name}
                      onChange={(e) => handleInterviewerItemChange(intIdx, "interviewer_name", e.target.value)}
                      placeholder="Interviewer Name"
                      className="text-xs font-bold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent"
                    />
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Rating (1-5)</label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={interviewer.rating || 4}
                        onChange={(e) => handleInterviewerItemChange(intIdx, "rating", parseFloat(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-amber-600 block mt-1">
                        {interviewer.rating || 4} ★
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Recommendation</label>
                      <select
                        value={interviewer.recommendation || "Selected"}
                        onChange={(e) => handleInterviewerItemChange(intIdx, "recommendation", e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                      >
                        <option value="Selected">Selected</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Hold">Hold</option>
                      </select>
                    </div>
                  </div>

                  {(interviewer.rating || 4) <= 4.5 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                        <HelpCircle size={13} className="text-amber-600" />
                        Select Observation Reason
                      </label>
                      <select
                        onChange={(e) => {
                          const reason = e.target.value;
                          if (reason && !reason.startsWith("--")) {
                            const newFb = interviewer.feedback ? `${interviewer.feedback}\nNote: ${reason}` : reason;
                            handleInterviewerItemChange(intIdx, "feedback", newFb);
                          }
                        }}
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                      >
                        {questionOptions.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Strengths (Comma-separated)</label>
                      <input
                        type="text"
                        value={interviewer.strengths ? (Array.isArray(interviewer.strengths) ? interviewer.strengths.join(", ") : interviewer.strengths) : ""}
                        onChange={(e) => {
                          const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          handleInterviewerItemChange(intIdx, "strengths", list);
                        }}
                        placeholder="e.g. Problem Solving, React"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Weaknesses / Improvement Areas</label>
                      <input
                        type="text"
                        value={interviewer.weaknesses ? (Array.isArray(interviewer.weaknesses) ? interviewer.weaknesses.join(", ") : interviewer.weaknesses) : ""}
                        onChange={(e) => {
                          const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          handleInterviewerItemChange(intIdx, "weaknesses", list);
                        }}
                        placeholder="e.g. System Design edge cases"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">Feedback Comments</label>
                    <textarea
                      rows={2}
                      value={interviewer.feedback || ""}
                      onChange={(e) => handleInterviewerItemChange(intIdx, "feedback", e.target.value)}
                      placeholder="Interviewer specific feedback..."
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* SECTION 2: CLIENT FEEDBACK (MULTI PANEL) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-teal-600" />
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Client Panel Feedback ({currentForm.clientsList.length})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleAddClient}
                  className="flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus size={14} /> Add Client
                </button>
              </div>

              {currentForm.clientsList.map((client, clientIdx) => (
                <div key={clientIdx} className="p-4 bg-teal-50/30 border border-teal-200 rounded-xl space-y-4 relative">
                  <div className="flex justify-between items-center">
                    <input
                      type="text"
                      value={client.client_name}
                      onChange={(e) => handleClientItemChange(clientIdx, "client_name", e.target.value)}
                      placeholder="Client Name / Company"
                      className="text-xs font-bold text-slate-900 border-b border-dashed border-teal-300 focus:border-teal-500 focus:outline-none bg-transparent"
                    />
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Rating (1-5)</label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.5"
                        value={client.client_rating || 4}
                        onChange={(e) => handleClientItemChange(clientIdx, "client_rating", parseFloat(e.target.value))}
                        className="w-full accent-teal-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-teal-700 block mt-1">
                        {client.client_rating || 4} ★
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Recommendation</label>
                      <select
                        value={client.client_recommendation || "Selected"}
                        onChange={(e) => handleClientItemChange(clientIdx, "client_recommendation", e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                      >
                        <option value="Selected">Selected</option>
                        <option value="Rejected">Rejected</option>
                        <option value="On Hold">On Hold</option>
                      </select>
                    </div>
                  </div>

                  {(client.client_rating || 4) <= 4.5 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                        <HelpCircle size={13} className="text-amber-600" />
                        Select Client Observation Reason
                      </label>
                      <select
                        onChange={(e) => {
                          const reason = e.target.value;
                          if (reason && !reason.startsWith("--")) {
                            const newFb = client.client_feedback ? `${client.client_feedback}\nNote: ${reason}` : reason;
                            handleClientItemChange(clientIdx, "client_feedback", newFb);
                          }
                        }}
                        className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                      >
                        {questionOptions.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Client Strengths (Comma-separated)</label>
                      <input
                        type="text"
                        value={client.client_strengths ? (Array.isArray(client.client_strengths) ? client.client_strengths.join(", ") : client.client_strengths) : ""}
                        onChange={(e) => {
                          const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          handleClientItemChange(clientIdx, "client_strengths", list);
                        }}
                        placeholder="e.g. Domain depth, Communication"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Client Weaknesses / Improvement Areas</label>
                      <input
                        type="text"
                        value={client.client_weaknesses ? (Array.isArray(client.client_weaknesses) ? client.client_weaknesses.join(", ") : client.client_weaknesses) : ""}
                        onChange={(e) => {
                          const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          handleClientItemChange(clientIdx, "client_weaknesses", list);
                        }}
                        placeholder="e.g. English fluency"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">Client Feedback Comments</label>
                    <textarea
                      rows={2}
                      value={client.client_feedback || ""}
                      onChange={(e) => handleClientItemChange(clientIdx, "client_feedback", e.target.value)}
                      placeholder="Client specific feedback notes..."
                      className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* SECTION 3: SHARED OUTCOMES & DOCUMENTS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <DollarSign size={18} className="text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Salary & Candidate Requests
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Salary Requested</label>
                  <input
                    type="text"
                    value={currentForm.salary_requested}
                    onChange={(e) => handleCurrentFormChange("salary_requested", e.target.value)}
                    placeholder="e.g. 15 LPA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Final Fit Salary</label>
                  <input
                    type="text"
                    value={currentForm.final_fit_salary}
                    onChange={(e) => handleCurrentFormChange("final_fit_salary", e.target.value)}
                    placeholder="e.g. 14 LPA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Joining Date</label>
                  <input
                    type="date"
                    value={currentForm.joining_date}
                    onChange={(e) => handleCurrentFormChange("joining_date", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

          </div>
        )}

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <div className="text-xs font-bold text-slate-500">
            Candidate <span className="text-indigo-600">{activeCandidateIndex + 1}</span> of {formsData.length}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmitAll}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Submitting Bulk Feedback...</span>
              ) : (
                <>
                  <Save size={16} />
                  <span>Submit All {formsData.length} Candidate Feedbacks</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
