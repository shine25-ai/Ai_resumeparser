import React, { useState, useEffect } from "react";
import {
  X, Star, Save, ChevronLeft, ChevronRight, UserCheck,
  Building2, DollarSign, Upload, Sparkles
} from "lucide-react";
import {
  bulkSubmitInterviewFeedback,
  type InterviewItem,
  type BulkFeedbackItemPayload,
} from "../utils/Api";

interface BulkFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInterviews: InterviewItem[];
  onSuccess: () => void;
}

interface SingleCandidateFeedbackForm {
  interview_id: string;
  candidate_id: string;
  candidate_name: string;
  job_title: string;
  round_number: number;
  
  // Interviewer / Round Feedback
  rating: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  recommendation: string;
  
  // Client Feedback
  client_name: string;
  client_rating: number;
  client_feedback: string;
  client_strengths: string;
  client_weaknesses: string;
  client_recommendation: string;
  client_notes: string;
  client_feedback_date: string;
  
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

  // Initialize form state when selectedInterviews change or modal opens
  useEffect(() => {
    if (selectedInterviews && selectedInterviews.length > 0) {
      const initialForms = selectedInterviews.map((item) => ({
        interview_id: item.id,
        candidate_id: item.candidate_id || "",
        candidate_name: item.candidate_name || "Unknown Candidate",
        job_title: item.job_title || "Job Position",
        round_number: item.round_number || 1,
        
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
      }));
      setFormsData(initialForms);
      setActiveCandidateIndex(0);
    }
  }, [selectedInterviews, isOpen]);

  if (!isOpen || selectedInterviews.length === 0) return null;

  const currentForm = formsData[activeCandidateIndex] || formsData[0];

