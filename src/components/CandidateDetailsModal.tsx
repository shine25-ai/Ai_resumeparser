import React, { useEffect, useState } from "react";
import {
  X, UserCheck, Calendar, MapPin, ShieldCheck, DollarSign,
  TrendingUp, FileText, Building2, Layers, RefreshCw, AlertCircle, Video, Users
} from "lucide-react";
import { getCandidateInterviewHistory, type InterviewItem, type InterviewerItem, type ClientFeedbackItem } from "../utils/Api";

interface CandidateDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string | null;
  candidateName?: string;
  fallbackInterview?: InterviewItem | null;
}

export const CandidateDetailsModal: React.FC<CandidateDetailsModalProps> = ({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  fallbackInterview,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && candidateId) {
      fetchCandidateHistory();
    } else if (isOpen && fallbackInterview) {
      // Fallback single record display if candidate_id is missing
      setHistoryData({
        candidate_id: fallbackInterview.candidate_id || "N/A",
        candidate_name: fallbackInterview.candidate_name,
        job_title: fallbackInterview.job_title,
        job_location: fallbackInterview.job_location,
        job_type: fallbackInterview.job_type,
        location: fallbackInterview.location || fallbackInterview.interview_location,
        interview_location: fallbackInterview.interview_location || fallbackInterview.location,
        hr_call_verification: fallbackInterview.hr_call_verification,
        candidate_requested_date: fallbackInterview.candidate_requested_date,
        candidate_requested_time: fallbackInterview.candidate_requested_time,
        candidate_requested_role: fallbackInterview.candidate_requested_role,
        salary_requested: fallbackInterview.salary_requested,
        final_fit_salary: fallbackInterview.final_fit_salary,
        joining_date: fallbackInterview.joining_date,
        interview_document_files: fallbackInterview.interview_document_files || [],
        total_rounds: 1,
        rounds: [fallbackInterview],
      });
    }
  }, [isOpen, candidateId, fallbackInterview]);

  const fetchCandidateHistory = async () => {
    if (!candidateId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCandidateInterviewHistory(candidateId);
      setHistoryData(data);
    } catch (err: any) {
      console.error("Failed to fetch candidate history:", err);
      setError(err.message || "Failed to load candidate details.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-6xl w-[94vw] max-h-[92vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl relative text-slate-900">
        
        {/* Header Bar */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-indigo-600 to-blue-600 rounded-2xl shadow-md text-white">
              <UserCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-wide">
                  Candidate Full Interview & Panel Evaluation Record
                </h2>
                {historyData?.total_rounds && (
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    {historyData.total_rounds} Round(s) Completed/Scheduled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete candidate profile details, panel interviewer ratings, and client evaluator reviews
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <RefreshCw size={32} className="animate-spin text-indigo-600" />
            <p className="text-sm font-semibold text-slate-600">Fetching candidate complete interview details...</p>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-center gap-3">
            <AlertCircle size={20} />
            <p className="text-xs font-semibold">{error}</p>
          </div>
        )}

        {!loading && historyData && (
          <div className="space-y-6 text-xs">
            {/* CANDIDATE SUMMARY BADGE & BACKGROUND CARD */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Candidate Name</span>
                  <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    {historyData.candidate_name || candidateName}
                    <span className="text-xs font-semibold text-slate-500">({historyData.candidate_id})</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Target Job Position</span>
                  <div className="text-sm font-bold text-slate-800">{historyData.job_title || "N/A"}</div>
                </div>

                <div>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">HR Verification</span>
                  <div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      historyData.hr_call_verification === "Verified"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}>
                      <ShieldCheck size={13} />
                      {historyData.hr_call_verification || "Pending"}
                    </span>
                  </div>
                </div>
              </div>

              {/* DETAILS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                    <MapPin size={12} className="text-indigo-600" /> Location / Office
                  </span>
                  <div className="font-bold text-slate-800 truncate">{historyData.location || historyData.interview_location || "N/A"}</div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                    <DollarSign size={12} className="text-amber-600" /> Salary Requested
                  </span>
                  <div className="font-bold text-amber-700">{historyData.salary_requested || "N/A"}</div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                    <TrendingUp size={12} className="text-emerald-600" /> Final Fit Salary
                  </span>
                  <div className="font-bold text-emerald-600">{historyData.final_fit_salary || "N/A"}</div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                    <Calendar size={12} className="text-indigo-600" /> Joining Date
                  </span>
                  <div className="font-bold text-indigo-700">{historyData.joining_date || "N/A"}</div>
                </div>
              </div>

              {/* ATTACHED DOCUMENTS & REQUESTED ROLE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {historyData.candidate_requested_role && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold">Candidate Requested Role</span>
                    <div className="font-semibold text-slate-800">{historyData.candidate_requested_role}</div>
                  </div>
                )}

                {historyData.interview_document_files && historyData.interview_document_files.length > 0 && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                      <FileText size={12} className="text-rose-600" /> Attached Files ({historyData.interview_document_files.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {historyData.interview_document_files.map((fileUrl: string, idx: number) => (
                        <a
                          key={idx}
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-slate-100 border border-slate-200 hover:border-indigo-500 text-indigo-600 text-[10px] px-2 py-0.5 rounded font-mono truncate max-w-[200px]"
                        >
                          {fileUrl}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* INTERVIEW ROUNDS CHRONOLOGICAL TIMELINE */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm border-b border-slate-200 pb-2">
                <Layers size={18} />
                <span>Interview Rounds Evaluation Timeline ({historyData.rounds?.length || 0} Rounds)</span>
              </div>

              {historyData.rounds && historyData.rounds.length > 0 ? (
                historyData.rounds.map((round: InterviewItem, index: number) => {
                  // Determine Panel Interviewers list (fallback to single interviewer_name if empty)
                  const interviewerList: InterviewerItem[] =
                    round.interviewers && round.interviewers.length > 0
                      ? round.interviewers
                      : [
                          {
                            interviewer_name: round.interviewer_name || "Interviewer",
                            interviewer_email: round.interviewer_email,
                            rating: round.rating,
                            feedback: round.feedback,
                            recommendation: round.recommendation,
                            strengths: round.strengths,
                            weaknesses: round.weaknesses,
                          },
                        ];

                  // Determine Panel Client Evaluators list (fallback to single client_name if empty)
                  const clientList: ClientFeedbackItem[] =
                    round.clients && round.clients.length > 0
                      ? round.clients
                      : [
                          {
                            client_name: round.client_name || "Client Evaluator",
                            client_rating: round.client_rating,
                            client_feedback: round.client_feedback,
                            client_recommendation: round.client_recommendation,
                            client_notes: round.client_notes,
                            client_feedback_date: round.client_feedback_date,
                            client_strengths: round.client_strengths,
                            client_weaknesses: round.client_weaknesses,
                          },
                        ];

                  return (
                    <div
                      key={round.id || index}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs relative"
                    >
                      {/* Round Banner Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-indigo-600 text-white font-bold text-xs px-3 py-1 rounded-xl shadow-xs">
                            Round {round.round_number} ({round.interview_type})
                          </div>
                          <div className="text-slate-700 font-semibold flex items-center gap-1">
                            <Calendar size={13} className="text-indigo-600" /> {round.scheduled_date} at {round.scheduled_time} ({round.timezone})
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {round.meeting_link && (
                            <a
                              href={round.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3 py-1 rounded-xl font-bold transition-all"
                            >
                              <Video size={13} />
                              <span>Join Meeting</span>
                            </a>
                          )}

                          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                            round.status === "COMPLETED"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-indigo-50 border-indigo-200 text-indigo-700"
                          }`}>
                            {round.status}
                          </span>
                        </div>
                      </div>

                      {/* 2-COLUMN GRID: MULTIPLE INTERVIEWERS (LEFT) & MULTIPLE CLIENTS (RIGHT) */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* LEFT COLUMN: INTERVIEWER PANEL CARDS */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                            <span className="font-bold text-purple-700 flex items-center gap-1 text-xs">
                              <Users size={14} /> Panel Interviewers ({interviewerList.length})
                            </span>
                          </div>

                          {interviewerList.map((intItem, intIdx) => (
                            <div key={intIdx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="font-bold text-slate-900 text-xs">
                                  {intItem.interviewer_name || `Interviewer ${intIdx + 1}`}
                                </span>
                                <span className="text-amber-600 font-bold text-xs bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                  ⭐ {intItem.rating ? `${intItem.rating} / 5` : "No Rating"}
                                </span>
                              </div>

                              {intItem.interviewer_email && (
                                <div className="text-slate-500 text-[11px]">
                                  Email: <span className="text-slate-800 font-medium">{intItem.interviewer_email}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-semibold">Outcome Recommendation:</span>
                                <span className={`font-bold text-xs ${
                                  intItem.recommendation === "Selected"
                                    ? "text-emerald-600"
                                    : intItem.recommendation === "Rejected"
                                    ? "text-rose-600"
                                    : "text-amber-600"
                                }`}>
                                  {intItem.recommendation || "Pending"}
                                </span>
                              </div>

                              {intItem.feedback && (
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Feedback Comments:</span>
                                  <p className="text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 leading-relaxed text-[11px]">
                                    {intItem.feedback}
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                                {intItem.strengths && intItem.strengths.length > 0 && (
                                  <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                                    <span className="text-emerald-700 font-bold block mb-0.5">Strengths:</span>
                                    <span className="text-slate-800">{Array.isArray(intItem.strengths) ? intItem.strengths.join(", ") : intItem.strengths}</span>
                                  </div>
                                )}

                                {intItem.weaknesses && intItem.weaknesses.length > 0 && (
                                  <div className="bg-rose-50 border border-rose-200 p-2 rounded-lg">
                                    <span className="text-rose-700 font-bold block mb-0.5">Areas for Improvement:</span>
                                    <span className="text-slate-800">{Array.isArray(intItem.weaknesses) ? intItem.weaknesses.join(", ") : intItem.weaknesses}</span>
                                  </div>
                                )}
                              </div>

                              {/* Dynamic Tech Skill Ratings Badge List */}
                              {((intItem.skill_ratings && intItem.skill_ratings.length > 0) || (round.skill_ratings && round.skill_ratings.length > 0)) && (
                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                                  <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">
                                    Dynamic Skill Ratings
                                  </span>
                                  <div className="flex flex-wrap gap-2 text-[11px]">
                                    {(intItem.skill_ratings || round.skill_ratings || []).map((sk: any, sIdx: number) => (
                                      <span key={sIdx} className="bg-white border border-slate-200 px-2 py-0.5 rounded font-bold text-slate-800 flex items-center gap-1">
                                        <span>{sk.skill_name} -</span>
                                        <span className="text-amber-500 font-extrabold">{sk.rating} ★</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* RIGHT COLUMN: CLIENT EVALUATORS PANEL CARDS */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                            <span className="font-bold text-teal-700 flex items-center gap-1 text-xs">
                              <Building2 size={14} /> Client Evaluators Panel ({clientList.length})
                            </span>
                          </div>

                          {clientList.map((clientItem, clientIdx) => (
                            <div key={clientIdx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 shadow-xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="font-bold text-slate-900 text-xs">
                                  {clientItem.client_name || `Client Evaluator ${clientIdx + 1}`}
                                </span>
                                <span className="text-teal-700 font-bold text-xs bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                                  ⭐ {clientItem.client_rating ? `${clientItem.client_rating} / 5` : "No Rating"}
                                </span>
                              </div>

                              {clientItem.client_feedback_date && (
                                <div className="text-slate-500 text-[11px]">
                                  Date: <span className="text-teal-700 font-medium">{clientItem.client_feedback_date}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-semibold">Client Outcome:</span>
                                <span className={`font-bold text-xs ${
                                  clientItem.client_recommendation === "Selected"
                                    ? "text-emerald-600"
                                    : clientItem.client_recommendation === "Rejected"
                                    ? "text-rose-600"
                                    : "text-amber-600"
                                }`}>
                                  {clientItem.client_recommendation || "Pending"}
                                </span>
                              </div>

                              {clientItem.client_feedback && (
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Client Feedback Comments:</span>
                                  <p className="text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1 leading-relaxed text-[11px]">
                                    {clientItem.client_feedback}
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                                {clientItem.client_strengths && clientItem.client_strengths.length > 0 && (
                                  <div className="bg-teal-50 border border-teal-200 p-2 rounded-lg">
                                    <span className="text-teal-700 font-bold block mb-0.5">Client Strengths:</span>
                                    <span className="text-slate-800">{Array.isArray(clientItem.client_strengths) ? clientItem.client_strengths.join(", ") : clientItem.client_strengths}</span>
                                  </div>
                                )}

                                {clientItem.client_weaknesses && clientItem.client_weaknesses.length > 0 && (
                                  <div className="bg-rose-50 border border-rose-200 p-2 rounded-lg">
                                    <span className="text-rose-700 font-bold block mb-0.5">Client Weaknesses:</span>
                                    <span className="text-slate-800">{Array.isArray(clientItem.client_weaknesses) ? clientItem.client_weaknesses.join(", ") : clientItem.client_weaknesses}</span>
                                  </div>
                                )}
                              </div>

                              {clientItem.client_notes && (
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">Client Specific Notes:</span>
                                  <p className="text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-0.5 font-medium text-[11px]">
                                    {clientItem.client_notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 text-xs italic py-4 text-center">No interview rounds recorded yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold transition-all cursor-pointer shadow-sm"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
