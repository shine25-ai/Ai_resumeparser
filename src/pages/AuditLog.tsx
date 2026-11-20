import { useState, useEffect, useCallback } from 'react';
import { Search, Download, RefreshCw, ShieldCheck, X, Loader2 } from 'lucide-react';
import { fetchAuditLogs, type AuditLogEntry } from '../utils/atsApi';

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAuditLogs({
        user: userFilter || undefined,
        action: actionFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: search.trim() || undefined,
      });
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setUsers(res.users || []);
      setActions(res.actions || []);
    } catch (err) {
      console.error('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  }, [userFilter, actionFilter, startDate, endDate, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const hasFilters = Boolean(userFilter || actionFilter || startDate || endDate || search);

  const exportCsv = () => {
    const header = ['Timestamp', 'User', 'Action', 'Target', 'Details'];
    const rows = logs.map((l) => [l.created_at, l.user, l.action, l.target, l.details]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ats-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4 pb-8 font-sans text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-200/80">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck size={18} className="text-indigo-600" />
            <span>Audit Log</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Compliance trail of stage moves, scorecards, offers, merges, interviews &amp; applications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="h-9 px-3 rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={loadLogs}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-500"
            aria-label="Refresh audit logs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </header>

      {/* Filter Controls: User, Action, Date Range, Search */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search target or details..."
            className="w-full h-8.5 pl-8.5 pr-3 bg-white border border-slate-200 rounded-lg text-xs"
          />
        </div>

        <select
          aria-label="Filter by user"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 max-w-[180px]"
        >
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-8.5 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 max-w-[190px]"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-8.5">
          <input
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-transparent text-xs text-slate-700 focus:outline-none"
          />
          <span className="text-[11px] text-slate-300">–</span>
          <input
            type="date"
            aria-label="End date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-transparent text-xs text-slate-700 focus:outline-none"
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setUserFilter('');
              setActionFilter('');
              setStartDate('');
              setEndDate('');
              setSearch('');
            }}
            className="h-8.5 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 inline-flex items-center gap-1"
          >
            <X size={12} />
            Reset
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500 tabular-nums">{total} events</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center text-xs text-slate-500">
            <Loader2 size={22} className="animate-spin text-indigo-600 mb-2" />
            Loading audit trail...
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">User</th>
                  <th className="py-2.5 px-4 font-medium">Action</th>
                  <th className="py-2.5 px-4 font-medium">Target</th>
                  <th className="py-2.5 px-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {log.user}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-700">{log.target}</td>
                    <td className="py-2.5 px-4 text-slate-500">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center text-xs text-slate-400">
            No audit events match the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}

