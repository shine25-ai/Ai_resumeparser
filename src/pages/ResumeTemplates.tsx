import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, Download, Search, FileText, CheckCircle, AlertCircle, Eye, X, Code, Info } from "lucide-react";
import { getResumes } from "../utils/Api";

// Local API wrapper
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

const getHeaders = (isFormData = false) => {
  const token = localStorage.getItem("access_token") || "";
  const headers: Record<string, string> = { "Authorization": `Bearer ${token}` };
  if (!isFormData) headers["Content-Type"] = "application/json";
  return headers;
};

const api = {
  get: async (url: string, options: any = {}) => {
    const res = await fetch(`${BASE_URL}${url}`, { method: "GET", headers: getHeaders() });
    if (options.responseType === "blob") {
      if (!res.ok) throw { response: { data: {} } };
      const blob = await res.blob();
      return { data: blob, headers: { "content-disposition": res.headers.get("content-disposition") } };
    }
    const data = await res.json();
    if (!res.ok) throw { response: { data } };
    return { data };
  },
  post: async (url: string, data?: any) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${BASE_URL}${url}`, {
      method: "POST", headers: getHeaders(isFormData),
      body: isFormData ? data : JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json } };
    return { data: json };
  },
  put: async (url: string, data?: any) => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method: "PUT", headers: getHeaders(),
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json } };
    return { data: json };
  },
  delete: async (url: string) => {
    const res = await fetch(`${BASE_URL}${url}`, { method: "DELETE", headers: getHeaders() });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json } };
    return { data: json };
  },
};

interface Template {
  id: string;
  name: string;
  description?: string;
  type: string;
  content?: string;
  file_path?: string;
  created_at: string;
  updated_at?: string;
}

interface Candidate {
  id: string;
  candidate_id?: string;
  parsed_data?: {
    name?: string;
    full_name?: string;
    email?: string;
    role?: string;
    designation?: string;
    phone?: string;
    location?: string;
    total_experience_years?: number;
    years_of_experience?: number;
    skills?: string[];
    education?: any[];
    experience?: any[];
  };
}

const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; margin: 40px; color: #1e293b; }
    h1 { font-size: 28px; font-weight: 700; color: #1e293b; margin: 0; }
    .subtitle { color: #64748b; font-size: 16px; margin-top: 4px; }
    .contact { display: flex; gap: 20px; margin: 16px 0; font-size: 13px; color: #475569; }
    .section { margin-top: 24px; }
    .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6366f1; border-bottom: 2px solid #e0e7ff; padding-bottom: 6px; margin-bottom: 12px; }
    .skill-tag { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 10px; font-size: 12px; margin: 3px; }
    .exp-item { margin-bottom: 14px; }
    .exp-title { font-weight: 600; font-size: 15px; }
    .exp-company { color: #64748b; font-size: 13px; }
  </style>
</head>
<body>
  <h1>{{ candidate.full_name or candidate.name or "Candidate Name" }}</h1>
  <div class="subtitle">{{ candidate.role or candidate.designation or "Software Professional" }}</div>

  <div class="contact">
    {% if candidate.email %}<span>{{ candidate.email }}</span>{% endif %}
    {% if candidate.phone %}<span>{{ candidate.phone }}</span>{% endif %}
    {% if candidate.location %}<span>{{ candidate.location }}</span>{% endif %}
  </div>

  {% if candidate.skills %}
  <div class="section">
    <div class="section-title">Skills</div>
    {% for skill in candidate.skills %}
    <span class="skill-tag">{{ skill }}</span>
    {% endfor %}
  </div>
  {% endif %}

  {% if candidate.experience %}
  <div class="section">
    <div class="section-title">Experience</div>
    {% for exp in candidate.experience %}
    <div class="exp-item">
      <div class="exp-title">{{ exp.designation or exp.title or "Role" }}</div>
      <div class="exp-company">{{ exp.company or exp.organization or "" }} - {{ exp.duration or "" }}</div>
    </div>
    {% endfor %}
  </div>
  {% endif %}

  {% if candidate.education %}
  <div class="section">
    <div class="section-title">Education</div>
    {% for edu in candidate.education %}
    <div class="exp-item">
      <div class="exp-title">{{ edu.degree or edu.qualification or "" }}</div>
      <div class="exp-company">{{ edu.institution or edu.college or "" }} - {{ edu.year or "" }}</div>
    </div>
    {% endfor %}
  </div>
  {% endif %}
</body>
</html>`;

export default function ResumeTemplates() {
  const [activeTab, setActiveTab] = useState<"manage" | "export">("manage");

  // Manage Tab State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", type: "html", content: DEFAULT_HTML_TEMPLATE });
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showVarGuide, setShowVarGuide] = useState(false);

  // Export Tab State
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchTemplates();
    fetchCandidates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/resume-templates");
      const data = res.data?.data || res.data;
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch templates", err);
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await getResumes({ limit: 100, page: 1 });
      if (res?.resumes) {
        setCandidates(res.resumes);
      } else {
        setCandidates([]);
      }
    } catch (err) {
      console.error("Failed to fetch candidates", err);
      setCandidates([]);
    }
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: "", description: "", type: "html", content: DEFAULT_HTML_TEMPLATE });
    setDocxFile(null);
    setShowPreview(false);
    setIsModalOpen(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      type: template.type,
      content: template.content || DEFAULT_HTML_TEMPLATE,
    });
    setDocxFile(null);
    setShowPreview(false);
    setIsModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        await api.put(`/resume-templates/${editingTemplate.id}`, {
          name: templateForm.name,
          description: templateForm.description,
          content: templateForm.content,
        });
        setMessage("Template updated successfully");
      } else {
        if (templateForm.type === "docx") {
          if (!docxFile) { setError("Please select a DOCX file"); return; }
          const formData = new FormData();
          formData.append("name", templateForm.name);
          formData.append("description", templateForm.description);
          formData.append("file", docxFile);
          await api.post("/resume-templates/upload", formData);
        } else {
          await api.post("/resume-templates", templateForm);
        }
        setMessage("Template created successfully");
      }
      setIsModalOpen(false);
      fetchTemplates();
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.message || "Failed to save template");
      setTimeout(() => setError(""), 4000);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return;
    try {
      await api.delete(`/resume-templates/${id}`);
      fetchTemplates();
      setMessage("Template deleted");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error("Failed to delete template", err);
    }
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (selectedCandidates.length === 0) { setError("Please select at least one candidate"); setTimeout(() => setError(""), 3000); return; }
    if (!selectedTemplate) { setError("Please select a template"); setTimeout(() => setError(""), 3000); return; }

    setExportLoading(true);
    try {
      let queryParams = selectedCandidates.map(id => `candidate_ids=${encodeURIComponent(id)}`).join("&");
      queryParams += `&format=${exportFormat}`;

      const res = await api.get(`/resume-templates/${selectedTemplate}/export?${queryParams}`, { responseType: "blob" });

      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const contentDisposition = (res.headers as any)["content-disposition"];
      let filename = selectedCandidates.length > 1 ? "exported_resumes.zip" : `resume.${exportFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) filename = match[1].replace(/['"]/g, "");
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setMessage(`Exported ${selectedCandidates.length} resume(s) successfully`);
      setTimeout(() => setMessage(""), 4000);
    } catch (err: any) {
      setError("Export failed. Make sure the template format matches the export format.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setExportLoading(false);
    }
  };

  const getCandidateName = (c: Candidate) =>
    c.parsed_data?.full_name || c.parsed_data?.name || "Unknown Candidate";
  const getCandidateRole = (c: Candidate) =>
    c.parsed_data?.role || c.parsed_data?.designation || c.parsed_data?.email || "No details";

  const filteredCandidates = candidates.filter(c => {
    const q = candidateSearch.toLowerCase();
    return getCandidateName(c).toLowerCase().includes(q) || getCandidateRole(c).toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resume Templates</h1>
          <p className="text-sm text-slate-500">Create templates and export candidate profiles as PDF or DOCX</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 border border-red-100">
          <AlertCircle size={18} />{error}
        </div>
      )}
      {message && (
        <div className="p-4 bg-green-50 text-green-600 rounded-xl flex items-center gap-2 border border-green-100">
          <CheckCircle size={18} />{message}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button onClick={() => setActiveTab("manage")}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === "manage" ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:text-slate-700"}`}>
            Template Management
          </button>
          <button onClick={() => setActiveTab("export")}
            className={`flex-1 py-4 text-sm font-semibold transition-colors ${activeTab === "export" ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50" : "text-slate-500 hover:text-slate-700"}`}>
            Export Resumes
          </button>
        </div>

        <div className="p-6">
          {activeTab === "manage" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-slate-800">Your Templates <span className="text-sm font-normal text-slate-500">({templates.length})</span></h2>
                <button onClick={openCreateModal}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm">
                  <Plus size={16} /> Create Template
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                      <th className="pb-3 pr-4">Name</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4">Created</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(t => (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                              <FileText size={18} />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                              <p className="text-xs text-slate-500">{t.description || "No description"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${t.type === "html" ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
                            {t.type === "html" ? "HTML/PDF" : "DOCX"}
                          </span>
                        </td>
                        <td className="py-4 pr-4 text-sm text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className="py-4">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openEditModal(t)}
                              className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Template">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDeleteTemplate(t.id)}
                              className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors" title="Delete Template">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {templates.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          <FileText size={36} className="mx-auto mb-3 opacity-30" />
                          <p className="font-medium">No templates yet</p>
                          <p className="text-sm mt-1">Click "Create Template" to build your first resume template</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "export" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-800">Export Candidate Resumes</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select Template</label>
                    <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white">
                      <option value="">-- Choose Template --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.type === "html" ? "PDF export" : "DOCX export"})</option>
                      ))}
                    </select>
                    {templates.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No templates yet. Create one in the Template Management tab first.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Export Format</label>
                    <div className="flex gap-3">
                      {(["pdf", "docx"] as const).map(fmt => (
                        <label key={fmt} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${exportFormat === fmt ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                          <input type="radio" checked={exportFormat === fmt} onChange={() => setExportFormat(fmt)} className="accent-indigo-600" />
                          <span className="text-sm font-medium uppercase">{fmt}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">HTML templates export as PDF. DOCX templates export as DOCX. Multiple candidates download as ZIP.</p>
                  </div>
                  <button onClick={handleExport} disabled={exportLoading || selectedCandidates.length === 0 || !selectedTemplate}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                    {exportLoading ? (
                      <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Exporting...</>
                    ) : (
                      <><Download size={18} /> Export {selectedCandidates.length > 0 ? `${selectedCandidates.length} Resume${selectedCandidates.length > 1 ? "s" : ""}` : "Resumes"}</>
                    )}
                  </button>
                </div>

                <div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col" style={{ height: 380 }}>
                    <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col gap-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-700">Select Candidates</span>
                        <div className="flex items-center gap-2">
                          {selectedCandidates.length > 0 && (
                            <button onClick={() => setSelectedCandidates([])} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>
                          )}
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{selectedCandidates.length} selected</span>
                        </div>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input type="text" placeholder="Search by name or role..." value={candidateSearch}
                          onChange={(e) => setCandidateSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {filteredCandidates.length > 0 ? filteredCandidates.map(c => (
                        <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0">
                          <input type="checkbox" checked={selectedCandidates.includes(c.id)}
                            onChange={() => toggleCandidateSelection(c.id)}
                            className="rounded accent-indigo-600 w-4 h-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm truncate">{getCandidateName(c)}</div>
                            <div className="text-xs text-slate-500 truncate">{getCandidateRole(c)}</div>
                          </div>
                        </label>
                      )) : (
                        <div className="p-6 text-center text-slate-400">
                          {candidates.length === 0 ? (
                            <>
                              <FileText size={28} className="mx-auto mb-2 opacity-30" />
                              <p className="text-sm font-medium">No candidates found</p>
                              <p className="text-xs mt-1">Upload resumes first to export them</p>
                            </>
                          ) : (
                            <p className="text-sm">No candidates match your search</p>
                          )}
                        </div>
                      )}
                    </div>
                    {candidates.length > 0 && (
                      <div className="p-2 border-t border-slate-100 bg-slate-50">
                        <button onClick={() => setSelectedCandidates(selectedCandidates.length === candidates.length ? [] : candidates.map(c => c.id))}
                          className="w-full text-xs text-indigo-600 font-semibold py-1 hover:bg-indigo-50 rounded-lg transition-colors">
                          {selectedCandidates.length === candidates.length ? "Deselect All" : `Select All (${candidates.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col"
            style={{ maxWidth: (templateForm.type === "html" || editingTemplate?.type === "html") ? 960 : 520, maxHeight: "92vh" }}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editingTemplate ? "Edit Template" : "Create New Template"}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editingTemplate ? `Editing: ${editingTemplate.name}` : "Build an HTML/PDF or DOCX resume template"}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Template Name *</label>
                  <input type="text" value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Standard Developer Resume" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <input type="text" value={templateForm.description} onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Optional description..." />
                </div>
                {!editingTemplate && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Template Type</label>
                    <div className="flex gap-3 h-[38px] items-center">
                      {(["html", "docx"] as const).map(t => (
                        <label key={t} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${templateForm.type === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
                          <input type="radio" checked={templateForm.type === t} onChange={() => setTemplateForm({ ...templateForm, type: t })} className="accent-indigo-600" />
                          {t === "html" ? "HTML to PDF" : "DOCX Upload"}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-5 gap-3">
                {(templateForm.type === "html" || editingTemplate?.type === "html") ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowPreview(false)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!showPreview ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          <Code size={13} /> HTML Editor
                        </button>
                        <button onClick={() => setShowPreview(true)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${showPreview ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          <Eye size={13} /> Live Preview
                        </button>
                      </div>
                      <button onClick={() => setShowVarGuide(!showVarGuide)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <Info size={13} /> Variable Guide
                      </button>
                    </div>

                    {showVarGuide && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-mono leading-relaxed">
                        <p className="font-bold text-amber-900 mb-1.5 font-sans">Available Jinja2 Variables (inside candidate object):</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>{"{{ candidate.name }}"}</span><span>{"{{ candidate.full_name }}"}</span>
                          <span>{"{{ candidate.email }}"}</span><span>{"{{ candidate.phone }}"}</span>
                          <span>{"{{ candidate.role }}"}</span><span>{"{{ candidate.designation }}"}</span>
                          <span>{"{{ candidate.location }}"}</span><span>{"{{ candidate.total_experience_years }}"}</span>
                          <span>{"{% for skill in candidate.skills %} {{ skill }} {% endfor %}"}</span>
                          <span>{"{% for exp in candidate.experience %} {{ exp.designation }} {% endfor %}"}</span>
                          <span>{"{% for edu in candidate.education %} {{ edu.degree }} {% endfor %}"}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex-1 overflow-hidden rounded-xl border border-slate-200" style={{ minHeight: 280 }}>
                      {!showPreview ? (
                        <textarea value={templateForm.content}
                          onChange={e => setTemplateForm({ ...templateForm, content: e.target.value })}
                          className="w-full h-full px-4 py-3 font-mono text-xs resize-none outline-none bg-slate-950 text-green-400"
                          style={{ minHeight: 280 }}
                          spellCheck={false}
                        />
                      ) : (
                        <iframe srcDoc={templateForm.content} className="w-full h-full bg-white"
                          style={{ minHeight: 280 }} title="Template Preview" sandbox="allow-same-origin" />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-700">Upload DOCX Template File</label>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <FileText size={32} className="mx-auto mb-3 text-slate-300" />
                      <input type="file" accept=".docx" id="docx-file-upload"
                        onChange={e => e.target.files && setDocxFile(e.target.files[0])} className="hidden" />
                      <label htmlFor="docx-file-upload" className="cursor-pointer">
                        {docxFile ? (
                          <p className="text-sm font-semibold text-indigo-600">{docxFile.name}</p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-slate-700">Click to select a .docx file</p>
                            <p className="text-xs text-slate-400 mt-1">Use {"{{candidate.name}}"} tags inside the Word document</p>
                          </>
                        )}
                      </label>
                    </div>
                    {editingTemplate?.type === "docx" && (
                      <p className="text-xs text-slate-500">To replace the file, upload a new one. Otherwise just update the name/description above.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors text-sm">
                Cancel
              </button>
              <button onClick={handleSaveTemplate}
                disabled={!templateForm.name || (templateForm.type === "docx" && !editingTemplate && !docxFile)}
                className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm shadow-sm">
                {editingTemplate ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
