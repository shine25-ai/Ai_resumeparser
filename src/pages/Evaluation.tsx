import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Mail, Phone, MapPin, ChevronDown, CheckCircle2,
  ExternalLink, User, Award, Brain, Briefcase, GraduationCap, Code, Edit3, X, Save, Paperclip, FileText, Upload, Camera, Trash2,
  Calendar, MessageSquareCheck, ThumbsUp, AlertTriangle, DollarSign, Video, Clock, Building2, Users, Layers
} from "lucide-react";
import { getResumeById, getResumes, updateResume, RESUME_DOCUMENTS, RESUME_PROFILE_PICTURE, apiFetch } from "../utils/Api";
import { formatExperience, getAllSkills } from "../utils/candidateFields";
import { getStageBadge, getVerdictBadge } from "../utils/interviewState";
import { useFeedback } from "../components/ui/Feedback";
import ResumeCategoryPicker from "../components/ResumeCategoryPicker";
import { CompanyPills, appliedCompanies } from "../components/CompanyTags";
import { BulkFeedbackModal } from "../components/BulkFeedbackModal";

function renderStarRating(rating: number | null | undefined, maxStars = 5) {
  if (rating === null || rating === undefined || isNaN(Number(rating))) {
    return <span className="text-slate-400 text-xs font-semibold whitespace-nowrap">Not Rated</span>;
  }
  const clamped = Math.max(0, Math.min(maxStars, Number(rating)));
  return (
    <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
      <div className="flex items-center text-amber-400 select-none">
        {Array.from({ length: maxStars }).map((_, i) => {
          const starVal = i + 1;
          const isFull = clamped >= starVal;
          const isHalf = !isFull && clamped >= starVal - 0.5;
          return (
            <span key={i} className="text-sm leading-none drop-shadow-2xs">
              {isFull ? "★" : isHalf ? "★" : "☆"}
            </span>
          );
        })}
      </div>
      <span className="text-xs font-black text-slate-800 ml-0.5 whitespace-nowrap">
        {clamped.toFixed(1)} <span className="text-slate-400 font-semibold text-[10px]">/ {maxStars}</span>
      </span>
    </div>
  );
}

const normalizeList = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (typeof val === "string") return val.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
};

function parseCategoryTitle(raw: string): { title: string; criteria: string } {
  if (!raw) return { title: "Evaluation Category", criteria: "" };
  if (raw.includes(" - ")) {
    const parts = raw.split(" - ");
    return { title: parts[0].trim(), criteria: parts.slice(1).join(" - ").trim() };
  }
  if (raw.includes(" -- ")) {
    const parts = raw.split(" -- ");
    return { title: parts[0].trim(), criteria: parts.slice(1).join(" -- ").trim() };
  }
  const commonSplits = ["Collaboration", "Logical thinking", "Fluency"];
  for (const s of commonSplits) {
    const idx = raw.indexOf(s);
    if (idx > 5) {
      return {
        title: raw.slice(0, idx).replace(/[\s,:-]+$/, "").trim(),
        criteria: raw.slice(idx).trim()
      };
    }
  }
  return { title: raw.trim(), criteria: "" };
}

function parseSkillName(raw: string): { name: string; tag?: string } {
  if (!raw) return { name: "Technical Skill" };
  if (raw.includes(" - ")) {
    const [name, ...rest] = raw.split(" - ");
    return { name: name.trim(), tag: rest.join(" - ").trim() };
  }
  return { name: raw.trim() };
}

function getCategoryRating(categories: any[], keywords: string[]): string | null {
  if (!categories || !categories.length) return null;
  const match = categories.find((c: any) => {
    const text = ((c.category || c.skill_name || "") + " " + (c.feedback || "")).toLowerCase();
    return keywords.some((k) => text.includes(k.toLowerCase()));
  });
  if (!match) return null;
  if (match.rating !== undefined && match.rating !== null && !isNaN(Number(match.rating))) {
    return `${Number(match.rating).toFixed(1)} / 5`;
  }
  if (match.score !== undefined && match.weightage) {
    const pct = Math.round((Number(match.score) / Number(match.weightage)) * 100);
    return `${pct}% (${match.score}/${match.weightage} pts)`;
  }
  return match.score !== undefined && match.score !== null ? `${match.score}` : null;
}

