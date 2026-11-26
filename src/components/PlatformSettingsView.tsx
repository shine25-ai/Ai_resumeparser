import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import {
  BASE_URL,
  apiFetch,
  fetchSystemHealthMetrics,
  runDataRetentionDryRun,
  applyDataRetention,
} from "../utils/Api";

interface PlatformSettingsData {
  platform_name: string;
  support_email: string;
  platform_url: string;
  default_timezone: string;
  default_language: string;
  allowed_resume_types: string[];
  security: {
    require_mfa_superadmin: boolean;
    require_mfa_all_staff: boolean;
    session_timeout_minutes: number;
  };
  email_templates: Record<string, { subject: string; body: string }>;
  integrations: Array<{
    id: string;
    name: string;
    category: string;
    is_enabled: boolean;
    description: string;
  }>;
}

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export default function PlatformSettingsView() {
  const { toast, confirm } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PlatformSettingsData | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [retentionReport, setRetentionReport] = useState<any>(null);
  const [retentionRunning, setRetentionRunning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token") || "";
      const [settingsRes, healthData] = await Promise.all([
        apiFetch(`${BASE_URL}/operations/platform-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
        fetchSystemHealthMetrics().catch(() => null),
      ]);
      setSettings(settingsRes.data || settingsRes);
      setHealth(healthData);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load platform settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("access_token") || "";
      const res = await apiFetch(`${BASE_URL}/operations/platform-settings`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.detail || "Save failed");
      setSettings(data.data || data);
      toast("Platform settings saved successfully.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save platform settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRetentionDryRun = async () => {
    setRetentionRunning(true);
    try {
      const rep = await runDataRetentionDryRun();
      setRetentionReport(rep);
      toast(`Retention dry-run completed: ${rep.eligible_count} candidates found past period.`, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Retention dry-run failed", "error");
    } finally {
      setRetentionRunning(false);
    }
  };

  const handleApplyRetention = async () => {
    const ok = await confirm({
      title: "Apply Candidate Retention Deletion?",
      message: "This will permanently purge rejected/withdrawn candidate data past the configured retention months. This action is audited and irreversible.",
      confirmLabel: "Apply Deletion",
      danger: true,
    });
    if (!ok) return;

    setRetentionRunning(true);
    try {
      const rep = await applyDataRetention();
      setRetentionReport(rep);
      toast(`Retention applied: ${rep.eligible_count} candidates permanently deleted.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Retention deletion failed", "error");
    } finally {
      setRetentionRunning(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-slate-500 text-sm">
        <Loader2 className="animate-spin text-indigo-600" size={20} />
        Loading Screen 22 Platform Settings…
      </div>
    );
  }

  const toggleResumeType = (type: string) => {
    const current = settings.allowed_resume_types || [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    if (next.length === 0) {
      toast("At least one resume type must remain allowed.", "warning");
      return;
    }
    setSettings({ ...settings, allowed_resume_types: next });
  };

  const toggleIntegration = (id: string) => {
    const updated = settings.integrations.map((item) =>
      item.id === id ? { ...item, is_enabled: !item.is_enabled } : item
    );
    setSettings({ ...settings, integrations: updated });
  };

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-900">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Sliders className="text-indigo-600" size={24} />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Platform Settings & Global Operations (Screen 22)
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Unified platform parameters, security policies, system health, and scheduled maintenance.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save All Changes
          </button>
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. General Platform Identification */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Globe className="text-indigo-600" size={18} />
              <h2 className="text-sm font-bold text-slate-900">General Platform Identification</h2>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">Platform Brand Name</label>
                <input
                  type="text"
                  value={settings.platform_name}
                  onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Platform URL</label>
                <input
                  type="text"
                  value={settings.platform_url}
                  onChange={(e) => setSettings({ ...settings, platform_url: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://hirelogics.ai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Support Email</label>
                <input
                  type="email"
                  value={settings.support_email}
                  onChange={(e) => setSettings({ ...settings, support_email: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="support@hirelogics.ai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Default Timezone</label>
                <select
                  value={settings.default_timezone}
                  onChange={(e) => setSettings({ ...settings, default_timezone: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Default Language</label>
                <select
                  value={settings.default_language}
                  onChange={(e) => setSettings({ ...settings, default_language: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="en">English (US/UK)</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Allowed Resume Formats</label>
                <div className="flex flex-wrap gap-4">
                  {["pdf", "docx", "doc"].map((fmt) => (
                    <label key={fmt} className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.allowed_resume_types.includes(fmt)}
                        onChange={() => toggleResumeType(fmt)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="uppercase">{fmt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 2. Security & Authentication Policies */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <ShieldCheck className="text-emerald-600" size={18} />
              <h2 className="text-sm font-bold text-slate-900">Security & Authentication Policies</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-slate-900">Require MFA for the super admin</p>
                  <p className="text-[11px] text-slate-500">
                    Require TOTP authenticator setup for platform super admin accounts at login (off by default).
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.security?.require_mfa_superadmin ?? false}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, require_mfa_superadmin: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </label>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5">
                <div>
                  <p className="text-xs font-bold text-slate-900">Enforce MFA Across All Staff Accounts</p>
                  <p className="text-[11px] text-slate-500">
                    Require TOTP authenticator setup for all company admins and recruiters at login.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.security?.require_mfa_all_staff ?? false}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      security: { ...settings.security, require_mfa_all_staff: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Session Inactivity Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min={15}
                  max={43200}
                  value={settings.security?.session_timeout_minutes ?? 1440}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      security: {
                        ...settings.security,
                        session_timeout_minutes: parseInt(e.target.value || "1440", 10),
                      },
                    })
                  }
                  className="w-full sm:w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* 3. Data Retention & Compliance */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Lock className="text-amber-600" size={18} />
                <h2 className="text-sm font-bold text-slate-900">GDPR & Data Retention Cleaner</h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRetentionDryRun}
                  disabled={retentionRunning}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Dry-Run Preview
                </button>
                <button
                  type="button"
                  onClick={handleApplyRetention}
                  disabled={retentionRunning}
                  className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Apply Purge
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Automated retention cleaner runs nightly, purging rejected and withdrawn candidate resumes older than each tenant's configured limit.
            </p>
            {retentionReport && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
                <p className="font-semibold">{retentionReport.message}</p>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Cutoff date: {retentionReport.cutoff_date ? new Date(retentionReport.cutoff_date).toLocaleDateString() : "Indefinite"} · Eligible: {retentionReport.eligible_count}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Column 2: System Health, Integrations, Shortcuts */}
        <div className="space-y-6">
          {/* 4. Live System Health & Background Jobs */}
          {health && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Activity className="text-emerald-600" size={18} />
                  <h2 className="text-sm font-bold text-slate-900">System Health & Daemon Jobs</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  {health.status.toUpperCase()}
                </span>
              </div>

              {/* Component Health Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                <div className="rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Database</span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{health.components?.database?.status || "Connected"}</p>
                  <p className="text-[10px] text-slate-500 tabular-nums">{health.components?.database?.latency_ms || 1.2} ms latency</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">AI Parser</span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{health.components?.ai_parser?.status || "Active"}</p>
                  <p className="text-[10px] text-slate-500">PyMuPDF Engine</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-2.5">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Free Storage</span>
                  <p className="text-xs font-bold text-slate-800 mt-0.5">{health.components?.storage?.free_space_gb || 45} GB</p>
                  <p className="text-[10px] text-slate-500">Writable Volume</p>
                </div>
              </div>

              {/* Background Jobs List */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-800 mb-2">Scheduled Daemon Jobs</p>
                {(health.background_jobs || []).map((job: any) => (
                  <div key={job.name} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{job.label}</p>
                      <p className="text-[10px] text-slate-500">{job.schedule}</p>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Success
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Master Shortcuts & Quick Links */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Layers className="text-indigo-600" size={18} />
              <h2 className="text-sm font-bold text-slate-900">Platform Masters & Quick Links</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Link
                to="/plans"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
              >
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-indigo-600">Subscription Plans</p>
                  <p className="text-[11px] text-slate-500">Manage pricing & limits</p>
                </div>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600" />
              </Link>

              <Link
                to="/skills"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
              >
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-indigo-600">Skill Intelligence</p>
                  <p className="text-[11px] text-slate-500">Taxonomy & aliases</p>
                </div>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600" />
              </Link>

              <Link
                to="/companies"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
              >
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-indigo-600">Companies & Tenants</p>
                  <p className="text-[11px] text-slate-500">Directory & usage meters</p>
                </div>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600" />
              </Link>

              <Link
                to="/audit"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:bg-indigo-50 hover:border-indigo-200 transition-colors group"
              >
                <div>
                  <p className="font-bold text-slate-900 group-hover:text-indigo-600">Platform Audit Log</p>
                  <p className="text-[11px] text-slate-500">Super admin event trail</p>
                </div>
                <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-600" />
              </Link>
            </div>
          </section>

          {/* 6. Platform Integrations Overview */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Plug className="text-indigo-600" size={18} />
              <h2 className="text-sm font-bold text-slate-900">Supported Platform Integrations</h2>
            </div>
            <div className="space-y-3">
              {(settings.integrations || []).map((plugin) => (
                <div key={plugin.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">{plugin.name}</p>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-600">
                        {plugin.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{plugin.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={plugin.is_enabled}
                    onClick={() => toggleIntegration(plugin.id)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      plugin.is_enabled ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                        plugin.is_enabled ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
