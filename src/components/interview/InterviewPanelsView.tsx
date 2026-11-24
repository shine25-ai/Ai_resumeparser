import React, { useState, useEffect } from "react";
import {
  Users, Plus, Search, Shield, X, Edit3, Trash2, Loader2, UserPlus
} from "lucide-react";
import type { InterviewPanel, PanelMember } from "../../utils/interviewPanelsApi";
import {
  fetchInterviewPanels, createInterviewPanel, updateInterviewPanel, deleteInterviewPanel
} from "../../utils/interviewPanelsApi";
import { useFeedback } from "../ui/Feedback";

export const InterviewPanelsView: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const [panels, setPanels] = useState<InterviewPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<InterviewPanel | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [expertiseTags, setExpertiseTags] = useState<string[]>([]);
  const [members, setMembers] = useState<PanelMember[]>([]);
  const [assignedRounds, setAssignedRounds] = useState<string[]>([]);
  const [roundInput, setRoundInput] = useState("");

  // New member inputs
  const [memName, setMemName] = useState("");
  const [memEmail, setMemEmail] = useState("");
  const [memRole, setMemRole] = useState<"lead" | "member">("member");

  const loadPanels = async () => {
    try {
      setLoading(true);
      const data = await fetchInterviewPanels({ q: search });
      setPanels(data);
    } catch (err: any) {
      toast(err.message || "Failed to load interview panels", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPanels();
  }, [search]);

  const openCreateModal = () => {
    setEditingPanel(null);
    setName("");
    setDescription("");
    setExpertiseTags([]);
    setMembers([]);
    setAssignedRounds(["Technical Round 1", "System Design"]);
    setModalOpen(true);
  };

  const openEditModal = (p: InterviewPanel) => {
    setEditingPanel(p);
    setName(p.name);
    setDescription(p.description || "");
    setExpertiseTags(p.expertise_tags || []);
    setMembers(p.members || []);
    setAssignedRounds(p.assigned_rounds || []);
    setModalOpen(true);
  };

  const handleAddMember = () => {
    if (!memName.trim() || !memEmail.trim()) {
      toast("Member name and email are required", "error");
      return;
    }
    const newMember: PanelMember = {
      user_id: `mem-${Date.now()}`,
      name: memName.trim(),
      email: memEmail.trim().toLowerCase(),
      role: memRole,
    };
    setMembers([...members, newMember]);
    setMemName("");
    setMemEmail("");
    setMemRole("member");
  };

  const handleRemoveMember = (idx: number) => {
    setMembers(members.filter((_, i) => i !== idx));
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!expertiseTags.includes(tagInput.trim())) {
        setExpertiseTags([...expertiseTags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const handleAddRound = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && roundInput.trim()) {
      e.preventDefault();
      if (!assignedRounds.includes(roundInput.trim())) {
        setAssignedRounds([...assignedRounds, roundInput.trim()]);
      }
      setRoundInput("");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast("Panel name is required", "error");
      return;
    }
    try {
      setSubmitting(true);
      const payload: Partial<InterviewPanel> = {
        name: name.trim(),
        description: description.trim(),
        expertise_tags: expertiseTags,
        members,
        assigned_rounds: assignedRounds,
        is_active: true,
      };

      if (editingPanel) {
        await updateInterviewPanel(editingPanel.id, payload);
        toast("Interview panel updated successfully", "success");
      } else {
        await createInterviewPanel(payload);
        toast("Interview panel created successfully", "success");
      }
      setModalOpen(false);
      loadPanels();
    } catch (err: any) {
      toast(err.message || "Failed to save panel", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (panel: InterviewPanel) => {
    const ok = await confirm({
      title: "Deactivate Interview Panel",
      message: `Are you sure you want to deactivate panel "${panel.name}"?`,
      confirmLabel: "Deactivate",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteInterviewPanel(panel.id);
      toast("Panel deactivated", "success");
      loadPanels();
    } catch (err: any) {
      toast(err.message || "Could not delete panel", "error");
    }
  };

  const allTags = Array.from(new Set(panels.flatMap(p => p.expertise_tags || [])));

  const filteredPanels = panels.filter(p => {
    if (selectedTag !== "all" && !(p.expertise_tags || []).includes(selectedTag)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="text-indigo-600 dark:text-indigo-400" size={22} />
            Interview Panels
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize interviewers into specialized panels with expertise tags, leads, and availability.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
        >
          <Plus size={16} />
          Create Panel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search panels by name, member, or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          <button
            onClick={() => setSelectedTag("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedTag === "all"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            All Skills
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTag(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedTag === t
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="animate-spin mb-3 text-indigo-600" size={32} />
          <p className="text-sm">Loading interview panels...</p>
        </div>
      ) : filteredPanels.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
          <Users className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={42} />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No interview panels found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create an interview panel to easily assign groups of interviewers to job rounds.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} /> Create First Panel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPanels.map((panel) => {
            const leads = (panel.members || []).filter(m => m.role === "lead");

            return (
              <div
                key={panel.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {panel.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(panel)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md"
                        title="Edit Panel"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(panel)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md"
                        title="Deactivate Panel"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {panel.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                      {panel.description}
                    </p>
                  )}

                  {panel.expertise_tags && panel.expertise_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {panel.expertise_tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {panel.assigned_rounds && panel.assigned_rounds.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        Assigned Rounds
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {panel.assigned_rounds.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center justify-between">
                      <span>Panel Members ({panel.members?.length || 0})</span>
                      {leads.length > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold lowercase">
                          {leads.length} lead{leads.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {panel.members?.map((m) => (
                        <div
                          key={m.user_id + m.email}
                          className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-[10px] shrink-0">
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</span>
                          </div>
                          {m.role === "lead" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-[10px] uppercase">
                              <Shield size={10} /> Lead
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">Member</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    Active
                  </span>
                  <span>Ready for Scheduling</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="text-indigo-600" size={20} />
                {editingPanel ? "Edit Interview Panel" : "Create Interview Panel"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Panel Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Backend Engineering Panel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Panel scope and primary evaluation areas..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Expertise Tags (Type & Press Enter)
                </label>
                <input
                  type="text"
                  placeholder="Add skill tag (e.g. Python, Microservices, React)..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                {expertiseTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {expertiseTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-medium"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setExpertiseTags(expertiseTags.filter(item => item !== t))}
                          className="hover:text-rose-500"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Assigned Interview Rounds (Type & Press Enter)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Technical Round 1, System Design, Hiring Manager..."
                  value={roundInput}
                  onChange={(e) => setRoundInput(e.target.value)}
                  onKeyDown={handleAddRound}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                {assignedRounds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {assignedRounds.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium"
                      >
                        {r}
                        <button
                          type="button"
                          onClick={() => setAssignedRounds(assignedRounds.filter(item => item !== r))}
                          className="hover:text-rose-500"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2">
                  Panel Interviewers & Role
                </label>

                <div className="grid grid-cols-12 gap-2 mb-3 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="col-span-5">
                    <input
                      type="text"
                      placeholder="Name"
                      value={memName}
                      onChange={(e) => setMemName(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="email"
                      placeholder="Email"
                      value={memEmail}
                      onChange={(e) => setMemEmail(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      value={memRole}
                      onChange={(e: any) => setMemRole(e.target.value)}
                      className="w-full px-1 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-medium"
                    >
                      <option value="member">Member</option>
                      <option value="lead">Lead</option>
                    </select>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleAddMember}
                      className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      title="Add Member"
                    >
                      <UserPlus size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {members.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs"
                    >
                      <div className="truncate">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 mr-2">{m.name}</span>
                        <span className="text-slate-400 text-[11px]">{m.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            m.role === "lead"
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {m.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(idx)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-xs text-slate-400 italic">No interviewers added yet.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingPanel ? "Update Panel" : "Create Panel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

