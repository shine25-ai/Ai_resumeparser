import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Copy, Gauge, Pencil, Plus, Power, Trash2, Users, X } from "lucide-react";
import { apiFetch, BASE_URL, getInterviews } from "../utils/Api";
import type { InterviewItem } from "../types/interview";
import { useFeedback } from "../components/ui/Feedback";
import { Badge, KpiGrid, KpiTile, PageHeader, SearchBox, TabGroup, btnPrimary, btnSecondary, tableHead, tableShell } from "../components/interview/interviewUi";
import {
  createPanel, deletePanel, listPanels, updatePanel,
  type Availability, type InterviewPanel, type PanelMember, type PanelPayload, type PanelStatus,
} from "../utils/phase8Api";

/** Screen 11, Interview Panel Management. Create, edit, duplicate, activate or deactivate, delete, and see who sits where. */

interface DirectoryUser { id: string; full_name: string; email: string; role?: string; is_active?: boolean }
interface JobOption { id: string; title: string }

type Tab = "all" | "mine" | "active" | "inactive";

const AVAILABILITY_LABELS: Record<Availability, string> = {
  INDIVIDUAL: "Use individual availability",
  COMMON: "Set common availability",
  ON_REQUEST: "Available on request",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const emptyPanel = (): PanelPayload => ({
  name: "", code: "", description: "", status: "ACTIVE", availability: "INDIVIDUAL",
  weekly_availability: [], members: [], expertise_tags: [], job_ids: [], rounds: [],
});

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

export default function InterviewPanels() {
  const { toast, confirm } = useFeedback();
  const [panels, setPanels] = useState<InterviewPanel[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [interviews, setInterviews] = useState<InterviewItem[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [showDirectory, setShowDirectory] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; draft: PanelPayload } | null>({ draft: emptyPanel() });
  const [expertiseInput, setExpertiseInput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, usersResp, jobsResp, me, interviewList] = await Promise.all([
        listPanels(),
        apiFetch(`${BASE_URL}/users`).then((r) => r.json()),
        apiFetch(`${BASE_URL}/job-openings`).then((r) => r.json()),
        apiFetch(`${BASE_URL}/users/me`).then((r) => r.json()),
        getInterviews({ limit: 500 }),
      ]);
      setPanels(list);
      setUsers((usersResp.data?.users || []) as DirectoryUser[]);
      setJobs(((jobsResp.data || []) as any[]).map((j) => ({ id: j.id, title: j.title })));
      setMyId((me.data || me).id);
      const data = interviewList?.data || interviewList;
      setInterviews((Array.isArray(data) ? data : data?.interviews || []) as InterviewItem[]);
    } catch (e: any) {
      toast(e?.message || "Could not load panels", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = useMemo(() => new Set(panels.flatMap((p) => p.members.map((m) => m.user_id))), [panels]);
  const activePanels = panels.filter((p) => p.status === "ACTIVE");
  const jobTitle = useMemo(() => new Map(jobs.map((j) => [j.id, j.title])), [jobs]);

  // Interviews whose interviewers sit on a panel.
  const assignedInterviews = useMemo(
    () => interviews.filter((i) => i.status !== "CANCELLED" && ((i.interviewers || []).some((x: any) => memberIds.has(x.interviewer_id)) || (i.interviewer_id && memberIds.has(i.interviewer_id)))).length,
    [interviews, memberIds],
  );
  // Share of active panels with at least one live interview booked for one of their members.
  const panelsInUse = activePanels.filter((p) =>
    interviews.some((i) => i.status !== "CANCELLED" && ((i.interviewers || []).some((x: any) => p.members.some((m) => m.user_id === x.interviewer_id)) || p.members.some((m) => m.user_id === i.interviewer_id))),
  ).length;
  const utilisation = activePanels.length ? Math.round((panelsInUse / activePanels.length) * 100) : 0;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return panels.filter((p) => {
      if (tab === "active" && p.status !== "ACTIVE") return false;
      if (tab === "inactive" && p.status !== "INACTIVE") return false;
      if (tab === "mine" && !(myId && p.members.some((m) => m.user_id === myId))) return false;
      if (!q) return true;
      return [p.name, p.code || "", ...p.expertise_tags, ...p.members.map((m) => m.name)].join(" ").toLowerCase().includes(q);
    });
  }, [panels, tab, search, myId]);

  const directory = useMemo(() => users.map((u) => {
    const mine = panels.filter((p) => p.members.some((m) => m.user_id === u.id));
    return { user: u, panels: mine, skills: Array.from(new Set(mine.flatMap((p) => p.expertise_tags))) };
  }), [users, panels]);

  const openNew = () => {
    setExpertiseInput("");
    setEditing({ draft: emptyPanel() });
  };

  const openEdit = (p: InterviewPanel) => {
    setExpertiseInput("");
    setEditing({
      id: p.id,
      draft: {
        name: p.name, code: p.code || "", description: p.description || "", status: p.status,
        availability: p.availability || "INDIVIDUAL",
        weekly_availability: p.weekly_availability || [],
        members: p.members, expertise_tags: p.expertise_tags, job_ids: p.job_ids, rounds: p.rounds,
      },
    });
  };

  const duplicate = async (p: InterviewPanel) => {
    try {
      await createPanel({
        name: `${p.name} (copy)`, code: "", description: p.description || "", status: "INACTIVE",
        availability: p.availability || "INDIVIDUAL",
        members: p.members, expertise_tags: p.expertise_tags, job_ids: [], rounds: [],
      });
      toast("Panel duplicated as inactive. Set a code and activate it when ready.", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Could not duplicate", "error");
    }
  };

  const toggleStatus = async (p: InterviewPanel) => {
    const next: PanelStatus = p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updatePanel(p.id, {
        name: p.name, code: p.code, description: p.description, status: next,
        availability: p.availability || "INDIVIDUAL",
        weekly_availability: p.weekly_availability || [],
        members: p.members, expertise_tags: p.expertise_tags, job_ids: p.job_ids, rounds: p.rounds,
      });
      toast(next === "ACTIVE" ? "Panel activated" : "Panel deactivated", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Could not change status", "error");
    }
  };

  const remove = async (p: InterviewPanel) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: "Past interviews keep their interviewers. This panel will no longer be offered when scheduling.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePanel(p.id);
      toast("Panel deleted", "success");
      await load();
    } catch (e: any) {
      toast(e?.message || "Could not delete", "error");
    }
  };

  const addExpertise = () => {
    const tags = expertiseInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (!editing || !tags.length) return;
    setEditing({ ...editing, draft: { ...editing.draft, expertise_tags: Array.from(new Set([...editing.draft.expertise_tags, ...tags])) } });
    setExpertiseInput("");
  };

  const addMember = (userId: string) => {
    if (!editing || !userId) return;
    const user = users.find((u) => u.id === userId);
    if (!user || editing.draft.members.some((m) => m.user_id === userId)) return;
    const member: PanelMember = {
      user_id: user.id, name: user.full_name, email: user.email,
      role: editing.draft.members.length === 0 ? "lead" : "member",
    };
    setEditing({ ...editing, draft: { ...editing.draft, members: [...editing.draft.members, member] } });
  };

  const setRole = (userId: string, role: "lead" | "member") => {
    if (!editing) return;
    const members = editing.draft.members.map((m) =>
      m.user_id === userId ? { ...m, role } : role === "lead" ? { ...m, role: "member" as const } : m,
    );
    setEditing({ ...editing, draft: { ...editing.draft, members } });
  };

  const removeMember = (userId: string) => {
    if (!editing) return;
    setEditing({ ...editing, draft: { ...editing.draft, members: editing.draft.members.filter((m) => m.user_id !== userId) } });
  };

  const toggleJob = (jobId: string) => {
    if (!editing) return;
    const ids = editing.draft.job_ids.includes(jobId)
      ? editing.draft.job_ids.filter((x) => x !== jobId)
      : [...editing.draft.job_ids, jobId];
    setEditing({ ...editing, draft: { ...editing.draft, job_ids: ids } });
  };

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim()) return toast("Panel name is required", "error");
    if (!d.code?.trim()) return toast("Panel code is required", "error");
    if (d.members.length === 0) return toast("Add at least one interviewer", "error");
    if (!d.members.some((m) => m.role === "lead")) return toast("Choose a panel lead", "error");
    setBusy(true);
    try {
      const payload = { ...d, name: d.name.trim(), code: d.code?.trim() };
      if (editing.id) await updatePanel(editing.id, payload);
      else await createPanel(payload);
      toast(editing.id ? "Panel updated" : "Panel created", "success");
      setEditing({ draft: emptyPanel() });
      await load();
    } catch (e: any) {
      toast(e?.message || "Could not save the panel", "error");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All Panels", count: panels.length },
    { key: "mine", label: "My Panels", count: myId ? panels.filter((p) => p.members.some((m) => m.user_id === myId)).length : 0 },
    { key: "active", label: "Active", count: activePanels.length },
    { key: "inactive", label: "Inactive", count: panels.length - activePanels.length },
  ];

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Interview Panel Management"
        subtitle="Create and manage interview panels, assign interviewers, define expertise and manage availability."
        actions={
          <>
            <button type="button" onClick={() => setShowDirectory((v) => !v)} className={btnSecondary}>Interviewer Directory</button>
            <Link to="/interviews/calendar" className={btnSecondary}>Availability &amp; Calendar</Link>
            <button type="button" onClick={openNew} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> Create Interview Panel</button>
          </>
        }
      />

      <KpiGrid cols="lg:grid-cols-5">
        {[
          { label: "Total Panels", value: panels.length, icon: <Users size={16} /> },
          { label: "Interviewers", value: memberIds.size, icon: <Users size={16} /> },
          { label: "Active Panels", value: activePanels.length, icon: <CheckCircle2 size={16} /> },
          { label: "Interviews Assigned", value: assignedInterviews, icon: <CalendarDays size={16} /> },
          { label: "Panel Utilisation", value: `${utilisation}%`, icon: <Gauge size={16} /> },
        ].map((k) => (
          <KpiTile key={k.label} label={k.label} value={k.value} icon={k.icon} />
        ))}
      </KpiGrid>

      <div className="flex flex-wrap items-center gap-2">
        <TabGroup
          tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
          value={tab}
          onChange={setTab}
        />
        <div className="ml-auto">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by panel name, skill or interviewer" />
        </div>
      </div>

      {showDirectory && (
        <div className={tableShell}>
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-800">Interviewer Directory</div>
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="py-3 px-4 text-left">Name</th>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Role</th>
                <th className="py-3 px-4 text-left">Panels</th>
                <th className="py-3 px-4 text-left">Expertise</th>
              </tr>
            </thead>
            <tbody>
              {directory.map((d) => (
                <tr key={d.user.id} className="border-t">
                  <td className="py-3 px-4 font-semibold text-slate-900">{d.user.full_name}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{d.user.email}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{d.user.role || "—"}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{d.panels.length ? d.panels.map((p) => p.name).join(", ") : "Not on a panel"}</td>
                  <td className="py-3 px-4 align-middle text-slate-700">{d.skills.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <div className={tableShell}>
          <table className="w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="py-3 px-4 text-left">Panel name</th>
                <th className="py-3 px-4 text-left">Expertise / skills</th>
                <th className="py-3 px-4 text-left">Interviewers</th>
                <th className="py-3 px-4 text-left">Used in jobs</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No panels match.</td></tr>}
              {shown.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-3 px-4 align-middle text-slate-700">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.code || "No code"}</div>
                  </td>
                  <td className="py-3 px-4 align-middle text-slate-700">
                    <div className="flex flex-wrap gap-1">
                      {p.expertise_tags.slice(0, 4).map((t) => (
                        <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 align-middle text-slate-700">
                    <div className="flex -space-x-2">
                      {p.members.slice(0, 3).map((m) => (
                        <span key={m.user_id} title={`${m.name} (${m.role === "lead" ? "Panel lead" : "Interviewer"})`} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-indigo-100 text-[10px] font-bold text-indigo-700">
                          {initials(m.name)}
                        </span>
                      ))}
                      {p.members.length > 3 && <span className="ml-3 text-xs text-slate-500">+{p.members.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    {p.job_ids.length === 0 ? "All Jobs" : p.job_ids.map((id) => jobTitle.get(id) || "Job").slice(0, 2).join(", ") + (p.job_ids.length > 2 ? ` +${p.job_ids.length - 2}` : "")}
                  </td>
                  <td className="py-3 px-4 align-middle text-slate-700">
                    <Badge tone={p.status === "ACTIVE" ? "emerald" : "slate"}>{p.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="py-3 px-4 align-middle text-slate-700">
                    <div className="flex justify-end gap-2">
                      <button type="button" title="Edit" onClick={() => openEdit(p)} className="rounded p-1 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      <button type="button" title="Duplicate" onClick={() => duplicate(p)} className="rounded p-1 hover:bg-slate-100"><Copy className="h-4 w-4" /></button>
                      <button type="button" title={p.status === "ACTIVE" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(p)} className="rounded p-1 hover:bg-slate-100"><Power className="h-4 w-4" /></button>
                      <button type="button" title="Delete" onClick={() => remove(p)} className="rounded p-1 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing && (
          <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">{editing.id ? "Edit Interview Panel" : "Create Interview Panel"}</h2>
              <button type="button" onClick={() => setEditing({ draft: emptyPanel() })} className="rounded p-1 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            <label className="block text-xs font-semibold text-slate-600">Panel name *
              <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={editing.draft.name}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Panel code *
              <input className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={editing.draft.code || ""}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, code: e.target.value } })} />
            </label>
            <label className="block text-xs font-semibold text-slate-600">Description
              <textarea rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={editing.draft.description || ""}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })} />
            </label>

            <div>
              <div className="text-xs font-semibold text-slate-600">Expertise / skills</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {editing.draft.expertise_tags.map((t) => (
                  <button key={t} type="button" onClick={() => setEditing({ ...editing, draft: { ...editing.draft, expertise_tags: editing.draft.expertise_tags.filter((x) => x !== t) } })}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800">{t} ×</button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Add skills, comma separated" value={expertiseInput}
                  onChange={(e) => setExpertiseInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExpertise(); } }} />
                <button type="button" onClick={addExpertise} className="rounded-md border px-2 py-1 text-sm">Add</button>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600">Panel members *</div>
              <ul className="mt-1 space-y-2">
                {editing.draft.members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{m.name}</span>
                    <select value={m.role} onChange={(e) => setRole(m.user_id, e.target.value as "lead" | "member")} className="rounded-md border px-1 py-0.5 text-xs">
                      <option value="lead">Panel Lead</option>
                      <option value="member">Interviewer</option>
                    </select>
                    <button type="button" onClick={() => removeMember(m.user_id)} className="rounded p-1 hover:bg-slate-100" aria-label={`Remove ${m.name}`}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
              <select className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value="" onChange={(e) => addMember(e.target.value)}>
                <option value="">+ Add interviewer</option>
                {users.filter((u) => u.is_active !== false && !editing.draft.members.some((m) => m.user_id === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600">Used in jobs (none selected = all jobs)</div>
              <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {jobs.map((j) => (
                  <label key={j.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.draft.job_ids.includes(j.id)} onChange={() => toggleJob(j.id)} />
                    {j.title}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600">Panel availability</div>
              <div className="mt-1 space-y-1">
                {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="availability" checked={editing.draft.availability === key}
                      onChange={() => setEditing({ ...editing, draft: { ...editing.draft, availability: key } })} />
                    {AVAILABILITY_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>

            {editing.draft.availability === "COMMON" && (
              <div>
                <div className="text-xs font-semibold text-slate-600">Weekly availability (company timezone)</div>
                <ul className="mt-1 space-y-2">
                  {(editing.draft.weekly_availability || []).map((w, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <select value={w.weekday} onChange={(e) => {
                        const list = [...(editing.draft.weekly_availability || [])]; list[idx] = { ...w, weekday: Number(e.target.value) };
                        setEditing({ ...editing, draft: { ...editing.draft, weekly_availability: list } });
                      }} className="rounded-md border px-1 py-0.5 text-xs">
                        {WEEKDAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}
                      </select>
                      <input type="time" value={w.start} onChange={(e) => {
                        const list = [...(editing.draft.weekly_availability || [])]; list[idx] = { ...w, start: e.target.value };
                        setEditing({ ...editing, draft: { ...editing.draft, weekly_availability: list } });
                      }} className="rounded-md border px-1 py-0.5 text-xs" />
                      <span className="text-xs text-slate-500">to</span>
                      <input type="time" value={w.end} onChange={(e) => {
                        const list = [...(editing.draft.weekly_availability || [])]; list[idx] = { ...w, end: e.target.value };
                        setEditing({ ...editing, draft: { ...editing.draft, weekly_availability: list } });
                      }} className="rounded-md border px-1 py-0.5 text-xs" />
                      <button type="button" aria-label="Remove window" className="rounded p-1 hover:bg-slate-100" onClick={() => {
                        const list = (editing.draft.weekly_availability || []).filter((_, n) => n !== idx);
                        setEditing({ ...editing, draft: { ...editing.draft, weekly_availability: list } });
                      }}><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="mt-2 rounded-md border px-2 py-1 text-xs" onClick={() => {
                  const list = [...(editing.draft.weekly_availability || []), { weekday: 0, start: "09:00", end: "17:00" }];
                  setEditing({ ...editing, draft: { ...editing.draft, weekly_availability: list } });
                }}>+ Add window</button>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.draft.status === "ACTIVE"}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, status: e.target.checked ? "ACTIVE" : "INACTIVE" } })} />
              Panel is active
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
              <button type="button" onClick={save} disabled={busy} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Save Panel</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
