import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Mail, Phone, MapPin, ChevronDown, CheckCircle2,
  ExternalLink, User, Award, Brain, Briefcase, GraduationCap, Code, Edit3, X, Save, Paperclip, FileText, Upload
} from "lucide-react";
import { getResumeById, getResumes, updateResume, RESUME_DOCUMENTS } from "../utils/Api";

export default function Evaluation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<any>(null);
  const [resumesList, setResumesList] = useState<any[]>([]);
  const [resumesLoading, setResumesLoading] = useState<boolean>(true);
  const [selectedResumeId, setSelectedResumeId] = useState<string>(id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Experience");

  // Actions dropdown & Edit Modal states
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Document upload states
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("Cover Letter");
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

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

  const navTabs = ["Experience", "Education", "Skills", "Projects", "Certifications", "Analysis", "Documents"];

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

  const totalExp = parsed.total_experience_years !== undefined && parsed.total_experience_years !== null
    ? `${parsed.total_experience_years} Years`
    : parsed.years_of_experience !== undefined
      ? `${parsed.years_of_experience} Years`
      : "N/A";

  // Combine primary_skills, frameworks, databases, cloud_tech into categorized skill matrix
  const primarySkills = parsed.primary_skills || [];
  const frameworks = parsed.frameworks || [];
  const databases = parsed.databases || [];
  const cloudTech = parsed.cloud_tech || [];
  const programmingLanguages = parsed.programming_languages || [];
  const devopsAndInfra = parsed.devops_and_infrastructure || [];
  const otherTechnologies = parsed.other_technologies || [];
  const allSkills = [...new Set([
    ...primarySkills, ...frameworks, ...databases, ...cloudTech,
    ...programmingLanguages, ...devopsAndInfra, ...otherTechnologies,
    ...(parsed.skills || [])
  ])];

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
      const res = await fetch(
        `${RESUME_DOCUMENTS(candidate.id)}?doc_type=${encodeURIComponent(docType)}&doc_title=${encodeURIComponent(docTitle || docFile.name)}`,
        { method: "POST", headers, body: formData }
      );
      const data = await res.json();
      if (res.ok) {
        setCandidate(data.data || data);
        setDocFile(null);
        setDocTitle("");
      } else {
        alert(data.message || "Failed to upload document.");
      }
    } catch {
      alert("Upload failed.");
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleOpenEditModal = () => {
    setIsActionsOpen(false);
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
      alert(err.message || "Failed to save update.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Candidate Profile</h1>
          {latestHrUpdate && (
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              HR Updated
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Candidate Dropdown displaying full_name, email, phone */}
          <div className="relative flex-1 sm:flex-initial min-w-[260px] max-w-[420px]">
            <select
              value={candidate?.id || selectedResumeId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedResumeId(newId);
                navigate(`/evaluation/${newId}`, { replace: true });
              }}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-xs font-medium"
            >
              {resumesLoading ? (
                <option value="" disabled>Loading candidates...</option>
              ) : resumesList.length === 0 ? (
                <option value="" disabled>No candidates available</option>
              ) : null}
              {resumesList.map((res: any) => {
                const resParsed = res.parsed_data || {};
                const fullName = resParsed.full_name || resParsed.name || res.original_filename || "Candidate";
                const resEmail = resParsed.email ? resParsed.email.replace(/\s+/g, "") : "";
                const resPhone = resParsed.phone || "";

                const detailsStr = [resEmail, resPhone].filter(Boolean).join(" • ");
                const label = detailsStr ? `${fullName} (${detailsStr})` : fullName;

                return (
                  <option key={res.id} value={res.id} className="bg-white text-slate-800 py-1">
                    {label}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-600 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="flex justify-between items-center relative">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex items-center gap-3 relative">
          {s3Url && (
            <a
              href={s3Url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors shadow-xs"
            >
              <ExternalLink size={14} />
              Open Original Resume
            </a>
          )}

          {/* Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
            >
              Actions
              <ChevronDown size={14} />
            </button>

            {isActionsOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 font-sans">
                <button
                  onClick={handleOpenEditModal}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 transition-colors text-left cursor-pointer"
                >
                  <Edit3 size={14} className="text-indigo-600" />
                  Edit Evaluation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Overview Header Card & Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card (2 cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-xs">
            <User size={40} />
          </div>

          <div className="space-y-3 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <h2 className="text-xl font-extrabold text-slate-900">{name}</h2>
              <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                {status}
              </span>
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                {seniority}
              </span>
              {primaryDomain !== "Domain Not Specified" && (
                <span className="bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  {primaryDomain}
                </span>
              )}
            </div>

            <div className="text-sm font-semibold text-slate-700 mt-1">
              {currentRole} {specialization ? `• ${specialization}` : ""}
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 text-xs text-slate-500 mt-2">
              <div className="flex items-center gap-1.5">
                <Mail size={14} className="text-slate-500" />
                <span>{email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone size={14} className="text-slate-500" />
                <span>{phone}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-slate-500" />
                <span>{location}</span>
              </div>
            </div>

            {(linkedin || github) && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 text-xs">
                {linkedin && (
                  <a href={linkedin.startsWith("http") ? linkedin : `https://${linkedin}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-indigo-600 font-semibold hover:underline">
                    <span className="bg-[#0a66c2] text-white w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[9px] font-bold">in</span>
                    <span className="truncate max-w-[200px]">{linkedin}</span>
                  </a>
                )}
                {github && (
                  <a href={github.startsWith("http") ? github : `https://${github}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-indigo-600 font-semibold hover:underline">
                    <svg className="w-3.5 h-3.5 fill-current text-slate-600" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>{github}</span>
                  </a>
                )}
              </div>
            )}

            {/* Resume Source & Sourcer Informer Name Details */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Resume Source:</span>
                <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-lg capitalize">
                  {resumeSource}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Source Informer Name:</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                  {resumeSourceInformerName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Profile Score Card (1 col) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900">AI Technical Score</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900">{aiScore}</span>
              <span className="text-xs text-slate-500 font-semibold">/100</span>
            </div>
            <span className="text-xs font-bold text-emerald-600 block">{scoreLabel}</span>
          </div>

          {/* Gauge Ring Visual */}
          <div className="relative w-20 h-20 flex items-center justify-center">
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
                strokeDasharray={`${aiScore}, 100`}
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Metrics Row: Total Experience & HR / Evaluation Overview */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 divide-x divide-slate-200">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Total Experience</span>
          <div className="text-base font-extrabold text-slate-900">{totalExp}</div>
        </div>

        <div className="pl-6 space-y-1">
          <span className="text-xs font-semibold text-slate-500">Leadership Score</span>
          <div className="text-base font-extrabold text-indigo-600">
            {activeLeadership !== null ? `${activeLeadership}%` : "N/A"}
          </div>
        </div>

        <div className="pl-6 space-y-1">
          <span className="text-xs font-semibold text-slate-500">Team Player</span>
          <div className="text-base font-extrabold text-emerald-600">
            {activeTeamPlayer !== null ? `${activeTeamPlayer}%` : "N/A"}
          </div>
        </div>

        <div className="pl-6 space-y-1">
          <span className="text-xs font-semibold text-slate-500">Communication</span>
          <div className="text-base font-extrabold text-blue-600">
            {activeCommunication !== null ? `${activeCommunication}%` : "N/A"}
          </div>
        </div>

        <div className="pl-6 space-y-1">
          <span className="text-xs font-semibold text-slate-500">Problem Solving</span>
          <div className="text-base font-extrabold text-purple-600">
            {activeProblemSolving !== null ? `${activeProblemSolving}%` : "N/A"}
          </div>
        </div>

        <div className="pl-6 space-y-1">
          <span className="text-xs font-semibold text-slate-500">Job Hopping Risk</span>
          <div className="text-base font-extrabold text-amber-600">
            {activeJobHopping !== null ? (typeof activeJobHopping === "number" ? `${activeJobHopping}%` : activeJobHopping) : "N/A"}
          </div>
        </div>
      </div>

      {/* Content Tabs Wrapper */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* Navigation Tabs Header */}
        <div className="flex items-center gap-6 border-b border-slate-200 pb-4 overflow-x-auto">
          {navTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs font-bold transition-colors whitespace-nowrap relative pb-4 -mb-4 cursor-pointer ${activeTab === tab ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
                }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"></span>
              )}
            </button>
          ))}
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
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Responsibilities</span>
                        <p className="text-xs text-slate-700 leading-relaxed mt-1">
                          {Array.isArray(exp.responsibilities) ? exp.responsibilities.join(" ") : exp.responsibilities}
                        </p>
                      </div>
                    )}
                    {exp.technologies_used && Array.isArray(exp.technologies_used) && exp.technologies_used.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Technologies Used</span>
                        <div className="flex flex-wrap gap-1">
                          {exp.technologies_used.map((t: string, ti: number) => (
                            <span key={ti} className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-medium">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {exp.achievements && Array.isArray(exp.achievements) && exp.achievements.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Key Achievements</span>
                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                          {exp.achievements.map((ach: string, ai: number) => (
                            <li key={ai}>{ach}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {exp.leadership_responsibilities && (
                      <div className="pt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Leadership Responsibilities</span>
                        <p className="text-xs text-slate-700 leading-relaxed mt-1">{exp.leadership_responsibilities}</p>
                      </div>
                    )}
                    {(exp.business_domain || exp.team_size) && (
                      <div className="flex gap-4 pt-2 border-t border-slate-200 mt-2">
                        {exp.business_domain && (
                          <div className="text-[10px]"><span className="font-bold text-slate-500">Domain:</span> <span className="text-slate-700">{exp.business_domain}</span></div>
                        )}
                        {exp.team_size && (
                          <div className="text-[10px]"><span className="font-bold text-slate-500">Team Size:</span> <span className="text-slate-700">{exp.team_size}</span></div>
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
                      {proj.role && <span className="text-[10px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium">{proj.role}</span>}
                    </div>
                    {proj.description && <p className="text-xs text-slate-700 leading-relaxed">{proj.description}</p>}
                    
                    {(proj.architecture || proj.scale) && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 mt-2">
                        {proj.architecture && (
                          <div className="text-[10px]"><span className="font-bold text-slate-500 uppercase block mb-0.5">Architecture</span> <span className="text-slate-700">{proj.architecture}</span></div>
                        )}
                        {proj.scale && (
                          <div className="text-[10px]"><span className="font-bold text-slate-500 uppercase block mb-0.5">Scale</span> <span className="text-slate-700">{proj.scale}</span></div>
                        )}
                      </div>
                    )}
                    
                    {(proj.business_impact || proj.candidate_ownership) && (
                      <div className="grid grid-cols-1 gap-2 pt-2">
                        {proj.business_impact && (
                          <div className="text-[10px]"><span className="font-bold text-emerald-600 uppercase block mb-0.5">Business Impact</span> <span className="text-slate-700">{proj.business_impact}</span></div>
                        )}
                        {proj.candidate_ownership && (
                          <div className="text-[10px]"><span className="font-bold text-indigo-600 uppercase block mb-0.5">Ownership</span> <span className="text-slate-700">{proj.candidate_ownership}</span></div>
                        )}
                      </div>
                    )}

                    {proj.tech_stack && Array.isArray(proj.tech_stack) && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {proj.tech_stack.map((t: string, ti: number) => (
                          <span key={ti} className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
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

        {activeTab === "Analysis" && (
          <div className="space-y-6 font-sans">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Brain size={16} className="text-indigo-600" /> AI Evaluation & HR Update Comparison
            </h3>

            {/* Side-by-side Dual Cards Grid: Original AI vs HR Updates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Original AI Evaluation Baseline Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-indigo-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Original AI Evaluation Baseline
                    </h4>
                  </div>
                  <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                    AI Generated
                  </span>
                </div>

                {/* Scores Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 block font-medium">Leadership</span>
                    <div className="text-base font-extrabold text-indigo-600">
                      {personality.leadership !== undefined ? `${personality.leadership}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 block font-medium">Team Player</span>
                    <div className="text-base font-extrabold text-emerald-600">
                      {personality.team_player !== undefined ? `${personality.team_player}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 block font-medium">Communication</span>
                    <div className="text-base font-extrabold text-blue-600">
                      {personality.communication !== undefined ? `${personality.communication}%` : "N/A"}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[11px] text-slate-500 block font-medium">Problem Solving</span>
                    <div className="text-base font-extrabold text-purple-600">
                      {personality.problem_solving !== undefined ? `${personality.problem_solving}%` : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Career & Lists */}
                <div className="space-y-3 text-xs pt-1">
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Job Hopping Risk</span>
                    <span className="font-bold text-amber-600">{careerAnalysis.job_hopping_risk || "N/A"}</span>
                  </div>

                  {originalArchitecture && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                      <span className="text-slate-500 font-semibold block text-[11px]">Architecture & Design Capabilities</span>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{originalArchitecture}</p>
                    </div>
                  )}

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
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

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
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

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
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

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
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

                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
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

              {/* 2. HR Update Grid Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-emerald-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                      Latest HR Evaluation Update
                    </h4>
                  </div>
                  {latestHrUpdate ? (
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      HR Overridden
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                      Pending HR Review
                    </span>
                  )}
                </div>

                {latestHrUpdate ? (
                  <>
                    {/* Scores Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[11px] text-slate-500 block font-medium">Leadership Score</span>
                        <div className="text-base font-extrabold text-indigo-600">
                          {latestHrUpdate.leadership_score !== undefined ? `${latestHrUpdate.leadership_score}%` : "N/A"}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[11px] text-slate-500 block font-medium">Team Player</span>
                        <div className="text-base font-extrabold text-emerald-600">
                          {latestHrUpdate.team_player !== undefined ? `${latestHrUpdate.team_player}%` : "N/A"}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[11px] text-slate-500 block font-medium">Communication</span>
                        <div className="text-base font-extrabold text-blue-600">
                          {latestHrUpdate.communication !== undefined ? `${latestHrUpdate.communication}%` : "N/A"}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1">
                        <span className="text-[11px] text-slate-500 block font-medium">Problem Solving</span>
                        <div className="text-base font-extrabold text-purple-600">
                          {latestHrUpdate.problem_solving !== undefined ? `${latestHrUpdate.problem_solving}%` : "N/A"}
                        </div>
                      </div>
                    </div>

                    {/* Career & Lists */}
                    <div className="space-y-3 text-xs pt-1">
                      <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200">
                        <span className="text-slate-500 font-medium">Job Hopping Risk</span>
                        <span className="font-bold text-emerald-600">
                          {latestHrUpdate.job_hopping_risk !== undefined ? latestHrUpdate.job_hopping_risk : "N/A"}
                        </span>
                      </div>

                      {latestHrUpdate.architecture_and_design_capabilities && (
                        <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                          <span className="text-slate-500 font-semibold block text-[11px]">Architecture & Design Capabilities</span>
                          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{latestHrUpdate.architecture_and_design_capabilities}</p>
                        </div>
                      )}

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Recommended Upskilling</span>
                        {latestHrUpdate.recommended_upskilling && Array.isArray(latestHrUpdate.recommended_upskilling) && latestHrUpdate.recommended_upskilling.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {latestHrUpdate.recommended_upskilling.map((item: string, i: number) => (
                              <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None listed</span>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Skill Weaknesses</span>
                        {latestHrUpdate.skill_weaknesses && Array.isArray(latestHrUpdate.skill_weaknesses) && latestHrUpdate.skill_weaknesses.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {latestHrUpdate.skill_weaknesses.map((item: string, i: number) => (
                              <span key={i} className="bg-rose-50 text-rose-700 border border-rose-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None flagged</span>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Resume Red Flags</span>
                        {latestHrUpdate.resume_red_flags && Array.isArray(latestHrUpdate.resume_red_flags) && latestHrUpdate.resume_red_flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {latestHrUpdate.resume_red_flags.map((item: string, i: number) => (
                              <span key={i} className="bg-red-100 text-red-800 border border-red-300 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None detected</span>
                        )}
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <span className="text-slate-500 font-semibold block text-[11px]">Interview Focus Areas</span>
                        {latestHrUpdate.interview_focus_areas && Array.isArray(latestHrUpdate.interview_focus_areas) && latestHrUpdate.interview_focus_areas.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {latestHrUpdate.interview_focus_areas.map((item: string, i: number) => (
                              <span key={i} className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] px-2 py-0.5 rounded-md font-medium">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">None specified</span>
                        )}
                      </div>

                      {latestHrUpdate.updated_at && (
                        <div className="text-[10px] text-slate-400 text-right pt-1">
                          Last Updated: {new Date(latestHrUpdate.updated_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 space-y-2">
                    <p className="text-xs">No HR updates recorded yet for this candidate.</p>
                    <button
                      onClick={handleOpenEditModal}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-bold underline cursor-pointer"
                    >
                      Click here to add HR Evaluation values
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Side-by-Side Comparison Matrix Table */}
            {latestHrUpdate && (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  📊 Direct Side-by-Side Value Comparison
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-white">
                        <th className="py-2.5 px-4 font-semibold">Evaluation Metric</th>
                        <th className="py-2.5 px-4 font-semibold text-indigo-600">Original AI Value</th>
                        <th className="py-2.5 px-4 font-semibold text-emerald-600">HR Update Value</th>
                        <th className="py-2.5 px-4 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Leadership Score</td>
                        <td className="py-2.5 px-4 text-indigo-700 font-semibold">{personality.leadership !== undefined ? `${personality.leadership}%` : "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-semibold">{latestHrUpdate.leadership_score !== undefined ? `${latestHrUpdate.leadership_score}%` : "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Team Player</td>
                        <td className="py-2.5 px-4 text-indigo-700 font-semibold">{personality.team_player !== undefined ? `${personality.team_player}%` : "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-semibold">{latestHrUpdate.team_player !== undefined ? `${latestHrUpdate.team_player}%` : "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Communication</td>
                        <td className="py-2.5 px-4 text-indigo-700 font-semibold">{personality.communication !== undefined ? `${personality.communication}%` : "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-semibold">{latestHrUpdate.communication !== undefined ? `${latestHrUpdate.communication}%` : "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Problem Solving</td>
                        <td className="py-2.5 px-4 text-indigo-700 font-semibold">{personality.problem_solving !== undefined ? `${personality.problem_solving}%` : "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-semibold">{latestHrUpdate.problem_solving !== undefined ? `${latestHrUpdate.problem_solving}%` : "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Job Hopping Risk</td>
                        <td className="py-2.5 px-4 text-indigo-700 font-semibold">{careerAnalysis.job_hopping_risk || "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 font-semibold">{latestHrUpdate.job_hopping_risk !== undefined ? `${latestHrUpdate.job_hopping_risk}%` : "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Recommended Upskilling</td>
                        <td className="py-2.5 px-4 text-indigo-700">
                          {careerAnalysis.recommended_upskilling && Array.isArray(careerAnalysis.recommended_upskilling) ? careerAnalysis.recommended_upskilling.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4 text-emerald-700">
                          {latestHrUpdate.recommended_upskilling && Array.isArray(latestHrUpdate.recommended_upskilling) ? latestHrUpdate.recommended_upskilling.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Skill Weaknesses</td>
                        <td className="py-2.5 px-4 text-indigo-700">
                          {originalSkillWeaknesses && originalSkillWeaknesses.length > 0 ? originalSkillWeaknesses.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4 text-rose-700 font-semibold">
                          {latestHrUpdate.skill_weaknesses && Array.isArray(latestHrUpdate.skill_weaknesses) && latestHrUpdate.skill_weaknesses.length > 0 ? latestHrUpdate.skill_weaknesses.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Architecture & Design</td>
                        <td className="py-2.5 px-4 text-indigo-700 whitespace-pre-wrap">{originalArchitecture || "N/A"}</td>
                        <td className="py-2.5 px-4 text-emerald-700 whitespace-pre-wrap">{latestHrUpdate.architecture_and_design_capabilities || "N/A"}</td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Resume Red Flags</td>
                        <td className="py-2.5 px-4 text-indigo-700">
                          {originalRedFlags && originalRedFlags.length > 0 ? originalRedFlags.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4 text-rose-700 font-semibold">
                          {latestHrUpdate.resume_red_flags && Array.isArray(latestHrUpdate.resume_red_flags) && latestHrUpdate.resume_red_flags.length > 0 ? latestHrUpdate.resume_red_flags.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2.5 px-4 font-medium text-slate-700">Interview Focus Areas</td>
                        <td className="py-2.5 px-4 text-indigo-700">
                          {originalInterviewFocus && originalInterviewFocus.length > 0 ? originalInterviewFocus.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4 text-blue-700 font-semibold">
                          {latestHrUpdate.interview_focus_areas && Array.isArray(latestHrUpdate.interview_focus_areas) && latestHrUpdate.interview_focus_areas.length > 0 ? latestHrUpdate.interview_focus_areas.join(", ") : "None"}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            HR Updated
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
                          <p className="text-[10px] text-slate-500">{doc.doc_type} • {new Date(doc.uploaded_at).toLocaleDateString()}</p>
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
                  <span className="text-[10px] text-slate-500 italic">Does not modify original AI baseline</span>
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
