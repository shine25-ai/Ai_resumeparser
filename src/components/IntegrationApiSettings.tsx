import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Plug, Plus, Key, Copy, Check, RefreshCw, Trash2, Power, AlertCircle, CheckCircle2, X,
  Activity, Upload, Gauge, Clock, ChevronLeft, ChevronRight, BookOpen, AlertTriangle,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  INTEGRATION_API_BASE,
  getIntegrationOverview, setIntegrationEnabled, setShareInterviewResults, getIntegrationKeys, createIntegrationKey,
  updateIntegrationKey, regenerateIntegrationKey, deleteIntegrationKey, getIntegrationUsage, getIntegrationLogs,
} from '../utils/Api';
import type { IntegrationOverview, IntegrationKey, IntegrationUsage, IntegrationLogPage } from '../utils/Api';

// Request outcome colors (state, not series identity): always shown with a text label.
const SUCCESS_COLOR = '#10b981';
const ERROR_COLOR = '#f43f5e';

const ENDPOINT_LABELS: Record<string, string> = {
  upload: 'Upload resume',
  status: 'Get status',
  profile: 'Get profile',
  lookup: 'Lookup',
  interviews: 'Interviews',
  other: 'Other',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const timeAgo = (value?: string | null) => {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
};

const statusCodeClass = (code: number) =>
  code < 300 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : code < 500 ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';

const parsingStatusClass = (status: string) =>
  status === 'PARSED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'FAILED' ? 'bg-rose-50 text-rose-700 border-rose-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked; user can still select the text */ }
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-2">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

