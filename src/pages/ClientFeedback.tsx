import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Plus, ChevronDown } from "lucide-react";

export default function ClientFeedback() {
  const navigate = useNavigate();
  const [decision, setDecision] = useState("Selected");
  const [nextSteps, setNextSteps] = useState("Offer will be released");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const ratings = [
    { label: "Technical Rating", stars: 5 },
    { label: "Communication Rating", stars: 5 },
    { label: "Overall Rating", stars: 5 },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
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

          <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer">
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
          <h3 className="text-sm font-bold text-slate-900">Client Feedback</h3>

          {/* Star Ratings List */}
          <div className="space-y-4 max-w-lg">
            {ratings.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-slate-700">{item.label}</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((starIndex) => (
                    <Star
                      key={starIndex}
                      size={18}
                      className={starIndex <= item.stars ? "text-indigo-600 fill-indigo-600" : "text-slate-200"}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Client Comments Text Area Box */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-900">Client Comments</h4>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 leading-relaxed min-h-[100px]">
              Good technical knowledge and communication.
              <br />
              Suitable for our team.
            </div>
          </div>
        </div>

        {/* Right Column: Interview Decision Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Interview Decision Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 block">Interview Decision</label>
              <div className="relative">
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none cursor-pointer"
                >
                  <option value="Selected" className="bg-white text-emerald-600 font-bold">Selected</option>
                  <option value="Rejected" className="bg-white text-rose-600 font-bold">Rejected</option>
                  <option value="On Hold" className="bg-white text-amber-600 font-bold">On Hold</option>
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
          <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-bold transition-colors shadow-sm mt-4 cursor-pointer">
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
