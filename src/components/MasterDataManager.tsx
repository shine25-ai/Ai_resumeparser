import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, Globe, Loader2, Pencil, Plus, X } from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import {
  createMaster,
  fetchMasterTypes,
  fetchMasters,
  updateMaster,
  type MasterEntry,
  type MasterType,
} from "../utils/adminApi";

/**
 * Master data (SRS 4.20): skills, industries, job categories, locations, education and experience levels,
 * departments. Platform entries are shared by every company; companies add their own. The super admin can switch
 * to the platform list.
 */

const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const isSuperAdmin = () => {
  try {
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    return !!me?.is_superadmin || String(me?.role || "").toLowerCase() === "superadmin";
  } catch {
    return false;
  }
};

export default function MasterDataManager() {
  const { toast } = useFeedback();
  const superAdmin = isSuperAdmin();
  const [types, setTypes] = useState<MasterType[]>([]);
  const [type, setType] = useState("department");
  const [scope, setScope] = useState<"company" | "platform">("company");
  const [items, setItems] = useState<MasterEntry[]>([]);
  const [showOff, setShowOff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");

  const current = types.find((t) => t.id === type);
  const platformLocked = scope === "platform" && !!current?.company_only;

  useEffect(() => {
    fetchMasterTypes().then(setTypes).catch((e) => toast(e instanceof Error ? e.message : "Could not load master data.", "error"));
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchMasters(type, scope, true));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load entries.", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type, scope, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await createMaster(type, newName.trim(), scope);
      setNewName("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add.", "error");
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await updateMaster(editing.id, { name: editing.name.trim() }, scope);
      setEditing(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not rename.", "error");
    }
  };

  const toggle = async (item: MasterEntry) => {
    try {
      await updateMaster(item.id, { is_active: !item.is_active }, scope);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update.", "error");
    }
  };

  // A company can change only its own entries; the platform list is the super admin's (in platform view).
  const canEdit = (item: MasterEntry) => (scope === "platform" ? item.is_global : !item.is_global);
  const shown = items
    .filter((i) => showOff || i.is_active)
    .filter((i) => !filter || i.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="space-y-3">
        {superAdmin && (
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            {(["company", "platform"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 rounded-md px-2 py-1.5 ${scope === s ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}
              >
                {s === "company" ? "This company" : "Platform list"}
              </button>
            ))}
          </div>
        )}
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setEditing(null); }}
              className={`rounded-lg px-3 py-2 text-left text-sm ${type === t.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{current?.label || "Master data"}</h3>
            <p className="text-xs text-slate-500">
              {scope === "platform"
                ? "Shared by every company. Companies can add their own entries too."
                : current?.company_only
                  ? "Only your company uses these."
                  : "Entries marked with a globe come from the platform list; add your own alongside them."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className={`${input} w-36`} />
            <button onClick={() => setShowOff((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50">
              {showOff ? <EyeOff size={13} /> : <Eye size={13} />} {showOff ? "Hide turned off" : "Show turned off"}
            </button>
          </div>
        </div>

        {platformLocked ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Departments belong to each company. Switch to "This company" to manage them.</p>
        ) : (
          <form onSubmit={add} className="mb-3 flex gap-2">
            <input value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} placeholder={`Add to ${current?.label.toLowerCase() || "list"}`} className={`${input} flex-1`} />
            <button disabled={!newName.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              <Plus size={14} /> Add
            </button>
          </form>
        )}

        {loading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : shown.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                {editing?.id === item.id ? (
                  <form onSubmit={rename} className="flex flex-1 gap-2">
                    <input autoFocus value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`${input} flex-1 py-1`} />
                    <button className="rounded-lg bg-indigo-600 p-1.5 text-white" aria-label="Save"><Check size={14} /></button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 p-1.5 text-slate-600" aria-label="Cancel"><X size={14} /></button>
                  </form>
                ) : (
                  <>
                    <span className={`flex-1 text-sm ${item.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>{item.name}</span>
                    {item.is_global && scope === "company" && (
                      <span title="From the platform list" className="text-slate-400"><Globe size={13} /></span>
                    )}
                    {canEdit(item) && (
                      <>
                        <button onClick={() => setEditing({ id: item.id, name: item.name })} title="Rename" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={13} /></button>
                        <button onClick={() => toggle(item)} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
                          {item.is_active ? "Turn off" : "Turn on"}
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