export default function IntegrationApiSettings() {
  const [overview, setOverview] = useState<IntegrationOverview | null>(null);
  const [keys, setKeys] = useState<IntegrationKey[]>([]);
  const [usage, setUsage] = useState<IntegrationUsage | null>(null);
  const [logs, setLogs] = useState<IntegrationLogPage | null>(null);

  const [days, setDays] = useState(30);
  const [keyFilter, setKeyFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [revealedKey, setRevealedKey] = useState<IntegrationKey | null>(null);
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'regenerate'; key: IntegrationKey } | null>(null);

  const showError = (err: unknown) =>
    setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });

  const loadOverviewAndKeys = useCallback(async () => {
    const [o, k] = await Promise.all([getIntegrationOverview(), getIntegrationKeys()]);
    setOverview(o);
    setKeys(k);
  }, []);

  const loadUsage = useCallback(async () => {
    setUsage(await getIntegrationUsage(days, keyFilter || undefined));
  }, [days, keyFilter]);

  const loadLogs = useCallback(async () => {
    setLogs(await getIntegrationLogs({
      page, limit: 20, key_id: keyFilter || undefined, outcome: outcomeFilter || undefined, endpoint: endpointFilter || undefined,
    }));
  }, [page, keyFilter, outcomeFilter, endpointFilter]);

  useEffect(() => {
    loadOverviewAndKeys().catch(showError).finally(() => setLoading(false));
  }, [loadOverviewAndKeys]);
  useEffect(() => { loadUsage().catch(showError); }, [loadUsage]);
  useEffect(() => { loadLogs().catch(showError); }, [loadLogs]);

  const refreshAll = async () => {
    setBusy(true);
    try {
      await Promise.all([loadOverviewAndKeys(), loadUsage(), loadLogs()]);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<void>, successText?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (successText) setMessage({ type: 'success', text: successText });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleApi = () => run(async () => {
    const next = !overview?.enabled;
    setOverview(await setIntegrationEnabled(next));
  }, overview?.enabled ? 'Integration API turned off. All API requests are now rejected.' : 'Integration API turned on.');

  const handleToggleShareResults = () => run(async () => {
    setOverview(await setShareInterviewResults(!overview?.share_interview_results));
  }, overview?.share_interview_results
    ? 'Interview results are now hidden. Candidates only see schedule and status.'
    : 'Interview results are now shared with candidates.');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const created = await createIntegrationKey(newKeyName.trim(), newKeyDescription.trim() || undefined);
      setIsCreateOpen(false);
      setNewKeyName('');
      setNewKeyDescription('');
      setRevealedKey(created);
      await loadOverviewAndKeys();
    });
  };

  const handleToggleKey = (key: IntegrationKey) => run(async () => {
    await updateIntegrationKey(key.id, { is_active: !key.is_active });
    await loadOverviewAndKeys();
  }, key.is_active ? `"${key.name}" disabled. Requests with this key are now rejected.` : `"${key.name}" enabled.`);

  const handleConfirm = () => {
    if (!confirm) return;
    const { type, key } = confirm;
    setConfirm(null);
    if (type === 'delete') {
      run(async () => {
        await deleteIntegrationKey(key.id);
        if (keyFilter === key.id) setKeyFilter('');
        await loadOverviewAndKeys();
      }, `"${key.name}" deleted.`);
    } else {
      run(async () => {
        setRevealedKey(await regenerateIntegrationKey(key.id));
        await loadOverviewAndKeys();
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>;
  }

  const enabled = !!overview?.enabled;
  const chartData = (usage?.daily || []).map(d => ({
    ...d,
    label: new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));
  const curlExample = `curl -X POST ${INTEGRATION_API_BASE}/resumes \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -F "file=@resume.pdf"`;

  return (
    <div className="space-y-6">
      {/* Header + global switch */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
              <Plug className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900">API Integration</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Let other applications upload resumes, fetch parsed profiles and show candidates their interviews, using an API key.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">Accept API requests</span>
              <span className="relative inline-flex items-center">
                <input type="checkbox" className="sr-only peer" checked={enabled} onChange={handleToggleApi} disabled={busy} />
                <span className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 peer-focus:ring-4 peer-focus:ring-indigo-300 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <div className="text-slate-500">Active keys</div>
            <div className="font-semibold text-slate-900">{overview?.active_keys ?? 0} of {overview?.total_keys ?? 0}</div>
          </div>
          <div>
            <div className="text-slate-500">Requests (24 h)</div>
            <div className="font-semibold text-slate-900">{overview?.requests_24h ?? 0}</div>
          </div>
          <div>
            <div className="text-slate-500">Errors (24 h)</div>
            <div className={`font-semibold ${overview?.errors_24h ? 'text-rose-600' : 'text-slate-900'}`}>{overview?.errors_24h ?? 0}</div>
          </div>
          <div>
            <div className="text-slate-500">Last request</div>
            <div className="font-semibold text-slate-900" title={formatDateTime(overview?.last_request_at)}>{timeAgo(overview?.last_request_at)}</div>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 mt-6 pt-5 border-t border-slate-200 cursor-pointer">
          <span>
            <span className="block text-sm font-medium text-slate-900">Share interview results with candidates</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              When on, the interviews API includes each round's outcome (Selected, Moved to next round, Not selected, On hold).
              Ratings, feedback and salary are never shared.
            </span>
          </span>
          <span className="relative inline-flex items-center shrink-0">
            <input type="checkbox" className="sr-only peer" checked={!!overview?.share_interview_results} onChange={handleToggleShareResults} disabled={busy} />
            <span className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-indigo-600 peer-focus:ring-4 peer-focus:ring-indigo-300 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></span>
          </span>
        </label>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* API keys */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Key className="w-5 h-5 text-indigo-600" /> API Keys</h3>
            <p className="text-sm text-slate-500 mt-1">Create one key per application, so you can track and turn off each one separately.</p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" /> New API key
          </button>
        </div>
        {keys.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No API keys yet. Create one to let another application use the API.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Name</th>
                  <th className="p-4">Key</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Requests</th>
                  <th className="p-4">Last used</th>
                  <th className="p-4">Created</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {keys.map(key => (
                  <tr key={key.id} className="hover:bg-slate-50/60">
                    <td className="p-4 align-top">
                      <div className="font-semibold text-slate-900">{key.name}</div>
                      {key.description && <div className="text-xs text-slate-500 mt-0.5 max-w-xs">{key.description}</div>}
                    </td>
                    <td className="p-4 align-top font-mono text-xs text-slate-600 whitespace-nowrap">
                      <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">{key.key_hint}••••••••</span>
                    </td>
                    <td className="p-4 align-top">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${key.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {key.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="p-4 align-top text-right tabular-nums">{key.request_count.toLocaleString()}</td>
                    <td className="p-4 align-top whitespace-nowrap" title={formatDateTime(key.last_used_at)}>{timeAgo(key.last_used_at)}</td>
                    <td className="p-4 align-top whitespace-nowrap">
                      <div>{formatDateTime(key.created_at)}</div>
                      {key.created_by_name && <div className="text-xs text-slate-500">by {key.created_by_name}</div>}
                    </td>
                    <td className="p-4 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleKey(key)}
                          disabled={busy}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${key.is_active ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
                          title={key.is_active ? 'Disable key' : 'Enable key'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirm({ type: 'regenerate', key })}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Regenerate key"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirm({ type: 'delete', key })}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600" /> Usage</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={keyFilter}
              onChange={e => { setKeyFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">All keys</option>
              {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              {[7, 30, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${days === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Activity className="w-4 h-4" />} label="Requests" value={(usage?.total_requests ?? 0).toLocaleString()} hint={`Last ${days} days`} />
          <StatCard
            icon={<Gauge className="w-4 h-4" />}
            label="Success rate"
            value={usage?.success_rate != null ? `${usage.success_rate}%` : '—'}
            hint={`${usage?.failed_requests ?? 0} failed${usage?.server_errors ? `, ${usage.server_errors} server error${usage.server_errors === 1 ? '' : 's'}` : ''}`}
          />
          <StatCard icon={<Upload className="w-4 h-4" />} label="Resumes uploaded" value={(usage?.resumes_uploaded ?? 0).toLocaleString()} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="Avg response" value={usage?.avg_duration_ms != null ? `${Math.round(usage.avg_duration_ms)} ms` : '—'} />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-slate-700">Requests per day</div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SUCCESS_COLOR }} /> Successful</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ERROR_COLOR }} /> Failed</span>
            </div>
          </div>
          <div className="h-56">
            {usage && usage.total_requests > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#0f172a' }}
                    labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                    itemStyle={{ color: '#334155' }}
                  />
                  <Bar dataKey="success" name="Successful" stackId="r" fill={SUCCESS_COLOR} stroke="#ffffff" strokeWidth={1} maxBarSize={28} />
                  <Bar dataKey="errors" name="Failed" stackId="r" fill={ERROR_COLOR} stroke="#ffffff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No API requests in this period yet.
              </div>
            )}
          </div>
        </div>

        {usage && usage.by_endpoint.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">By endpoint</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {usage.by_endpoint.map(e => (
                    <tr key={e.endpoint}>
                      <td className="py-2 text-slate-700">{ENDPOINT_LABELS[e.endpoint] || e.endpoint}</td>
                      <td className="py-2 text-right tabular-nums text-slate-900">{e.total.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500 w-28">{e.errors ? `${e.errors} failed` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">By key</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {usage.by_key.map(k => (
                    <tr key={k.key_id || 'unknown'}>
                      <td className={`py-2 ${k.key_id ? 'text-slate-700' : 'text-slate-500 italic'}`}>
                        {k.key_id ? (keys.find(x => x.id === k.key_id)?.name || k.key_name) : 'Missing or invalid key'}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-900">{k.total.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500 w-28">{k.errors ? `${k.errors} failed` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Request Logs</h3>
            <p className="text-sm text-slate-500 mt-1">
              Every API call, newest first. Logs are kept for {overview?.log_retention_days ?? 90} days.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={endpointFilter}
              onChange={e => { setEndpointFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-sm text-slate-700"
            >
              <option value="">All endpoints</option>
              {['upload', 'status', 'profile', 'lookup', 'interviews'].map(e => <option key={e} value={e}>{ENDPOINT_LABELS[e]}</option>)}
            </select>
            <select
              value={outcomeFilter}
              onChange={e => { setOutcomeFilter(e.target.value); setPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-sm text-slate-700"
            >
              <option value="">All results</option>
              <option value="success">Successful</option>
              <option value="error">Failed</option>
            </select>
          </div>
        </div>

        {!logs || logs.logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No requests match these filters.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-500 uppercase tracking-wider">
                    <th className="p-3 pl-6">Time</th>
                    <th className="p-3">Key</th>
                    <th className="p-3">Request</th>
                    <th className="p-3">Result</th>
                    <th className="p-3 text-right">Duration</th>
                    <th className="p-3">Candidate / parsing</th>
                    <th className="p-3 pr-6">Client IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {logs.logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60 align-top">
                      <td className="p-3 pl-6 whitespace-nowrap text-slate-700">{formatDateTime(log.created_at)}</td>
                      <td className="p-3 whitespace-nowrap">
                        {log.key_name
                          ? <span className="text-slate-900">{log.key_name}</span>
                          : <span className="text-slate-500 italic">{log.key_hint ? `Invalid (${log.key_hint}…)` : 'No key'}</span>}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-900">{ENDPOINT_LABELS[log.endpoint] || log.endpoint}</div>
                        <div className="font-mono text-[11px] text-slate-500 break-all">{log.method} {log.path}{log.query ? `?${log.query}` : ''}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${statusCodeClass(log.status_code)}`}>{log.status_code}</span>
                        {log.error_message && (
                          <div className="flex items-start gap-1 text-xs text-rose-600 mt-1 max-w-xs">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{log.error_message}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-slate-700 whitespace-nowrap">{Math.round(log.duration_ms)} ms</td>
                      <td className="p-3">
                        {log.resume ? (
                          <div>
                            <div className="text-slate-900">
                              {log.resume.candidate_name || log.resume.candidate_id || 'Candidate'}
                              {log.resume.candidate_name && log.resume.candidate_id && <span className="text-slate-500"> · {log.resume.candidate_id}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${parsingStatusClass(log.resume.parsing_status)}`}>{log.resume.parsing_status}</span>
                              {log.resume.merged && <span className="text-[11px] text-slate-500">merged into existing profile</span>}
                            </div>
                          </div>
                        ) : log.resume_id ? (
                          <span className="text-xs text-slate-500 italic">Resume no longer exists</span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="p-3 pr-6 font-mono text-xs text-slate-600 whitespace-nowrap" title={log.user_agent || ''}>{log.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 text-sm text-slate-600">
              <span>{logs.total.toLocaleString()} requests · page {logs.page} of {logs.total_pages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={logs.page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={logs.page >= logs.total_pages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick start */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-600" /> Quick start</h3>
        <p className="text-sm text-slate-500 mt-1">Send the key in the <code className="font-mono text-slate-700">X-API-Key</code> header on every request.</p>
        <div className="mt-4 grid gap-2 text-sm">
          {[
            ['POST', '/resumes', 'Upload a resume (multipart "file"). Returns resume_id; parsing runs in the background.'],
            ['GET', '/resumes/{resume_id}/status', 'Parsing status (PENDING, PARSED, FAILED) and interview status.'],
            ['GET', '/resumes/{resume_id}', 'Full parsed profile and AI evaluation.'],
            ['GET', '/resumes/lookup?email=…', 'Find a profile by email or candidate_id.'],
            ['GET', '/resumes/{resume_id}/interviews', "Candidate's interview schedule, joining link, status and result."],
            ['GET', '/interviews/lookup?email=…', 'Same, found by email or candidate_id.'],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${method === 'POST' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>{method}</span>
              <span className="font-mono text-xs text-slate-800">{path}</span>
              <span className="text-slate-500 text-xs">{desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 truncate">{INTEGRATION_API_BASE}</code>
          <CopyButton text={INTEGRATION_API_BASE} label="Copy base URL" />
        </div>
        <pre className="mt-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">{curlExample}</pre>
      </div>

      {/* Create key modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">New API key</h3>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Name</label>
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  placeholder="e.g. HRMS portal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={newKeyDescription}
                  onChange={e => setNewKeyDescription(e.target.value)}
                  placeholder="Which application or team uses this key"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 pt-0 flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 cursor-pointer">Cancel</button>
              <button type="submit" disabled={busy || !newKeyName.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer">Create key</button>
            </div>
          </form>
        </div>
      )}

      {/* Show new key once */}
      {revealedKey?.api_key && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Copy your API key for "{revealedKey.name}"</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                This is the only time the full key is shown. Store it somewhere safe, such as the other application's environment settings.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 break-all select-all">{revealedKey.api_key}</code>
                <CopyButton text={revealedKey.api_key} />
              </div>
            </div>
            <div className="p-6 pt-0 flex justify-end">
              <button onClick={() => setRevealedKey(null)} className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">I've saved it</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete / regenerate */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900">
              {confirm.type === 'delete' ? `Delete "${confirm.key.name}"?` : `Regenerate "${confirm.key.name}"?`}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              {confirm.type === 'delete'
                ? 'Any application using this key will stop working immediately. Its past request logs are kept.'
                : 'A new key will be created and the current one stops working immediately. Update the other application with the new key.'}
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 cursor-pointer">Cancel</button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer ${confirm.type === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {confirm.type === 'delete' ? 'Delete key' : 'Regenerate key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
