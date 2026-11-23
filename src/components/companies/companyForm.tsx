import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchPlans, type Plan } from "../../utils/adminApi";
import type { Company, CompanyAddress, CompanyContact, CompanyLimits } from "../../utils/jobsApi";

/** Pieces shared by the Create Company page and the company details panel (SRS Screens 2 and 3). */

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

export const INDUSTRIES = [
  "Information Technology", "IT Services & Consulting", "Software Product", "Banking & Financial Services", "Healthcare",
  "Manufacturing", "Retail & E-commerce", "Education", "Telecommunications", "Consulting", "Logistics",
  "Media & Entertainment", "BPO / KPO", "Government", "Other",
];
export const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
export const COMPANY_TYPES = ["Private Limited", "Public Limited", "LLP", "Partnership", "Proprietorship", "One Person Company", "Government", "Non-profit"];

export const EMPTY_ADDRESS: CompanyAddress = { line1: "", line2: "", city: "", state: "", country: "India", pincode: "" };
export const EMPTY_CONTACT: CompanyContact = { name: "", email: "", phone: "" };
export const EMPTY_LIMITS: CompanyLimits = { users: 0, active_jobs: 0, storage_mb: 0, ai_parses_per_month: 0 };

export const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** "abc.com, @abc.in" -> ["abc.com", "abc.in"] */
export const parseDomains = (value: string) =>
  value.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);

