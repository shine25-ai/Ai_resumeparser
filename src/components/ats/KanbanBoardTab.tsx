import React, { useState, useMemo } from 'react';
import {
  Upload,
  CheckSquare,
  Mail,
  XCircle,
  Tag,
  MessageSquare,
  Link2,
  Check,
  X,
  Plus,
  Send,
  Search,
  Star,
} from 'lucide-react';
import {
  moveCandidateStage,
  runBulkCandidateAction,
  fetchCandidateCollaboration,
  saveCandidateTags,
  postCandidateNote,
  createCandidateTrackingLink,
  type KanbanCandidate,
  type TeamMember,
  type CandidateNote,
} from '../../utils/atsApi';

interface KanbanBoardTabProps {
  stages: string[];
  candidates: KanbanCandidate[];
  team: TeamMember[];
  onReload: () => void;
  onNavigate: (path: string) => void;
}

const STAGE_DOT: Record<string, string> = {
  Screening: 'bg-indigo-500',
  Interviewing: 'bg-sky-500',
  Offer: 'bg-emerald-500',
  Hired: 'bg-teal-600',
  Closed: 'bg-slate-400',
};

export const KanbanBoardTab = React.memo(function KanbanBoardTab({
  stages,
  candidates,
  team,
  onReload,
  onNavigate,
}: KanbanBoardTabProps) {
  const [search, setSearch] = useState('');
  const [localCards, setLocalCards] = useState<KanbanCandidate[]>(candidates);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  // Collaboration Drawer state (Tags, Notes, @Mentions, Tracking Link)
  const [activeCand, setActiveCand] = useState<KanbanCandidate | null>(null);
  const [collabTags, setCollabTags] = useState<string[]>([]);
  const [collabNotes, setCollabNotes] = useState<CandidateNote[]>([]);
  const [newTag, setNewTag] = useState('');
  const [noteText, setNoteText] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  React.useEffect(() => {
    setLocalCards(candidates);
  }, [candidates]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localCards;
    return localCards.filter((c) =>
      `${c.name} ${c.role} ${c.email} ${c.skills.join(' ')} ${c.tags.join(' ')}`
        .toLowerCase()
        .includes(q)
    );
  }, [localCards, search]);

  const handleDropOnStage = async (targetStage: string) => {
    setDropStage(null);
    if (!dragId) return;
    const card = localCards.find((c) => c.id === dragId);
    setDragId(null);
    if (!card || card.stage === targetStage) return;

    // Optimistic update
    setLocalCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, stage: targetStage } : c))
    );
    try {
      await moveCandidateStage(card.id, targetStage);
      setStatusMsg(`Moved ${card.name} → ${targetStage}`);
    } catch (err: any) {
      setStatusMsg(err?.message || 'Stage update failed');
      onReload();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulk = async (action: 'shortlist' | 'reject') => {
    if (selectedIds.size === 0) return;
    setBusyBulk(true);
    try {
      const ids = Array.from(selectedIds);
      await runBulkCandidateAction(ids, action);
      setStatusMsg(
        action === 'shortlist'
          ? `Shortlisted ${ids.length} candidates to Interviewing.`
          : `Rejected ${ids.length} candidates to Closed.`
      );
      setSelectedIds(new Set());
      onReload();
    } catch (err: any) {
      setStatusMsg(err?.message || 'Bulk action failed');
    } finally {
      setBusyBulk(false);
    }
  };

  const handleBulkEmail = () => {
    const emails = localCards
      .filter((c) => selectedIds.has(c.id) && c.email)
      .map((c) => c.email);
    if (emails.length === 0) {
      setStatusMsg('Selected candidates do not have email addresses on file.');
      return;
    }
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(
      'Update regarding your application'
    )}`;
  };

  const openCollaboration = async (cand: KanbanCandidate) => {
    setActiveCand(cand);
    setCollabTags(cand.tags || []);
    setCollabNotes([]);
    try {
      const data = await fetchCandidateCollaboration(cand.id);
      setCollabTags(data.tags || []);
      setCollabNotes(data.notes || []);
    } catch {
      // keep existing tags
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCand || !newTag.trim()) return;
    const next = Array.from(new Set([...collabTags, newTag.trim()]));
    setCollabTags(next);
    setNewTag('');
    await saveCandidateTags(activeCand.id, next);
    setLocalCards((prev) => prev.map((c) => (c.id === activeCand.id ? { ...c, tags: next } : c)));
  };

  const handleRemoveTag = async (tag: string) => {
    if (!activeCand) return;
    const next = collabTags.filter((t) => t !== tag);
    setCollabTags(next);
    await saveCandidateTags(activeCand.id, next);
    setLocalCards((prev) => prev.map((c) => (c.id === activeCand.id ? { ...c, tags: next } : c)));
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCand || !noteText.trim()) return;
    const mentions = Array.from(noteText.matchAll(/@([A-Za-z0-9._-]+)/g)).map((m) => m[1]);
    const saved = await postCandidateNote(activeCand.id, noteText.trim(), mentions);
    setCollabNotes((prev) => [saved, ...prev]);
    setNoteText('');
    setLocalCards((prev) =>
      prev.map((c) => (c.id === activeCand.id ? { ...c, notes_count: (c.notes_count || 0) + 1 } : c))
    );
  };

  const handleCopyTrackingLink = async (cand: KanbanCandidate) => {
    try {
      const res = await createCandidateTrackingLink(cand.id);
      const fullUrl = `${window.location.origin}${res.path}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLinkId(cand.id);
      setStatusMsg(`Copied self-service tracking link for ${cand.name}: ${fullUrl}`);
      setTimeout(() => setCopiedLinkId(null), 2500);
    } catch (err: any) {
      setStatusMsg(err?.message || 'Failed to generate tracking link');
    }
  };

  // Detect @mention autocomplete trigger
  const mentionMatch = noteText.match(/@([A-Za-z0-9._-]*)$/);
  const mentionSuggestions = mentionMatch
    ? team.filter((t) => t.name.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 4)
    : [];

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Search + Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter board by name, skill, tag..."
            className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200/90 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200/80 rounded-lg px-2.5 py-1">
              <span className="text-xs font-semibold text-indigo-700 tabular-nums pr-1">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                disabled={busyBulk}
                onClick={() => handleBulk('shortlist')}
                className="h-7 px-2 rounded-md bg-white border border-indigo-200 text-xs font-medium text-indigo-700 hover:bg-indigo-100/70 inline-flex items-center gap-1"
              >
                <CheckSquare size={12} />
                <span>Shortlist</span>
              </button>
              <button
                type="button"
                disabled={busyBulk}
                onClick={() => handleBulk('reject')}
                className="h-7 px-2 rounded-md bg-white border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1"
              >
                <XCircle size={12} />
                <span>Reject</span>
              </button>
              <button
                type="button"
                onClick={handleBulkEmail}
                className="h-7 px-2 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
              >
                <Mail size={12} />
                <span>Email</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Clear selection"
              >
                <X size={13} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigate('/upload')}
            className="h-9 px-3 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5"
          >
            <Upload size={13} />
            <span>Bulk Upload</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="px-3.5 py-2 rounded-lg bg-slate-100 border border-slate-200/80 text-xs text-slate-700 flex items-center justify-between">
          <span className="truncate">{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">
            <X size={13} />
          </button>
        </div>
      )}

      {/* 5-Column Drag & Drop Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3.5 items-start">
        {stages.map((stage) => {
          const colCards = filteredCards.filter((c) => c.stage === stage);
          const isDropTarget = dropStage === stage;

          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDropStage(stage);
              }}
              onDragLeave={() => setDropStage((prev) => (prev === stage ? null : prev))}
              onDrop={() => handleDropOnStage(stage)}
              className={`rounded-xl border p-3 min-h-[420px] transition-colors ${
                isDropTarget
                  ? 'bg-indigo-50/50 border-indigo-300 border-dashed'
                  : 'bg-slate-100/70 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/70">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STAGE_DOT[stage] || 'bg-slate-400'}`} />
                  <h3 className="text-xs font-semibold text-slate-800">{stage}</h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200/70 tabular-nums">
                  {colCards.length}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-0.5">
                {colCards.slice(0, 35).map((card) => {
                  const checked = selectedIds.has(card.id);
                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropStage(null);
                      }}
                      className={`bg-white p-3 rounded-lg border shadow-[0_1px_2px_rgba(15,23,42,0.03)] cursor-grab active:cursor-grabbing transition-all ${
                        checked ? 'border-indigo-400 ring-1 ring-indigo-500/20' : 'border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(card.id)}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onNavigate(`/candidates/${encodeURIComponent(card.id)}`)}
                              className="text-xs font-semibold text-slate-900 hover:text-indigo-600 text-left block truncate"
                            >
                              {card.name}
                            </button>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {card.role}
                            </span>
                          </div>
                        </label>

                        {card.avg_scorecard !== null && card.avg_scorecard !== undefined && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded tabular-nums shrink-0">
                            <Star size={9} className="fill-amber-400 text-amber-500" />
                            {card.avg_scorecard}
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {card.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Bottom Row Actions */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="tabular-nums">
                          {card.experience_years ? `${card.experience_years}y` : '—'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCollaboration(card)}
                            title="Tags, notes & @mentions"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                          >
                            <MessageSquare size={11} />
                            <span className="tabular-nums">{card.notes_count}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyTrackingLink(card)}
                            title="Copy candidate self-service status link"
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600"
                          >
                            {copiedLinkId === card.id ? (
                              <Check size={11} className="text-emerald-600" />
                            ) : (
                              <Link2 size={11} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {colCards.length === 0 && (
                  <div className="py-10 text-center text-[11px] text-slate-400">
                    Drag a candidate here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Candidate Collaboration Slide-Over Drawer (Tags, Notes, @Mentions, Tracking Link) */}
      {activeCand && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
        >
          <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">{activeCand.name}</h3>
                <p className="text-xs text-slate-500 truncate">{activeCand.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCand(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Self-Service Tracking Link */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Candidate Status Tracker
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Share read-only live stage link with candidate
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyTrackingLink(activeCand)}
                  className="h-8 px-2.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 text-xs font-medium text-indigo-600 inline-flex items-center gap-1 shrink-0"
                >
                  <Link2 size={12} />
                  <span>{copiedLinkId === activeCand.id ? 'Copied!' : 'Copy link'}</span>
                </button>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Tag size={13} className="text-indigo-500" />
                  <span>Candidate Tags</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {collabTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="hover:text-rose-600"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {collabTags.length === 0 && (
                    <span className="text-xs text-slate-400">No tags yet.</span>
                  )}
                </div>
                <form onSubmit={handleAddTag} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag (e.g. Immediate Joiner, Top 5%)"
                    className="flex-1 h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </form>
              </div>

              {/* Notes & @Mentions */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-indigo-500" />
                  <span>Team Notes &amp; @Mentions</span>
                </div>

                <form onSubmit={handleAddNote} className="relative space-y-2">
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Write a note... Type @name to mention a teammate"
                    className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
                  />

                  {mentionSuggestions.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-md py-1">
                      {mentionSuggestions.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            setNoteText((prev) =>
                              prev.replace(/@([A-Za-z0-9._-]*)$/, `@${m.name.replace(/\s+/g, '')} `)
                            )
                          }
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-indigo-50 flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-800">{m.name}</span>
                          <span className="text-[11px] text-slate-400">{m.email}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Send size={12} />
                      <span>Post Note</span>
                    </button>
                  </div>
                </form>

                <div className="divide-y divide-slate-100 pt-1">
                  {collabNotes.map((n) => (
                    <div key={n.id} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800">{n.author}</span>
                        <span className="text-slate-400">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{n.text}</p>
                    </div>
                  ))}
                  {collabNotes.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">
                      No notes recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