  const handleCurrentFormChange = (field: keyof SingleCandidateFeedbackForm, value: any) => {
    setFormsData((prev) => {
      const updated = [...prev];
      if (updated[activeCandidateIndex]) {
        updated[activeCandidateIndex] = {
          ...updated[activeCandidateIndex],
          [field]: value,
        };
      }
      return updated;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && currentForm) {
      const fileNames = Array.from(e.target.files).map((f) => f.name);
      const existing = currentForm.interview_document_files
        ? currentForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
        : [];
      const combined = Array.from(new Set([...existing, ...fileNames])).join("\n");
      handleCurrentFormChange("interview_document_files", combined);
    }
  };

  const handleSubmitBulk = async () => {
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
          client_name: f.client_name || undefined,
          client_rating: f.client_rating ? Number(f.client_rating) : undefined,
          client_feedback: f.client_feedback || undefined,
          client_strengths: f.client_strengths ? f.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_weaknesses: f.client_weaknesses ? f.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_recommendation: f.client_recommendation || undefined,
          client_notes: f.client_notes || undefined,
          client_feedback_date: f.client_feedback_date || undefined,
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
      console.error("Bulk feedback submission failed:", err);
      setError(err.message || "Failed to submit bulk candidate feedback.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm w-screen h-screen flex flex-col overflow-hidden text-slate-900 font-sans">
      
      {/* Full Width Top Header Bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              Bulk Candidate Feedback Entry
              <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold px-3 py-1 rounded-full">
                {selectedInterviews.length} Candidates Selected
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Select candidate on top to edit Interviewer Feedback & Client Feedback on a single screen.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={24} />
        </button>
      </div>


      {/* Candidate Select Tabs Bar (Only candidate selector at top) */}
      <div className="px-8 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 overflow-x-auto gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 mr-2 uppercase tracking-wider shrink-0">Select Candidate:</span>
          {formsData.map((item, idx) => {
            const isActive = idx === activeCandidateIndex;
            return (
              <button
                key={item.interview_id}
                onClick={() => setActiveCandidateIndex(idx)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-md scale-105"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? "bg-white text-indigo-600" : "bg-slate-200 text-slate-700"
                }`}>
                  {idx + 1}
                </span>
                <span className="truncate max-w-[150px]">{item.candidate_name}</span>
                <span className="text-[10px] opacity-75">(R{item.round_number})</span>
              </button>
            );
          })}
        </div>

        {/* Stepper Navigation Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-500 mr-1">
            Candidate <strong className="text-slate-900">{activeCandidateIndex + 1}</strong> of <strong className="text-slate-900">{formsData.length}</strong>
          </span>
          <button
            type="button"
            disabled={activeCandidateIndex === 0}
            onClick={() => setActiveCandidateIndex((prev) => Math.max(0, prev - 1))}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer shadow-xs"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            disabled={activeCandidateIndex === formsData.length - 1}
            onClick={() => setActiveCandidateIndex((prev) => Math.min(formsData.length - 1, prev + 1))}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 cursor-pointer shadow-xs"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Main Form Content Area - Full Screen Height & Width Scrollable */}
      <div className="flex-1 overflow-y-auto px-8 py-6 bg-slate-100 space-y-8">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        {currentForm && (
          <form onSubmit={(e) => e.preventDefault()} className="max-w-6xl mx-auto space-y-8">
            
            {/* Candidate Info Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-extrabold text-xl">
                  {currentForm.candidate_name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {currentForm.candidate_name}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Position: <span className="text-slate-800 font-semibold">{currentForm.job_title}</span> • Interview Round: <span className="text-indigo-600 font-bold">Round {currentForm.round_number}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
                <span className="text-slate-500">Editing Candidate:</span>
                <span className="font-extrabold text-indigo-600 text-sm">{activeCandidateIndex + 1} / {formsData.length}</span>
              </div>
            </div>

            {/* SECTION 1: INTERVIEWER ROUND FEEDBACK */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <UserCheck size={18} className="text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Interviewer Round Feedback
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Rating */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Star size={15} className="text-amber-500" />
                    Round Rating Score (1 to 5)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      value={currentForm.rating}
                      onChange={(e) => handleCurrentFormChange("rating", parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-base font-extrabold text-amber-600 w-14 text-center bg-slate-50 border border-slate-200 py-1.5 rounded-xl shrink-0">
                      {currentForm.rating} ★
                    </span>
                  </div>
                </div>

                {/* Recommendation */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Interviewer Recommendation
                  </label>
                  <select
                    value={currentForm.recommendation}
                    onChange={(e) => handleCurrentFormChange("recommendation", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
                  >
                    <option value="Selected">Selected</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Next Round">Next Round</option>
                    <option value="Hold">Hold</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              {/* Feedback Text */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-2 block">
                  Detailed Interviewer Feedback
                </label>
                <textarea
                  rows={3}
                  value={currentForm.feedback}
                  onChange={(e) => handleCurrentFormChange("feedback", e.target.value)}
                  placeholder="Enter detailed feedback on candidate's technical skills, performance, problem solving, etc."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Strengths (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={currentForm.strengths}
                    onChange={(e) => handleCurrentFormChange("strengths", e.target.value)}
                    placeholder="e.g. React, System Design, Communication"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Weaknesses / Areas for Improvement
                  </label>
                  <input
                    type="text"
                    value={currentForm.weaknesses}
                    onChange={(e) => handleCurrentFormChange("weaknesses", e.target.value)}
                    placeholder="e.g. Docker experience, GraphQL"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: CLIENT FEEDBACK */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Building2 size={18} className="text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Client Feedback
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client / Company Name
                  </label>
                  <input
                    type="text"
                    value={currentForm.client_name}
                    onChange={(e) => handleCurrentFormChange("client_name", e.target.value)}
                    placeholder="e.g. Acme Corp / TechClient"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client Rating (1 to 5)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      value={currentForm.client_rating}
                      onChange={(e) => handleCurrentFormChange("client_rating", parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-base font-extrabold text-amber-600 w-14 text-center bg-slate-50 border border-slate-200 py-1.5 rounded-xl shrink-0">
                      {currentForm.client_rating} ★
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client Recommendation
                  </label>
                  <select
                    value={currentForm.client_recommendation}
                    onChange={(e) => handleCurrentFormChange("client_recommendation", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
                  >
                    <option value="Selected">Selected</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Next Round">Next Round</option>
                    <option value="Hold">Hold</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-2 block">
                  Client Feedback Comments
                </label>
                <textarea
                  rows={3}
                  value={currentForm.client_feedback}
                  onChange={(e) => handleCurrentFormChange("client_feedback", e.target.value)}
                  placeholder="Enter feedback provided by client evaluators..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client Strengths
                  </label>
                  <input
                    type="text"
                    value={currentForm.client_strengths}
                    onChange={(e) => handleCurrentFormChange("client_strengths", e.target.value)}
                    placeholder="Comma separated"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client Weaknesses
                  </label>
                  <input
                    type="text"
                    value={currentForm.client_weaknesses}
                    onChange={(e) => handleCurrentFormChange("client_weaknesses", e.target.value)}
                    placeholder="Comma separated"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Client Feedback Date
                  </label>
                  <input
                    type="date"
                    value={currentForm.client_feedback_date}
                    onChange={(e) => handleCurrentFormChange("client_feedback_date", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: SALARY, JOINING & REQUESTED TERMS */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <DollarSign size={18} className="text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Salary, Joining & Requested Terms
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Requested Role
                  </label>
                  <input
                    type="text"
                    value={currentForm.candidate_requested_role}
                    onChange={(e) => handleCurrentFormChange("candidate_requested_role", e.target.value)}
                    placeholder="e.g. Lead Frontend Developer"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Salary Requested
                  </label>
                  <input
                    type="text"
                    value={currentForm.salary_requested}
                    onChange={(e) => handleCurrentFormChange("salary_requested", e.target.value)}
                    placeholder="e.g. 15 LPA / $120k"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Final Fit Salary Approved
                  </label>
                  <input
                    type="text"
                    value={currentForm.final_fit_salary}
                    onChange={(e) => handleCurrentFormChange("final_fit_salary", e.target.value)}
                    placeholder="e.g. 14 LPA / $115k"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Candidate Joining Date
                  </label>
                  <input
                    type="date"
                    value={currentForm.joining_date}
                    onChange={(e) => handleCurrentFormChange("joining_date", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-2 block">
                    Additional Notes / Comments
                  </label>
                  <input
                    type="text"
                    value={currentForm.notes}
                    onChange={(e) => handleCurrentFormChange("notes", e.target.value)}
                    placeholder="Any general observations..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Document Files Attachment */}
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-2 block flex items-center gap-2">
                  <Upload size={15} className="text-indigo-600" />
                  Interview Documents & Evaluation Artifacts
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border border-indigo-200 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>
                {currentForm.interview_document_files && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 whitespace-pre-line font-mono">
                    {currentForm.interview_document_files}
                  </div>
                )}
              </div>
            </div>

          </form>
        )}
      </div>

      {/* Full Width Footer Action Bar */}
      <div className="px-8 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="text-xs text-slate-500">
          Currently editing candidate <span className="text-slate-900 font-bold">{activeCandidateIndex + 1}</span> of{" "}
          <span className="text-slate-900 font-bold">{formsData.length}</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleSubmitBulk}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving Bulk Feedback...
              </>
            ) : (
              <>
                <Save size={18} />
                Save All Bulk Feedback ({formsData.length} Candidates)
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
};