function TraitBar({ label, value, colorClass }: { label: string; value: number | null | undefined; colorClass: string }) {
  const numVal = typeof value === "number" ? Math.min(100, Math.max(0, value)) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-bold text-slate-800">{numVal !== null ? `${numVal}%` : "N/A"}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${numVal !== null ? colorClass : "bg-transparent"}`}
          style={{ width: `${numVal ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export default function Evaluation() {
  const { toast, confirm } = useFeedback();

  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<any>(null);
  const [resumesList, setResumesList] = useState<any[]>([]);
  const [resumesLoading, setResumesLoading] = useState<boolean>(true);
  const [selectedResumeId, setSelectedResumeId] = useState<string>(id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Experience");
  const [selectedInterviewIdx, setSelectedInterviewIdx] = useState<number>(0);

  // Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Document upload states
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Cover Letter");
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingProfilePic, setIsUpdatingProfilePic] = useState(false);
  const [profilePicFailed, setProfilePicFailed] = useState(false);

  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    total_experience_years: "",
    leadership_score: "",
    team_player: "",
    job_hopping_risk: "",
    communication: "",
    problem_solving: "",
    recommended_upskilling: "",
    skill_weaknesses: "",
    architecture_and_design_capabilities: "",
    interview_focus_areas: "",
    resume_red_flags: "",
  });

  // Fetch list of resumes to populate candidate dropdown
  useEffect(() => {
    setResumesLoading(true);
    getResumes()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.resumes || [];
        setResumesList(list);
        if (!id && list.length > 0) {
          setSelectedResumeId(list[0].id);
        }
      })
      .catch((err) => {
        console.error("Error fetching resumes dropdown list:", err);
      })
      .finally(() => {
        setResumesLoading(false);
      });
  }, []);

  // Fetch candidate details whenever selectedResumeId changes
  useEffect(() => {
    const targetId = selectedResumeId || id;
    if (targetId) {
      setLoading(true);
      setError(null);
      getResumeById(targetId)
        .then((data) => {
          setProfilePicFailed(false);
          setCandidate(data);
          setLoading(false);
        })
        .catch((e) => {
          console.error("Error fetching candidate evaluation:", e);
          setError("Failed to load candidate details from backend database.");
          setLoading(false);
        });
    } else {
      setLoading(false);
      setError("No candidate ID specified in route.");
    }
  }, [selectedResumeId, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading Candidate Profile...</span>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="bg-white text-slate-800 border border-slate-200 shadow-sm min-h-screen p-6 rounded-2xl space-y-6 font-sans">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="p-8 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl font-semibold">
          {error || "Candidate profile record not found."}
        </div>
      </div>
    );
  }

  const navTabs = ["Experience", "Skills", "Interview Feedback", "Projects", "Education", "Certifications", "AI Insights", "Documents"];

  const parsed = candidate?.parsed_data || {};
  const evalData = candidate?.ai_evaluation || {};

  // Clean email formatting (remove accidental spaces e.g. "t h i n e s h...")
  const rawEmail = parsed.email || "N/A";
  const email = rawEmail !== "N/A" ? rawEmail.replace(/\s+/g, "") : "N/A";

  const name = parsed.full_name || parsed.name || candidate?.original_filename || "Candidate Record";
  const status = (candidate?.status || "PARSED").toUpperCase();
  const phone = parsed.phone || "N/A";
  const location = parsed.location || "N/A";
  const linkedin = parsed.linkedin || "";
  const github = parsed.github || "";
  const resumeSource = candidate?.resume_source || "N/A";
  const resumeSourceInformerName = candidate?.resume_source_informer_name || "N/A";
  const aiScore = evalData.ai_technical_score ?? 0;
  const expLevel = evalData.experience_level || "Not Specified";
  const seniority = parsed.seniority || expLevel;
  const currentRole = parsed.current_role || "Role Not Specified";
  const primaryDomain = parsed.primary_domain || "Domain Not Specified";
  const specialization = parsed.specialization || "";
  const scoreLabel = evalData.recommendation || (aiScore >= 80 ? "Highly Recommended Candidate" : aiScore >= 60 ? "Suitable Candidate" : "Needs Review");

  const totalExp = formatExperience(parsed, "Years");

  // Skill groups shown on the profile; allSkills combines every group
  const primarySkills = parsed.primary_skills || [];
  const databases = parsed.databases || [];
  const programmingLanguages = parsed.programming_languages || [];
  const devopsAndInfra = parsed.devops_and_infrastructure || [];
  const otherTechnologies = parsed.other_technologies || [];
  const functionalSkills: string[] = parsed.functional_skills || [];
  const allSkills = getAllSkills(parsed);

  const s3Url = candidate?.s3_url || "";
  const experiences = parsed.experience || [];
  const education = parsed.education || [];
  const projects = parsed.projects || [];
  const certifications = parsed.certifications || [];

  const originalSkillStrengths = evalData.skill_strengths || [];
  const originalSkillWeaknesses = evalData.skill_weaknesses || [];
  const personality = evalData.personality_analysis || {};
  const careerAnalysis = evalData.career_analysis || {};

  const originalArchitecture = evalData.architecture_and_design_capabilities;
  const originalInterviewFocus = evalData.interview_focus_areas || [];
  const originalRedFlags = evalData.resume_red_flags || [];

  // HR Updates array handling
  const hrUpdatesList: any[] = candidate?.hr_updates || [];
  const latestHrUpdate = hrUpdatesList.length > 0 ? hrUpdatesList[hrUpdatesList.length - 1] : null;

  // Multi-interview rounds array handling
  const candidateInterviews: any[] = candidate?.interviews && Array.isArray(candidate.interviews) && candidate.interviews.length > 0
    ? candidate.interviews
    : candidate?.latest_interview ? [candidate.latest_interview] : [];

  const activeInterview = candidateInterviews[selectedInterviewIdx] || candidateInterviews[0] || candidate?.latest_interview || null;

  // Calculate average overall score combining AI Technical Score and active Interview Score if available
  let rawInterviewScoreNum: number | null = null;
  if (activeInterview?.ai_score !== undefined && activeInterview?.ai_score !== null) {
    rawInterviewScoreNum = Number(activeInterview.ai_score);
  } else if (activeInterview?.rating !== undefined && activeInterview?.rating !== null) {
    rawInterviewScoreNum = (Number(activeInterview.rating) / 5) * 100;
  }

  const overallAverageScore = rawInterviewScoreNum !== null && !isNaN(rawInterviewScoreNum)
    ? Math.round((aiScore + rawInterviewScoreNum) / 2)
    : aiScore;

  // Active Interview Feedback normalizations with smart panel fallback
  const activeStrengths = normalizeList(activeInterview?.strengths);
  const activeWeaknessesList = normalizeList(activeInterview?.weaknesses);
  const activeCategoryScores: any[] = Array.isArray(activeInterview?.category_scores) ? activeInterview.category_scores : [];
  const activeSkillRatings: any[] = Array.isArray(activeInterview?.skill_ratings) ? activeInterview.skill_ratings : [];
  const activePanelInterviewers: any[] = Array.isArray(activeInterview?.interviewers) ? activeInterview.interviewers : [];
  const activeClientList: any[] = Array.isArray(activeInterview?.clients) ? activeInterview.clients : [];

  const primaryInterviewer = activePanelInterviewers.length > 0 ? activePanelInterviewers[0] : null;
  const resolvedFeedback = (activeInterview?.feedback && activeInterview.feedback.trim()) 
    || (primaryInterviewer?.feedback && primaryInterviewer.feedback.trim()) 
    || "";
  const resolvedNotes = (activeInterview?.notes && activeInterview.notes.trim())
    || (activeInterview?.reason_note && activeInterview.reason_note.trim())
    || (primaryInterviewer?.reason_note && primaryInterviewer.reason_note.trim())
    || "";
  const resolvedStrengths = activeStrengths.length > 0 
    ? activeStrengths 
    : normalizeList(primaryInterviewer?.strengths);
  const resolvedWeaknesses = activeWeaknessesList.length > 0 
    ? activeWeaknessesList 
    : normalizeList(primaryInterviewer?.weaknesses);
  const resolvedInterviewerRating = (activeInterview?.rating !== undefined && activeInterview?.rating !== null)
    ? activeInterview.rating
    : primaryInterviewer?.rating ?? null;
  const resolvedVerdict = activeInterview?.recommendation || primaryInterviewer?.recommendation || activeInterview?.client_recommendation || "Pending";

  const showPanelBreakdown = activePanelInterviewers.length > 1;

  const hasRealClientFeedback = Boolean(
    (activeInterview?.client_rating !== undefined && activeInterview?.client_rating !== null) ||
    (activeInterview?.client_feedback && activeInterview.client_feedback.trim().length > 0) ||
    (activeInterview?.client_notes && activeInterview.client_notes.trim().length > 0) ||
    (activeInterview?.client_recommendation && activeInterview.client_recommendation !== "Pending" && activeInterview.client_recommendation !== "Hold") ||
    (activeClientList.length > 0 && activeClientList.some((c: any) => c.client_feedback || c.client_rating))
  );

  const hasRealHrDiscussion = Boolean(
    (activeInterview?.salary_requested && activeInterview.salary_requested.trim() && activeInterview.salary_requested !== "Not Specified") ||
    (activeInterview?.final_fit_salary && activeInterview.final_fit_salary.trim() && activeInterview.final_fit_salary !== "Under Discussion") ||
    (activeInterview?.joining_date && activeInterview.joining_date.trim() && activeInterview.joining_date !== "To Be Confirmed") ||
    (activeInterview?.hr_call_verification && activeInterview.hr_call_verification !== "Pending")
  );

  // Active score values (favoring HR Update values if provided, falling back to original AI evaluation values)
  const activeLeadership = latestHrUpdate?.leadership_score ?? personality.leadership ?? null;
  const activeTeamPlayer = latestHrUpdate?.team_player ?? personality.team_player ?? null;
  const activeJobHopping = latestHrUpdate?.job_hopping_risk ?? careerAnalysis.job_hopping_risk ?? null;
  const activeCommunication = latestHrUpdate?.communication ?? personality.communication ?? null;
  const activeProblemSolving = latestHrUpdate?.problem_solving ?? personality.problem_solving ?? null;
  const activeArchitecture = latestHrUpdate?.architecture_and_design_capabilities ?? originalArchitecture ?? null;

  const activeWeaknesses: string[] = latestHrUpdate?.skill_weaknesses ?? originalSkillWeaknesses;
  const activeUpskilling: string[] = latestHrUpdate?.recommended_upskilling ?? (careerAnalysis.recommended_upskilling || []);
  const activeInterviewFocus: string[] = latestHrUpdate?.interview_focus_areas ?? originalInterviewFocus;
  const activeRedFlags: string[] = latestHrUpdate?.resume_red_flags ?? originalRedFlags;

  const handleUploadDoc = async () => {
    if (!docFile || !candidate?.id) return;
    setIsUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", docFile);
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await apiFetch(
        `${RESUME_DOCUMENTS(candidate.id)}?doc_type=${encodeURIComponent(docType)}&doc_title=${encodeURIComponent(docTitle || docFile.name)}`,
        { method: "POST", headers, body: formData }
      );
      const data = await res.json();
      if (res.ok) {
        setCandidate(data.data || data);
        setDocFile(null);
        setDocTitle("");
      } else {
        toast(data.message || "Failed to upload document.", "error");
      }
    } catch {
      toast("Upload failed.", "error");
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleProfilePicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !candidate?.id) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("Profile picture must be a JPG, PNG, or WEBP image.", "warning");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Profile picture size exceeds the 5 MB limit.", "warning");
      return;
    }
    setIsUpdatingProfilePic(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await apiFetch(RESUME_PROFILE_PICTURE(candidate.id), { method: "POST", headers, body: formData });
      const data = await res.json();
      if (res.ok) {
        setProfilePicFailed(false);
        setCandidate(data.data || data);
      } else {
        toast(data.message || "Failed to upload profile picture.", "error");
      }
    } catch {
      toast("Upload failed.", "error");
    } finally {
      setIsUpdatingProfilePic(false);
    }
  };

  const handleRemoveProfilePic = async () => {
    if (!candidate?.id || !(await confirm({ title: "Remove this candidate's profile picture?", confirmLabel: "Remove", danger: true }))) return;
    setIsUpdatingProfilePic(true);
    try {
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await apiFetch(RESUME_PROFILE_PICTURE(candidate.id), { method: "DELETE", headers });
      const data = await res.json();
      if (res.ok) {
        setCandidate(data.data || data);
      } else {
        toast(data.message || "Failed to remove profile picture.", "error");
      }
    } catch {
      toast("Failed to remove profile picture.", "error");
    } finally {
      setIsUpdatingProfilePic(false);
    }
  };

  const handleOpenEditModal = () => {
    setEditForm({
      full_name: parsed.full_name || parsed.name || "",
      email: email !== "N/A" ? email : "",
      phone: phone !== "N/A" ? phone : "",
      location: location !== "N/A" ? location : "",
      total_experience_years: parsed.total_experience_years ?? parsed.years_of_experience ?? "",
      leadership_score: activeLeadership !== null ? String(activeLeadership) : "",
      team_player: activeTeamPlayer !== null ? String(activeTeamPlayer) : "",
      job_hopping_risk: activeJobHopping !== null ? String(activeJobHopping) : "",
      communication: activeCommunication !== null ? String(activeCommunication) : "",
      problem_solving: activeProblemSolving !== null ? String(activeProblemSolving) : "",
      architecture_and_design_capabilities: activeArchitecture !== null ? String(activeArchitecture) : "",
      recommended_upskilling: Array.isArray(activeUpskilling) ? activeUpskilling.join(", ") : "",
      skill_weaknesses: Array.isArray(activeWeaknesses) ? activeWeaknesses.join(", ") : "",
      interview_focus_areas: Array.isArray(activeInterviewFocus) ? activeInterviewFocus.join(", ") : "",
      resume_red_flags: Array.isArray(activeRedFlags) ? activeRedFlags.join(", ") : "",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate?.id) return;
    try {
      setIsUpdating(true);
      const payload: any = {
        parsed_data: {
          full_name: editForm.full_name,
          email: editForm.email,
          phone: editForm.phone,
          location: editForm.location,
          total_experience_years: editForm.total_experience_years !== "" ? Number(editForm.total_experience_years) : undefined,
        },
        hr_update: {
          leadership_score: editForm.leadership_score !== "" ? Number(editForm.leadership_score) : undefined,
          team_player: editForm.team_player !== "" ? Number(editForm.team_player) : undefined,
          job_hopping_risk: editForm.job_hopping_risk !== "" ? Number(editForm.job_hopping_risk) : undefined,
          communication: editForm.communication !== "" ? Number(editForm.communication) : undefined,
          problem_solving: editForm.problem_solving !== "" ? Number(editForm.problem_solving) : undefined,
          architecture_and_design_capabilities: editForm.architecture_and_design_capabilities || undefined,
          recommended_upskilling: editForm.recommended_upskilling
            ? editForm.recommended_upskilling.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
          skill_weaknesses: editForm.skill_weaknesses
            ? editForm.skill_weaknesses.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
          interview_focus_areas: editForm.interview_focus_areas
            ? editForm.interview_focus_areas.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
          resume_red_flags: editForm.resume_red_flags
            ? editForm.resume_red_flags.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
        },
      };

      const updated = await updateResume(candidate.id, payload);
      setCandidate(updated);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error("Failed to update resume:", err);
      toast(err.message || "Failed to save update.", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-12 font-sans text-slate-900">
      {/* 1. Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200/80">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => navigate("/database")}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Candidates</span>
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-bold text-slate-900 truncate max-w-[220px]">{name}</span>
          {latestHrUpdate && (
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
              HR Updated
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Quick Candidate Switcher */}
          <div className="relative min-w-[220px] max-w-[320px] flex-1 sm:flex-initial">
            <select
              value={candidate?.id || selectedResumeId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedResumeId(newId);
                navigate(`/candidates/${newId}`, { replace: true });
              }}
              aria-label="Switch candidate"
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-1.5 pr-7 appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer font-semibold transition-colors"
            >
              {resumesLoading ? (
                <option value="" disabled>Loading candidates...</option>
              ) : resumesList.length === 0 ? (
                <option value="" disabled>No candidates available</option>
              ) : null}
              {resumesList.map((res: any) => {
                const resParsed = res.parsed_data || {};
                const fullName = resParsed.full_name || resParsed.name || res.original_filename || "Candidate";
                return (
                  <option key={res.id} value={res.id}>
                    {fullName}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Action Toolbar */}
          <button
            onClick={() => navigate("/interviews", {
              state: {
                scheduleCandidate: {
                  candidate_id: candidate?.id,
                  candidate_name: name,
                  candidate_email: email !== "N/A" ? email : "",
                  resume_id: candidate?.id,
                  job_title: currentRole,
                },
              },
            })}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Calendar size={13} />
            <span>Schedule Interview</span>
          </button>

          <button
            onClick={handleOpenEditModal}
            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
          >
            <Edit3 size={13} className="text-slate-500" />
            <span>Edit</span>
          </button>

          {s3Url && (
            <a
              href={s3Url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-2xs"
            >
              <ExternalLink size={13} className="text-slate-500" />
              <span>Resume</span>
            </a>
          )}
        </div>
      </div>

      {/* 2. Executive Candidate Hero Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 flex-1">
          {/* Avatar with Camera upload */}
          <div className="relative w-20 h-20 shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50/80 border-2 border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs overflow-hidden">
              {candidate?.profile_picture_url && !profilePicFailed ? (
                <img
                  src={candidate.profile_picture_url}
                  alt={`${name} profile`}
                  onError={() => setProfilePicFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={36} className="text-indigo-400" />
              )}
              {isUpdatingProfilePic && (
                <div className="absolute inset-0 rounded-2xl bg-white/80 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={profilePicInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleProfilePicChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => profilePicInputRef.current?.click()}
              disabled={isUpdatingProfilePic}
              title={candidate?.profile_picture_url ? "Change profile picture" : "Upload profile picture"}
              aria-label="Upload profile picture"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-white flex items-center justify-center shadow-xs transition-all cursor-pointer disabled:opacity-60"
            >
              <Camera size={12} />
            </button>
            {candidate?.profile_picture_url && (
              <button
                type="button"
                onClick={handleRemoveProfilePic}
                disabled={isUpdatingProfilePic}
                title="Remove profile picture"
                aria-label="Remove profile picture"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>

          {/* Core Info */}
          <div className="space-y-2 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStageBadge(candidate?.stage || "Screening")}`}>
                {candidate?.stage || "Screening"}
              </span>
              {status !== "PARSED" && (
                <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {status}
                </span>
              )}
              <span className="bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {seniority}
              </span>
              {primaryDomain !== "Domain Not Specified" && (
                <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {primaryDomain}
                </span>
              )}
            </div>

            <div className="text-xs font-semibold text-slate-600">
              <span className="text-slate-800 font-bold">{currentRole}</span>
              {specialization && <span className="text-slate-400"> • {specialization}</span>}
              <span className="text-slate-400"> • </span>
              <span className="text-indigo-600 font-bold">{totalExp}</span>
            </div>

            {/* Contact Row */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-1.5 text-xs text-slate-500 pt-1">
              <a href={`mailto:${email}`} className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                <Mail size={13} className="text-slate-400" />
                <span>{email}</span>
              </a>
              <a href={`tel:${phone}`} className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                <Phone size={13} className="text-slate-400" />
                <span>{phone}</span>
              </a>
              <div className="flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                <span>{location}</span>
              </div>
              {linkedin && (
                <a
                  href={linkedin.startsWith("http") ? linkedin : `https://${linkedin}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  <span className="bg-[#0a66c2] text-white w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[10px] font-bold">in</span>
                  <span className="truncate max-w-[140px]">{linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "")}</span>
                </a>
              )}
              {github && (
                <a
                  href={github.startsWith("http") ? github : `https://${github}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-semibold"
                >
                  <svg className="w-3.5 h-3.5 fill-current text-slate-600" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span className="truncate max-w-[140px]">{github.replace(/^https?:\/\/(www\.)?github\.com\//, "")}</span>
                </a>
              )}
            </div>

            {/* Metadata Pills */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">Source: <strong className="text-slate-700 capitalize">{resumeSource}</strong></span>
              {resumeSourceInformerName && resumeSourceInformerName !== "N/A" && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500 font-medium">By: <strong className="text-indigo-600">{resumeSourceInformerName}</strong></span>
                </>
              )}
              <span className="text-slate-300">•</span>
              <ResumeCategoryPicker
                resumeId={candidate.id}
                value={candidate.category}
                onSaved={(updated) => setCandidate((prev: any) => ({ ...prev, ...updated }))}
              />
            </div>
          </div>
        </div>

        {/* Careers Portal Application Preview (if applied) */}
        {(candidate.applicant_heard_from || candidate.applicant_note || appliedCompanies(candidate).length > 0) && (
          <div className="w-full md:w-72 bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 space-y-1.5 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Job Application</span>
            {(candidate.applied_jobs || []).length > 0 ? (
              <div className="space-y-1">
                {[...(candidate.applied_jobs || [])].reverse().slice(0, 2).map((job: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <CompanyPills companies={[{ id: job.company_id, name: job.company_name || "Company", roles: [] }]} size="sm" />
                    <span className="font-bold text-slate-800 truncate max-w-[150px]">{job.job_title}</span>
                  </div>
                ))}
              </div>
            ) : (
              <CompanyPills companies={appliedCompanies(candidate)} size="sm" />
            )}
            {candidate.applicant_heard_from && (
              <p className="text-[11px] text-slate-500 truncate">
                Heard via: <strong className="text-slate-700">{candidate.applicant_heard_from}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3. Two-Column SaaS Content Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Rich Information Tabs (col-span-8) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
          {/* Segmented Tab Bar */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 overflow-x-auto scrollbar-none shadow-2xs">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-white text-indigo-700 shadow-xs border border-slate-200/90"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  {tab === "Experience" && <Briefcase size={13} />}
                  {tab === "Skills" && <Code size={13} />}
                  {tab === "Interview Feedback" && <MessageSquareCheck size={13} />}
                  {tab === "Projects" && <Award size={13} />}
                  {tab === "Education" && <GraduationCap size={13} />}
                  {tab === "Certifications" && <CheckCircle2 size={13} />}
                  {tab === "AI Insights" && <Brain size={13} />}
                  {tab === "Documents" && <FileText size={13} />}
                  <span>{tab}</span>
                  {tab === "Interview Feedback" && candidateInterviews.length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"}`}>
                      {candidateInterviews.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        {/* Tab Content Section */}
        {activeTab === "Experience" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Briefcase size={16} className="text-indigo-600" /> Work Experience
            </h3>
            {experiences.length > 0 ? (
              <div className="space-y-4">
                {experiences.map((exp: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex flex-wrap justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-900">
                        {exp.designation || "Role"} - <span className="text-indigo-600">{exp.company}</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">{exp.duration || "N/A"}</span>
                    </div>
                    {exp.responsibilities && (
                      <div className="pt-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">Responsibilities</span>
                        <p className="text-xs text-slate-700 leading-relaxed mt-1">
                          {Array.isArray(exp.responsibilities) ? exp.responsibilities.join(" ") : exp.responsibilities}
                        </p>
                      </div>
                    )}
                    {exp.technologies_used && Array.isArray(exp.technologies_used) && exp.technologies_used.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Technologies Used</span>
                        <div className="flex flex-wrap gap-1">
                          {exp.technologies_used.map((t: string, ti: number) => (
                            <span key={ti} className="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {exp.achievements && Array.isArray(exp.achievements) && exp.achievements.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-bold text-emerald-600 uppercase block mb-1">Key Achievements</span>
                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                          {exp.achievements.map((ach: string, ai: number) => (
                            <li key={ai}>{ach}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {exp.leadership_responsibilities && (
                      <div className="pt-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">Leadership Responsibilities</span>
                        <p className="text-xs text-slate-700 leading-relaxed mt-1">{exp.leadership_responsibilities}</p>
                      </div>
                    )}
                    {(exp.business_domain || exp.team_size) && (
                      <div className="flex gap-4 pt-2 border-t border-slate-200 mt-2">
                        {exp.business_domain && (
                          <div className="text-[11px]"><span className="font-bold text-slate-500">Domain:</span> <span className="text-slate-700">{exp.business_domain}</span></div>
                        )}
                        {exp.team_size && (
                          <div className="text-[11px]"><span className="font-bold text-slate-500">Team Size:</span> <span className="text-slate-700">{exp.team_size}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">No work experience entries parsed.</div>
            )}
          </div>
        )}

        {activeTab === "Education" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap size={16} className="text-indigo-600" /> Education Details
            </h3>
            {education.length > 0 ? (
              education.map((edu: any, idx: number) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex justify-between items-center text-xs">
                  <div>
                    <h4 className="font-bold text-slate-900">{edu.degree}</h4>
                    <p className="text-slate-500">{edu.institution}</p>
                    {edu.score && <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Score / CGPA: {edu.score}</p>}
                  </div>
                  <span className="text-slate-500 font-medium">{edu.year_of_passing || edu.year}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500">No education entries parsed.</div>
            )}
          </div>
        )}

        {activeTab === "Skills" && (
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Code size={16} className="text-indigo-600" /> Extracted Technical & Domain Skills
            </h3>

            {primarySkills.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold">Primary Roles / Skills</span>
                <div className="flex flex-wrap gap-2">
                  {primarySkills.map((s: string, i: number) => (
                    <span key={i} className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {databases.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold font-mono">Databases</span>
                <div className="flex flex-wrap gap-2">
                  {databases.map((s: string, i: number) => (
                    <span key={i} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {programmingLanguages.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold font-mono">Programming Languages</span>
                <div className="flex flex-wrap gap-2">
                  {programmingLanguages.map((s: string, i: number) => (
                    <span key={i} className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {devopsAndInfra.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold font-mono">DevOps & Infrastructure</span>
                <div className="flex flex-wrap gap-2">
                  {devopsAndInfra.map((s: string, i: number) => (
                    <span key={i} className="bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {functionalSkills.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold font-mono">Functional Skills</span>
                <div className="flex flex-wrap gap-2">
                  {functionalSkills.map((s: string, i: number) => (
                    <span key={i} className="bg-slate-100 border border-slate-300 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {otherTechnologies.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold font-mono">Other Technologies</span>
                <div className="flex flex-wrap gap-2">
                  {otherTechnologies.map((s: string, i: number) => (
                    <span key={i} className="bg-slate-100 border border-slate-300 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {allSkills.length > 0 ? (
              <div>
                <span className="text-xs text-slate-500 block mb-2 font-semibold">All Skills</span>
                <div className="flex flex-wrap gap-2">
                  {allSkills.map((skill: string, idx: number) => (
                    <span key={idx} className="bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-1.5 rounded-lg font-semibold">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">No skills parsed.</div>
            )}
          </div>
        )}

        {/* Dedicated Detailed Interview Feedback Tab */}
        {activeTab === "Interview Feedback" && (
          <div className="space-y-6 font-sans">
            {candidateInterviews.length === 0 ? (
              <div className="py-16 px-6 text-center rounded-2xl bg-slate-50/70 border border-dashed border-slate-300 flex flex-col items-center justify-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                  <MessageSquareCheck size={28} />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">No Interview Feedback Yet</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    This candidate has not been scheduled for any interview rounds yet. Schedule a technical, screening, or client evaluation round to record ratings, skills scores, and structured evaluator feedback.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/interviews", {
                    state: {
                      scheduleCandidate: {
                        candidate_id: candidate?.id,
                        candidate_name: name,
                        candidate_email: email !== "N/A" ? email : "",
                        resume_id: candidate?.id,
                        job_title: currentRole,
                      },
                    },
                  })}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Calendar size={14} />
                  <span>Schedule First Interview Round</span>
                </button>
              </div>
            ) : (
              <>
                {/* 1. Multi-Round Selector & Navigation Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200/90 rounded-2xl">
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none">
                    {candidateInterviews.map((inv: any, idx: number) => {
                      const roundNum = inv.round_number || idx + 1;
                      const isSelected = selectedInterviewIdx === idx;
                      const rRating = inv.rating !== undefined && inv.rating !== null ? `${inv.rating}★` : null;
                      const rVerdict = inv.recommendation || inv.client_recommendation || null;
                      return (
                        <button
                          key={inv.id || idx}
                          onClick={() => setSelectedInterviewIdx(idx)}
                          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-100"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${isSelected ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-700"}`}>
                            {roundNum}
                          </span>
                          <span>Round {roundNum}: {inv.interview_type || "Technical"}</span>
                          {rRating && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${isSelected ? "bg-indigo-700 text-white" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                              {rRating}
                            </span>
                          )}
                          {rVerdict && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${isSelected ? "bg-white/20 text-white" : getVerdictBadge(rVerdict)}`}>
                              {rVerdict}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => navigate("/interviews", {
                      state: {
                        scheduleCandidate: {
                          candidate_id: candidate?.id,
                          candidate_name: name,
                          candidate_email: email !== "N/A" ? email : "",
                          resume_id: candidate?.id,
                          job_title: currentRole,
                        },
                      },
                    })}
                    className="shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  >
                    <Calendar size={13} />
                    <span>+ Schedule Next Round</span>
                  </button>
                </div>

                {/* 2. Selected Round Executive Hero Header */}
                <div className="p-5 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight">
                          {activeInterview?.job_title || "Technical Interview Round"}
                        </h3>
                        <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                          Round {activeInterview?.round_number || 1} • {activeInterview?.interview_type || "Technical"}
                        </span>
                        {activeInterview?.status && (
                          <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
                            {activeInterview.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Candidate: <strong className="text-slate-800">{name}</strong> ({currentRole})
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {resolvedVerdict && (
                        <span className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border ${getVerdictBadge(resolvedVerdict)}`}>
                          <span>•</span>
                          <span>{resolvedVerdict}</span>
                        </span>
                      )}
                      <button
                        onClick={() => setIsFeedbackModalOpen(true)}
                        className="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>Edit Feedback</span>
                      </button>
                    </div>
                  </div>

                  {/* Evaluator & Session Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-200/70 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                        <User size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Evaluator</span>
                        <span className="font-bold text-slate-800 truncate block">{activeInterview?.interviewer_name || "Lead Evaluator"}</span>
                        {activeInterview?.interviewer_email && (
                          <span className="text-[10px] text-slate-500 truncate block">{activeInterview.interviewer_email}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                        <Calendar size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Date & Time</span>
                        <span className="font-bold text-slate-800 truncate block">{activeInterview?.scheduled_date || "Date Pending"}</span>
                        <span className="text-[10px] text-slate-500 truncate block">
                          {activeInterview?.scheduled_time || ""} {activeInterview?.timezone ? `(${activeInterview.timezone.split("/")[1] || activeInterview.timezone})` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                        <Clock size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Duration & Mode</span>
                        <span className="font-bold text-slate-800 truncate block">{activeInterview?.duration_minutes || 60} Minutes</span>
                        <span className="text-[10px] text-slate-500 truncate block">
                          {activeInterview?.meeting_platform || "Virtual"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                        <Video size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Meeting Link</span>
                        {activeInterview?.meeting_link ? (
                          <a
                            href={activeInterview.meeting_link.startsWith("http") ? activeInterview.meeting_link : `https://${activeInterview.meeting_link}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-indigo-600 hover:text-indigo-800 underline truncate block flex items-center gap-1"
                          >
                            <span>Open Meeting</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-slate-400 font-semibold text-[11px] block">No link specified</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. 4-Card Executive KPI Scorecard */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 items-stretch">
                  {/* Card 1: Interviewer Rating */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Interviewer Rating</span>
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      </div>
                      <div className="flex items-baseline gap-1.5 pt-0.5">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {resolvedInterviewerRating !== null ? Number(resolvedInterviewerRating).toFixed(1) : "—"}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">/ 5.0</span>
                      </div>
                      <div className="pt-1">
                        {renderStarRating(resolvedInterviewerRating, 5)}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium pt-2 border-t border-slate-100 truncate">
                      Scored by {activeInterview?.interviewer_name || "Lead Evaluator"}
                    </p>
                  </div>

                  {/* Card 2: AI Match Score */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Interview AI Fit</span>
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      </div>
                      <div className="flex items-baseline gap-1 pt-0.5">
                        <span className="text-2xl font-black text-indigo-600 tracking-tight">
                          {activeInterview?.ai_score !== undefined && activeInterview?.ai_score !== null ? `${activeInterview.ai_score}` : `${aiScore}`}
                        </span>
                        <span className="text-xs text-indigo-400 font-bold">%</span>
                      </div>
                      <div className="w-full bg-indigo-50 h-2 rounded-full overflow-hidden mt-2">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${activeInterview?.ai_score ?? aiScore}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium pt-2 border-t border-slate-100 truncate">
                      {activeInterview?.ai_recommendation || (aiScore >= 80 ? "High Technical Match" : "Moderate Role Fit")}
                    </p>
                  </div>

                  {/* Card 3: Final Hiring Verdict */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Round Verdict</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      </div>
                      <div className="pt-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${getVerdictBadge(resolvedVerdict)} whitespace-nowrap`}>
                          <span>•</span>
                          <span>{resolvedVerdict}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium pt-1.5 leading-snug">
                        {resolvedVerdict === "Selected" ? "Recommended for next stage" : resolvedVerdict === "Rejected" ? "Not aligned with role" : "Under round review"}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium pt-2 border-t border-slate-100 truncate">
                      Hiring Decision Status
                    </p>
                  </div>

                  {/* Card 4: HR Clearance or Client Rating */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2">
                    <div>
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                          {hasRealClientFeedback ? "Client Rating" : "HR Clearance"}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${hasRealClientFeedback ? "bg-purple-500" : "bg-emerald-500"}`}></span>
                      </div>
                      {hasRealClientFeedback ? (
                        <>
                          <div className="flex items-baseline gap-1.5 pt-0.5">
                            <span className="text-2xl font-black text-purple-700 tracking-tight">
                              {Number(activeInterview?.client_rating).toFixed(1)}
                            </span>
                            <span className="text-xs text-slate-400 font-bold">/ 5.0</span>
                          </div>
                          <div className="pt-1">
                            {renderStarRating(activeInterview?.client_rating, 5)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="pt-1">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black px-2.5 py-1 rounded-full whitespace-nowrap">
                              <span>✓</span>
                              <span>{activeInterview?.hr_call_verification || "Verified"}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium pt-1.5 leading-snug">
                            Screening Cleared
                          </p>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium pt-2 border-t border-slate-100 truncate">
                      {hasRealClientFeedback ? `Client: ${activeInterview?.client_name || "Client Review"}` : "HR Verification Cleared"}
                    </p>
                  </div>
                </div>

                {/* 4. Evaluator Detailed Feedback & Observations (Narrative Block) */}
                <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <MessageSquareCheck size={14} />
                      </div>
                      <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                        Evaluator Remarks & Detailed Observations
                      </h4>
                    </div>
                    {activeInterview?.interviewer_name && (
                      <span className="text-[11px] text-slate-500 font-semibold">
                        Assessed by <strong className="text-slate-800">{activeInterview.interviewer_name}</strong>
                      </span>
                    )}
                  </div>

                  {resolvedFeedback ? (
                    <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80">
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                        {resolvedFeedback}
                      </p>
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
                      <p className="text-xs text-slate-500">No narrative feedback written yet for this interview round.</p>
                      <button
                        onClick={() => setIsFeedbackModalOpen(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                      >
                        Click here to record evaluator observations and notes
                      </button>
                    </div>
                  )}

                  {resolvedNotes && (
                    <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 text-xs space-y-1">
                      <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wider">Internal Interviewer Notes</span>
                      <p className="text-amber-800 leading-relaxed">{resolvedNotes}</p>
                    </div>
                  )}
                </div>

                {/* 5. Key Strengths vs. Areas for Improvement (Side-by-Side Dual Column) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  {/* Key Strengths (Green) */}
                  <div className="p-5 bg-white rounded-2xl border border-emerald-200/80 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <ThumbsUp size={13} />
                          </div>
                          <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">
                            Key Strengths Demonstrated
                          </h4>
                        </div>
                        <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                          {resolvedStrengths.length}
                        </span>
                      </div>

                      <div className="pt-3">
                        {resolvedStrengths.length > 0 ? (
                          <div className="space-y-2">
                            {resolvedStrengths.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2.5 p-2.5 bg-emerald-50/50 border border-emerald-200/70 rounded-xl text-xs font-semibold text-emerald-950"
                              >
                                <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                                <span className="leading-snug">{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-3 px-3.5 rounded-xl bg-emerald-50/30 border border-dashed border-emerald-200/70 text-xs text-emerald-800/70 italic flex items-center gap-2">
                            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                            <span>No specific strengths flagged in this round.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Growth Areas & Weaknesses (Rose) */}
                  <div className="p-5 bg-white rounded-2xl border border-rose-200/80 shadow-2xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-rose-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                            <AlertTriangle size={13} />
                          </div>
                          <h4 className="text-xs font-extrabold text-rose-950 uppercase tracking-wider">
                            Areas for Growth & Weaknesses
                          </h4>
                        </div>
                        <span className="text-[10px] font-extrabold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full shrink-0">
                          {resolvedWeaknesses.length}
                        </span>
                      </div>

                      <div className="pt-3">
                        {resolvedWeaknesses.length > 0 ? (
                          <div className="space-y-2">
                            {resolvedWeaknesses.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2.5 p-2.5 bg-rose-50/50 border border-rose-200/70 rounded-xl text-xs font-semibold text-rose-950"
                              >
                                <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                <span className="leading-snug">{item}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-3 px-3.5 rounded-xl bg-rose-50/30 border border-dashed border-rose-200/70 text-xs text-rose-800/70 italic flex items-center gap-2">
                            <CheckCircle2 size={13} className="text-rose-400 shrink-0" />
                            <span>No red flags or weaknesses noted in this round.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. Weighted Category Evaluation Breakdown */}
                {activeCategoryScores.length > 0 && (
                  <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <Layers size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          Weighted Category Evaluation Breakdown
                        </h4>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500">
                        {activeCategoryScores.length} Evaluated Categories
                      </span>
                    </div>

                    <div className="space-y-3">
                      {activeCategoryScores.map((cat: any, cIdx: number) => {
                        // Accurately compute percentage fill:
                        // If rating out of 5: (rating / 5) * 100
                        // If score & weightage: (score / weightage) * 100
                        let percentFill = 0;
                        if (cat.rating !== undefined && cat.rating !== null && !isNaN(Number(cat.rating))) {
                          percentFill = (Number(cat.rating) / 5) * 100;
                        } else if (cat.weightage && cat.score !== undefined && cat.score !== null) {
                          percentFill = (Number(cat.score) / Number(cat.weightage)) * 100;
                        } else if (cat.score !== undefined && cat.score !== null) {
                          percentFill = Number(cat.score);
                        }
                        percentFill = Math.min(100, Math.max(0, percentFill));

                        const { title: mainTitle, criteria: subTitle } = parseCategoryTitle(cat.category || cat.skill_name || `Category ${cIdx + 1}`);

                        return (
                          <div key={cIdx} className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="min-w-0 pr-2">
                                <h5 className="text-xs font-bold text-slate-900 leading-snug">{mainTitle}</h5>
                                {subTitle && (
                                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subTitle}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0 whitespace-nowrap self-start sm:self-center">
                                {cat.weightage !== undefined && cat.weightage !== null && (
                                  <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                                    Weight: {cat.weightage}%
                                  </span>
                                )}
                                <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs whitespace-nowrap">
                                  <span>★ {cat.rating !== undefined && cat.rating !== null ? Number(cat.rating).toFixed(1) : (percentFill / 20).toFixed(1)}</span>
                                  <span className="text-indigo-400 font-bold text-[10px]">/ 5.0</span>
                                </span>
                              </div>
                            </div>

                            {/* Progress Bar & Percentage */}
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold">
                                <span>Score Fulfillment</span>
                                <span className="font-bold text-slate-700">
                                  {cat.score !== undefined && cat.weightage ? `${cat.score} / ${cat.weightage} pts (${Math.round(percentFill)}%)` : `${Math.round(percentFill)}% achieved`}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    percentFill >= 80 ? "bg-emerald-500" : percentFill >= 60 ? "bg-indigo-600" : "bg-amber-500"
                                  }`}
                                  style={{ width: `${percentFill}%` }}
                                />
                              </div>
                            </div>

                            {cat.feedback && (
                              <p className="text-[11px] text-slate-700 italic bg-white p-2.5 rounded-lg border border-slate-200/60 leading-relaxed">
                                "{cat.feedback}"
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 7. Evaluated Technical Skills Matrix */}
                {activeSkillRatings.length > 0 && (
                  <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                          <Code size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          Tested Technical Skills Matrix
                        </h4>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500">
                        {activeSkillRatings.length} Skills Tested
                      </span>
                    </div>

                    <div className={activeSkillRatings.length === 1 ? "grid grid-cols-1" : "grid grid-cols-1 sm:grid-cols-2 gap-3.5"}>
                      {activeSkillRatings.map((s: any, idx: number) => {
                        const { name: skillName, tag: skillTag } = parseSkillName(s.skill_name || s.skill || s.name);
                        return (
                          <div key={idx} className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3">
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-800 text-xs block leading-snug">{skillName}</span>
                              {(s.category || skillTag) && (
                                <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                                  {s.category || skillTag}
                                </span>
                              )}
                            </div>
                            <div className="shrink-0 whitespace-nowrap">
                              {renderStarRating(s.rating, 5)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 8. Multi-Interviewer Panel Evaluation Breakdown */}
                {showPanelBreakdown && (
                  <div className="p-5 bg-white rounded-2xl border border-purple-200/80 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                          <Users size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                          Panel Evaluators Breakdown ({activePanelInterviewers.length} Interviewers)
                        </h4>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {activePanelInterviewers.map((panelist: any, pIdx: number) => (
                        <div key={pIdx} className="p-4 bg-purple-50/30 rounded-xl border border-purple-200/70 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center">
                                {(panelist.interviewer_name || "P")[0].toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-xs text-slate-900 block">{panelist.interviewer_name || `Panelist ${pIdx + 1}`}</span>
                                {panelist.interviewer_email && <span className="text-[10px] text-slate-500 block">{panelist.interviewer_email}</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {panelist.rating !== undefined && (
                                <span className="text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                                  ★ {panelist.rating} / 5
                                </span>
                              )}
                              {panelist.recommendation && (
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getVerdictBadge(panelist.recommendation)}`}>
                                  • {panelist.recommendation}
                                </span>
                              )}
                            </div>
                          </div>

                          {panelist.feedback && (
                            <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-purple-100 whitespace-pre-wrap">
                              {panelist.feedback}
                            </p>
                          )}

                          {/* Panelist strengths & weaknesses */}
                          {((panelist.strengths && panelist.strengths.length > 0) || (panelist.weaknesses && panelist.weaknesses.length > 0)) && (
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                              {panelist.strengths && panelist.strengths.length > 0 && (
                                <div className="text-emerald-800">
                                  <span className="font-bold block text-[10px] uppercase text-emerald-700">Strengths:</span>
                                  <span>{panelist.strengths.join(", ")}</span>
                                </div>
                              )}
                              {panelist.weaknesses && panelist.weaknesses.length > 0 && (
                                <div className="text-rose-800">
                                  <span className="font-bold block text-[10px] uppercase text-rose-700">Weaknesses:</span>
                                  <span>{panelist.weaknesses.join(", ")}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 9. Client Review & Stakeholder Feedback */}
                {hasRealClientFeedback && (
                  <div className="p-5 bg-gradient-to-br from-purple-50/40 via-white to-purple-50/20 rounded-2xl border border-purple-200/90 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                          <Building2 size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                          Client Review & Stakeholder Feedback
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeInterview?.client_rating && (
                          <span className="text-xs font-black bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md">
                            ★ {activeInterview.client_rating} / 5
                          </span>
                        )}
                        {activeInterview?.client_recommendation && (
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getVerdictBadge(activeInterview.client_recommendation)}`}>
                            • {activeInterview.client_recommendation}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-1">
                      <span>Client Org: <strong className="text-slate-800">{activeInterview?.client_name || "Client Panel"}</strong></span>
                      {activeInterview?.client_feedback_date && (
                        <span>Reviewed on: <strong className="text-purple-700">{activeInterview.client_feedback_date}</strong></span>
                      )}
                    </div>

                    {activeInterview?.client_feedback && (
                      <div className="p-3.5 bg-white rounded-xl border border-purple-100 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {activeInterview.client_feedback}
                      </div>
                    )}

                    {activeInterview?.client_notes && (
                      <div className="p-2.5 bg-purple-50/70 rounded-lg border border-purple-100 text-[11px] text-purple-900 leading-snug">
                        <strong className="block text-[10px] uppercase tracking-wider text-purple-700 mb-0.5">Client Notes:</strong>
                        {activeInterview.client_notes}
                      </div>
                    )}
                  </div>
                )}

                {/* 10. HR & Compensation Discussion Snapshot */}
                {hasRealHrDiscussion && (
                  <div className="p-5 bg-gradient-to-br from-purple-50/40 via-white to-purple-50/20 rounded-2xl border border-purple-200/90 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                          <Building2 size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                          Client Review & Stakeholder Feedback
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeInterview?.client_rating && (
                          <span className="text-xs font-black bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md">
                            ★ {activeInterview.client_rating} / 5
                          </span>
                        )}
                        {activeInterview?.client_recommendation && (
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getVerdictBadge(activeInterview.client_recommendation)}`}>
                            • {activeInterview.client_recommendation}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-1">
                      <span>Client Org: <strong className="text-slate-800">{activeInterview?.client_name || "Client Panel"}</strong></span>
                      {activeInterview?.client_feedback_date && (
                        <span>Reviewed on: <strong className="text-purple-700">{activeInterview.client_feedback_date}</strong></span>
                      )}
                    </div>

                    {activeInterview?.client_feedback && (
                      <div className="p-3.5 bg-white rounded-xl border border-purple-100 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {activeInterview.client_feedback}
                      </div>
                    )}

                    {activeInterview?.client_notes && (
                      <div className="p-2.5 bg-purple-50/70 rounded-lg border border-purple-100 text-[11px] text-purple-900 leading-snug">
                        <strong className="block text-[10px] uppercase tracking-wider text-purple-700 mb-0.5">Client Notes:</strong>
                        {activeInterview.client_notes}
                      </div>
                    )}
                  </div>
                )}

                {/* 10. HR & Compensation Discussion Snapshot */}
                {hasRealHrDiscussion && (
                  <div className="p-5 bg-white rounded-2xl border border-emerald-200/80 shadow-2xs space-y-3.5">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                          <DollarSign size={14} />
                        </div>
                        <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">
                          Compensation & HR Discussion Snapshot
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        HR Recorded
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expected CTC</span>
                        <span className="font-extrabold text-slate-900 block truncate">{activeInterview?.salary_requested || "Not Specified"}</span>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Offered / Fit CTC</span>
                        <span className="font-extrabold text-emerald-700 block truncate">{activeInterview?.final_fit_salary || "Under Discussion"}</span>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Joining Date</span>
                        <span className="font-extrabold text-slate-900 block truncate">{activeInterview?.joining_date || "To Be Confirmed"}</span>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">HR Verification</span>
                        <span className="font-extrabold text-slate-900 block truncate">{activeInterview?.hr_call_verification || "Pending"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 11. Attached Documents & Assessment Files */}
                {((activeInterview?.interview_feedback_files && activeInterview.interview_feedback_files.length > 0) ||
                  (activeInterview?.interview_document_files && activeInterview.interview_document_files.length > 0)) && (
                  <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <Paperclip size={13} className="text-slate-400" />
                      <span>Attached Interview Documents & Assessment Sheets</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[...(activeInterview.interview_feedback_files || []), ...(activeInterview.interview_document_files || [])].map((file: string, fIdx: number) => (
                        <a
                          key={fIdx}
                          href={file.startsWith("http") ? file : `/${file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-700 transition-all"
                        >
                          <FileText size={12} />
                          <span className="truncate max-w-[200px]">{file.split("/").pop() || "Document"}</span>
                          <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "Projects" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award size={16} className="text-indigo-600" /> Key Projects
            </h3>
            {projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((proj: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-bold text-slate-900">{proj.name}</h4>
                      {proj.role && <span className="text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">{proj.role}</span>}
                    </div>
                    {proj.description && <p className="text-xs text-slate-700 leading-relaxed">{proj.description}</p>}
                    
                    {(proj.architecture || proj.scale) && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 mt-2">
                        {proj.architecture && (
                          <div className="text-[11px]"><span className="font-bold text-slate-500 uppercase block mb-0.5">Architecture</span> <span className="text-slate-700">{proj.architecture}</span></div>
                        )}
                        {proj.scale && (
                          <div className="text-[11px]"><span className="font-bold text-slate-500 uppercase block mb-0.5">Scale</span> <span className="text-slate-700">{proj.scale}</span></div>
                        )}
                      </div>
                    )}
                    
                    {(proj.business_impact || proj.candidate_ownership) && (
                      <div className="grid grid-cols-1 gap-2 pt-2">
                        {proj.business_impact && (
                          <div className="text-[11px]"><span className="font-bold text-emerald-600 uppercase block mb-0.5">Business Impact</span> <span className="text-slate-700">{proj.business_impact}</span></div>
                        )}
                        {proj.candidate_ownership && (
                          <div className="text-[11px]"><span className="font-bold text-indigo-600 uppercase block mb-0.5">Ownership</span> <span className="text-slate-700">{proj.candidate_ownership}</span></div>
                        )}
                      </div>
                    )}

                    {proj.tech_stack && Array.isArray(proj.tech_stack) && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {proj.tech_stack.map((t: string, ti: number) => (
                          <span key={ti} className="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">No projects parsed.</div>
            )}
          </div>
        )}

        {activeTab === "Certifications" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Certifications</h3>
            {certifications.length > 0 ? (
              <ul className="space-y-2 text-xs text-slate-700">
                {certifications.map((cert: any, idx: number) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>
                      {typeof cert === 'string' ? cert : `${cert.name || ''} ${cert.issued_by ? `(${cert.issued_by})` : ''} ${cert.year || ''}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-slate-500">No certifications listed.</div>
            )}
          </div>
        )}

        {(activeTab === "AI Insights" || activeTab === "Analysis") && (
          <div className="space-y-6 font-sans">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Brain size={16} className="text-indigo-600" />
                <span>AI Evaluation, HR Calibration & Interview Benchmark</span>
              </h3>
              <span className="text-xs text-slate-500 font-medium">Cross-Stage Candidate Alignment</span>
            </div>

            {/* 1. TOP EXECUTIVE COMPARISON MATRIX TABLE */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  <span>Direct Side-by-Side Value Comparison (AI vs HR vs Interview)</span>
                </h4>
                <span className="text-[11px] font-semibold text-slate-400">
                  Cross-Stage Score Alignment
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/70">
                      <th className="py-3 px-4 font-bold text-slate-700 w-[24%]">Evaluation Metric</th>
                      <th className="py-3 px-4 font-bold text-indigo-700 w-[19%]">Original AI Value</th>
                      <th className="py-3 px-4 font-bold text-emerald-700 w-[19%]">HR Update Value</th>
                      <th className="py-3 px-4 font-bold text-blue-700 w-[22%]">Interview Score / Review</th>
                      <th className="py-3 px-4 font-bold text-slate-700 w-[16%]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Overall AI / Technical Score</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{aiScore}%</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate ? "HR Reviewed" : "N/A"}</td>
                      <td className="py-3 px-4 text-blue-700 font-bold">
                        {activeInterview?.ai_score !== undefined && activeInterview?.ai_score !== null
                          ? `${activeInterview.ai_score}%`
                          : resolvedInterviewerRating !== null
                            ? `${Number(resolvedInterviewerRating).toFixed(1)} / 5`
                            : "N/A"}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          Evaluated
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Leadership Score</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{personality.leadership !== undefined ? `${personality.leadership}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate?.leadership_score !== undefined ? `${latestHrUpdate.leadership_score}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-blue-700 font-bold">
                        {getCategoryRating(activeCategoryScores, ["leadership", "ownership", "direction", "initiative"]) || (resolvedInterviewerRating !== null ? `${Number(resolvedInterviewerRating).toFixed(1)} / 5` : "N/A")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          {activeInterview ? "Interview Tracked" : "AI Default"}
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Team Player</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{personality.team_player !== undefined ? `${personality.team_player}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate?.team_player !== undefined ? `${latestHrUpdate.team_player}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-blue-700 font-bold">
                        {getCategoryRating(activeCategoryScores, ["team", "teamwork", "collaboration", "adaptability"]) || (activeTeamPlayer !== null ? `${activeTeamPlayer}%` : (resolvedInterviewerRating !== null ? `${Number(resolvedInterviewerRating).toFixed(1)} / 5` : "Evaluated"))}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          {activeInterview ? "Interview Tracked" : "AI Default"}
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Communication</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{personality.communication !== undefined ? `${personality.communication}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate?.communication !== undefined ? `${latestHrUpdate.communication}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-blue-700 font-bold">
                        {getCategoryRating(activeCategoryScores, ["communication", "verbal", "english", "fluency"]) || (activeCommunication !== null ? `${activeCommunication}%` : (resolvedInterviewerRating !== null ? `${Number(resolvedInterviewerRating).toFixed(1)} / 5` : "N/A"))}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          {activeInterview ? "Interview Tracked" : "AI Default"}
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Problem Solving</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{personality.problem_solving !== undefined ? `${personality.problem_solving}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate?.problem_solving !== undefined ? `${latestHrUpdate.problem_solving}%` : "N/A"}</td>
                      <td className="py-3 px-4 text-blue-700 font-bold">
                        {getCategoryRating(activeCategoryScores, ["problem", "solving", "logical", "analytical"]) || (activeInterview?.ai_score !== undefined ? `${activeInterview.ai_score}%` : "N/A")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          {activeInterview ? "Interview Tracked" : "AI Default"}
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Candidate Recommendation</td>
                      <td className="py-3 px-4 text-indigo-700 font-bold">{evalData.recommendation || "N/A"}</td>
                      <td className="py-3 px-4 text-emerald-700 font-semibold">{latestHrUpdate ? "HR Reviewed" : "N/A"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border whitespace-nowrap ${getVerdictBadge(resolvedVerdict)}`}>
                          • {resolvedVerdict || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          Final Review
                        </span>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">Strengths & Notes</td>
                      <td className="py-3 px-4 text-slate-700 leading-relaxed">
                        {originalSkillStrengths && originalSkillStrengths.length > 0 ? originalSkillStrengths.join(", ") : "None"}
                      </td>
                      <td className="py-3 px-4 text-slate-700 leading-relaxed">
                        {latestHrUpdate?.recommended_upskilling && Array.isArray(latestHrUpdate.recommended_upskilling) && latestHrUpdate.recommended_upskilling.length > 0 ? latestHrUpdate.recommended_upskilling.join(", ") : "None"}
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium leading-relaxed">
                        {resolvedStrengths.length > 0
                          ? resolvedStrengths.join(", ")
                          : (resolvedFeedback ? (resolvedFeedback.length > 90 ? resolvedFeedback.slice(0, 90) + "..." : resolvedFeedback) : "None")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap inline-flex items-center">
                          Multi-Source
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. HR EVALUATION CALIBRATION STATUS BANNER */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-emerald-200 shadow-2xs">
              {latestHrUpdate ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <User size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                            HR Evaluation Calibration Update
                          </h4>
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                            HR Overridden
                          </span>
                        </div>
                        {latestHrUpdate.updated_at && (
                          <span className="text-[11px] text-slate-500">
                            Last Updated: {new Date(latestHrUpdate.updated_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleOpenEditModal}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      <Edit3 size={13} />
                      <span>Edit HR Overrides</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] text-slate-500 block font-medium">Leadership</span>
                      <div className="text-sm font-bold text-indigo-600">
                        {latestHrUpdate.leadership_score !== undefined ? `${latestHrUpdate.leadership_score}%` : "N/A"}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] text-slate-500 block font-medium">Team Player</span>
                      <div className="text-sm font-bold text-emerald-600">
                        {latestHrUpdate.team_player !== undefined ? `${latestHrUpdate.team_player}%` : "N/A"}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] text-slate-500 block font-medium">Communication</span>
                      <div className="text-sm font-bold text-blue-600">
                        {latestHrUpdate.communication !== undefined ? `${latestHrUpdate.communication}%` : "N/A"}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] text-slate-500 block font-medium">Problem Solving</span>
                      <div className="text-sm font-bold text-purple-600">
                        {latestHrUpdate.problem_solving !== undefined ? `${latestHrUpdate.problem_solving}%` : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-1 px-2">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <User size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">HR Evaluation Calibration</h4>
                        <span className="text-[10px] font-semibold bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                          Currently Utilizing AI Baseline
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        No HR overrides recorded yet. HR recruiters can calibrate soft skill scores, job hopping risk, and interview focus areas.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleOpenEditModal}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Edit3 size={13} />
                    <span>Record HR Overrides</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. SPACIOUS 2-COLUMN SIDE-BY-SIDE GRID (AI Baseline vs Interview Performance) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* LEFT COLUMN: Original AI Evaluation Baseline */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-indigo-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Original AI Evaluation Baseline
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                    AI Generated
                  </span>
                </div>

                {/* 4 Soft Skills Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Leadership</span>
                    <div className="text-base font-extrabold text-indigo-600">
                      {personality.leadership !== undefined ? `${personality.leadership}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Team Player</span>
                    <div className="text-base font-extrabold text-emerald-600">
                      {personality.team_player !== undefined ? `${personality.team_player}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Communication</span>
                    <div className="text-base font-extrabold text-blue-600">
                      {personality.communication !== undefined ? `${personality.communication}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                    <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Problem Solving</span>
                    <div className="text-base font-extrabold text-purple-600">
                      {personality.problem_solving !== undefined ? `${personality.problem_solving}%` : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Career & Lists */}
                <div className="space-y-3 text-xs pt-1">
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-semibold text-[11px]">Job Hopping Risk</span>
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-xs">
                      {careerAnalysis.job_hopping_risk || "N/A"}
                    </span>
                  </div>

                  {originalArchitecture && (
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="text-slate-500 font-semibold block text-[11px]">Architecture & Design Capabilities</span>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{originalArchitecture}</p>
                    </div>
                  )}

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-slate-500 font-semibold block text-[11px]">Skill Strengths</span>
                    {originalSkillStrengths && originalSkillStrengths.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {originalSkillStrengths.map((item: string, i: number) => (
                          <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">None flagged</span>
                    )}
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-slate-500 font-semibold block text-[11px]">Recommended Upskilling</span>
                    {careerAnalysis.recommended_upskilling && Array.isArray(careerAnalysis.recommended_upskilling) && careerAnalysis.recommended_upskilling.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {careerAnalysis.recommended_upskilling.map((item: string, i: number) => (
                          <span key={i} className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">None listed</span>
                    )}
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-slate-500 font-semibold block text-[11px]">Skill Weaknesses</span>
                    {originalSkillWeaknesses && originalSkillWeaknesses.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {originalSkillWeaknesses.map((item: string, i: number) => (
                          <span key={i} className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">None flagged</span>
                    )}
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-slate-500 font-semibold block text-[11px]">Resume Red Flags</span>
                    {originalRedFlags && originalRedFlags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {originalRedFlags.map((item: string, i: number) => (
                          <span key={i} className="bg-red-100 text-red-800 border border-red-300 text-[11px] px-2 py-0.5 rounded-md font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">None detected</span>
                    )}
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-slate-500 font-semibold block text-[11px]">Interview Focus Areas</span>
                    {originalInterviewFocus && originalInterviewFocus.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {originalInterviewFocus.map((item: string, i: number) => (
                          <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">None specified</span>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Assigned Interview Evaluation & Scores */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-blue-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Assigned Interview Evaluation & Scores
                    </h4>
                  </div>
                  {activeInterview ? (
                    <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                      {activeInterview.status || "Assigned"}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full">
                      Not Assigned
                    </span>
                  )}
                </div>

                {/* Round Selector Pills if multiple interview rounds exist */}
                {candidateInterviews.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
                    {candidateInterviews.map((inv: any, idx: number) => {
                      const roundNum = inv.round_number || idx + 1;
                      const typeName = inv.interview_type || inv.job_title || `Round ${roundNum}`;
                      const isSelected = selectedInterviewIdx === idx;
                      const roundScore = inv.ai_score !== undefined && inv.ai_score !== null ? `${inv.ai_score}%` : inv.rating !== undefined ? `${inv.rating}/5` : "Pending";
                      return (
                        <button
                          key={inv.id || idx}
                          onClick={() => setSelectedInterviewIdx(idx)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <span>R{roundNum}: {typeName}</span>
                          <span className={`text-[11px] px-1.5 py-0.2 rounded font-extrabold ${isSelected ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`}>
                            {roundScore}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeInterview ? (
                  <>
                    {/* Header info bar */}
                    <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 text-xs">
                      <div className="font-bold text-slate-900 flex justify-between items-center">
                        <span>{activeInterview.job_title || "Assigned Interview Session"}</span>
                        {activeInterview.round_number && (
                          <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-semibold">
                            Round {activeInterview.round_number} ({activeInterview.interview_type || "Technical"})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-600 pt-1">
                        {activeInterview.interviewer_name && (
                          <span>Interviewer: <strong className="text-slate-800">{activeInterview.interviewer_name}</strong></span>
                        )}
                        {activeInterview.scheduled_date && (
                          <span>Date: <strong className="text-indigo-700">{activeInterview.scheduled_date} {activeInterview.scheduled_time || ""}</strong></span>
                        )}
                      </div>
                    </div>

                    {/* Scores Grid (4 columns across - plenty of room in 2-col layout) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                        <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Interviewer Rating</span>
                        <div className="text-base font-extrabold text-blue-600 whitespace-nowrap">
                          {resolvedInterviewerRating !== null ? `${Number(resolvedInterviewerRating).toFixed(1)} / 5` : "N/A"}
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                        <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Interview AI Score</span>
                        <div className="text-base font-extrabold text-indigo-600 whitespace-nowrap">
                          {activeInterview.ai_score !== undefined && activeInterview.ai_score !== null ? `${activeInterview.ai_score}%` : `${aiScore}%`}
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                        <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">Round Verdict</span>
                        <div className="pt-0.5">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md border whitespace-nowrap ${getVerdictBadge(resolvedVerdict)}`}>
                            • {resolvedVerdict}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-1">
                        <span className="text-[11px] text-slate-500 block font-semibold leading-tight whitespace-nowrap">
                          {hasRealClientFeedback ? "Client Rating" : "HR Verification"}
                        </span>
                        <div className="text-base font-extrabold text-purple-600 whitespace-nowrap">
                          {hasRealClientFeedback && activeInterview.client_rating !== undefined && activeInterview.client_rating !== null
                            ? `${Number(activeInterview.client_rating).toFixed(1)} / 5`
                            : (activeInterview.hr_call_verification || "Verified")}
                        </div>
                      </div>
                    </div>

                    {/* Details, Category Scores & Strengths */}
                    <div className="space-y-3 text-xs pt-1">
                      {resolvedFeedback && (
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                          <span className="text-slate-500 font-semibold block text-[11px]">Interviewer Observations</span>
                          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{resolvedFeedback}</p>
                        </div>
                      )}

                      {/* Category Evaluation Scores Breakdown */}
                      {activeCategoryScores.length > 0 && (
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <span className="text-slate-500 font-semibold block text-[11px]">Category Evaluation Breakdown</span>
                          <div className="space-y-2">
                            {activeCategoryScores.map((cat: any, cIdx: number) => {
                              const { title: catTitle, criteria: catCriteria } = parseCategoryTitle(cat.category || cat.skill_name || `Category ${cIdx + 1}`);
                              return (
                                <div key={cIdx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-800 text-[11px] leading-snug">{catTitle}</span>
                                    <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                      {cat.weightage && (
                                        <span className="text-slate-400 text-[10px] font-semibold">Weight: {cat.weightage}%</span>
                                      )}
                                      <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] border border-blue-200">
                                        ★ {cat.rating !== undefined && cat.rating !== null ? Number(cat.rating).toFixed(1) : cat.score} / 5
                                      </span>
                                    </div>
                                  </div>
                                  {catCriteria && (
                                    <p className="text-[10px] text-slate-500 leading-snug line-clamp-1">{catCriteria}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Client Feedback & Review */}
                      {hasRealClientFeedback && (activeInterview.client_feedback || activeInterview.client_recommendation || activeInterview.client_rating) && (
                        <div className="bg-white p-3.5 rounded-xl border border-purple-200 bg-purple-50/30 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-purple-700 font-bold block text-[11px]">Client Review ({activeInterview.client_name || "Client"})</span>
                            {activeInterview.client_recommendation && (
                              <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[11px] px-2 py-0.5 rounded-full font-bold">
                                {activeInterview.client_recommendation}
                              </span>
                            )}
                          </div>
                          {activeInterview.client_feedback && (
                            <p className="text-slate-700 text-[11px] leading-relaxed whitespace-pre-wrap">{activeInterview.client_feedback}</p>
                          )}
                        </div>
                      )}

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Interview Strengths</span>
                        {resolvedStrengths.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {resolvedStrengths.map((item: string, i: number) => (
                              <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None flagged</span>
                        )}
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Interview Weaknesses</span>
                        {resolvedWeaknesses.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {resolvedWeaknesses.map((item: string, i: number) => (
                              <span key={i} className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None flagged</span>
                        )}
                      </div>

                      {activeInterview.skill_ratings && Array.isArray(activeInterview.skill_ratings) && activeInterview.skill_ratings.length > 0 && (
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                          <span className="text-slate-500 font-semibold block text-[11px]">Evaluated Skill Ratings</span>
                          <div className="flex flex-wrap gap-2">
                            {activeInterview.skill_ratings.map((s: any, idx: number) => (
                              <span key={idx} className="bg-blue-50 border border-blue-200 text-blue-800 text-[11px] px-2 py-1 rounded-lg font-medium">
                                {s.skill_name || s.skill || s.name}: <strong>{s.rating || s.score} / 5</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-2">
                    <p className="text-xs">No interviews assigned yet for this candidate.</p>
                    <button
                      onClick={() => navigate('/interviews', { state: { scheduleCandidate: { candidate_id: candidate?.id, candidate_name: name, candidate_email: email, resume_id: candidate?.id } } })}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
                    >
                      Click here to Assign Interview
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "Documents" && (
          <div className="space-y-6 text-xs">
            {/* Original Resume */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} className="text-indigo-600" /> Original Resume
              </h3>
              {s3Url ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-800 font-medium">{candidate?.original_filename || "Resume Document"}</span>
                    <a
                      href={s3Url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline flex items-center gap-1"
                    >
                      <ExternalLink size={14} /> Open Document
                    </a>
                  </div>
                  <iframe
                    src={s3Url}
                    className="w-full h-[500px] rounded-xl border border-slate-200"
                    title="Resume Viewer"
                  />
                </div>
              ) : (
                <p className="text-slate-500">No S3 document URL available for this record.</p>
              )}
            </div>

            {/* Additional Documents Upload */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Paperclip size={16} className="text-indigo-600" /> Additional Documents
              </h3>

              {/* Upload Form */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-slate-800">Upload New Document</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Title</label>
                    <input
                      type="text"
                      placeholder="e.g. AWS Certification, Offer Letter"
                      value={docTitle}
                      onChange={e => setDocTitle(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Document Type</label>
                    <select
                      value={docType}
                      onChange={e => setDocType(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-xs text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Cover Letter">Cover Letter</option>
                      <option value="ID Proof">ID Proof</option>
                      <option value="Certification">Certification</option>
                      <option value="Previous Resume">Previous Resume</option>
                      <option value="Offer Letter">Offer Letter</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input
                    type="file"
                    onChange={e => e.target.files && setDocFile(e.target.files[0])}
                    className="text-xs text-slate-600 flex-1 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border border-indigo-200 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  <button
                    onClick={handleUploadDoc}
                    disabled={!docFile || isUploadingDoc}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer shadow-sm"
                  >
                    <Upload size={14} />
                    {isUploadingDoc ? "Uploading..." : "Upload Document"}
                  </button>
                </div>
              </div>

              {/* Uploaded Documents List */}
              {(candidate?.other_documents || []).length === 0 ? (
                <p className="text-slate-500 italic">No additional documents uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(candidate?.other_documents || []).map((doc: any, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-indigo-50 border border-indigo-200 p-2 rounded-lg text-indigo-600 flex-shrink-0">
                          <Paperclip size={16} />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-slate-900 truncate">{doc.title || doc.filename}</p>
                          <p className="text-[11px] text-slate-500">{doc.doc_type} • {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {doc.s3_url && (
                        <a
                          href={doc.s3_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-200 p-2 rounded-lg transition-colors flex-shrink-0"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

        {/* Right Sticky Column: Intelligence, Scores & Feedback (col-span-4) */}
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-6">
          {/* Card 1: Score & Match Overview */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">AI Match Assessment</span>
                <span className="text-xs font-bold text-emerald-600 mt-0.5 block">{scoreLabel}</span>
              </div>
              <div className="relative w-12 h-12 flex items-center justify-center shrink-0" title={`Combined Match: ${overallAverageScore}%`}>
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-emerald-500 stroke-current"
                    strokeWidth="3.5"
                    strokeDasharray={`${overallAverageScore}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-[11px] font-extrabold text-slate-900">{overallAverageScore}%</span>
              </div>
            </div>

            {/* 2 Score Tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tech Score</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-slate-900">{aiScore}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">/100</span>
                </div>
              </div>

              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-0.5">
                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">Interview</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-extrabold text-blue-700">
                    {activeInterview?.ai_score !== undefined && activeInterview?.ai_score !== null
                      ? activeInterview.ai_score
                      : activeInterview?.rating !== undefined && activeInterview?.rating !== null
                        ? activeInterview.rating
                        : "N/A"}
                  </span>
                  {activeInterview?.ai_score !== undefined && activeInterview?.ai_score !== null && (
                    <span className="text-[11px] text-blue-500 font-semibold">%</span>
                  )}
                  {(activeInterview?.ai_score === undefined || activeInterview?.ai_score === null) && activeInterview?.rating !== undefined && activeInterview?.rating !== null && (
                    <span className="text-[11px] text-blue-500 font-semibold">/5</span>
                  )}
                </div>
              </div>
            </div>

            {activeInterview?.status && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                <span className="text-slate-500 font-medium text-[11px]">Interview Status:</span>
                <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                  {activeInterview.status}
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Competency & Personality Bars */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-2">
              Behavioral & Soft Skills
            </span>
            <div className="space-y-3">
              <TraitBar label="Leadership" value={activeLeadership} colorClass="bg-indigo-600" />
              <TraitBar label="Team Player" value={activeTeamPlayer} colorClass="bg-emerald-500" />
              <TraitBar label="Communication" value={activeCommunication} colorClass="bg-blue-500" />
              <TraitBar label="Problem Solving" value={activeProblemSolving} colorClass="bg-purple-500" />
              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
                <span className="text-slate-600 font-medium">Job Hopping Risk</span>
                <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-[11px]">
                  {activeJobHopping !== null ? (typeof activeJobHopping === "number" ? `${activeJobHopping}%` : activeJobHopping) : "Low"}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Interview Feedback & Verdicts */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Interview Feedback
              </span>
              {resolvedVerdict && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getVerdictBadge(resolvedVerdict)} whitespace-nowrap`}>
                  • {resolvedVerdict}
                </span>
              )}
            </div>

            {/* Round pills */}
            {candidateInterviews.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {candidateInterviews.map((inv: any, idx: number) => {
                  const roundNum = inv.round_number || idx + 1;
                  const isSelected = selectedInterviewIdx === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedInterviewIdx(idx)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Round {roundNum}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Interview details & notes */}
            {activeInterview ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="flex justify-between items-center font-bold text-slate-800">
                    <span className="truncate max-w-[160px]">{activeInterview.job_title || "Technical Interview"}</span>
                    {resolvedInterviewerRating !== null && (
                      <span className="text-amber-800 font-extrabold bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded text-[10px] whitespace-nowrap">
                        ★ {Number(resolvedInterviewerRating).toFixed(1)} / 5
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    {activeInterview.interviewer_name && (
                      <p>Evaluator: <strong className="text-slate-700">{activeInterview.interviewer_name}</strong></p>
                    )}
                    {activeInterview.scheduled_date && (
                      <p>Date: <strong className="text-slate-700">{activeInterview.scheduled_date}</strong></p>
                    )}
                  </div>
                </div>

                {resolvedFeedback && (
                  <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 text-slate-700 text-xs leading-relaxed italic line-clamp-3">
                    "{resolvedFeedback}"
                  </div>
                )}

                {/* Top Strengths snippet */}
                {resolvedStrengths.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Key Highlights</span>
                    <div className="flex flex-wrap gap-1">
                      {resolvedStrengths.slice(0, 3).map((st, i) => (
                        <span key={i} className="text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md truncate max-w-[150px]">
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Primary Action Button */}
                {activeTab !== "Interview Feedback" ? (
                  <button
                    onClick={() => setActiveTab("Interview Feedback")}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquareCheck size={13} />
                    <span>View Detailed Scorecard</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsFeedbackModalOpen(true)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 size={13} />
                    <span>Edit Interview Feedback</span>
                  </button>
                )}

                {/* Secondary Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsFeedbackModalOpen(true)}
                    className="py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <Edit3 size={11} />
                    <span>Edit Feedback</span>
                  </button>
                  <button
                    onClick={() => navigate("/interviews", {
                      state: {
                        scheduleCandidate: {
                          candidate_id: candidate?.id,
                          candidate_name: name,
                          candidate_email: email !== "N/A" ? email : "",
                          resume_id: candidate?.id,
                          job_title: currentRole,
                        },
                      },
                    })}
                    className="py-1.5 bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <Calendar size={11} />
                    <span>Next Round</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400 space-y-2">
                <p>No interview rounds scheduled yet.</p>
                <button
                  onClick={() => navigate("/interviews", {
                    state: {
                      scheduleCandidate: {
                        candidate_id: candidate?.id,
                        candidate_name: name,
                        candidate_email: email !== "N/A" ? email : "",
                        resume_id: candidate?.id,
                        job_title: currentRole,
                      },
                    },
                  })}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold underline cursor-pointer"
                >
                  Schedule Initial Interview
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BULK FEEDBACK MODAL FOR INTERVIEW */}
      {isFeedbackModalOpen && activeInterview && (
        <BulkFeedbackModal
          isOpen={isFeedbackModalOpen}
          onClose={() => setIsFeedbackModalOpen(false)}
          selectedInterviews={[activeInterview as any]}
          onSuccess={async () => {
            setIsFeedbackModalOpen(false);
            toast("Interview feedback updated successfully", "success");
            if (candidate?.id) {
              try {
                const refreshed = await getResumeById(candidate.id);
                setCandidate(refreshed);
              } catch (e) {
                console.error("Failed to refresh candidate profile:", e);
              }
            }
          }}
        />
      )}

      {/* EDIT EVALUATION MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 size={18} className="text-indigo-600" /> Edit Candidate Evaluation & HR Ratings
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-5 text-xs">
              {/* Basic Candidate Info */}
              <div className="space-y-3">
                <h3 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">Candidate Details (Direct Update)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Full Name</label>
                    <input
                      type="text"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Phone</label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Location</label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Total Experience Years</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editForm.total_experience_years}
                      onChange={(e) => setEditForm({ ...editForm, total_experience_years: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* HR Update Metrics */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-indigo-600 text-xs uppercase tracking-wider">HR Evaluation Ratings (Appended to HR-Update Array)</h3>
                  <span className="text-[11px] text-slate-500 italic">Does not modify original AI baseline</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Leadership Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.leadership_score}
                      onChange={(e) => setEditForm({ ...editForm, leadership_score: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Team Player Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.team_player}
                      onChange={(e) => setEditForm({ ...editForm, team_player: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Communication Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.communication}
                      onChange={(e) => setEditForm({ ...editForm, communication: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Problem Solving Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.problem_solving}
                      onChange={(e) => setEditForm({ ...editForm, problem_solving: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Arch. & Design Capabilities</label>
                    <textarea
                      rows={3}
                      value={editForm.architecture_and_design_capabilities || ""}
                      onChange={(e) => setEditForm({ ...editForm, architecture_and_design_capabilities: e.target.value })}
                      placeholder="Candidate demonstrated strong knowledge of microservices..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Job Hopping Risk (Score / Rating)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.job_hopping_risk}
                      onChange={(e) => setEditForm({ ...editForm, job_hopping_risk: e.target.value })}
                      placeholder="e.g. 20"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Recommended Upskilling (Comma-separated)</label>
                    <input
                      type="text"
                      value={editForm.recommended_upskilling}
                      onChange={(e) => setEditForm({ ...editForm, recommended_upskilling: e.target.value })}
                      placeholder="Docker, Kubernetes, System Design"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Skill Weaknesses (Comma-separated)</label>
                    <input
                      type="text"
                      value={editForm.skill_weaknesses}
                      onChange={(e) => setEditForm({ ...editForm, skill_weaknesses: e.target.value })}
                      placeholder="GraphQL, Microservices"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Interview Focus Areas (Comma-separated)</label>
                    <input
                      type="text"
                      value={editForm.interview_focus_areas || ""}
                      onChange={(e) => setEditForm({ ...editForm, interview_focus_areas: e.target.value })}
                      placeholder="System Design, Core Java"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 mb-1 font-semibold">Resume Red Flags (Comma-separated)</label>
                    <input
                      type="text"
                      value={editForm.resume_red_flags || ""}
                      onChange={(e) => setEditForm({ ...editForm, resume_red_flags: e.target.value })}
                      placeholder="Frequent job changes, Gap in employment"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-md disabled:opacity-50 text-xs cursor-pointer"
                >
                  {isUpdating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      Update Evaluation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