export const careersUrl = (slug: string) => `${window.location.origin}/careers/${slug}`;
export const limitText = (n: number) => (n > 0 ? n.toLocaleString() : "No limit");
export const dateText = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function Field({ label, hint, required, children, className = "" }: { label: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>} {hint && <span className="font-normal text-slate-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export interface ProfileDraft {
  name: string;
  short_name: string;
  company_type: string;
  industry: string;
  website: string;
  company_size: string;
  description: string;
  logo_url: string;
  address: CompanyAddress;
  contact: CompanyContact;
}

export const draftOf = (c?: Company): ProfileDraft => ({
  name: c?.name ?? "",
  short_name: c?.short_name ?? "",
  company_type: c?.company_type ?? "",
  industry: c?.industry ?? "",
  website: c?.website ?? "",
  company_size: c?.company_size ?? "",
  description: c?.description ?? "",
  logo_url: c?.logo_url ?? "",
  address: { ...EMPTY_ADDRESS, ...(c?.address || {}) },
  contact: { ...EMPTY_CONTACT, ...(c?.contact || {}) },
});

/** Company details: industry, website, contact person, address (Screen 3 step 1). */
export function ProfileFields({ value, onChange, withName = false }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void; withName?: boolean }) {
  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) => onChange({ ...value, [key]: v });
  const setAddress = (key: keyof CompanyAddress, v: string) => set("address", { ...value.address, [key]: v });
  const setContact = (key: keyof CompanyContact, v: string) => set("contact", { ...value.contact, [key]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {withName && (
          <Field label="Company name" required className="sm:col-span-2">
            <input required maxLength={120} value={value.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
        )}
        <Field label="Short name / brand" hint="shown in the portal">
          <input value={value.short_name} maxLength={60} onChange={(e) => set("short_name", e.target.value)} placeholder="ShineLogics" className={inputClass} />
        </Field>
        <Field label="Industry" required>
          <select value={value.industry} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            {value.industry && !INDUSTRIES.includes(value.industry) && <option>{value.industry}</option>}
          </select>
        </Field>
        <Field label="Company size" hint="employees">
          <select value={value.company_size} onChange={(e) => set("company_size", e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {SIZES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Company type">
          <select value={value.company_type} onChange={(e) => set("company_type", e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {COMPANY_TYPES.map((s) => <option key={s}>{s}</option>)}
            {value.company_type && !COMPANY_TYPES.includes(value.company_type) && <option>{value.company_type}</option>}
          </select>
        </Field>
        <Field label="Company website" className="sm:col-span-2">
          <input value={value.website} maxLength={200} onChange={(e) => set("website", e.target.value)} placeholder="https://www.abc.com" className={inputClass} />
        </Field>
        <Field label="Company description" className="sm:col-span-2">
          <textarea rows={3} maxLength={500} value={value.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
          <span className="self-end text-[11px] text-slate-400">{value.description.length} / 500</span>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Contact person" required><input value={value.contact.name} maxLength={120} onChange={(e) => setContact("name", e.target.value)} className={inputClass} /></Field>
        <Field label="Official email" required><input type="email" value={value.contact.email} maxLength={120} onChange={(e) => setContact("email", e.target.value)} placeholder="careers@abc.com" className={inputClass} /></Field>
        <Field label="Phone number"><input value={value.contact.phone} maxLength={30} onChange={(e) => setContact("phone", e.target.value)} placeholder="+91 98765 43210" className={inputClass} /></Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Address" className="sm:col-span-4">
          <input value={value.address.line1} maxLength={120} onChange={(e) => setAddress("line1", e.target.value)} placeholder="Street, area" className={inputClass} />
        </Field>
        <Field label="Country"><input value={value.address.country} maxLength={120} onChange={(e) => setAddress("country", e.target.value)} className={inputClass} /></Field>
        <Field label="State"><input value={value.address.state} maxLength={120} onChange={(e) => setAddress("state", e.target.value)} className={inputClass} /></Field>
        <Field label="City"><input value={value.address.city} maxLength={120} onChange={(e) => setAddress("city", e.target.value)} className={inputClass} /></Field>
        <Field label="Pincode"><input value={value.address.pincode} maxLength={12} onChange={(e) => setAddress("pincode", e.target.value)} className={inputClass} /></Field>
      </div>
    </div>
  );
}

/** The super admin's plan catalogue (Plans & Billing), loaded once per page. */
export function usePlans() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    fetchPlans().then(setPlans).catch(() => setPlans([]));
  }, []);
  return plans;
}

export const planPrice = (p: Plan) =>
  p.monthly_price === null ? "Custom" : `${p.currency === "INR" ? "₹" : p.currency + " "}${p.monthly_price.toLocaleString("en-IN")}/mo`;

/** Plan, end date and limits. Choosing a plan from the catalogue fills its limits. */
export function PlanFields({
  plan, validUntil, limits, onPlan, onValidUntil, onLimits,
}: {
  plan: string;
  validUntil: string;
  limits: CompanyLimits;
  onPlan: (v: string) => void;
  onValidUntil: (v: string) => void;
  onLimits: (v: CompanyLimits) => void;
}) {
  const plans = usePlans();
  const setLimit = (key: keyof CompanyLimits, v: string) => onLimits({ ...limits, [key]: Math.max(0, parseInt(v || "0", 10) || 0) });
  const active = (plans || []).filter((p) => p.is_active || p.code === plan);
  return (
    <div className="space-y-4">
      <Field label="Plan" hint="payments come later; you set the plan for now">
        {plans === null ? (
          <p className="text-xs text-slate-400">Loading plans…</p>
        ) : active.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {active.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => {
                  onPlan(p.code);
                  onLimits({ ...EMPTY_LIMITS, ...p.limits });
                }}
                className={`rounded-xl border p-3 text-left ${plan === p.code ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <span className="block text-sm font-bold text-slate-900">{p.name}</span>
                <span className="block text-xs font-semibold text-indigo-700">{planPrice(p)}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{p.features.slice(0, 2).join(" · ") || "—"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input value={plan} onChange={(e) => onPlan(e.target.value)} placeholder="e.g. Trial" className={`${inputClass} max-w-xs`} />
            <span className="text-xs text-slate-500">
              No plans yet. <Link to="/platform/plans" className="font-medium text-indigo-600 hover:underline">Add plans in Plans & Billing</Link>.
            </span>
          </div>
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Valid until"><input type="date" value={validUntil} onChange={(e) => onValidUntil(e.target.value)} className={inputClass} /></Field>
        <Field label="Users" hint="0 = no limit"><input type="number" min={0} value={limits.users} onChange={(e) => setLimit("users", e.target.value)} className={inputClass} /></Field>
        <Field label="Active jobs"><input type="number" min={0} value={limits.active_jobs} onChange={(e) => setLimit("active_jobs", e.target.value)} className={inputClass} /></Field>
        <Field label="Storage (MB)"><input type="number" min={0} value={limits.storage_mb} onChange={(e) => setLimit("storage_mb", e.target.value)} className={inputClass} /></Field>
        <Field label="AI parses / month"><input type="number" min={0} value={limits.ai_parses_per_month} onChange={(e) => setLimit("ai_parses_per_month", e.target.value)} className={inputClass} /></Field>
      </div>
    </div>
  );
}

/** Coloured summary card with an icon (the mockups' top-of-page cards). */
export function StatCard({ icon, value, label, tone }: { icon: ReactNode; value: ReactNode; label: string; tone: "blue" | "green" | "red" | "amber" | "violet" | "orange" | "teal" | "slate" }) {
  const tones: Record<string, string> = {
    blue: "bg-sky-50 text-sky-600 ring-sky-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    red: "bg-rose-50 text-rose-600 ring-rose-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    teal: "bg-teal-50 text-teal-600 ring-teal-100",
    slate: "bg-slate-50 text-slate-600 ring-slate-100",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-4 ${tones[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight text-slate-900 tabular-nums">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/** Plan name as a coloured pill. */
export function PlanPill({ plan }: { plan: string }) {
  if (!plan) return <span className="text-slate-400">—</span>;
  const p = plan.toLowerCase();
  const tone = p.includes("enterprise") ? "bg-violet-50 text-violet-700" : p.includes("pro") || p.includes("business") ? "bg-sky-50 text-sky-700" : p.includes("trial") ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${tone}`}>{plan.replace(/-/g, " ")}</span>;
}
