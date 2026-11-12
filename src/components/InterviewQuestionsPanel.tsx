import React, { useEffect, useRef, useState } from "react";
import { Brain, Code, User, Briefcase, Video, Upload, CheckCircle, XCircle } from "lucide-react";
import { generateInterviewQuestions, BASE_URL, apiFetch, getInterviewAiPrep, saveInterviewAiPrep } from "../utils/Api";
import { useFeedback } from "./ui/Feedback";

interface InterviewQuestionsPanelProps {
  candidateId: string;
  /** The round these questions belong to. With it, questions, transcript and scores are saved with the round. */
  interviewId?: string;
  roundSkills?: { skill_name: string; rating: number }[];
  roundCategories?: { category: string; weightage: number; rating: number }[];
}

// Models don't always return text for each field (a list of points, or an object, is common).
// Turn every field into text so one unusual answer can't blank the page.
const asText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join("\n");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(asText).filter(Boolean).join("\n");
  return String(v);
};

const normalizeQuestions = (data: any) => {
  const fix = (list: any) =>
    (Array.isArray(list) ? list : []).map((q: any) =>
      typeof q === "string" ? { question: q, expectedAnswer: "" } : { ...q, question: asText(q?.question), expectedAnswer: asText(q?.expectedAnswer) }
    );
  return { technical: fix(data?.technical), behavioral: fix(data?.behavioral), domain: fix(data?.domain) };
};

