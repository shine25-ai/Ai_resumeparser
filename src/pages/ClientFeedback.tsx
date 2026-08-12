import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Plus, ChevronDown, HelpCircle, Trash2, UserCheck, Building2 } from "lucide-react";
import { getFeedbackQuestionsAsync, getAutoRatingOutcome } from "../utils/feedbackHelpers";
import { getUsers, type ClientFeedbackItem, type UserProfile } from "../utils/Api";

export default function ClientFeedback() {
  const navigate = useNavigate();
  const [decision, setDecision] = useState("Selected");
  const [nextSteps, setNextSteps] = useState("Offer will be released");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  // Multi Client Evaluators State
  const [clientEvaluators, setClientEvaluators] = useState<ClientFeedbackItem[]>([
    {
      client_name: "TechNova Client Evaluator 1",
      client_rating: 5,
      client_feedback: "Good technical knowledge and communication.\nSuitable for our team.",
      client_strengths: ["Technical Depth", "Team Alignment"],
      client_weaknesses: ["Domain English terms"],
      client_recommendation: "Selected",
      reason_note: "",
    },
  ]);

  const [questionOptions, setQuestionOptions] = useState<string[]>([]);
  const interviewType = "FINAL_ROUND";

  useEffect(() => {
    getFeedbackQuestionsAsync(interviewType).then((opts) => setQuestionOptions(opts));
    getUsers().then((users) => setSystemUsers(users)).catch(() => setSystemUsers([]));
  }, [interviewType]);

  const handleAddClientEvaluator = () => {
    setClientEvaluators((prev) => [
      ...prev,
      {
        client_name: `Client Evaluator ${prev.length + 1}`,
        client_rating: 5,
        client_feedback: "",
        client_strengths: [],
        client_weaknesses: [],
        client_recommendation: "Selected",
        reason_note: "",
      },
    ]);
  };

  const handleRemoveClientEvaluator = (index: number) => {
    if (clientEvaluators.length <= 1) return;
    setClientEvaluators((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleEvaluatorChange = (index: number, field: keyof ClientFeedbackItem, val: any) => {
    setClientEvaluators((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        const item = { ...updated[index], [field]: val };
        if (field === "client_rating") {
          const outcome = getAutoRatingOutcome(Number(val));
          item.client_recommendation = outcome.clientDecision;
        }
        updated[index] = item;
      }

      // Recompute global overall decision based on average ratings
      const avgRating =
        updated.reduce((sum, item) => sum + (item.client_rating || 5), 0) / updated.length;
      const globalOutcome = getAutoRatingOutcome(avgRating);
      setDecision(globalOutcome.clientDecision);

      return updated;
    });
  };

  const handleQuestionReasonSelect = (index: number, reason: string) => {
    if (reason && !reason.startsWith("--")) {
      const item = clientEvaluators[index];
      const newFb = item.client_feedback ? `${item.client_feedback}\nNote: ${reason}` : reason;
      handleEvaluatorChange(index, "client_feedback", newFb);
      handleEvaluatorChange(index, "reason_note", reason);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSaveFeedback = () => {
    alert(`Feedback for ${clientEvaluators.length} Client Evaluator(s) saved successfully!\nGlobal Decision: ${decision}`);
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Client Interview & Panel Feedback</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          <button
            onClick={handleAddClientEvaluator}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            Add Client Evaluator
          </button>

          <button
            onClick={handleSaveFeedback}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <UserCheck size={14} />
            Submit Feedback
          </button>
        </div>
      </div>

      {/* Top Row Overview Cards (2 Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidate Info Card (1 Col) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <img
            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
            alt="Vijay"
            className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 flex-shrink-0 shadow-sm"
          />
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900">Vijay</h2>
            <p className="text-xs text-slate-500 font-medium">Senior Java Developer</p>
            <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Shortlisted
            </span>
          </div>
        </div>

        {/* Client & Interview Meta Card (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-6 items-center">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Client</span>
            <span className="text-xs font-bold text-slate-800">TechNova Solutions</span>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Interview Date</span>
            <span className="text-xs font-bold text-slate-800">25 May 2025</span>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Round</span>
            <span className="text-xs font-bold text-slate-800">Final Round</span>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Panel Evaluators</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              {clientEvaluators.length} Evaluator(s)
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Client Feedback Ratings (Left 2 cols) & Interview Decision Form (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Dynamic Multi Client Feedback List */}
        <div className="lg:col-span-2 space-y-6">
          {clientEvaluators.map((evaluator, idx) => (
            <div
              key={idx}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 relative"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Building2 size={16} className="text-teal-600 shrink-0" />
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
                    <select
                      value={evaluator.client_id || (evaluator.client_name ? "custom" : "")}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "custom" || !val) {
                          handleEvaluatorChange(idx, "client_id", undefined);
                          handleEvaluatorChange(idx, "client_email", undefined);
                        } else {
                          const u = systemUsers.find((user) => user.id === val);
                          if (u) {
                            handleEvaluatorChange(idx, "client_id", u.id);
                            handleEvaluatorChange(idx, "client_name", u.full_name);
                            handleEvaluatorChange(idx, "client_email", u.email);
                          }
                        }
                      }}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-500 cursor-pointer"
                    >
                      <option value="">-- Choose Registered User --</option>
                      {systemUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.role || u.email})
                        </option>
                      ))}
                      <option value="custom">+ External / Custom Evaluator</option>
                    </select>

                    <input
                      type="text"
                      value={evaluator.client_name}
                      onChange={(e) => handleEvaluatorChange(idx, "client_name", e.target.value)}
                      placeholder="Enter Evaluator / Client Name"
                      className="text-sm font-bold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none bg-transparent flex-1"
                    />
                  </div>
                </div>
                {clientEvaluators.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveClientEvaluator(idx)}
                    className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1 font-semibold cursor-pointer shrink-0"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>

              {/* Star Rating Bar */}
              <div className="flex items-center justify-between gap-4 max-w-lg">
                <span className="text-xs font-bold text-slate-700">Evaluator Rating Score</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starIndex) => (
                    <button
                      key={starIndex}
                      type="button"
                      onClick={() => handleEvaluatorChange(idx, "client_rating", starIndex)}
                      className="focus:outline-none cursor-pointer"
                    >
                      <Star
                        size={20}
                        className={
                          starIndex <= (evaluator.client_rating || 5)
                            ? "text-amber-500 fill-amber-500"
                            : "text-slate-200"
                        }
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-indigo-700 ml-2 w-8">
                    {evaluator.client_rating || 5} ★
                  </span>
                </div>
              </div>

              {/* Conditional Reason Selection if Rating <= 4.5 */}
              {(evaluator.client_rating || 5) <= 4.5 && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 animate-fadeIn">
                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <HelpCircle size={15} className="text-amber-600" />
                    Select Client Observation Reason (Interview Type: Final Round)
                  </label>
                  <select
                    value={evaluator.reason_note || ""}
                    onChange={(e) => handleQuestionReasonSelect(idx, e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs cursor-pointer"
                  >
                    {questionOptions.map((opt, qIdx) => (
                      <option key={qIdx} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Strengths and Weaknesses Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Evaluator Strengths (Comma-separated)</label>
                  <input
                    type="text"
                    value={evaluator.client_strengths ? (Array.isArray(evaluator.client_strengths) ? evaluator.client_strengths.join(", ") : evaluator.client_strengths) : ""}
                    onChange={(e) => {
                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      handleEvaluatorChange(idx, "client_strengths", list);
                    }}
                    placeholder="e.g. Communication, Problem Solving"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Evaluator Weaknesses / Improvement Areas</label>
                  <input
                    type="text"
                    value={evaluator.client_weaknesses ? (Array.isArray(evaluator.client_weaknesses) ? evaluator.client_weaknesses.join(", ") : evaluator.client_weaknesses) : ""}
                    onChange={(e) => {
                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      handleEvaluatorChange(idx, "client_weaknesses", list);
                    }}
                    placeholder="e.g. System design depth, English fluency"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Client Feedback Comments */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Evaluator Comments & Feedback</label>
                <textarea
                  rows={3}
                  value={evaluator.client_feedback || ""}
                  onChange={(e) => handleEvaluatorChange(idx, "client_feedback", e.target.value)}
                  placeholder="Enter specific comments from this evaluator..."
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-sans"
                />
              </div>
            </div>
          ))}

          {/* Add New Client Evaluator Button */}
          <button
            type="button"
            onClick={handleAddClientEvaluator}
            className="w-full py-3.5 bg-dashed border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/30 text-indigo-600 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Plus size={16} /> Add Another Client Evaluator Feedback
          </button>
        </div>

        {/* Right Column: Interview Decision Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between h-fit">
          <div className="space-y-5">
            {/* Interview Decision Dropdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 block">Global Interview Outcome</label>
                <span className="text-[10px] text-slate-500 italic">Auto-calculated</span>
              </div>
              <div className="relative">
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer ${
                    decision === "Selected"
                      ? "text-emerald-600"
                      : decision === "On Hold"
                      ? "text-amber-600"
                      : "text-rose-600"
                  }`}
                >
                  <option value="Selected" className="bg-white text-emerald-600 font-bold">Selected</option>
                  <option value="On Hold" className="bg-white text-amber-600 font-bold">On Hold</option>
                  <option value="Rejected" className="bg-white text-rose-600 font-bold">Rejected</option>
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Next Steps Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 block">Next Steps</label>
              <input
                type="text"
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="Enter next steps..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Attachment (Optional) Upload Field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 block">Attachment (Optional)</label>
              <div className="flex items-center gap-3 p-1.5 rounded-xl border border-slate-200 bg-slate-50">
                <label className="bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors border border-slate-200 shadow-sm">
                  Choose File
                  <input type="file" className="hidden" onChange={handleFileChange} />
                </label>
                <span className="text-[11px] text-slate-500 truncate flex-1">
                  {selectedFile ? selectedFile.name : "No file chosen"}
                </span>
              </div>
            </div>
          </div>

          {/* Submit Feedback Button */}
          <button
            onClick={handleSaveFeedback}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-sm mt-4 cursor-pointer"
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
