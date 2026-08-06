import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Plus, ChevronDown, HelpCircle } from "lucide-react";
import { getFeedbackQuestionsAsync, getAutoRatingOutcome } from "../utils/feedbackHelpers";

export default function ClientFeedback() {
  const navigate = useNavigate();
  const [decision, setDecision] = useState("Selected");
  const [nextSteps, setNextSteps] = useState("Offer will be released");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Ratings State (1 to 5 stars)
  const [techRating, setTechRating] = useState<number>(5);
  const [commRating, setCommRating] = useState<number>(5);
  const [overallRating, setOverallRating] = useState<number>(5);

  const [comments, setComments] = useState<string>("Good technical knowledge and communication.\nSuitable for our team.");
  const [selectedQuestionReason, setSelectedQuestionReason] = useState<string>("");
  const [questionOptions, setQuestionOptions] = useState<string[]>([]);

  const interviewType = "FINAL_ROUND";

  useEffect(() => {
    getFeedbackQuestionsAsync(interviewType).then((opts) => setQuestionOptions(opts));
  }, [interviewType]);

  const handleRatingChange = (type: "tech" | "comm" | "overall", val: number) => {
    let newOverall = overallRating;
    if (type === "tech") {
      setTechRating(val);
      newOverall = Math.round((val + commRating) / 2);
      setOverallRating(newOverall);
    } else if (type === "comm") {
      setCommRating(val);
      newOverall = Math.round((techRating + val) / 2);
      setOverallRating(newOverall);
    } else {
      setOverallRating(val);
      newOverall = val;
    }

    // Auto update decision based on rating
    const outcome = getAutoRatingOutcome(newOverall);
    setDecision(outcome.clientDecision);
  };

  const handleQuestionReasonSelect = (reason: string) => {
    setSelectedQuestionReason(reason);
    if (reason && !reason.startsWith("--")) {
      setComments((prev) => (prev ? `${prev}\nNote: ${reason}` : reason));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSaveFeedback = () => {
    alert(`Feedback saved successfully!\nDecision: ${decision}\nOverall Rating: ${overallRating} Stars`);
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Client Interview & Feedback</h1>
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
            onClick={handleSaveFeedback}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            Add Feedback
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
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Interviewer</span>
            <span className="text-xs font-bold text-slate-800">Mr. Suresh CTO</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Client Feedback Ratings (Left 2 cols) & Interview Decision Form (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client Feedback Ratings & Comments */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <h3 className="text-sm font-bold text-slate-900">Client Feedback & Ratings</h3>

          {/* Star Ratings List */}
          <div className="space-y-4 max-w-lg">
            {/* Technical Rating */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-slate-700">Technical Rating</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((starIndex) => (
                  <button
                    key={starIndex}
                    type="button"
                    onClick={() => handleRatingChange("tech", starIndex)}
                    className="focus:outline-none cursor-pointer"
                  >
                    <Star
                      size={20}
                      className={starIndex <= techRating ? "text-amber-500 fill-amber-500" : "text-slate-200"}
                    />
                  </button>
                ))}
                <span className="text-xs font-bold text-slate-700 ml-2 w-6">{techRating} ★</span>
              </div>
            </div>

            {/* Communication Rating */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-slate-700">Communication Rating</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((starIndex) => (
                  <button
                    key={starIndex}
                    type="button"
                    onClick={() => handleRatingChange("comm", starIndex)}
                    className="focus:outline-none cursor-pointer"
                  >
                    <Star
                      size={20}
                      className={starIndex <= commRating ? "text-amber-500 fill-amber-500" : "text-slate-200"}
                    />
                  </button>
                ))}
                <span className="text-xs font-bold text-slate-700 ml-2 w-6">{commRating} ★</span>
              </div>
            </div>

            {/* Overall Rating */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-900">Overall Rating</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((starIndex) => (
                  <button
                    key={starIndex}
                    type="button"
                    onClick={() => handleRatingChange("overall", starIndex)}
                    className="focus:outline-none cursor-pointer"
                  >
                    <Star
                      size={22}
                      className={starIndex <= overallRating ? "text-indigo-600 fill-indigo-600" : "text-slate-200"}
                    />
                  </button>
                ))}
                <span className="text-xs font-extrabold text-indigo-700 ml-2 w-6">{overallRating} ★</span>
              </div>
            </div>
          </div>

          {/* Conditional Reason / Question Selection when Rating is 1 to 4.5 Stars */}
          {overallRating <= 4.5 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2 animate-fadeIn">
              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <HelpCircle size={15} className="text-amber-600" />
                Select Reason / Observation (Interview Type: Final Round)
              </label>
              <select
                value={selectedQuestionReason}
                onChange={(e) => handleQuestionReasonSelect(e.target.value)}
                className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs cursor-pointer"
              >
                {questionOptions.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-amber-700 italic">
                Selecting a reason will automatically record it under candidate feedback notes.
              </p>
            </div>
          )}

          {/* Client Comments Text Area Box */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-900">Client Comments & Feedback</h4>
            <textarea
              rows={4}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter detailed feedback comments..."
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-sans"
            />
          </div>
        </div>

        {/* Right Column: Interview Decision Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Interview Decision Dropdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 block">Interview Decision</label>
                <span className="text-[10px] text-slate-500 italic">Auto-updated by rating</span>
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