export function InterviewQuestionsPanel({ candidateId, interviewId, roundSkills, roundCategories }: InterviewQuestionsPanelProps) {
  const { toast, confirm } = useFeedback();

  const [interviewQuestions, setInterviewQuestions] = useState<any>(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTranscript, setVideoTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState<Record<string, any>>({});
  const [evaluatingQuestionId, setEvaluatingQuestionId] = useState<string | null>(null);

  // Saved with the round, so questions and scores are still there next time the panel opens
  const [loadingSaved, setLoadingSaved] = useState(!!interviewId);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef<{ questions: any; transcript: string | null; evaluations: Record<string, any> }>({ questions: null, transcript: null, evaluations: {} });

  useEffect(() => {
    if (!interviewId) return;
    let cancelled = false;
    setLoadingSaved(true);
    getInterviewAiPrep(interviewId)
      .then((prep) => {
        if (cancelled) return;
        const questions = prep.questions ? normalizeQuestions(prep.questions) : null;
        latest.current = { questions, transcript: prep.transcript || null, evaluations: prep.evaluations || {} };
        setInterviewQuestions(questions);
        setVideoTranscript(prep.transcript || null);
        setEvaluationResults(prep.evaluations || {});
        setSavedAt(prep.updated_at || null);
      })
      .catch(() => undefined) // Nothing saved yet, or offline: the panel still works, it just starts empty
      .finally(() => !cancelled && setLoadingSaved(false));
    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  const persist = async (patch: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...patch };
    if (!interviewId) return;
    try {
      const saved = await saveInterviewAiPrep(interviewId, latest.current);
      setSavedAt(saved.updated_at || new Date().toISOString());
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };

  const handleGenerateQuestions = async (replace = false) => {
    if (!candidateId) return;
    setGeneratingQuestions(true);
    setQuestionsError(null);
    try {
      const skillsList = roundSkills ? roundSkills.map(s => s.skill_name) : undefined;
      const categoriesList = roundCategories ? roundCategories.map(c => c.category) : undefined;
      
      let existingQuestionsText: string | undefined = undefined;
      if (interviewQuestions && !replace) {
        const allQuestions = [
          ...(interviewQuestions.technical || []),
          ...(interviewQuestions.behavioral || []),
          ...(interviewQuestions.domain || [])
        ].map(q => q.question);
        if (allQuestions.length > 0) {
          existingQuestionsText = allQuestions.join(" | ");
        }
      }
      
      const data = normalizeQuestions(await generateInterviewQuestions(candidateId, skillsList, categoriesList, existingQuestionsText));
      const prev = replace ? null : latest.current.questions;
      const next = !prev
        ? data
        : {
            technical: [...(prev.technical || []), ...(data.technical || [])],
            behavioral: [...(prev.behavioral || []), ...(data.behavioral || [])],
            domain: [...(prev.domain || []), ...(data.domain || [])],
          };
      setInterviewQuestions(next);
      // New questions are added at the end, so earlier scores still match their questions; a full regenerate clears them
      const evaluations = replace ? {} : latest.current.evaluations;
      if (replace) setEvaluationResults({});
      await persist({ questions: next, evaluations });
    } catch (err: any) {
      console.error(err);
      setQuestionsError(err.message || "Failed to generate questions.");
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
      setIsTranscribing(true);
      setVideoTranscript(null);
      
      const formData = new FormData();
      formData.append("file", e.target.files[0]);

      try {
        const response = await apiFetch(`${BASE_URL}/transcription/transcribe`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("Failed to transcribe video");
        }
        const data = await response.json();
        if (data.status === "success") {
          setVideoTranscript(data.transcription);
          await persist({ transcript: data.transcription });
        } else {
          throw new Error("Failed to transcribe video");
        }
      } catch (err) {
        console.error("Transcription error:", err);
        toast("Failed to transcribe the uploaded video.", "error");
      } finally {
        setIsTranscribing(false);
      }
    }
  };

  const handleEvaluateAnswer = async (qIndex: number, category: string, questionObj: any) => {
    if (!videoTranscript) {
      toast("Please upload and transcribe a video first.", "warning");
      return;
    }
    const qId = `${category}-${qIndex}`;
    setEvaluatingQuestionId(qId);
    
    try {
      const response = await apiFetch(`${BASE_URL}/transcription/evaluate-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: videoTranscript,
          expected_answer: questionObj.expectedAnswer,
          question: questionObj.question,
          evaluation_criteria: questionObj.evaluationCriteria
        }),
      });
      
      if (!response.ok) {
        throw new Error("Evaluation failed");
      }
      
      const data = await response.json();
      if (data.status === "success") {
        const evaluations = { ...latest.current.evaluations, [qId]: data.data };
        setEvaluationResults(evaluations);
        await persist({ evaluations });
      }
    } catch (err) {
      console.error("Evaluation error:", err);
      toast("Failed to evaluate answer.", "error");
    } finally {
      setEvaluatingQuestionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Brain size={18} className="text-indigo-600" /> AI Interview Prep & Video Evaluation
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Generate interview questions, upload candidate video, and evaluate transcript against expected answers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleGenerateQuestions()}
            disabled={generatingQuestions || loadingSaved}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 min-w-[180px]"
          >
            {generatingQuestions ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Code size={16} /> {interviewQuestions ? "Generate More Questions" : "Generate Questions"}
              </>
            )}
          </button>
          
          {interviewQuestions && (
            <button
              onClick={async () => {
                if (await confirm({ title: "Clear and regenerate all questions?", message: "The current questions and their scores are replaced.", confirmLabel: "Regenerate" })) {
                  handleGenerateQuestions(true);
                }
              }}
              disabled={generatingQuestions}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 min-w-[120px] cursor-pointer"
            >
              <Brain size={16} /> Re-generate
            </button>
          )}
        </div>
      </div>

      {interviewId && (loadingSaved || savedAt || saveError) && (
        <p className={`text-xs font-semibold ${saveError ? "text-rose-700" : "text-slate-500"}`} role="status">
          {loadingSaved
            ? "Loading saved questions..."
            : saveError
            ? "Couldn't save to this round. Questions are shown but will be lost when you close this."
            : `Saved with this round · ${new Date(savedAt as string).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}

      {questionsError && (
        <div className="p-4 text-xs font-semibold text-rose-700 bg-rose-50 rounded-xl border border-rose-200">
          {questionsError}
        </div>
      )}

      {interviewQuestions && (
        <div className="space-y-6">
          {/* Video Upload Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <Video size={16} className="text-indigo-600" /> Candidate Video Upload
            </h4>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <label className="flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl cursor-pointer text-indigo-700 text-xs font-bold bg-indigo-50 transition-colors w-full sm:w-auto">
                <Upload size={16} />
                {isTranscribing ? "Transcribing Video..." : "Upload Video for Evaluation"}
                <input type="file" accept="video/*,audio/*" className="hidden" onChange={handleVideoUpload} disabled={isTranscribing} />
              </label>
              {videoFile && (
                <div className="text-xs text-slate-600 font-medium truncate">
                  Uploaded: {videoFile.name}
                </div>
              )}
            </div>
            {videoTranscript && (
              <div className="mt-4 bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-slate-700 mb-1">Transcript:</p>
                <p className="text-xs text-slate-600 leading-relaxed">{videoTranscript}</p>
              </div>
            )}
          </div>

          {/* Render Questions Function */}
          {["technical", "behavioral", "domain"].map((category) => {
            if (!interviewQuestions[category] || interviewQuestions[category].length === 0) return null;
            
            const Icon = category === "technical" ? Code : category === "behavioral" ? User : Briefcase;
            const title = category === "technical" ? "Technical Assessment" : category === "behavioral" ? "Behavioral & Soft Skills" : "Domain & Experience";
            
            return (
              <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Icon size={16} className="text-indigo-600" /> {title}
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {interviewQuestions[category].map((q: any, i: number) => {
                    const qId = `${category}-${i}`;
                    const evalData = evaluationResults[qId];
                    const isEvaluating = evaluatingQuestionId === qId;
                    
                    return (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <p className="text-sm font-bold text-slate-800">Q{i + 1}. {q.question}</p>
                          <button
                            onClick={() => handleEvaluateAnswer(i, category, q)}
                            disabled={!videoTranscript || isEvaluating}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {isEvaluating ? "Evaluating..." : "Evaluate via Video"}
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                            <p className="text-xs font-bold text-emerald-800 mb-1">Expected Answer</p>
                            <div className="text-xs text-emerald-700/80 leading-relaxed whitespace-pre-wrap">
                              {q.expectedAnswer?.split('\n').map((line: string, idx: number) => {
                                const trimmed = line.trim();
                                if (!trimmed) return null;
                                return <div key={idx} className="mb-0.5">{trimmed.startsWith('-') || trimmed.startsWith('•') ? trimmed : `• ${trimmed}`}</div>;
                              })}
                            </div>
                          </div>
                          <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-800 mb-1">Evaluation Criteria</p>
                            <p className="text-xs text-indigo-700/80 leading-relaxed">{q.evaluationCriteria}</p>
                          </div>
                        </div>

                        {evalData && (
                          <div className={`mt-4 p-4 rounded-xl border ${evalData.is_match ? 'bg-green-50 border-green-200' : 'bg-rose-50 border-rose-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {evalData.is_match ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-rose-600" />}
                              <p className={`text-xs font-bold ${evalData.is_match ? 'text-green-800' : 'text-rose-800'}`}>
                                Match Score: {evalData.score}/100
                              </p>
                            </div>
                            <p className={`text-xs ${evalData.is_match ? 'text-green-700' : 'text-rose-700'} leading-relaxed`}>
                              {evalData.feedback}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
