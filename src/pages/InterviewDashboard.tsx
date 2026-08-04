import { useState } from "react";
import { ChevronDown, Video, FileText, UserCheck, Briefcase } from "lucide-react";

export default function InterviewDashboard() {
  const [selectedRound, setSelectedRound] = useState("Technical Interview");
  const [activeTab, setActiveTab] = useState("Interview Details");

  const rounds = [
    {
      title: "Technical Interview",
      status: "Completed on 20 May",
      isCompleted: true,
      icon: <FileText size={18} />,
    },
    {
      title: "Project Interview",
      status: "Scheduled on 21 May",
      isCompleted: false,
      icon: <Briefcase size={18} />,
    },
    {
      title: "HR Interview",
      status: "Scheduled on 22 May",
      isCompleted: false,
      icon: <UserCheck size={18} />,
    },
    {
      title: "Client Interview",
      status: "Scheduled on 25 May",
      isCompleted: false,
      icon: <Video size={18} />,
    },
  ];

  const evaluationScores = [
    { label: "Technical Skills", score: 84 },
    { label: "Problem Solving", score: 88 },
    { label: "Coding", score: 85 },
    { label: "Communication", score: 78 },
  ];

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">

          <h1 className="text-xl font-bold text-slate-900">Interview Dashboard</h1>
        </div>

        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
          This Month
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Main Content Grid (Sidebar Column 1 & Content Column 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Candidate Info & Interview Rounds Navigation (1 col) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {/* Candidate Profile Header */}
          <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
              alt="Vijay"
              className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 shadow-sm"
            />
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">Vijay</h2>
              <p className="text-xs text-slate-500 font-medium">Senior Java Developer</p>
              <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                Shortlisted
              </span>
            </div>
          </div>

          {/* Interview Rounds List */}
          <div className="space-y-3">
            {rounds.map((round) => {
              const isSelected = selectedRound === round.title;
              return (
                <div
                  key={round.title}
                  onClick={() => setSelectedRound(round.title)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${isSelected
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                >
                  <div className={`p-2 rounded-lg ${isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 border border-slate-200 text-slate-600"}`}>
                    {round.icon}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className={`text-xs font-bold ${isSelected ? "text-indigo-600" : "text-slate-800"}`}>
                      {round.title}
                    </h3>
                    <p className="text-[11px] text-slate-500">{round.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Round Details & Evaluation (2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {/* Top Details / Scorecard Tabs */}
          <div className="flex items-center gap-6 border-b border-slate-200 pb-4">
            {["Interview Details", "Scorecard"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-bold transition-colors relative pb-4 -mb-4 cursor-pointer ${activeTab === tab ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                  }`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"></span>
                )}
              </button>
            ))}
          </div>

          {/* Selected Round Title & Metadata Box */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {selectedRound} - <span className="text-slate-500 font-medium">Completed</span>
            </h3>

            {/* Meta Attributes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Interviewer</span>
                <span className="text-xs font-bold text-slate-800">Ravi Shankar</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Date & Time</span>
                <span className="text-xs font-bold text-slate-800">20 May 2025, 10:00 AM</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Mode</span>
                <span className="text-xs font-bold text-slate-800">Google Meet</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">Duration</span>
                <span className="text-xs font-bold text-slate-800">60 mins</span>
              </div>
            </div>
          </div>

          {/* Evaluation Summary Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Evaluation Summary</h3>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
              {/* 4 Score Badges */}
              <div className="sm:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {evaluationScores.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center space-y-2">
                    <span className="text-[11px] font-semibold text-slate-500 block truncate" title={item.label}>
                      {item.label}
                    </span>
                    <div className="flex items-baseline justify-center gap-0.5">
                      <span className="text-xl font-extrabold text-slate-900">{item.score}</span>
                      <span className="text-[10px] text-slate-500 font-semibold">/100</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall Score Circle Gauge */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center space-y-2">
                <span className="text-[11px] font-semibold text-slate-500 block">Overall Score</span>

                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-200"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-600 stroke-current"
                      strokeWidth="3.5"
                      strokeDasharray="84, 100"
                      strokeLinecap="round"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center leading-none">
                    <span className="text-xs font-bold text-slate-900">84</span>
                    <span className="text-[8px] text-slate-500">/100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interviewer Comments Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-900">Interviewer Comments</h3>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 leading-relaxed">
              Strong in Java, Spring Boot and Microservices. Good problem solving skills.
              Can improve in system design concepts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
