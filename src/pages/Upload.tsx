import { useState } from "react";
import { UploadCloud, FileText, CheckCircle2, Loader2, X, User, Briefcase, GraduationCap, Award, Code, FolderGit2, ExternalLink, Paperclip } from "lucide-react";
import { RESUME_UPLOAD, RESUME_LIST, RESUME_DOCUMENTS } from "../utils/Api";

export default function Upload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [parsedResponse, setParsedResponse] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("personal");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [otherDocFile, setOtherDocFile] = useState<File | null>(null);
  const [otherDocType, setOtherDocType] = useState<string>("Cover Letter");
  const [otherDocTitle, setOtherDocTitle] = useState<string>("");
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const steps = [
    { number: 1, title: "Upload", active: true },
    { number: 2, title: "Parse & Extract", active: parsedResponse ? true : false },
    { number: 3, title: "AI Analysis", active: parsedResponse ? true : false },
    { number: 4, title: "Complete", active: parsedResponse ? true : false },
  ];



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setIsParsing(true);
    setPollingError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(RESUME_UPLOAD, {
        method: 'POST',
        headers,
        body: formData,
      });

      const resData = await response.json();

      if (response.status === 401 || (resData.detail && typeof resData.detail === 'string' &&
        (resData.detail.toLowerCase().includes('token') || resData.detail.toLowerCase().includes('signature') || resData.detail.toLowerCase().includes('authentication')))) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        throw new Error(resData.detail || resData.message || 'Upload failed. Ensure backend is running.');
      }

      const initialResult = resData.data || resData;
      const resumeId = initialResult.id;
      console.log(`[FRONTEND_UPLOAD] File uploaded successfully. Initial Resume ID: '${resumeId}', Status: '${initialResult.status}'`);

      let finalResult = initialResult;
      let currentStatus = (initialResult.status || "").toLowerCase();
      let attempts = 0;

      while (currentStatus === "pending" && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        console.log(`[FRONTEND_UPLOAD_POLL] Checking status for Resume ID '${resumeId}' (Attempt ${attempts})...`);

        const statusRes = await fetch(`${RESUME_LIST}/${resumeId}`, {
          method: 'GET',
          headers
        });

        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          throw new Error(statusData.detail || "Failed to check status.");
        }

        finalResult = statusData.data || statusData;
        currentStatus = (finalResult.status || "").toLowerCase();
        console.log(`[FRONTEND_UPLOAD_POLL] Status response received:`, finalResult);

        if (currentStatus === "failed" || currentStatus === "error") {
          throw new Error("AI Parsing failed on the backend.");
        }
      }

      if (currentStatus === "pending") {
        throw new Error("Parsing timed out after 5 minutes.");
      }

      console.log(`[FRONTEND_UPLOAD_SUCCESS] Resume parsing completed! Final Candidate ID: '${finalResult.id}', Email: '${finalResult.parsed_data?.email}'`);
      setIsParsing(false);
      setParsedResponse(finalResult);
      if (finalResult.is_auto_updated) {
        const candName = finalResult.parsed_data?.full_name || "Candidate";
        const rawOldDate = finalResult.previous_upload_date || (finalResult.other_documents && finalResult.other_documents.length > 0 ? finalResult.other_documents[finalResult.other_documents.length - 1]?.uploaded_at : null);
        let formattedOldDate = "";
        if (rawOldDate) {
          try {
            formattedOldDate = new Date(rawOldDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          } catch {
            formattedOldDate = String(rawOldDate).split("T")[0];
          }
        }
        const dateText = formattedOldDate ? ` (Created on: ${formattedOldDate})` : "";
        setToastMessage(`The candidate profile for "${candName}" already exists${dateText}, so the resume has been updated.`);
      } else {
        setToastMessage(null);
      }
      setShowModal(true);
    } catch (e: any) {
      setIsParsing(false);
      setPollingError(e.message || "Failed to parse upload");
    }
  };

  const pData = parsedResponse?.parsed_data || {};
  const aiEval = parsedResponse?.ai_evaluation || {};

  const personal = {
    full_name: pData.full_name,
    email: pData.email,
    phone_number: pData.phone,
    current_location: pData.location,
    linkedin_url: pData.linkedin,
    total_experience: pData.total_experience_years
  };

  const expList = Array.isArray(pData.experience) ? pData.experience : [];
  const eduList = Array.isArray(pData.education) ? pData.education : [];
  const certList = Array.isArray(pData.certifications) ? pData.certifications : [];
  const projList = Array.isArray(pData.projects) ? pData.projects : [];
  const skills = {
    primary_skills: pData.primary_skills || [],
    frameworks: pData.frameworks || [],
    databases: pData.databases || [],
    cloud_technologies: pData.cloud_tech || [],
  };
  const otherDocs = parsedResponse?.other_documents || [];

  const handleUploadOtherDoc = async () => {
    if (!otherDocFile || !parsedResponse?.id) return;
    setIsUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', otherDocFile);

      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${RESUME_DOCUMENTS(parsedResponse.id)}?doc_type=${encodeURIComponent(otherDocType)}&doc_title=${encodeURIComponent(otherDocTitle)}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setParsedResponse(data.data || data);
        setOtherDocFile(null);
        setOtherDocTitle("");
        alert("Document uploaded successfully!");
      } else {
        alert(data.message || "Failed to upload document");
      }
    } catch (e) {
      alert("Failed to upload document");
    } finally {
      setIsUploadingDoc(false);
    }
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 font-sans relative">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Resume Upload & AI Extractor</h1>
        {parsedResponse && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            View Parsed Resume Popup
          </button>
        )}
      </div>

      {/* Main Container Card Wrapper */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
        {/* Step Wizard Header */}
        <div className="flex items-center justify-between max-w-3xl mx-auto px-4 py-2 border-b border-slate-200 pb-6">
          {steps.map((step, idx) => (
            <div key={step.number} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step.active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}>
                  {step.number}
                </span>
                <span className={`text-xs font-bold ${step.active ? "text-indigo-600" : "text-slate-500"}`}>
                  {step.title}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <span className="text-slate-300 mx-4 font-light text-sm">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Toast Message for Existing Email Update */}
        {toastMessage && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-amber-700 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-amber-600 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold">{toastMessage}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-amber-600 hover:text-amber-800 p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left / Drag & Drop Upload Zone (2 cols) */}
          <div className="lg:col-span-2">
            <div
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300 ${isDragging ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 bg-slate-50 hover:border-indigo-400"
                }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Cloud Icon */}
              <div className="relative mb-4 flex items-center justify-center">
                <UploadCloud className="text-slate-400 w-24 h-24 stroke-1" />
                <span className="absolute text-indigo-600 text-xl font-bold">↑</span>
              </div>

              <h3 className="text-base font-bold text-slate-900 mb-4">
                Drag & Drop your resume here (PDF, DOC, DOCX)
              </h3>

              <span className="text-xs text-slate-500 mb-4">or</span>

              <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors shadow-sm mb-6">
                Browse Files
                <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileInput} />
              </label>

              <span className="text-xs text-slate-500 mb-8">
                Supports PDF, DOC, DOCX (Max 20MB)
              </span>

              {/* Divider */}
              <div className="w-full flex items-center gap-4 mb-6">
                <div className="h-px bg-slate-200 flex-1"></div>
                <span className="text-xs text-slate-500 font-medium">or</span>
                <div className="h-px bg-slate-200 flex-1"></div>
              </div>
            </div>

            {/* Selected File & Actions */}
            {file && (
              <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="text-indigo-600" size={20} />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{file.name}</p>
                    <p className="text-[11px] text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>

                <button
                  onClick={handleParse}
                  disabled={isParsing}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-md cursor-pointer"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Extracting AI Data...
                    </>
                  ) : (
                    <>Start AI Parsing</>
                  )}
                </button>
              </div>
            )}

            {pollingError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                <strong>Error:</strong> {pollingError}
              </div>
            )}

            {parsedResponse && (
              <div className="mt-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-4 shadow-sm">
                {parsedResponse.is_auto_updated && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
                    <span>{toastMessage || "This candidate profile already exists, so the resume has been updated"}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 size={16} /> Resume Uploaded & Auto Extracted Successfully!
                  </h4>
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
                  >
                    Open Extracted Details Popup
                  </button>
                </div>

                {parsedResponse.s3_url && (
                  <div className="text-xs flex items-center gap-2">
                    <span className="text-slate-600 font-medium">S3 Link: </span>
                    <a
                      href={parsedResponse.s3_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 underline hover:text-indigo-800 break-all flex items-center gap-1"
                    >
                      {parsedResponse.s3_url} <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Tips & Recent Uploads */}
          <div className="space-y-6">
            {/* Upload Tips Box */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Upload Tips</h3>
              <ul className="space-y-3 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 text-base leading-none">◇</span>
                  <span>Upload latest resume (PDF / DOC / DOCX)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 text-base leading-none">◇</span>
                  <span>Ensure all experience sections are clear</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 text-base leading-none">◇</span>
                  <span>Auto extracts Skills, Projects, CTC & History</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 text-base leading-none">◇</span>
                  <span>Max file size: 20MB</span>
                </li>
              </ul>
            </div>


          </div>
        </div>
      </div>

      {/* PARSED RESUME DETAILS POPUP MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-600" size={20} /> Extracted Resume Information
                </h3>
                <p className="text-xs text-slate-500 mt-1">Module 2 – AI Resume Parsing Results</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-2 px-6 border-b border-slate-200 bg-white overflow-x-auto text-xs py-2">
              {[
                { id: "personal", label: "Personal Information", icon: User },
                { id: "experience", label: "Experience", icon: Briefcase },
                { id: "education", label: "Education", icon: GraduationCap },
                { id: "certifications", label: "Certifications", icon: Award },
                { id: "skills", label: "Skills", icon: Code },
                { id: "projects", label: "Projects", icon: FolderGit2 },
                { id: "evaluation", label: "AI Evaluation", icon: ExternalLink },
                { id: "documents", label: "Additional Documents", icon: Paperclip },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === tab.id
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              {/* Tab 1: Personal Information */}
              {activeTab === "personal" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Personal Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FieldBox label="Full Name" value={personal.full_name} />
                    <FieldBox label="Phone Number" value={personal.phone_number} />
                    <FieldBox label="Email" value={personal.email} />
                    <FieldBox label="Current Location" value={personal.current_location} />
                    <FieldBox label="LinkedIn URL" value={personal.linkedin_url} isLink />
                    <FieldBox label="Total Experience (Years)" value={personal.total_experience} />
                  </div>
                </div>
              )}

              {/* Tab 2: Experience */}
              {activeTab === "experience" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Work Experience</h4>
                  {expList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No experience records specified.</p>
                  ) : (
                    expList.map((exp: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FieldBox label="Company" value={exp.company} />
                          <FieldBox label="Designation" value={exp.designation} />
                          <FieldBox label="Duration" value={exp.duration} />
                          <FieldBox label="Responsibilities" value={exp.responsibilities} fullWidth />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Education */}
              {activeTab === "education" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Education History</h4>
                  {eduList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No education records specified.</p>
                  ) : (
                    eduList.map((edu: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FieldBox label="Degree" value={edu.degree} />
                          <FieldBox label="Specialization" value={edu.specialization} />
                          <FieldBox label="Institution" value={edu.institution} />
                          <FieldBox label="Year of Passing" value={edu.year_of_passing} />
                          <FieldBox label="Score (Percentage/CGPA)" value={edu.score} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 4: Certifications */}
              {activeTab === "certifications" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Certifications</h4>
                  {certList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No certification records specified.</p>
                  ) : (
                    certList.map((cert: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FieldBox label="Certification Name" value={cert.name} />
                          <FieldBox label="Issued By" value={cert.issued_by} />
                          <FieldBox label="Year" value={cert.year} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 5: Skills */}
              {activeTab === "skills" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Skills Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SkillPillGroup title="Primary Skills" items={skills.primary_skills} />
                    <SkillPillGroup title="Frameworks" items={skills.frameworks} />
                    <SkillPillGroup title="Databases" items={skills.databases} />
                    <SkillPillGroup title="Cloud Technologies" items={skills.cloud_technologies} />
                  </div>
                </div>
              )}

              {/* Tab 6: Projects */}
              {activeTab === "projects" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Projects</h4>
                  {projList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No projects specified.</p>
                  ) : (
                    projList.map((proj: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                        <h5 className="text-xs font-bold text-emerald-700">Project #{idx + 1}: {proj.name || "Untitled"}</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FieldBox label="Domain" value={proj.domain} />
                          <FieldBox label="Duration" value={proj.duration} />
                          <FieldBox label="Role" value={proj.role} />
                          <FieldBox label="Technology Stack" value={proj.tech_stack?.join(", ")} fullWidth />
                          <FieldBox label="Description" value={proj.description} fullWidth />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 7: AI Evaluation */}
              {activeTab === "evaluation" && (
                <div className="space-y-6">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">AI Insight & Evaluation</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white border border-indigo-200 p-4 rounded-xl flex flex-col items-center justify-center text-center shadow-xs">
                      <span className="text-xs font-bold text-slate-500 mb-1">AI Technical Score</span>
                      <span className="text-3xl font-black text-indigo-600">{aiEval.ai_technical_score || "N/A"}/100</span>
                    </div>
                    <FieldBox label="Experience Level" value={aiEval.experience_level} />
                    <FieldBox label="Job Hopping Risk" value={aiEval.career_analysis?.job_hopping_risk} />
                    <FieldBox label="Career Stability" value={aiEval.career_analysis?.career_stability} />
                    <FieldBox label="Promotion Pattern" value={aiEval.career_analysis?.promotion_pattern} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SkillPillGroup title="Skill Strengths" items={aiEval.skill_strengths} />
                    <SkillPillGroup title="Skill Weaknesses" items={aiEval.skill_weaknesses} />
                    <SkillPillGroup title="Domain Expertise" items={aiEval.domain_expertise} />
                    <SkillPillGroup title="Recommended Upskilling" items={aiEval.career_analysis?.recommended_upskilling} />
                  </div>

                  {aiEval.personality_analysis && (
                    <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-xs">
                      <h5 className="text-xs font-bold text-slate-800">Personality & Trait Inference</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FieldBox label="Leadership" value={`${aiEval.personality_analysis.leadership}/100`} />
                        <FieldBox label="Team Player" value={`${aiEval.personality_analysis.team_player}/100`} />
                        <FieldBox label="Problem Solving" value={`${aiEval.personality_analysis.problem_solving}/100`} />
                        <FieldBox label="Communication" value={`${aiEval.personality_analysis.communication}/100`} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 8: Additional Documents */}
              {activeTab === "documents" && (
                <div className="space-y-6">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Candidate Documents</h4>

                  {/* Upload Form */}
                  <div className="bg-white border border-slate-200 p-5 rounded-xl space-y-4 shadow-xs">
                    <h5 className="text-xs font-bold text-slate-800">Upload New Document</h5>
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                      <input
                        type="text"
                        placeholder="Title (Optional)"
                        value={otherDocTitle}
                        onChange={e => setOtherDocTitle(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500 w-full md:w-1/4"
                      />
                      <select
                        value={otherDocType}
                        onChange={e => setOtherDocType(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-xs text-slate-800 p-2.5 rounded-lg focus:outline-none focus:border-indigo-500 w-full md:w-1/4"
                      >
                        <option value="Cover Letter">Cover Letter</option>
                        <option value="ID Proof">ID Proof</option>
                        <option value="Certification">Certification</option>
                        <option value="Previous Resume">Previous Resume</option>
                        <option value="Other">Other</option>
                      </select>

                      <input
                        type="file"
                        onChange={e => e.target.files && setOtherDocFile(e.target.files[0])}
                        className="text-xs text-slate-600 w-full md:w-1/2 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border border-indigo-200 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                      />

                      <button
                        onClick={handleUploadOtherDoc}
                        disabled={!otherDocFile || isUploadingDoc}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap w-full md:w-auto cursor-pointer"
                      >
                        {isUploadingDoc ? "Uploading..." : "Upload"}
                      </button>
                    </div>
                  </div>

                  {/* Documents List */}
                  <div className="space-y-3">
                    {otherDocs.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No additional documents uploaded yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {otherDocs.map((doc: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="bg-indigo-50 border border-indigo-200 p-2 rounded-lg text-indigo-600">
                                <Paperclip size={16} />
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-xs font-bold text-slate-900 truncate">{doc.title || doc.filename}</p>
                                <p className="text-[10px] text-slate-500">{doc.doc_type} • {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <a
                              href={doc.s3_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 border border-indigo-200 p-2 rounded-lg transition-colors"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">Status: Ready for AI Evaluation</span>
              <button
                onClick={() => setShowModal(false)}
                className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Popup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBox({ label, value, isLink, fullWidth }: { label: string; value?: string; isLink?: boolean; fullWidth?: boolean }) {
  const displayVal = value && value.toString().trim() ? value.toString() : "N/A";
  return (
    <div className={`space-y-1 ${fullWidth ? "col-span-full" : ""}`}>
      <label className="text-[11px] font-medium text-slate-500 block">{label}</label>
      {isLink && displayVal !== "N/A" ? (
        <a
          href={displayVal.startsWith("http") ? displayVal : `https://${displayVal}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline break-all block font-medium"
        >
          {displayVal}
        </a>
      ) : (
        <span className={`text-xs block font-semibold ${displayVal === "N/A" ? "text-slate-400 italic" : "text-slate-800"}`}>
          {displayVal}
        </span>
      )}
    </div>
  );
}

function SkillPillGroup({ title, items }: { title: string; items?: any[] }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div className="bg-white border border-slate-200 p-3.5 rounded-xl space-y-2 shadow-xs">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {list.length > 0 ? (
          list.map((item, idx) => {
            let displayItem = item;
            if (typeof item === 'object' && item !== null) {
              displayItem = item.name || item.skill || JSON.stringify(item);
            }
            return (
              <span key={idx} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-0.5 rounded-md text-[11px] font-medium">
                {String(displayItem)}
              </span>
            );
          })
        ) : (
          <span className="text-[11px] text-slate-400 italic">None extracted</span>
        )}
      </div>
    </div>
  );
}
