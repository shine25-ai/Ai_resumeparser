import React, { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Search, CheckCircle2, AlertCircle, RefreshCw,
  Layers, Lock, Check, X, Tag
} from 'lucide-react';
import {
  getInterviewTypes,
  createInterviewType,
  updateInterviewType,
  deleteInterviewType,
  type InterviewTypeItem,
  type InterviewTypeCreatePayload
} from '../utils/Api';

const COLOR_OPTIONS = [
  { label: 'Indigo', value: '#4F46E5' },
  { label: 'Emerald', value: '#10B981' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Purple', value: '#8B5CF6' },
  { label: 'Sky', value: '#0EA5E9' },
  { label: 'Rose', value: '#F43F5E' },
  { label: 'Teal', value: '#14B8A6' },
  { label: 'Slate', value: '#64748B' },
];

export default function InterviewTypeManagement() {
  const [types, setTypes] = useState<InterviewTypeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingType, setEditingType] = useState<InterviewTypeItem | null>(null);
  const [formData, setFormData] = useState<InterviewTypeCreatePayload>({
    name: '',
    code: '',
    description: '',
    color: '#4F46E5',
    is_active: true,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Delete Confirmation Modal
  const [deletingType, setDeletingType] = useState<InterviewTypeItem | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    setLoading(true);
    try {
      const data = await getInterviewTypes(true);
      setTypes(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch interview types.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingType(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      color: '#4F46E5',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: InterviewTypeItem) => {
    setEditingType(item);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description || '',
      color: item.color || '#4F46E5',
      is_active: item.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Interview Type name is required.' });
      return;
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      if (editingType) {
        await updateInterviewType(editingType.id, {
          name: formData.name.trim(),
          code: formData.code?.trim().toUpperCase(),
          description: formData.description?.trim(),
          color: formData.color,
          is_active: formData.is_active,
        });
        setMessage({ type: 'success', text: `Interview type "${formData.name}" updated successfully.` });
      } else {
        await createInterviewType({
          name: formData.name.trim(),
          code: formData.code?.trim().toUpperCase(),
          description: formData.description?.trim(),
          color: formData.color,
          is_active: formData.is_active,
        });
        setMessage({ type: 'success', text: `Interview type "${formData.name}" created successfully.` });
      }
      setIsModalOpen(false);
      await loadTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save interview type.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: InterviewTypeItem) => {
    try {
      await updateInterviewType(item.id, { is_active: !item.is_active });
      setTypes(prev => prev.map(t => t.id === item.id ? { ...t, is_active: !t.is_active } : t));
      setMessage({
        type: 'success',
        text: `Interview type "${item.name}" set to ${!item.is_active ? 'Active' : 'Inactive'}.`
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update status.' });
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    setDeleting(true);
    try {
      await deleteInterviewType(deletingType.id);
      setMessage({ type: 'success', text: `Interview type "${deletingType.name}" deleted successfully.` });
      setDeletingType(null);
      await loadTypes();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete interview type.' });
    } finally {
      setDeleting(false);
    }
  };

  const filteredTypes = types.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Interview Types</h2>
            <p className="text-sm text-slate-500 font-medium">
              Manage dynamic interview types for scheduling and evaluation workflows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={loadTypes}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-all cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Interview Type
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {message.text && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search interview types by name or code..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500">
          Total: <span className="text-slate-900">{filteredTypes.length}</span> type(s)
        </div>
      </div>

      {/* Cards List Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : filteredTypes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No interview types found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {search ? `No interview types match your search "${search}".` : 'Get started by creating your first custom interview type.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTypes.map((item) => (
            <div
              key={item.id}
              className={`bg-white border rounded-2xl p-5 transition-all shadow-sm hover:shadow-md flex flex-col justify-between ${
                item.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: item.color || '#4F46E5' }}
                    />
                    <h3 className="font-bold text-slate-900 text-base leading-snug">{item.name}</h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.is_system && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md flex items-center gap-1 border border-slate-200">
                        <Lock className="w-2.5 h-2.5" /> System
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-mono font-bold rounded-lg border border-slate-200 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-slate-400" />
                    {item.code}
                  </span>

                  <span
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                      item.is_active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px]">
                  {item.description || <span className="italic text-slate-400">No description provided</span>}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => handleToggleActive(item)}
                  className={`font-semibold cursor-pointer transition-colors ${
                    item.is_active ? 'text-slate-500 hover:text-slate-700' : 'text-emerald-600 hover:text-emerald-700'
                  }`}
                >
                  {item.is_active ? 'Deactivate' : 'Activate'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEditModal(item)}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {!item.is_system && (
                    <button
                      onClick={() => setDeletingType(item)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingType ? 'Edit Interview Type' : 'Add New Interview Type'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Interview Type Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. System Design Round"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Code Identifier <span className="text-slate-400 font-normal">(Optional, e.g. SYSTEM_DESIGN)</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Auto-generated if left blank"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of what this interview round entails..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                        formData.color === c.value ? 'scale-110 ring-2 ring-indigo-600 ring-offset-2' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    >
                      {formData.color === c.value && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="is_active" className="text-sm font-semibold text-slate-700 cursor-pointer">
                  Active (available for scheduling and selection)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  {editingType ? 'Save Changes' : 'Create Interview Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingType && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-2 bg-rose-50 border border-rose-100 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Delete Interview Type</h3>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              Are you sure you want to delete <span className="font-bold text-slate-900">"{deletingType.name}"</span>? This action can be reversed by administrators.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingType(null)}
                className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
