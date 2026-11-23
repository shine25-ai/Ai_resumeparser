import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import { downloadAuditCsv, fetchAuditLogs, type AuditEntry, type AuditFilters } from "../utils/adminApi";

/** Central audit log (SRS 4.22): who changed what, with before/after values. */

const input = "h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none";

const ENTITY_TYPES = ["company", "user", "role", "invitation", "master"];
const PAGE_SIZE = 50;

const isSuperAdmin = () => {
  try {
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    return !!me?.is_superadmin || String(me?.role || "").toLowerCase() === "superadmin";
  } catch {
    return false;
  }
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const actionLabel = (a: string) => a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function AdminAuditLog() {
  const { toast } = useFeedback();
  const superAdmin = isSuperAdmin();
  const [filters, setFilters] = useState<AuditFilters>({ scope: "company" });
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs(filters, page, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the audit log.", "error");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (patch: Partial<AuditFilters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const exportCsv = async () => {
    try {
      await downloadAuditCsv(filters);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not export.", "error");
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {superAdmin && (
          <select value={filters.scope} onChange={(e) => set({ scope: e.target.value as "company" | "platform" })} className={input} aria-label="Log">
            <option value="company">This company's log</option>
            <option value="platform">Platform log</option>
          </select>
        )}
        <input value={filters.search || ""} onChange={(e) => set({ search: e.target.value })} placeholder="Search record or details" className={`${input} min-w-[200px] flex-1`} />
        <input value={filters.actor || ""} onChange={(e) => set({ actor: e.target.value })} placeholder="By (name or email)" className={input} />
        <select value={filters.entity_type || ""} onChange={(e) => set({ entity_type: e.target.value })} className={input} aria-label="Record type">
          <option value="">All records</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{actionLabel(t)}</option>)}
        </select>
        <input type="date" value={filters.start || ""} onChange={(e) => set({ start: e.target.value })} className={input} aria-label="From" />
        <input type="date" value={filters.end || ""} onChange={(e) => set({ end: e.target.value })} className={input} aria-label="To" />
        <button onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={exportCsv} disabled={!total} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Record</th>
                <th className="px-3 py-2.5">By</th>
                <th className="px-3 py-2.5">Changes</th>
                <th className="px-3 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="p-4 text-slate-500"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-slate-500">No entries match.</td></tr>
              ) : (
                items.map((i) => {
                  const changed = Object.keys(i.changes || {});
                  const expandable = changed.length > 0 || !!i.details;
                  return (
                    <Fragment key={i.id}>
                      <tr className={expandable ? "cursor-pointer hover:bg-slate-50" : ""} onClick={() => expandable && setOpen(open === i.id ? null : i.id)}>
                        <td className="px-3 py-2 text-slate-400">{expandable && (open === i.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(i.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{actionLabel(i.action)}</td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{i.entity_type.replace("master:", "")}</span>
                          {i.entity_label || i.entity_id || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{i.actor?.name || i.actor?.email || "System"}<div className="text-[10px] text-slate-400">{i.actor?.role}</div></td>
                        <td className="px-3 py-2 text-slate-600">{changed.length ? changed.join(", ") : i.details ? "details" : "—"}</td>
                        <td className="px-3 py-2 text-slate-400">{i.ip || "—"}</td>
                      </tr>
                      {open === i.id && (
                        <tr className="bg-slate-50/60">
                          <td />
                          <td colSpan={6} className="px-3 py-2">
                            {i.details && <p className="mb-1 text-slate-600">{i.details}</p>}
                            {changed.length > 0 && (
                              <table className="text-[11px]">
                                <tbody>
                                  {changed.map((k) => (
                                    <tr key={k}>
                                      <td className="pr-3 font-semibold text-slate-600">{k}</td>
                                      <td className="pr-2 text-rose-600 line-through">{show(i.changes[k].from)}</td>
                                      <td className="text-emerald-700">{show(i.changes[k].to)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <span>{total.toLocaleString()} entries</span>
          <span className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Previous</button>
            Page {page} of {pages}
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Next</button>
          </span>
        </div>
      </div>
    </div>
  );
}
