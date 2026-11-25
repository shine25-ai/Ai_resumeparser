import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Building2, CalendarClock, ChevronRight, Copy, Database, FileCheck2, Globe, Loader2, Mail, MapPin, Palette, Phone,
  Plug, Save, ScanText, Settings2, ShieldCheck, Workflow, BarChart3, AlertTriangle, QrCode, Check,
} from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import { useTheme } from "../theme/ThemeProvider";
import { careerAssetUrl } from "../careers/api";
import { fetchCompanies, fetchJobSettings, saveJobSettings, updateCompany, type Company, type TenantSettings } from "../utils/jobsApi";
import { COMPANY_TYPES, Field, INDUSTRIES, SIZES, inputClass } from "./companies/companyForm";
import { fetchCompanyUsageMeters, type CompanyUsageMeters, startMfaEnrolment, confirmMfaEnrolment } from "../utils/Api";

/**
 * Settings → Company Settings (SRS Screen 21, "Company Settings & Tenant Configuration"): the company profile,
 * contact and location, a branding summary and the tenant switches a company admin controls.
 */

const DEFAULT_TENANT: TenantSettings = {
  resume_parsing: true, duplicate_check: true, multi_department: true, calendar_scheduling: false,
  candidate_registration: false, data_retention_months: 24,
};
const RETENTION = [6, 12, 24, 36, 60, 0];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

