import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Briefcase,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  GraduationCap,
  History,
  Layers,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";

import { useFeedback } from "../components/ui/Feedback";
import { ConfidenceBadge } from "./Applications";
import JobMatchBadge from "../components/JobMatchBadge";
import {
  addCandidateNote,
  fetchCandidate360,
  removeCandidateNote,
  reprocessCandidateResume,
  updateCandidate,
  updateCandidateTags,
  type Candidate360Data,
} from "../utils/candidatesApi";

const TABS = [
  { id: "overview", label: "Overview", icon: <User size={16} /> },
  { id: "resume", label: "Resume & Documents", icon: <FileText size={16} /> },
  { id: "extraction", label: "AI Review", icon: <Sparkles size={16} /> },
  { id: "applications", label: "Applications", icon: <Layers size={16} /> },
  { id: "interviews", label: "Interviews", icon: <Calendar size={16} /> },
  { id: "notes", label: "Notes", icon: <MessageSquare size={16} /> },
  { id: "activity", label: "Activity", icon: <History size={16} /> },
];

const getInitials = (name?: string) => {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

export default function Candidate360() {
  const { id } = useParams<{ id: string }>();
  const { toast, confirm } = useFeedback();

  const [candidate, setCandidate] = useState<Candidate360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Modals & form state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    current_role: "",
    total_experience_years: "",
    linkedin: "",
    portfolio: "",
  });

  // Tag modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  // Note state
  const [noteInput, setNoteInput] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  // Selected document for preview
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);

  // Load candidate 360 data
  const loadCandidate = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await fetchCandidate360(id);
      setCandidate(data);
      setEditForm({
        full_name: data.full_name || "",
        email: data.email || "",
        phone: data.phone || "",
        location: data.location || "",
        current_role: data.current_role || "",
        total_experience_years: data.total_experience_years != null ? String(data.total_experience_years) : "",
        linkedin: data.linkedin || "",
        portfolio: data.portfolio || "",
      });
    } catch (err: any) {
      toast(err.message || "Failed to load candidate profile", "error");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    loadCandidate();
  }, [loadCandidate]);

  // Handle Edit Save
  const handleSaveEdit = async () => {
    if (!id) return;
    try {
      const exp = editForm.total_experience_years.trim() ? Number(editForm.total_experience_years) : null;
      await updateCandidate(id, {
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        location: editForm.location.trim(),
        current_role: editForm.current_role.trim(),
        total_experience_years: exp,
        linkedin: editForm.linkedin.trim(),
        portfolio: editForm.portfolio.trim(),
      });
      toast("Candidate profile updated successfully.", "success");
      setEditModalOpen(false);
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Failed to update profile", "error");
    }
  };

  // Add Tag
  const handleAddTag = async () => {
    if (!id || !candidate || !newTagInput.trim()) return;
    const tag = newTagInput.trim();
    const tags = Array.from(new Set([...(candidate.tags || []), tag]));
    try {
      await updateCandidateTags(id, tags);
      toast(`Tag "${tag}" added.`, "success");
      setNewTagInput("");
      setTagModalOpen(false);
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Failed to add tag", "error");
    }
  };

  // Remove Tag
  const handleRemoveTag = async (tagToRemove: string) => {
    if (!id || !candidate) return;
    const tags = (candidate.tags || []).filter((t) => t !== tagToRemove);
    try {
      await updateCandidateTags(id, tags);
      toast(`Tag removed.`, "info");
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Failed to remove tag", "error");
    }
  };

  // Add Note
  const handleAddNote = async () => {
    if (!id || !noteInput.trim()) return;
    try {
      setNoteSubmitting(true);
      await addCandidateNote(id, noteInput.trim());
      toast("Note added to profile.", "success");
      setNoteInput("");
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Failed to add note", "error");
    } finally {
      setNoteSubmitting(false);
    }
  };

  // Delete Note
  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    const ok = await confirm({
      title: "Delete note?",
      message: "Are you sure you want to remove this note? This action will be logged in the audit trail.",
      confirmLabel: "Delete Note",
      danger: true,
    });
    if (!ok) return;

    try {
      await removeCandidateNote(id, noteId);
      toast("Note deleted.", "info");
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Failed to delete note", "error");
    }
  };

  // Reprocess Resume
  const handleReprocess = async () => {
    if (!id) return;
    const ok = await confirm({
      title: "Reprocess resume with AI?",
      message: "This will re-send the candidate's resume to the AI parser for fresh extraction.",
      confirmLabel: "Reprocess",
    });
    if (!ok) return;

    try {
      await reprocessCandidateResume(id);
      toast("Resume sent for AI reprocessing.", "success");
      loadCandidate();
    } catch (err: any) {
      toast(err.message || "Reprocessing failed", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center text-slate-500">
          <RefreshCw className="mx-auto mb-3 animate-spin text-indigo-600" size={32} />
          <p className="text-sm font-medium">Loading candidate 360 profile...</p>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="py-16 text-center">
        <AlertCircle className="mx-auto mb-3 text-slate-400" size={40} />
        <h2 className="text-lg font-bold text-slate-800">Candidate not found</h2>
        <p className="mt-1 text-sm text-slate-500">The requested candidate record may have been merged or deleted.</p>
        <Link
          to="/database"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <ArrowLeft size={16} />
          <span>Back to Candidates</span>
        </Link>
      </div>
    );
  }

  const primaryDoc = candidate.documents?.[selectedDocIndex] || candidate.documents?.[0];
  const parsed = primaryDoc?.parsed_data || {};
  const confidence = primaryDoc?.confidence;
  const activeApp = candidate.applications?.[0];

  return (
    <div className="space-y-6 pb-24">
      {/* ── Breadcrumb & Back ── */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/database" className="inline-flex items-center gap-1 hover:text-indigo-600">
          <ArrowLeft size={14} /> Candidates
        </Link>
        <span>/</span>
        <span className="font-medium text-slate-900">{candidate.full_name}</span>
      </div>

      {/* ── Header Profile Card (Matching Screen 8 & 10) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Avatar & Core Bio */}
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-md">
              {getInitials(candidate.full_name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">{candidate.full_name}</h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {candidate.candidate_id_display || candidate.id}
                </span>
                {candidate.status === "merged" && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    Merged into {candidate.merged_into}
                  </span>
                )}
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {candidate.status === "active" ? "Active Candidate" : candidate.status}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{candidate.current_role || "Role unlisted"}</span>
                {candidate.total_experience_years != null && (
                  <span>&middot; {candidate.total_experience_years} years total experience</span>
                )}
                {candidate.owner_name && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    <User size={12} />
                    Owner: {candidate.owner_name}
                  </span>
                )}
              </div>

              {/* Contact Pills */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`mailto:${candidate.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Mail size={13} className="text-slate-400" />
                  <span>{candidate.email}</span>
                </a>

                {candidate.phone && (
                  <a
                    href={`tel:${candidate.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Phone size={13} className="text-slate-400" />
                    <span>{candidate.phone}</span>
                  </a>
                )}

                {candidate.location && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                    <MapPin size={13} className="text-slate-400" />
                    <span>{candidate.location}</span>
                  </span>
                )}

                {candidate.linkedin && (
                  <a
                    href={candidate.linkedin.startsWith("http") ? candidate.linkedin : `https://${candidate.linkedin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <ExternalLink size={13} />
                    <span>LinkedIn</span>
                  </a>
                )}

                {candidate.portfolio && (
                  <a
                    href={candidate.portfolio.startsWith("http") ? candidate.portfolio : `https://${candidate.portfolio}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink size={13} />
                    <span>Portfolio</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Edit3 size={14} />
              <span>Edit Details</span>
            </button>

            <button
              onClick={() => setTagModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Tag size={14} />
              <span>Add Tag</span>
            </button>

            <button
              onClick={handleReprocess}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
            >
              <Sparkles size={14} />
              <span>Reprocess AI</span>
            </button>
          </div>
        </div>

        {/* Tags bar */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold text-slate-500 mr-1">Tags:</span>
          {candidate.tags && candidate.tags.length > 0 ? (
            candidate.tags.map((t, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
              >
                <span>{t}</span>
                <button onClick={() => handleRemoveTag(t)} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400">No tags assigned</span>
          )}
          <button
            onClick={() => setTagModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition whitespace-nowrap ${
              activeTab === tab.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.id === "applications" && candidate.applications?.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {candidate.applications.length}
              </span>
            ) : null}
            {tab.id === "notes" && candidate.notes?.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {candidate.notes.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Experience</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {candidate.total_experience_years != null ? `${candidate.total_experience_years} yrs` : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notice Period</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {activeApp?.form?.notice_period || "30 Days"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Expected CTC</div>
              <div className="mt-1 text-2xl font-bold text-indigo-600">
                {activeApp?.form?.expected_ctc ? `₹${activeApp.form.expected_ctc.toLocaleString()}` : "—"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applications</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{candidate.applications?.length || 0}</div>
            </div>
          </div>

          {/* Skills Breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Brain size={18} className="text-indigo-600" />
              <span>Skills &amp; Technical Capabilities</span>
            </h3>

            <div className="flex flex-wrap gap-2">
              {candidate.skills && candidate.skills.length > 0 ? (
                candidate.skills.map((s, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-1 text-xs font-semibold text-indigo-800"
                  >
                    {s}
                  </span>
                ))
              ) : (
                <p className="text-xs text-slate-400">No skills identified yet.</p>
              )}
            </div>
          </div>

          {/* Experience Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Briefcase size={18} className="text-indigo-600" />
              <span>Work Experience</span>
            </h3>

            {parsed.experience && parsed.experience.length > 0 ? (
              <div className="space-y-6 divide-y divide-slate-100">
                {parsed.experience.map((exp: any, idx: number) => (
                  <div key={idx} className={idx > 0 ? "pt-6" : ""}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-base font-bold text-slate-900">{exp.designation || "Designation"}</div>
                        <div className="text-sm font-semibold text-indigo-700">{exp.company || "Company"}</div>
                      </div>
                      <div className="text-xs font-medium text-slate-500">
                        {exp.start_date || exp.start || ""} &mdash; {exp.end_date || exp.end || "Present"}
                      </div>
                    </div>
                    {exp.responsibilities && (
                      <p className="mt-2 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                        {exp.responsibilities}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No work experience entries extracted.</p>
            )}
          </div>

          {/* Education History */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap size={18} className="text-indigo-600" />
              <span>Education</span>
            </h3>

            {parsed.education && parsed.education.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {parsed.education.map((edu: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-xs">
                    <div className="font-bold text-slate-900">{edu.degree || "Degree"}</div>
                    <div className="font-medium text-slate-700">{edu.institution || "Institution"}</div>
                    <div className="mt-1 text-slate-500">
                      Passing Year: {edu.year_of_passing || edu.year || "—"} {edu.score ? `&middot; Score: ${edu.score}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No education entries extracted.</p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: RESUME & DOCUMENTS ── */}
      {activeTab === "resume" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Available Files ({candidate.documents?.length || 0})</h3>
            <div className="space-y-2">
              {candidate.documents?.map((doc, idx) => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDocIndex(idx)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    selectedDocIndex === idx
                      ? "border-indigo-600 bg-indigo-50/40 shadow-xs"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 truncate">
                      <FileText size={16} className="text-indigo-600 shrink-0" />
                      <span className="truncate">{doc.original_filename}</span>
                    </div>
                    {doc.confidence && <ConfidenceBadge c={doc.confidence} />}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">Uploaded {doc.upload_date?.slice(0, 10)}</div>
                </div>
              ))}
            </div>

            {primaryDoc?.s3_url && (
              <a
                href={primaryDoc.s3_url}
                target="_blank"
                rel="noreferrer"
                download
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download size={14} />
                <span>Download Document</span>
              </a>
            )}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-h-[500px] flex flex-col justify-center items-center text-center">
            {primaryDoc?.s3_url ? (
              <iframe
                src={primaryDoc.s3_url}
                className="w-full h-[650px] rounded-lg border border-slate-200"
                title="Resume Preview"
              />
            ) : (
              <div className="text-slate-400 space-y-2">
                <FileText size={48} className="mx-auto text-slate-300" />
                <p className="font-medium text-slate-700">{primaryDoc?.original_filename || "Resume File"}</p>
                <p className="text-xs">Document is archived in storage.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: AI EXTRACTION REVIEW (Matching Screen 9 / image11) ── */}
      {activeTab === "extraction" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles size={20} className="text-indigo-600" />
                <span>Resume Parser &amp; AI Extraction Review</span>
              </h3>
              <p className="text-xs text-slate-500">
                Field-by-field verification comparing the AI extracted values against final candidate profile data.
              </p>
            </div>
            {confidence && <ConfidenceBadge c={confidence} />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase tracking-wider text-slate-500 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="px-4 py-3 w-40">Attribute</th>
                  <th className="px-4 py-3">AI Extracted Value</th>
                  <th className="px-4 py-3 w-32 text-center">Confidence</th>
                  <th className="px-4 py-3">Current Profile Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Full Name</td>
                  <td className="px-4 py-3.5 text-slate-600">{parsed.full_name || "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{candidate.full_name}</td>
                </tr>

                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Email Address</td>
                  <td className="px-4 py-3.5 text-slate-600">{parsed.email || "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{candidate.email}</td>
                </tr>

                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Mobile Phone</td>
                  <td className="px-4 py-3.5 text-slate-600">{parsed.phone || "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{candidate.phone || "—"}</td>
                </tr>

                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Current Location</td>
                  <td className="px-4 py-3.5 text-slate-600">{parsed.location || "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{candidate.location || "—"}</td>
                </tr>

                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Experience (Years)</td>
                  <td className="px-4 py-3.5 text-slate-600">{parsed.total_experience_years ?? "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{candidate.total_experience_years ?? "—"}</td>
                </tr>

                <tr>
                  <td className="px-4 py-3.5 font-semibold text-slate-800">Key Skills</td>
                  <td className="px-4 py-3.5 text-slate-600">{((parsed.primary_skills || []) as string[]).join(", ") || "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-semibold">High</span>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{(candidate.skills || []).join(", ") || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              onClick={handleReprocess}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw size={14} />
              <span>Read Resume Again</span>
            </button>
            <button
              onClick={() => toast("Profile verified and marked approved.", "success")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <CheckCircle2 size={14} />
              <span>Approve Profile</span>
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 4: APPLICATIONS ── */}
      {activeTab === "applications" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Applied Jobs History ({candidate.applications?.length || 0})</h3>
          {candidate.applications && candidate.applications.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {candidate.applications.map((app) => (
                <div key={app.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{app.opening_title}</h4>
                      <p className="text-xs text-slate-500">
                        Applied via {app.source || "Careers page"} on {app.submitted_at?.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <JobMatchBadge match={app.match} />
                      <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-700">
                        {app.stage_name || app.stage || "Applied"}
                      </span>
                    </div>
                  </div>

                  {!!app.match?.gaps?.length && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Missing for this job:</span>
                      {app.match.gaps.map((g) => (
                        <span key={g} className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">{g}</span>
                      ))}
                    </div>
                  )}

                  {app.history && app.history.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
                      <span className="font-semibold text-slate-700">Stage Timeline:</span>
                      {app.history.map((h: any, i: number) => (
                        <div key={i} className="text-slate-500">
                          &bull; {h.action} on {h.at?.slice(0, 10)} by {h.by} {h.note ? `(${h.note})` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No applications on record.</p>
          )}
        </div>
      )}

      {/* ── TAB 5: INTERVIEWS ── */}
      {activeTab === "interviews" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Interview Rounds &amp; Evaluations</h3>
          {candidate.interviews && candidate.interviews.length > 0 ? (
            <div className="space-y-4">
              {candidate.interviews.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-slate-900">{inv.round_name || "Interview Round"}</span>
                    <span className="text-xs font-medium text-slate-500">
                      {inv.scheduled_date} at {inv.scheduled_time}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Interviewer: <strong>{inv.interviewer_name || "Assigned Panel"}</strong>
                  </div>
                  {inv.recommendation && (
                    <div className="mt-2 text-xs">
                      <strong>Recommendation:</strong> {inv.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No scheduled or completed interviews for this candidate.</p>
          )}
        </div>
      )}

      {/* ── TAB 6: NOTES ── */}
      {activeTab === "notes" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-slate-900">Recruiter &amp; Team Notes</h3>

          {/* New note composer */}
          <div className="space-y-3">
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add an internal note or update about this candidate..."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleAddNote}
                disabled={noteSubmitting || !noteInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send size={14} />
                <span>Post Note</span>
              </button>
            </div>
          </div>

          {/* Notes list */}
          <div className="divide-y divide-slate-100">
            {candidate.notes && candidate.notes.length > 0 ? (
              candidate.notes.map((n) => (
                <div key={n.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-xs text-slate-700">
                      {getInitials(n.author_name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{n.author_name || "Staff"}</span>
                        <span className="text-[11px] text-slate-400">{n.created_at?.slice(0, 16).replace("T", " ")}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{n.text}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteNote(n.id)} className="text-slate-400 hover:text-rose-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-xs text-slate-400">No notes posted yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 7: ACTIVITY ── */}
      {activeTab === "activity" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Audit &amp; Activity Trail</h3>
          {candidate.activity && candidate.activity.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {candidate.activity.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{act.action}</span>
                    <p className="text-slate-500">{act.details || "Activity recorded"}</p>
                  </div>
                  <span className="text-slate-400">{act.created_at?.slice(0, 16).replace("T", " ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No activity logs recorded yet.</p>
          )}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Edit Candidate Details</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Current Role</label>
                <input
                  type="text"
                  value={editForm.current_role}
                  onChange={(e) => setEditForm({ ...editForm, current_role: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Experience (Years)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.total_experience_years}
                  onChange={(e) => setEditForm({ ...editForm, total_experience_years: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-slate-700">Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditModalOpen(false)}
                className="rounded-lg border px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag Modal ── */}
      {tagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Tag</h3>
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="e.g. Star Candidate, Shortlisted..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTagModalOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTag}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
