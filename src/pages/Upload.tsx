import { useState, useEffect } from "react";
import { UploadCloud, FileText, CheckCircle2, Loader2, X, User, Briefcase, GraduationCap, Award, Code, FolderGit2, ExternalLink, Paperclip, Clock, Sparkles, Cpu, Send, Brain, AlertCircle } from "lucide-react";
import { RESUME_UPLOAD, RESUME_LIST, RESUME_DOCUMENTS, SETTINGS_APP } from "../utils/Api";

export default function Upload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [appConfig, setAppConfig] = useState({ enable_bulk_parsing: true, bulk_parsing_limit: 5 });
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, filename: "" });
  const [isParsing, setIsParsing] = useState(false);
  const [parsingStep, setParsingStep] = useState<number>(1);
  const [parsingStatusText, setParsingStatusText] = useState<string>("Uploading document & initializing parser...");
  const [parsingProgress, setParsingProgress] = useState<number>(10);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [parsedResponse, setParsedResponse] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("personal");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [resumeSource, setResumeSource] = useState<string>("");
  const [resumeSourceInformerName, setResumeSourceInformerName] = useState<string>("");
  const [otherDocFile, setOtherDocFile] = useState<File | null>(null);
  const [otherDocType, setOtherDocType] = useState<string>("Cover Letter");
  const [otherDocTitle, setOtherDocTitle] = useState<string>("");
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  useEffect(() => {
    fetch(SETTINGS_APP)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enable_bulk_parsing !== 'undefined') {
          setAppConfig({
            enable_bulk_parsing: data.enable_bulk_parsing,
            bulk_parsing_limit: data.bulk_parsing_limit || 5
          });
        }
      })
      .catch(err => console.error("Failed to load app config", err));
  }, []);

  // Timer effect for tracking elapsed time during parsing
  useEffect(() => {
    let interval: any = null;
    if (isParsing) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isParsing]);

  // Update progress bar and text dynamically based on elapsed time
  useEffect(() => {
    if (!isParsing) return;

    if (elapsedSeconds < 5) {
      setParsingStep(1);
      setParsingStatusText("Uploading resume document & validating file format...");
      setParsingProgress(15);
    } else if (elapsedSeconds < 15) {
      setParsingStep(2);
      setParsingStatusText("Extracting text and document structure...");
      setParsingProgress(35);
    } else if (elapsedSeconds < 45) {
      setParsingStep(3);
      setParsingStatusText("AI Model analyzing candidate experience, skills & education...");
      setParsingProgress(65);
    } else if (elapsedSeconds < 90) {
      setParsingStep(3);
      setParsingStatusText("Processing detailed history for large resume... Please hold on!");
      setParsingProgress(85);
    } else {
      setParsingStep(4);
      setParsingStatusText("Finalizing candidate profile extraction...");
      setParsingProgress(95);
    }
  }, [elapsedSeconds, isParsing]);

  const sourceOptions = [
    { value: "", label: "-- Select any one --" },
    { value: "referral", label: "Employee Referral" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "naukri", label: "Naukri" },
    { value: "indeed", label: "Indeed" },
    { value: "email", label: "Email" },
    { value: "career_site", label: "Career Website" },
    { value: "company_website", label: "Company Website" },
    { value: "walk_in", label: "Walk-in" },
    { value: "campus_drive", label: "Campus Drive" },
    { value: "job_fair", label: "Job Fair" },
    { value: "consultancy", label: "Recruitment Consultancy" },
    { value: "staffing_agency", label: "Staffing Agency" },
    { value: "social_media", label: "Social Media" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "telegram", label: "Telegram" },
    { value: "friends", label: "Friends" },
    { value: "campaign", label: "Recruitment Campaign" },
    { value: "internal", label: "Internal Transfer" },
    { value: "rehire", label: "Rehire / Boomerang Employee" },
    { value: "freelancer", label: "Freelancer Platform" },
    { value: "other", label: "Other" },
  ];

  const steps = [
    { number: 1, title: "Upload", active: true },
    { number: 2, title: "Parse & Extract", active: isParsing || parsedResponse ? true : false },
    { number: 3, title: "AI Analysis", active: (isParsing && elapsedSeconds > 15) || parsedResponse ? true : false },
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
      const selectedFiles = Array.from(e.dataTransfer.files);
      if (appConfig.enable_bulk_parsing) {
        if (selectedFiles.length > appConfig.bulk_parsing_limit) {
          setPollingError(`You can only upload up to ${appConfig.bulk_parsing_limit} files at a time.`);
          return;
        }
        setFiles(selectedFiles);
        setFile(selectedFiles[0]); // keep legacy state for now to prevent breaking other UI
      } else {
        setFiles([selectedFiles[0]]);
        setFile(selectedFiles[0]);
      }
      setParsedResponse(null);
      setToastMessage(null);
      setPollingError(null);
      setShowModal(false);
      setResumeSource("");
      setResumeSourceInformerName("");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      if (appConfig.enable_bulk_parsing) {
        if (selectedFiles.length > appConfig.bulk_parsing_limit) {
          setPollingError(`You can only upload up to ${appConfig.bulk_parsing_limit} files at a time.`);
          return;
        }
        setFiles(selectedFiles);
        setFile(selectedFiles[0]);
      } else {
        setFiles([selectedFiles[0]]);
        setFile(selectedFiles[0]);
      }
      setParsedResponse(null);
      setToastMessage(null);
      setPollingError(null);
      setShowModal(false);
      setResumeSource("");
      setResumeSourceInformerName("");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins > 0 ? `${mins}m ` : ''}${secs}s`;
  };

  const handleParse = async () => {
    if (files.length === 0) return;
    setIsParsing(true);
    setPollingError(null);
    
    let allResults: any[] = [];
    let lastErrorMsg = "";
    
    for (let i = 0; i < files.length; i++) {
      const currentFile = files[i];
      setFile(currentFile); // Update UI for current file
      setBulkProgress({ current: i + 1, total: files.length, filename: currentFile.name });
      setParsingStep(1);
      setParsingProgress(10);
      
      const startTime = Date.now();
      
      try {
        const formData = new FormData();
        formData.append('file', currentFile);

        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        let uploadUrl = `${RESUME_UPLOAD}?resume_source=${encodeURIComponent(resumeSource)}`;
        if (resumeSourceInformerName.trim()) {
          uploadUrl += `&resume_source_informer_name=${encodeURIComponent(resumeSourceInformerName.trim())}`;
        }
        const response = await fetch(uploadUrl, {
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
        
        let finalResult = initialResult;
        let currentStatus = (initialResult.status || "").toLowerCase();
        let attempts = 0;
        let consecutiveErrors = 0;

        while (currentStatus === "pending" && attempts < 120) {
          await new Promise(resolve => setTimeout(resolve, 4000));
          attempts++;
          
          try {
            const statusRes = await fetch(`${RESUME_LIST}/${resumeId}`, {
              method: 'GET',
              headers
            });

            if (!statusRes.ok) {
              consecutiveErrors++;
              if (consecutiveErrors >= 5) {
                const statusData = await statusRes.json().catch(() => ({}));
                throw new Error(statusData.detail || "Failed to check parsing status from server.");
              }
              continue;
            }

            const statusData = await statusRes.json();
            consecutiveErrors = 0; 

            finalResult = statusData.data || statusData;
            currentStatus = (finalResult.status || "").toLowerCase();

            if (currentStatus === "failed" || currentStatus === "error") {
              throw new Error("AI Parsing failed on the backend.");
            }
          } catch (pollErr: any) {
            consecutiveErrors++;
            if (consecutiveErrors >= 5) {
              throw pollErr;
            }
          }
        }

        if (currentStatus === "pending") {
          throw new Error("Parsing timed out after 8 minutes. Please try again.");
        }

        const endTime = Date.now();
        const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);

        setParsingProgress(100);
        allResults.push({ ...finalResult, originalFilename: currentFile.name, parseStatus: 'success', parseDuration: durationSeconds });
        
      } catch (e: any) {
        const endTime = Date.now();
        const durationSeconds = ((endTime - startTime) / 1000).toFixed(1);
        lastErrorMsg = e.message || "Failed to parse upload";
        allResults.push({ originalFilename: currentFile.name, parseStatus: 'error', errorMsg: lastErrorMsg, parseDuration: durationSeconds });
      }
    }
    
    setIsParsing(false);
    
    if (files.length === 1) {
      if (allResults[0].parseStatus === 'success') {
        setParsedResponse(allResults[0]);
        if (allResults[0].is_auto_updated) {
          const candName = allResults[0].parsed_data?.full_name || "Candidate";
          setToastMessage(`The candidate profile for "${candName}" already exists, so the resume has been updated.`);
        } else {
          setToastMessage(null);
        }
        setShowModal(true);
      } else {
        setPollingError(allResults[0].errorMsg);
      }
    } else {
      // For bulk, we set the first successful response as the display, 
      // but ideally we'd show a summary modal. We'll set a mock response to trigger step 4.
      setParsedResponse({ isBulk: true, results: allResults });
      setShowModal(true);
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

      const token = localStorage.getItem('access_token');
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
          {/* Main Column (Spans full width when parsing, 2 cols when normal) */}
          <div className={isParsing ? "lg:col-span-3" : "lg:col-span-2"}>
            {/* Compact & Neat Upload Card (Hidden when parsing) */}
            {!isParsing && (
              <div
                className={`border-2 border-dashed rounded-2xl p-6 transition-all duration-300 ${isDragging ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 bg-slate-50/70 hover:border-indigo-400"
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                    <UploadCloud size={24} />
                  </div>

                  {/* Text & Button */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">
                      Drag & Drop resume file here
                    </h3>
                    <p className="text-xs text-slate-500">
                      Supports PDF, DOC, DOCX (Max 20MB)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-medium">or</span>
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm inline-flex items-center gap-1.5">
                      <FileText size={14} />
                      Browse File
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx" multiple={appConfig.enable_bulk_parsing} onChange={handleFileInput} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Selected File Details & Source Selection (Hidden when parsing) */}
            {!isParsing && file && (
              <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-slate-50/90 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100/80 border border-indigo-200 flex items-center justify-center text-indigo-600">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{files.length === 1 ? file.name : `${files.length} files selected`}</p>
                      <p className="text-[11px] text-slate-500">{files.length === 1 ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : `Total size: ${(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB`}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setFile(null);
                      setResumeSource("");
                      setResumeSourceInformerName("");
                      setParsedResponse(null);
                      setToastMessage(null);
                      setPollingError(null);
                      setShowModal(false);
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Step 2: Resume Source Dropdown (Displayed after file upload) */}
                <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    Resume Source <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={resumeSource}
                    onChange={(e) => setResumeSource(e.target.value)}
                    className="w-full sm:w-64 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-xs"
                  >
                    {sourceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2.5: Resume Source Informer Name Field (Displayed after selecting source) */}
                {resumeSource && (
                  <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Resume Source Informer Name:
                    </label>
                    <input
                      type="text"
                      placeholder="Enter informer / sourcer name..."
                      value={resumeSourceInformerName}
                      onChange={(e) => setResumeSourceInformerName(e.target.value)}
                      className="w-full sm:w-64 bg-white border border-slate-300 text-xs font-semibold text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-text shadow-xs"
                    />
                  </div>
                )}

                {/* Step 3: Start AI Parsing Button (Displayed ONLY after source value is selected) */}
                {resumeSource && (
                  <div className="pt-3 border-t border-slate-200/80 flex justify-end">
                    <button
                      onClick={handleParse}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer animate-fadeIn"
                    >
                      Start AI Parsing
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI Parsing Progress Loader & Notification Card (Full Width Un-truncated Layout) */}
            {isParsing && (
              <div className="mt-2 p-8 bg-white rounded-3xl shadow-sm border border-slate-200 border-t-4 border-t-indigo-600 space-y-6 relative overflow-hidden animate-fadeIn font-sans max-w-5xl mx-auto">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Animated Circular Spinner Container */}
                    <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs relative">
                      <Loader2 className="animate-spin text-indigo-600" size={32} />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">AI Resume Parsing in Progress</h3>
                        <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                          <Sparkles size={12} className="text-indigo-500 animate-spin" /> AI Active
                        </span>
                      </div>
                      <p className="text-xs text-indigo-600 font-semibold mt-0.5">{parsingStatusText}</p>
                    </div>
                  </div>

                  {/* Time Elapsed Widget */}
                  <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl px-5 py-3 flex items-center gap-3.5 shadow-2xs self-stretch sm:self-auto justify-between sm:justify-start shrink-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Clock size={20} className="text-indigo-600 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-slate-400 font-medium">Time Elapsed</span>
                      <span className="text-base font-bold text-slate-900 font-mono leading-none">{formatTime(elapsedSeconds)}</span>
                    </div>
                  </div>
                </div>

                {/* File Details Container Card */}
                {file && (
                  <div className="bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3.5 overflow-hidden w-full sm:w-auto">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <FileText size={22} />
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        <h4 className="text-xs font-bold text-slate-800 font-mono break-all">{file.name}</h4>
                        <p className="text-[11px] text-slate-400 font-medium">({(file.size / 1024 / 1024).toFixed(2)} MB) {files.length > 1 && ` - File ${bulkProgress.current} of ${bulkProgress.total}`}</p>
                      </div>
                    </div>

                    {resumeSource && (
                      <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-xs font-semibold px-3.5 py-1.5 rounded-full inline-flex items-center gap-1.5 shrink-0">
                        <Send size={12} className="text-indigo-500" />
                        Source: {sourceOptions.find(s => s.value === resumeSource)?.label || resumeSource}
                      </span>
                    )}
                  </div>
                )}

                {/* Progress Bar Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-900 font-bold flex items-center gap-2">
                      <Cpu size={16} className="text-indigo-600" />
                      Extraction Progress
                    </span>
                    <span className="text-indigo-600 font-mono font-bold text-sm">{parsingProgress}%</span>
                  </div>

                  <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60 shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${parsingProgress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Step Wizard Steps Connected by Dashed Line (Un-truncated Text Labels) */}
                <div className="relative pt-2">
                  {/* Dashed connecting background line */}
                  <div className="hidden sm:block absolute top-1/2 left-10 right-10 h-0.5 border-t-2 border-dashed border-slate-200 -z-0"></div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
                    {/* Step 1 */}
                    <div className={`rounded-2xl px-4 py-3 border flex items-center gap-3 transition-all ${
                      parsingStep >= 1 ? "bg-indigo-50/80 border-indigo-200 text-indigo-600 shadow-2xs" : "bg-slate-50/70 border-slate-200/80 text-slate-400"
                    }`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        parsingStep >= 1 ? "bg-indigo-600 text-white" : "bg-slate-400 text-white"
                      }`}>01</span>
                      <UploadCloud size={18} className={parsingStep >= 1 ? "text-indigo-600 shrink-0" : "text-slate-400 shrink-0"} />
                      <span className={`text-xs font-bold whitespace-nowrap ${parsingStep >= 1 ? "text-indigo-600" : "text-slate-500"}`}>File Upload</span>
                    </div>

                    {/* Step 2 */}
                    <div className={`rounded-2xl px-4 py-3 border flex items-center gap-3 transition-all ${
                      parsingStep >= 2 ? "bg-indigo-50/80 border-indigo-200 text-indigo-600 shadow-2xs" : "bg-slate-50/70 border-slate-200/80 text-slate-400"
                    }`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        parsingStep >= 2 ? "bg-indigo-600 text-white" : "bg-slate-400 text-white"
                      }`}>02</span>
                      <FileText size={18} className={parsingStep >= 2 ? "text-indigo-600 shrink-0" : "text-slate-400 shrink-0"} />
                      <span className={`text-xs font-bold whitespace-nowrap ${parsingStep >= 2 ? "text-indigo-600" : "text-slate-500"}`}>Text Extraction</span>
                    </div>

                    {/* Step 3 */}
                    <div className={`rounded-2xl px-4 py-3 border flex items-center gap-3 transition-all ${
                      parsingStep >= 3 ? "bg-indigo-50/80 border-indigo-200 text-indigo-600 shadow-2xs" : "bg-slate-50/70 border-slate-200/80 text-slate-400"
                    }`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        parsingStep >= 3 ? "bg-indigo-600 text-white" : "bg-slate-400 text-white"
                      }`}>03</span>
                      <Brain size={18} className={parsingStep >= 3 ? "text-indigo-600 shrink-0" : "text-slate-400 shrink-0"} />
                      <span className={`text-xs font-bold whitespace-nowrap ${parsingStep >= 3 ? "text-indigo-600" : "text-slate-500"}`}>AI Deep Analysis</span>
                    </div>

                    {/* Step 4 */}
                    <div className={`rounded-2xl px-4 py-3 border flex items-center gap-3 transition-all ${
                      parsingStep >= 4 ? "bg-indigo-50/80 border-indigo-200 text-indigo-600 shadow-2xs" : "bg-slate-50/70 border-slate-200/80 text-slate-400"
                    }`}>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        parsingStep >= 4 ? "bg-indigo-600 text-white" : "bg-slate-400 text-white"
                      }`}>04</span>
                      <User size={18} className={parsingStep >= 4 ? "text-indigo-600 shrink-0" : "text-slate-400 shrink-0"} />
                      <span className={`text-xs font-bold whitespace-nowrap ${parsingStep >= 4 ? "text-indigo-600" : "text-slate-500"}`}>Profile Ready</span>
                    </div>
                  </div>
                </div>

                {/* Large Resume Notice Box */}
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-4 text-amber-900">
                  <div className="w-9 h-9 rounded-full border-2 border-amber-500 flex items-center justify-center text-amber-600 font-bold text-base shrink-0 bg-amber-100/50">
                    !
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-amber-900">Large Resume Notice</h4>
                    <p className="text-xs text-amber-800/90 font-medium leading-relaxed">
                      Detailed resumes with multiple pages take extra processing time to extract work experience, projects, and skills accurately. Please do not refresh or close this browser tab while parsing.
                    </p>
                  </div>
                </div>

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

          {/* Right Column: Tips & Recent Uploads (Hidden when parsing) */}
          {!isParsing && (
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
          )}
        </div>
      </div>

      {/* PARSED RESUME DETAILS POPUP MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-4">
                {parsedResponse?.fromBulkResults && (
                  <button 
                    onClick={() => setParsedResponse({ isBulk: true, results: parsedResponse.fromBulkResults })}
                    className="flex items-center justify-center p-1.5 bg-white hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 transition-colors cursor-pointer shadow-sm"
                    title="Back to Bulk List"
                  >
                    <span className="text-lg leading-none font-bold">←</span>
                  </button>
                )}
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-600" size={20} /> Extracted Resume Information
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Module 2 – AI Resume Parsing Results</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {parsedResponse?.isBulk ? (
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <h4 className="text-md font-bold mb-4 text-slate-800">Bulk Parsing Results</h4>
                <div className="space-y-4">
                  {parsedResponse.results.map((res: any, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-xs">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{res.originalFilename}</p>
                        {res.parseStatus === 'success' ? (
                          <div className="mt-1 flex items-center gap-3">
                            <p className="text-xs text-emerald-600 font-medium">Successfully parsed • {res.parsed_data?.full_name}</p>
                            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">{res.parseDuration}s</span>
                            <button 
                              onClick={() => setParsedResponse({ ...res, fromBulkResults: parsedResponse.results })}
                              className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer"
                            >
                              View Details
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-3">
                            <p className="text-xs text-rose-600 font-medium">Failed: {res.errorMsg}</p>
                            <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-mono">{res.parseDuration}s</span>
                          </div>
                        )}
                      </div>
                      {res.parseStatus === 'success' ? (
                        <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                      ) : (
                        <AlertCircle className="text-rose-500 w-5 h-5" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
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
                    <FieldBox label="Resume Source" value={parsedResponse?.resume_source || resumeSource} />
                    <FieldBox label="Resume Source Informer Name" value={parsedResponse?.resume_source_informer_name || resumeSourceInformerName} />
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
            </>
            )}

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