function Card({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 text-indigo-600">{icon}</span>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SwitchRow({ icon, title, sub, on, onChange, disabled, note }: { icon: ReactNode; title: string; sub: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-slate-500">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-500">{sub}{note && <span className="ml-1 rounded bg-amber-50 px-1 text-amber-700">{note}</span>}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export default function CompanySettings() {
  const { toast } = useFeedback();
  const { branding, logo } = useTheme();
  const [company, setCompany] = useState<Company | null>(null);
  const [draft, setDraft] = useState<Company | null>(null);
  const [approval, setApproval] = useState<{ saved: boolean; now: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<CompanyUsageMeters | null>(null);
  const [mfaModal, setMfaModal] = useState<{ secret: string; otpauth_url: string; backup_codes: string[]; qr_svg: string } | null>(null);
  const [totpInput, setTotpInput] = useState("");
  const [enrollingMfa, setEnrollingMfa] = useState(false);

  useEffect(() => {
    fetchCompanies()
      .then((list) => {
        const me = JSON.parse(localStorage.getItem("user") || "{}");
        const own = list.find((c) => c.id === me.company_id) || list[0];
        if (own) {
          const c = { ...own, tenant_settings: { ...DEFAULT_TENANT, ...(own.tenant_settings || {}) } };
          setCompany(c);
          setDraft(c);
          fetchCompanyUsageMeters(own.id).then(setUsage).catch(() => null);
        }
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Could not load the company.", "error"));
    fetchJobSettings().then((s) => setApproval({ saved: s.require_approval, now: s.require_approval })).catch(() => undefined);
  }, [toast]);

  if (!draft || !company) {
    return <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading company settings…</p>;
  }

  const set = <K extends keyof Company>(k: K, v: Company[K]) => setDraft({ ...draft, [k]: v });
  const setTenant = <K extends keyof TenantSettings>(k: K, v: TenantSettings[K]) => set("tenant_settings", { ...draft.tenant_settings, [k]: v });
  const dirty = JSON.stringify(draft) !== JSON.stringify(company) || (approval && approval.now !== approval.saved);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateCompany(company.id, {
        name: draft.name.trim(), short_name: draft.short_name, industry: draft.industry, company_size: draft.company_size,
        company_type: draft.company_type, description: draft.description, website: draft.website, timezone: draft.timezone,
        contact: draft.contact, address: draft.address, tenant_settings: draft.tenant_settings,
      });
      const c = { ...saved, tenant_settings: { ...DEFAULT_TENANT, ...(saved.tenant_settings || {}) } };
      setCompany(c);
      setDraft(c);
      if (approval && approval.now !== approval.saved) {
        const s = await saveJobSettings(approval.now);
        setApproval({ saved: s.require_approval, now: s.require_approval });
      }
      toast("Company settings saved.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  };

  const t = draft.tenant_settings;
  const colours: [string, string][] = [["Primary", branding.colors.primary], ["Secondary", branding.colors.secondary], ["Accent", branding.colors.accent]];

  const startMfa = async () => {
    setEnrollingMfa(true);
    try {
      const data = await startMfaEnrolment();
      setMfaModal(data);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to initialize 2FA setup", "error");
    } finally {
      setEnrollingMfa(false);
    }
  };

  const confirmMfa = async () => {
    if (!totpInput.trim()) return;
    try {
      await confirmMfaEnrolment(totpInput.trim());
      toast("2FA authenticator successfully verified and enabled!", "success");
      setMfaModal(null);
      setTotpInput("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Invalid code. Please check your authenticator.", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Company Settings & Tenant Configuration</h2>
        <p className="text-sm text-slate-500">Configure your company profile, recruitment workflow, branding, integrations and tenant preferences.</p>
      </div>

      {/* Plan Expiration Banner */}
      {usage?.is_expired && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-bold">Subscription Plan Expired</p>
            <p className="mt-0.5 text-rose-700">
              Your subscription plan ({usage.plan}) expired on {usage.plan_valid_until}. The workspace is currently in read-only mode.
            </p>
          </div>
        </div>
      )}

      {/* Usage Quotas & Limits */}
      {usage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="text-indigo-600" size={20} />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Subscription Plan Quotas & Live Usage</h2>
                <p className="text-[11px] text-slate-500">
                  Plan: <span className="font-semibold text-slate-700 capitalize">{usage.plan}</span> · Billing: <span className="capitalize">{usage.billing_mode}</span>
                  {usage.plan_valid_until && ` · Valid until ${usage.plan_valid_until}`}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
              Month: {usage.month}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Users Meter */}
            <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">Active Staff Users</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {usage.users.used} / {usage.users.is_unlimited ? "∞" : usage.users.limit}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.users.pct >= 80 ? "bg-amber-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${Math.min(100, usage.users.pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{usage.users.pct}% used</span>
                {usage.users.pct >= 80 && <span className="text-amber-600 font-bold">Nearing Limit (80%)</span>}
              </div>
            </div>

            {/* 2. Active Jobs Meter */}
            <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">Open Job Postings</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {usage.active_jobs.used} / {usage.active_jobs.is_unlimited ? "∞" : usage.active_jobs.limit}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.active_jobs.pct >= 80 ? "bg-amber-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${Math.min(100, usage.active_jobs.pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{usage.active_jobs.pct}% used</span>
                {usage.active_jobs.pct >= 80 && <span className="text-amber-600 font-bold">Nearing Limit (80%)</span>}
              </div>
            </div>

            {/* 3. Storage Meter */}
            <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">Storage Capacity</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {usage.storage_mb.used} / {usage.storage_mb.is_unlimited ? "∞" : `${usage.storage_mb.limit} MB`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.storage_mb.pct >= 80 ? "bg-amber-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${Math.min(100, usage.storage_mb.pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{usage.storage_mb.pct}% used</span>
                {usage.storage_mb.pct >= 80 && <span className="text-amber-600 font-bold">Nearing Limit (80%)</span>}
              </div>
            </div>

            {/* 4. Monthly AI Parses Meter */}
            <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">AI Parses (Monthly)</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {usage.ai_parses.used} / {usage.ai_parses.is_unlimited ? "∞" : usage.ai_parses.limit}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.ai_parses.pct >= 80 ? "bg-amber-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${Math.min(100, usage.ai_parses.pct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                <span>{usage.ai_parses.pct}% used</span>
                {usage.ai_parses.pct >= 80 && <span className="text-amber-600 font-bold">Nearing Limit (80%)</span>}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card icon={<Building2 size={22} />} title="Company Profile" sub="Basic company information shown across the platform and your career page.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name" required className="sm:col-span-2"><input value={draft.name} maxLength={120} onChange={(e) => set("name", e.target.value)} className={inputClass} /></Field>
              <Field label="Short name / brand"><input value={draft.short_name} maxLength={60} onChange={(e) => set("short_name", e.target.value)} className={inputClass} /></Field>
              <Field label="Industry">
                <select value={draft.industry} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  {draft.industry && !INDUSTRIES.includes(draft.industry) && <option>{draft.industry}</option>}
                </select>
              </Field>
              <Field label="Company size">
                <select value={draft.company_size} onChange={(e) => set("company_size", e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </Field>
              <Field label="Company type">
                <select value={draft.company_type} onChange={(e) => set("company_type", e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {COMPANY_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="About company" className="sm:col-span-2">
                <textarea rows={3} maxLength={500} value={draft.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
                <span className="self-end text-[11px] text-slate-400">{draft.description.length} / 500</span>
              </Field>
            </div>
          </Card>

          <Card icon={<MapPin size={22} />} title="Contact & Location">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Website"><div className="relative"><Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={draft.website} onChange={(e) => set("website", e.target.value)} className={`${inputClass} pl-8`} /></div></Field>
              <Field label="Email (recruitment)"><div className="relative"><Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="email" value={draft.contact.email} onChange={(e) => set("contact", { ...draft.contact, email: e.target.value })} className={`${inputClass} pl-8`} /></div></Field>
              <Field label="Phone"><div className="relative"><Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={draft.contact.phone} maxLength={30} onChange={(e) => set("contact", { ...draft.contact, phone: e.target.value })} className={`${inputClass} pl-8`} /></div></Field>
              <Field label="Contact person"><input value={draft.contact.name} maxLength={120} onChange={(e) => set("contact", { ...draft.contact, name: e.target.value })} className={inputClass} /></Field>
              <Field label="Head office address" className="sm:col-span-2"><input value={draft.address.line1} maxLength={120} onChange={(e) => set("address", { ...draft.address, line1: e.target.value })} className={inputClass} /></Field>
              <Field label="City"><input value={draft.address.city} maxLength={120} onChange={(e) => set("address", { ...draft.address, city: e.target.value })} className={inputClass} /></Field>
              <Field label="Country"><input value={draft.address.country} maxLength={120} onChange={(e) => set("address", { ...draft.address, country: e.target.value })} className={inputClass} /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card icon={<Palette size={22} />} title="Company Branding" sub="Logo, favicon and brand colours for a consistent experience.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="mb-2 text-xs font-semibold text-slate-600">Company Logo</p>
                <div className="flex h-16 items-center justify-center">{logo ? <img src={logo} alt="" className="max-h-14 max-w-full object-contain" /> : <Building2 className="text-slate-300" />}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="mb-2 text-xs font-semibold text-slate-600">Favicon</p>
                <div className="flex h-16 items-center justify-center">{branding.favicon_url ? <img src={careerAssetUrl(branding.favicon_url)} alt="" className="h-8 w-8 object-contain" /> : <span className="text-xs text-slate-400">Not set</span>}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-600">Brand Colors</p>
                <ul className="space-y-1.5">
                  {colours.map(([k, v]) => <li key={k} className="flex items-center gap-2 text-xs"><span className="h-4 w-4 rounded" style={{ background: v }} />{k}<span className="ml-auto font-mono text-slate-500">{v}</span></li>)}
                </ul>
              </div>
            </div>
            <Link to="/settings?tab=branding" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">Change logo, colours and dark mode <ChevronRight size={14} /></Link>
          </Card>

          <Card icon={<Settings2 size={22} />} title="Tenant Configuration" sub="Company-level preferences for your workspace.">
            <div className="grid gap-x-6 sm:grid-cols-2 [&>*]:border-b [&>*]:border-slate-100">
              <SwitchRow icon={<ScanText size={18} />} title="Resume Parsing (AI)" sub="Read details from uploaded resumes automatically" on={t.resume_parsing} onChange={(v) => setTenant("resume_parsing", v)} />
              <SwitchRow icon={<Workflow size={18} />} title="Multi-Department Hiring" sub="Group jobs and users by department" on={t.multi_department} onChange={(v) => setTenant("multi_department", v)} />
              <SwitchRow icon={<Copy size={18} />} title="Duplicate Candidate Check" sub="Warn about a candidate who already exists" on={t.duplicate_check} onChange={(v) => setTenant("duplicate_check", v)} note="with Candidates" />
              <SwitchRow icon={<FileCheck2 size={18} />} title="Approval for Job Publishing" sub="A job needs approval before it goes live" on={!!approval?.now} disabled={!approval} onChange={(v) => setApproval((a) => (a ? { ...a, now: v } : a))} />
              <SwitchRow icon={<ShieldCheck size={18} />} title="Candidate Registration" sub="Candidates apply with an email code; accounts come later" on={t.candidate_registration} disabled onChange={() => undefined} />
              <SwitchRow icon={<CalendarClock size={18} />} title="Interview Scheduling (Calendar)" sub="Google / Outlook calendar sync" on={t.calendar_scheduling} onChange={(v) => setTenant("calendar_scheduling", v)} note="sync comes later" />
              <div className="flex items-center gap-3 py-2.5">
                <Database size={18} className="text-slate-500" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Data Retention Period</p><p className="text-[11px] text-slate-500">Keep candidate data for</p></div>
                <select value={t.data_retention_months} onChange={(e) => setTenant("data_retention_months", Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {RETENTION.map((m) => <option key={m} value={m}>{m ? `${m} Months` : "Until deleted"}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <Globe size={18} className="text-slate-500" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Timezone</p><p className="text-[11px] text-slate-500">For dates and interview times</p></div>
                <select value={draft.timezone} onChange={(e) => set("timezone", e.target.value)} className="max-w-[160px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  {[...new Set([draft.timezone, ...TIMEZONES])].filter(Boolean).map((z) => <option key={z}>{z}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card icon={<ShieldCheck size={22} />} title="Two-Factor Authentication (TOTP)" sub="Protect your company staff logins with authenticator apps (Google Authenticator, Authy, 1Password).">
            {!mfaModal ? (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Authenticator App 2FA</p>
                  <p className="text-xs text-slate-500">Require time-based one-time passcodes (TOTP) and backup codes during login.</p>
                </div>
                <button
                  type="button"
                  onClick={startMfa}
                  disabled={enrollingMfa}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {enrollingMfa ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />} Set Up 2FA
                </button>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Scan Authenticator QR Code</h3>
                    <p className="text-xs text-slate-500">Scan this image in Google Authenticator or enter the manual secret key.</p>
                  </div>
                  <button onClick={() => setMfaModal(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="p-2 bg-white rounded-xl border border-slate-200" dangerouslySetInnerHTML={{ __html: mfaModal.qr_svg }} />
                  <div className="space-y-2 text-xs text-slate-700">
                    <p className="font-semibold text-slate-900">Manual Setup Key:</p>
                    <code className="block bg-slate-100 p-2 rounded text-slate-800 font-mono select-all break-all">{mfaModal.secret}</code>
                    <p className="text-[11px] text-slate-500">Backup codes (keep these in a safe place):</p>
                    <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-600">
                      {mfaModal.backup_codes.map((c) => <span key={c} className="bg-white px-2 py-0.5 rounded border border-slate-200">{c}</span>)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-indigo-100">
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={totpInput}
                    onChange={(e) => setTotpInput(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono max-w-[180px]"
                  />
                  <button
                    type="button"
                    onClick={confirmMfa}
                    disabled={!totpInput.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check size={13} /> Verify & Activate
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Quick Links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            [<Workflow size={18} />, "Interview Types", "/settings?tab=interviewTypes"],
            [<Mail size={18} />, "Email Templates", "/settings?tab=templates"],
            [<Plug size={18} />, "Integrations", "/settings?tab=integration"],
            [<Globe size={18} />, "Career Page Settings", "/career-page"],
          ] as const).map(([icon, label, to]) => (
            <Link key={label} to={to} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/40">
              <span className="text-indigo-600">{icon}</span><span className="flex-1">{label}</span><ChevronRight size={15} className="text-slate-400" />
            </Link>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-[var(--app-bg)]/95 py-3 backdrop-blur">
        <button disabled={!dirty || saving} onClick={() => { setDraft(company); setApproval((a) => (a ? { ...a, now: a.saved } : a)); }} className="px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-40">Discard Changes</button>
        <button disabled={!dirty || saving || !draft.name.trim()} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save Changes
        </button>
      </div>
    </div>
  );
}
