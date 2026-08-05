import React, { useState, useEffect } from 'react';
import { Mail, Plus, Edit2, Trash2, Send, X, CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { MAIL_TEMPLATES_URL } from '../utils/Api';

export default function MailTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [formData, setFormData] = useState({ name: '', subject: '', body: '' });
  
  const [testData, setTestData] = useState({ to: '', cc: '', bcc: '' });
  const [testAttachments, setTestAttachments] = useState<File[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch(MAIL_TEMPLATES_URL);
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      const url = selectedTemplate?.id ? `${MAIL_TEMPLATES_URL}/${selectedTemplate.id}` : MAIL_TEMPLATES_URL;
      const method = selectedTemplate?.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) throw new Error('Failed to save template');
      
      setMessage({ type: 'success', text: 'Template saved successfully.' });
      setIsEditing(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save template' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`${MAIL_TEMPLATES_URL}/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to delete', error);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setMessage({ type: '', text: '' });
    
    const formDataObj = new FormData();
    formDataObj.append('to', testData.to);
    if (testData.cc) formDataObj.append('cc', testData.cc);
    if (testData.bcc) formDataObj.append('bcc', testData.bcc);
    
    testAttachments.forEach(file => {
      formDataObj.append('attachments', file);
    });

    try {
      const response = await fetch(`${MAIL_TEMPLATES_URL}/${selectedTemplate.id}/send-test`, {
        method: 'POST',
        body: formDataObj
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to send test email');
      }
      
      setMessage({ type: 'success', text: 'Test email sent successfully!' });
      setIsTesting(false);
      setTestData({ to: '', cc: '', bcc: '' });
      setTestAttachments([]);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setTestLoading(false);
    }
  };

  const openEdit = (template?: any) => {
    if (template) {
      setSelectedTemplate(template);
      setFormData({ name: template.name, subject: template.subject, body: template.body });
    } else {
      setSelectedTemplate(null);
      setFormData({ name: '', subject: '', body: '' });
    }
    setIsEditing(true);
    setMessage({ type: '', text: '' });
  };

  const openTest = (template: any) => {
    setSelectedTemplate(template);
    setIsTesting(true);
    setMessage({ type: '', text: '' });
  };

  if (loading) {
    return <div className="flex justify-center items-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;
  }

  return (
    <div className="space-y-6">
      {message.text && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {isEditing ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
            <h2 className="text-xl font-semibold text-slate-900">{selectedTemplate ? 'Edit Template' : 'Create Template'}</h2>
            <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"><X className="w-6 h-6" /></button>
          </div>
          <form onSubmit={handleSaveTemplate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Template Name</label>
                <input
                  type="text" required value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  placeholder="e.g. Interview Invitation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Subject</label>
                <input
                  type="text" required value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  placeholder="e.g. Invitation for Interview - {{company_name}}"
                />
              </div>
            </div>
            
            <div className="quill-dark">
              <label className="block text-sm font-medium text-slate-700 mb-2">Message Body</label>
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <ReactQuill theme="snow" value={formData.body} onChange={(content) => setFormData({...formData, body: content})} />
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700 mb-1.5">Available Variables (Click to copy/insert into template):</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'candidate_name', 'candidate_email', 'interviewer_name', 'interviewer_email',
                    'job_title', 'scheduled_date', 'scheduled_time', 'timezone', 'duration_minutes',
                    'meeting_link', 'location', 'interview_type', 'round_number', 'notes', 'company_name'
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, body: prev.body + ` {{${v}}}` }))}
                      className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded border border-slate-200 transition-colors font-mono cursor-pointer"
                      title={`Click to append {{${v}}} to message body`}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors cursor-pointer shadow-sm">
                Save Template
              </button>
            </div>
          </form>
        </div>
      ) : isTesting ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
            <h2 className="text-xl font-semibold text-slate-900">Test Template: {selectedTemplate.name}</h2>
            <button onClick={() => setIsTesting(false)} className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"><X className="w-6 h-6" /></button>
          </div>
          <form onSubmit={handleSendTest} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">To (comma separated)</label>
              <input type="text" required value={testData.to} onChange={e => setTestData({...testData, to: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="candidate@example.com" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CC (comma separated)</label>
                <input type="text" value={testData.cc} onChange={e => setTestData({...testData, cc: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" placeholder="hr@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">BCC (comma separated)</label>
                <input type="text" value={testData.bcc} onChange={e => setTestData({...testData, bcc: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
              </div>
            </div>
            <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">Attachments</label>
               <input type="file" multiple onChange={e => setTestAttachments(Array.from(e.target.files || []))} className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-indigo-600 hover:file:bg-slate-200 transition-colors cursor-pointer" />
            </div>
            
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button type="submit" disabled={testLoading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer shadow-sm">
                {testLoading ? 'Sending...' : <><Send className="w-4 h-4"/> Send Test</>}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg"><Mail className="w-6 h-6 text-indigo-600" /></div>
              <h2 className="text-xl font-semibold text-slate-900">Email Templates</h2>
            </div>
            <button onClick={() => openEdit()} className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2 rounded-lg font-medium transition-colors border border-indigo-200 cursor-pointer">
              <Plus className="w-4 h-4" /> New Template
            </button>
          </div>

          <div className="grid gap-4">
            {templates.map(template => (
              <div key={template.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-colors group">
                <div>
                  <h3 className="text-lg font-medium text-slate-900">{template.name}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-1">{template.subject}</p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {template.variables?.map((v: string) => (
                       <span key={v} className="text-xs px-2 py-1 bg-white text-slate-700 rounded-md border border-slate-200 shadow-xs">{`{{${v}}}`}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500 border-t border-slate-200/80 pt-2.5">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-semibold text-slate-800">Created:</span> {formatDate(template.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="font-semibold text-slate-800">Updated:</span> {formatDate(template.updated_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openTest(template)} className="p-2 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 rounded-lg transition-colors border border-cyan-200 cursor-pointer" title="Send Test Email"><Send className="w-4 h-4" /></button>
                  <button onClick={() => openEdit(template)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 cursor-pointer" title="Edit Template"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(template.id)} className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 cursor-pointer" title="Delete Template"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="text-center py-8 text-slate-500">No templates found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
