import React, { useState, useEffect } from "react";
import {
  X, Save, Edit3, User, Briefcase, Brain, Layers, Info
} from "lucide-react";
import { getResumeById, updateResume } from "../utils/Api";

interface CandidateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string | null;
  onSuccess?: () => void;
}

export const CandidateEditModal: React.FC<CandidateEditModalProps> = ({
  isOpen,
  onClose,
  candidateId,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Full Model Form State covering all ResumeDocument schema fields (A to Z)
  const [form, setForm] = useState({
    // 1. Resume Entity Metadata (ResumeDocument fields)
    candidate_id: "",
    status: "PARSED",
    resume_source: "",
    resume_source_informer_name: "",
    original_filename: "",
    s3_url: "",

    // 2. Personal & Contact Information (parsed_data)
    full_name: "",
    email: "",
    phone: "",
    location: "",
    designation: "",
    summary: "",
    total_experience_years: "",
    years_of_experience: "",
    experience_level: "",
    linkedin: "",
    github: "",

    // 3. Technical Skills & Categorized Stack (Arrays for chip badge view)
    primary_skills: [] as string[],
    frameworks: [] as string[],
    databases: [] as string[],
    cloud_tech: [] as string[],
    other_skills: [] as string[],

    // 4. Detailed Nested Lists (Structured Editable Cards & Form Fields)
    experience: [] as any[],
    education: [] as any[],
    projects: [] as any[],
    certifications: [] as any[],

    // 5. AI Evaluation Ratings & Match Scores (ai_evaluation)
    ai_technical_score: "",
    ai_recommendation: "",
    skill_strengths: [] as string[],

    // 6. HR Behavioral Competencies & Evaluation Scores (hr_updates / personality)
    leadership_score: "",
    team_player: "",
    job_hopping_risk: "",
    communication: "",
    problem_solving: "",
    recommended_upskilling: [] as string[],
    skill_weaknesses: [] as string[],
  });

  useEffect(() => {
    if (isOpen && candidateId) {
      fetchCandidateData();
    }
  }, [isOpen, candidateId]);

  const fetchCandidateData = async () => {
    if (!candidateId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getResumeById(candidateId);
      const parsed = data?.parsed_data || {};
      const evalData = data?.ai_evaluation || {};
      const hrUpdatesList = data?.hr_updates || [];
      const latestHr = hrUpdatesList.length > 0 ? hrUpdatesList[hrUpdatesList.length - 1] : null;

      const personality = evalData.personality_analysis || {};
      const careerAnalysis = evalData.career_analysis || {};

      setForm({
        // Resume Metadata
        candidate_id: data.candidate_id || "",
        status: data.status || "PARSED",
        resume_source: data.resume_source || "",
        resume_source_informer_name: data.resume_source_informer_name || "",
        original_filename: data.original_filename || data.filename || "",
        s3_url: data.s3_url || "",

        // Personal Info
        full_name: parsed.full_name || parsed.name || "",
        email: parsed.email ? String(parsed.email).replace(/\s+/g, "") : "",
        phone: parsed.phone || "",
        location: parsed.location || "",
        designation: parsed.designation || parsed.role || "",
        summary: parsed.summary || "",
        total_experience_years: parsed.total_experience_years !== undefined && parsed.total_experience_years !== null ? String(parsed.total_experience_years) : "",
        years_of_experience: parsed.years_of_experience !== undefined && parsed.years_of_experience !== null ? String(parsed.years_of_experience) : "",
        experience_level: parsed.experience_level || evalData.experience_level || "",
        linkedin: parsed.linkedin || "",
        github: parsed.github || "",

        // Skills Matrix (String Arrays)
        primary_skills: Array.isArray(parsed.primary_skills) ? parsed.primary_skills : [],
        frameworks: Array.isArray(parsed.frameworks) ? parsed.frameworks : [],
        databases: Array.isArray(parsed.databases) ? parsed.databases : [],
        cloud_tech: Array.isArray(parsed.cloud_tech) ? parsed.cloud_tech : [],
        other_skills: Array.isArray(parsed.skills) ? parsed.skills : [],

        // Structured Arrays
        experience: Array.isArray(parsed.experience) ? parsed.experience : [],
        education: Array.isArray(parsed.education) ? parsed.education : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],

        // AI Evaluation & Strengths
        ai_technical_score: evalData.ai_technical_score !== undefined ? String(evalData.ai_technical_score) : "",
        ai_recommendation: evalData.recommendation || "",
        skill_strengths: Array.isArray(evalData.skill_strengths) ? evalData.skill_strengths : [],

        // HR & Personality
        leadership_score: String(latestHr?.leadership_score ?? personality.leadership ?? ""),
        team_player: String(latestHr?.team_player ?? personality.team_player ?? ""),
        job_hopping_risk: String(latestHr?.job_hopping_risk ?? careerAnalysis.job_hopping_risk ?? ""),
        communication: String(latestHr?.communication ?? personality.communication ?? ""),
        problem_solving: String(latestHr?.problem_solving ?? personality.problem_solving ?? ""),
        recommended_upskilling: Array.isArray(latestHr?.recommended_upskilling)
          ? latestHr.recommended_upskilling
          : (careerAnalysis.recommended_upskilling || []),
        skill_weaknesses: Array.isArray(latestHr?.skill_weaknesses)
          ? latestHr.skill_weaknesses
          : (evalData.skill_weaknesses || []),
      });
    } catch (err: any) {
      console.error("Failed to fetch candidate details for edit:", err);
      setError(err.message || "Failed to load candidate information.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateId) return;

    try {
      setSaving(true);
      setError(null);

      const payload: any = {
        status: form.status,
        resume_source: form.resume_source || undefined,
        resume_source_informer_name: form.resume_source_informer_name || undefined,
        parsed_data: {
          full_name: form.full_name,
          name: form.full_name,
          email: form.email,
          phone: form.phone,
          location: form.location,
          designation: form.designation,
          role: form.designation,
          summary: form.summary,
          linkedin: form.linkedin,
          github: form.github,
          experience_level: form.experience_level || undefined,
          total_experience_years: form.total_experience_years !== "" ? Number(form.total_experience_years) : undefined,
          years_of_experience: form.years_of_experience !== "" ? Number(form.years_of_experience) : undefined,
          primary_skills: form.primary_skills,
          frameworks: form.frameworks,
          databases: form.databases,
          cloud_tech: form.cloud_tech,
          skills: form.other_skills,
          experience: form.experience,
          education: form.education,
          projects: form.projects,
          certifications: form.certifications,
        },
        hr_update: {
          leadership_score: form.leadership_score !== "" ? Number(form.leadership_score) : undefined,
          team_player: form.team_player !== "" ? Number(form.team_player) : undefined,
          job_hopping_risk: form.job_hopping_risk !== "" ? Number(form.job_hopping_risk) : undefined,
          communication: form.communication !== "" ? Number(form.communication) : undefined,
          problem_solving: form.problem_solving !== "" ? Number(form.problem_solving) : undefined,
          recommended_upskilling: form.recommended_upskilling,
          skill_weaknesses: form.skill_weaknesses,
        },
      };

      await updateResume(candidateId, payload);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Failed to update candidate details:", err);
      setError(err.message || "Failed to save update.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl relative text-slate-900 overflow-hidden">
        
        {/* Full-Page Modal Header */}
        <div className="flex flex-wrap justify-between items-center border-b border-slate-200 px-6 py-4 bg-slate-50/80 shrink-0 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-tr from-indigo-600 via-indigo-700 to-blue-600 rounded-2xl text-white shadow-md">
              <Edit3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Edit Candidate Record & Parsed Resume Data
                </h2>
                {form.candidate_id && (
                  <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                    ID: {form.candidate_id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Complete A to Z fields from <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono text-slate-800">ResumeDocument</code> & AI parsed model
              </p>
            </div>
          </div>

          {/* Action buttons at top right */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const formEl = document.getElementById("candidate-edit-form") as HTMLFormElement;
                if (formEl) formEl.requestSubmit();
              }}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save size={15} />
              {saving ? "Saving All..." : "Save Candidate Profile"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer shadow-xs ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-xs p-3 font-semibold px-6 shrink-0 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800"><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm gap-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="font-semibold text-slate-600">Loading Candidate Full Resume Profile...</span>
          </div>
        ) : (
          <form id="candidate-edit-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
            
            {/* SECTION 1: ENTITY METADATA & SYSTEM STATUS */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                <Info size={18} className="text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  System Record Metadata & Source Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">Resume Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="PARSED">PARSED</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Resume Source Channel</label>
                  <input
                    type="text"
                    value={form.resume_source}
                    onChange={(e) => setForm({ ...form, resume_source: e.target.value })}
                    placeholder="e.g. LinkedIn, Referral, Direct"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Source Informer / Referral Name</label>
                  <input
                    type="text"
                    value={form.resume_source_informer_name}
                    onChange={(e) => setForm({ ...form, resume_source_informer_name: e.target.value })}
                    placeholder="e.g. John Doe (HR)"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Original Upload Filename</label>
                  <input
                    type="text"
                    disabled
                    value={form.original_filename}
                    className="w-full bg-slate-200/60 border border-slate-300 rounded-xl px-3 py-2 text-slate-600 font-medium cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: PERSONAL & CONTACT INFORMATION */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <User size={18} className="text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Personal & Contact Information
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    required
                    placeholder="Candidate Name"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Location / City</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Bangalore, India"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Current Designation / Role</label>
                  <input
                    type="text"
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Total Experience (Years)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.total_experience_years}
                    onChange={(e) => setForm({ ...form, total_experience_years: e.target.value })}
                    placeholder="e.g. 5.5"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Experience Level</label>
                  <input
                    type="text"
                    value={form.experience_level}
                    onChange={(e) => setForm({ ...form, experience_level: e.target.value })}
                    placeholder="e.g. Senior / Lead / Mid"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">LinkedIn URL</label>
                  <input
                    type="text"
                    value={form.linkedin}
                    onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-600 block mb-1 text-xs font-semibold">Professional Summary</label>
                <textarea
                  rows={2}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="Summary of experience and background..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>
            </div>

            {/* SECTION 3: TECHNICAL SKILLS MATRIX */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Briefcase size={18} className="text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Technical Skills & Categorized Stack Matrix (Interactive Item-by-Item Chips)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                {/* Primary Skills Chips */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-slate-700 font-bold block text-xs">Primary Skills</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.primary_skills.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">No primary skills added</span>
                    ) : (
                      form.primary_skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.primary_skills.filter((_, i) => i !== idx);
                              setForm({ ...form, primary_skills: updated });
                            }}
                            className="hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type a primary skill & press Enter to add..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.primary_skills.includes(val)) {
                          setForm({ ...form, primary_skills: [...form.primary_skills, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                </div>

                {/* Frameworks Chips */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-slate-700 font-bold block text-xs">Frameworks & Libraries</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.frameworks.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">No frameworks added</span>
                    ) : (
                      form.frameworks.map((fw, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {fw}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.frameworks.filter((_, i) => i !== idx);
                              setForm({ ...form, frameworks: updated });
                            }}
                            className="hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type framework & press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.frameworks.includes(val)) {
                          setForm({ ...form, frameworks: [...form.frameworks, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                </div>

                {/* Databases Chips */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-slate-700 font-bold block text-xs">Databases</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.databases.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">No databases added</span>
                    ) : (
                      form.databases.map((db, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 text-sky-700 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {db}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.databases.filter((_, i) => i !== idx);
                              setForm({ ...form, databases: updated });
                            }}
                            className="hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type database & press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.databases.includes(val)) {
                          setForm({ ...form, databases: [...form.databases, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                </div>

                {/* Cloud & DevOps Chips */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-slate-700 font-bold block text-xs">Cloud & DevOps</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.cloud_tech.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">No cloud tech added</span>
                    ) : (
                      form.cloud_tech.map((cloud, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-700 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {cloud}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.cloud_tech.filter((_, i) => i !== idx);
                              setForm({ ...form, cloud_tech: updated });
                            }}
                            className="hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type cloud tech & press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.cloud_tech.includes(val)) {
                          setForm({ ...form, cloud_tech: [...form.cloud_tech, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: DETAILED NESTED EXPERIENCE, EDUCATION, PROJECTS & CERTIFICATIONS */}
            <div className="space-y-6">
              {/* Work Experience Card List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Work Experience Records ({form.experience.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newExp = { company: "", designation: "", duration: "", responsibilities: "" };
                      setForm({ ...form, experience: [...form.experience, newExp] });
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl transition-all cursor-pointer"
                  >
                    + Add Work Experience
                  </button>
                </div>

                {form.experience.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No work experience records found.</p>
                ) : (
                  <div className="space-y-3">
                    {form.experience.map((exp: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative text-xs">
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <span className="font-extrabold text-slate-700">Experience #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.experience.filter((_, i) => i !== idx);
                              setForm({ ...form, experience: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                            title="Remove Experience"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-semibold">
                          <div>
                            <label className="text-slate-600 block mb-1">Company Name</label>
                            <input
                              type="text"
                              value={exp.company || ""}
                              onChange={(e) => {
                                const updated = [...form.experience];
                                updated[idx] = { ...updated[idx], company: e.target.value };
                                setForm({ ...form, experience: updated });
                              }}
                              placeholder="e.g. ShineLogics Informatics"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Designation / Role</label>
                            <input
                              type="text"
                              value={exp.designation || ""}
                              onChange={(e) => {
                                const updated = [...form.experience];
                                updated[idx] = { ...updated[idx], designation: e.target.value };
                                setForm({ ...form, experience: updated });
                              }}
                              placeholder="e.g. Full-Stack Developer & Team Lead"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Duration</label>
                            <input
                              type="text"
                              value={exp.duration || ""}
                              onChange={(e) => {
                                const updated = [...form.experience];
                                updated[idx] = { ...updated[idx], duration: e.target.value };
                                setForm({ ...form, experience: updated });
                              }}
                              placeholder="e.g. Feb 2021 - Present"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-slate-600 block mb-1 font-semibold">Responsibilities & Achievements</label>
                          <textarea
                            rows={2}
                            value={exp.responsibilities || ""}
                            onChange={(e) => {
                              const updated = [...form.experience];
                              updated[idx] = { ...updated[idx], responsibilities: e.target.value };
                              setForm({ ...form, experience: updated });
                            }}
                            placeholder="Key achievements and daily duties..."
                            className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Projects Card List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Projects & Portfolio Items ({form.projects.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newProj = { name: "", domain: "", role: "", tech_stack: [], description: "" };
                      setForm({ ...form, projects: [...form.projects, newProj] });
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl transition-all cursor-pointer"
                  >
                    + Add Project
                  </button>
                </div>

                {form.projects.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No projects found.</p>
                ) : (
                  <div className="space-y-3">
                    {form.projects.map((proj: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative text-xs">
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <span className="font-extrabold text-slate-700">Project #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.projects.filter((_, i) => i !== idx);
                              setForm({ ...form, projects: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                            title="Remove Project"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-semibold">
                          <div>
                            <label className="text-slate-600 block mb-1">Project Name</label>
                            <input
                              type="text"
                              value={proj.name || proj.title || ""}
                              onChange={(e) => {
                                const updated = [...form.projects];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setForm({ ...form, projects: updated });
                              }}
                              placeholder="e.g. Articul8 - Data connector API"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Role / Contribution</label>
                            <input
                              type="text"
                              value={proj.role || ""}
                              onChange={(e) => {
                                const updated = [...form.projects];
                                updated[idx] = { ...updated[idx], role: e.target.value };
                                setForm({ ...form, projects: updated });
                              }}
                              placeholder="e.g. Backend Developer"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Tech Stack (Comma separated)</label>
                            <input
                              type="text"
                              value={Array.isArray(proj.tech_stack) ? proj.tech_stack.join(", ") : (proj.tech_stack || "")}
                              onChange={(e) => {
                                const updated = [...form.projects];
                                updated[idx] = {
                                  ...updated[idx],
                                  tech_stack: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                };
                                setForm({ ...form, projects: updated });
                              }}
                              placeholder="e.g. Python, FastAPI, Databricks"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-slate-600 block mb-1 font-semibold">Project Description</label>
                          <textarea
                            rows={2}
                            value={proj.description || ""}
                            onChange={(e) => {
                              const updated = [...form.projects];
                              updated[idx] = { ...updated[idx], description: e.target.value };
                              setForm({ ...form, projects: updated });
                            }}
                            placeholder="Description of system architecture and work..."
                            className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Education Records Card List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Education Records ({form.education.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newEdu = { degree: "", institution: "", year_of_passing: "", score: "" };
                      setForm({ ...form, education: [...form.education, newEdu] });
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl transition-all cursor-pointer"
                  >
                    + Add Education
                  </button>
                </div>

                {form.education.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No education records found.</p>
                ) : (
                  <div className="space-y-3">
                    {form.education.map((edu: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative text-xs">
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <span className="font-extrabold text-slate-700">Education #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.education.filter((_, i) => i !== idx);
                              setForm({ ...form, education: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                            title="Remove Education"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-semibold">
                          <div>
                            <label className="text-slate-600 block mb-1">Degree / Qualification</label>
                            <input
                              type="text"
                              value={edu.degree || ""}
                              onChange={(e) => {
                                const updated = [...form.education];
                                updated[idx] = { ...updated[idx], degree: e.target.value };
                                setForm({ ...form, education: updated });
                              }}
                              placeholder="e.g. B.E. Computer Science"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-slate-600 block mb-1">Institution / University</label>
                            <input
                              type="text"
                              value={edu.institution || ""}
                              onChange={(e) => {
                                const updated = [...form.education];
                                updated[idx] = { ...updated[idx], institution: e.target.value };
                                setForm({ ...form, education: updated });
                              }}
                              placeholder="e.g. Dr. Sivanthi Aditanar College of Engineering"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Year of Passing & Score</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={edu.year_of_passing || ""}
                                onChange={(e) => {
                                  const updated = [...form.education];
                                  updated[idx] = { ...updated[idx], year_of_passing: e.target.value };
                                  setForm({ ...form, education: updated });
                                }}
                                placeholder="Year (2019)"
                                className="w-1/2 bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <input
                                type="text"
                                value={edu.score || ""}
                                onChange={(e) => {
                                  const updated = [...form.education];
                                  updated[idx] = { ...updated[idx], score: e.target.value };
                                  setForm({ ...form, education: updated });
                                }}
                                placeholder="Score (69%)"
                                className="w-1/2 bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certifications Card List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Certifications & Badges ({form.certifications.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newCert = { name: "", issuer: "", year: "" };
                      setForm({ ...form, certifications: [...form.certifications, newCert] });
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl transition-all cursor-pointer"
                  >
                    + Add Certification
                  </button>
                </div>

                {form.certifications.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No certifications added.</p>
                ) : (
                  <div className="space-y-3">
                    {form.certifications.map((cert: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative text-xs">
                        <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                          <span className="font-extrabold text-slate-700">Certification #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.certifications.filter((_, i) => i !== idx);
                              setForm({ ...form, certifications: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                            title="Remove Certification"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-semibold">
                          <div>
                            <label className="text-slate-600 block mb-1">Certification Name</label>
                            <input
                              type="text"
                              value={cert.name || cert.title || ""}
                              onChange={(e) => {
                                const updated = [...form.certifications];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setForm({ ...form, certifications: updated });
                              }}
                              placeholder="e.g. AWS Certified Solutions Architect"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Issuer / Platform</label>
                            <input
                              type="text"
                              value={cert.issuer || ""}
                              onChange={(e) => {
                                const updated = [...form.certifications];
                                updated[idx] = { ...updated[idx], issuer: e.target.value };
                                setForm({ ...form, certifications: updated });
                              }}
                              placeholder="e.g. Amazon Web Services"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="text-slate-600 block mb-1">Year</label>
                            <input
                              type="text"
                              value={cert.year || ""}
                              onChange={(e) => {
                                const updated = [...form.certifications];
                                updated[idx] = { ...updated[idx], year: e.target.value };
                                setForm({ ...form, certifications: updated });
                              }}
                              placeholder="e.g. 2023"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 5: HR BEHAVIORAL & COMPETENCY SCORES */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Brain size={18} className="text-indigo-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  HR Behavioral Scores & Candidate Assessment
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-semibold">
                <div>
                  <label className="text-slate-600 block mb-1">Leadership Score</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.leadership_score}
                    onChange={(e) => setForm({ ...form, leadership_score: e.target.value })}
                    placeholder="0-100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Team Player Score</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.team_player}
                    onChange={(e) => setForm({ ...form, team_player: e.target.value })}
                    placeholder="0-100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Job Hopping Risk</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.job_hopping_risk}
                    onChange={(e) => setForm({ ...form, job_hopping_risk: e.target.value })}
                    placeholder="0-100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Communication Score</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.communication}
                    onChange={(e) => setForm({ ...form, communication: e.target.value })}
                    placeholder="0-100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Problem Solving Score</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.problem_solving}
                    onChange={(e) => setForm({ ...form, problem_solving: e.target.value })}
                    placeholder="0-100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold pt-2">
                {/* Skill Weaknesses Chips */}
                <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-rose-800 font-bold block text-xs">Skill Weaknesses (Item-by-Item)</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.skill_weaknesses.length === 0 ? (
                      <span className="text-rose-400 italic text-[11px]">No weaknesses added</span>
                    ) : (
                      form.skill_weaknesses.map((weak, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-rose-100 border border-rose-300 text-rose-800 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {weak}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.skill_weaknesses.filter((_, i) => i !== idx);
                              setForm({ ...form, skill_weaknesses: updated });
                            }}
                            className="hover:text-rose-950 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type weakness & press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.skill_weaknesses.includes(val)) {
                          setForm({ ...form, skill_weaknesses: [...form.skill_weaknesses, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-rose-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 mt-1"
                  />
                </div>

                {/* Recommended Upskilling Chips */}
                <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                  <label className="text-amber-800 font-bold block text-xs">Recommended Upskilling (Item-by-Item)</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                    {form.recommended_upskilling.length === 0 ? (
                      <span className="text-amber-400 italic text-[11px]">No upskilling recommendations added</span>
                    ) : (
                      form.recommended_upskilling.map((upskill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-xl text-xs font-bold shadow-xs"
                        >
                          {upskill}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = form.recommended_upskilling.filter((_, i) => i !== idx);
                              setForm({ ...form, recommended_upskilling: updated });
                            }}
                            className="hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Type recommended upskilling & press Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.recommended_upskilling.includes(val)) {
                          setForm({ ...form, recommended_upskilling: [...form.recommended_upskilling, val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer Info Note */}
            <div className="pt-2 pb-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Changes will be saved to MongoDB database & logged into candidate audit history</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
