import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  LogIn,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import {
  createWorkspace,
  fetchAllCompanies,
  setCompanyArchived,
  switchCompany,
  updateCompany,
  type Company,
  type CompanyAddress,
  type CompanyChanges,
  type CompanyContact,
  type CompanyLimits,
} from "../utils/jobsApi";

/**
 * Super admin: every company workspace on the platform (SRS Screens 2 and 3).
 * Each company sees only its own users, candidates, jobs, interviews, settings and templates.
 */

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const filterClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";

const INDUSTRIES = [
  "Information Technology", "Banking & Financial Services", "Healthcare", "Manufacturing", "Retail & E-commerce",
  "Education", "Telecommunications", "Consulting", "Logistics", "Media & Entertainment", "Government", "Other",
];
const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];
const PLANS = ["Trial", "Starter", "Growth", "Enterprise"];

const EMPTY_ADDRESS: CompanyAddress = { line1: "", line2: "", city: "", state: "", country: "India", pincode: "" };
const EMPTY_CONTACT: CompanyContact = { name: "", email: "", phone: "" };
const EMPTY_LIMITS: CompanyLimits = { users: 0, active_jobs: 0, storage_mb: 0, ai_parses_per_month: 0 };

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** "abc.com, @abc.in" -> ["abc.com", "abc.in"] */
const parseDomains = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

const currentCompanyId = (): string | undefined => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}").company_id;
  } catch {
    return undefined;
  }
};

const careersUrl = (slug: string) => `${window.location.origin}/careers/${slug}`;
const limitText = (n: number) => (n > 0 ? n.toLocaleString() : "No limit");
const dateText = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-slate-600">
        {label} {hint && <span className="font-normal text-slate-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

// ── Shared form sections ─────────────────────────────────────────────────────

interface ProfileDraft {
  name: string;
  industry: string;
  website: string;
  company_size: string;
  description: string;
  logo_url: string;
  address: CompanyAddress;
  contact: CompanyContact;
}

const draftOf = (c?: Company): ProfileDraft => ({
  name: c?.name ?? "",
  industry: c?.industry ?? "",
  website: c?.website ?? "",
  company_size: c?.company_size ?? "",
  description: c?.description ?? "",
  logo_url: c?.logo_url ?? "",
  address: { ...EMPTY_ADDRESS, ...(c?.address || {}) },
  contact: { ...EMPTY_CONTACT, ...(c?.contact || {}) },
});

function ProfileFields({ value, onChange }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void }) {
  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) => onChange({ ...value, [key]: v });
  const setAddress = (key: keyof CompanyAddress, v: string) => set("address", { ...value.address, [key]: v });
  const setContact = (key: keyof CompanyContact, v: string) => set("contact", { ...value.contact, [key]: v });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Industry">
          <select value={value.industry} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Company size" hint="employees">
          <select value={value.company_size} onChange={(e) => set("company_size", e.target.value)} className={inputClass}>
            <option value="">Choose…</option>
            {SIZES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Website">
          <input value={value.website} maxLength={200} onChange={(e) => set("website", e.target.value)} placeholder="https://abc.com" className={inputClass} />
        </Field>
        <Field label="Logo URL" hint="upload comes with Branding">
          <input value={value.logo_url} maxLength={500} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://abc.com/logo.png" className={inputClass} />
        </Field>
        <Field label="About the company" className="sm:col-span-2">
          <textarea rows={3} maxLength={4000} value={value.description} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact person</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><input value={value.contact.name} maxLength={120} onChange={(e) => setContact("name", e.target.value)} className={inputClass} /></Field>
          <Field label="Official email"><input type="email" value={value.contact.email} maxLength={120} onChange={(e) => setContact("email", e.target.value)} className={inputClass} /></Field>
          <Field label="Phone"><input value={value.contact.phone} maxLength={30} onChange={(e) => setContact("phone", e.target.value)} className={inputClass} /></Field>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Address</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Address line 1" className="sm:col-span-2"><input value={value.address.line1} maxLength={120} onChange={(e) => setAddress("line1", e.target.value)} className={inputClass} /></Field>
          <Field label="Address line 2"><input value={value.address.line2} maxLength={120} onChange={(e) => setAddress("line2", e.target.value)} className={inputClass} /></Field>
          <Field label="City"><input value={value.address.city} maxLength={120} onChange={(e) => setAddress("city", e.target.value)} className={inputClass} /></Field>
          <Field label="State"><input value={value.address.state} maxLength={120} onChange={(e) => setAddress("state", e.target.value)} className={inputClass} /></Field>
          <Field label="Country"><input value={value.address.country} maxLength={120} onChange={(e) => setAddress("country", e.target.value)} className={inputClass} /></Field>
          <Field label="Pincode"><input value={value.address.pincode} maxLength={12} onChange={(e) => setAddress("pincode", e.target.value)} className={inputClass} /></Field>
        </div>
      </div>
    </div>
  );
}

function PlanFields({
  plan,
  limits,
  onPlan,
  onLimits,
}: {
  plan: string;
  limits: CompanyLimits;
  onPlan: (v: string) => void;
  onLimits: (v: CompanyLimits) => void;
}) {
  const setLimit = (key: keyof CompanyLimits, v: string) => onLimits({ ...limits, [key]: Math.max(0, parseInt(v || "0", 10) || 0) });
  return (
    <div className="space-y-3">
      <Field label="Plan" hint="set by you for now; online payments come later">
        <div className="flex flex-wrap gap-2">
          {PLANS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPlan(p)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${plan === p ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Users" hint="0 = no limit"><input type="number" min={0} value={limits.users} onChange={(e) => setLimit("users", e.target.value)} className={inputClass} /></Field>
        <Field label="Active jobs"><input type="number" min={0} value={limits.active_jobs} onChange={(e) => setLimit("active_jobs", e.target.value)} className={inputClass} /></Field>
        <Field label="Storage (MB)"><input type="number" min={0} value={limits.storage_mb} onChange={(e) => setLimit("storage_mb", e.target.value)} className={inputClass} /></Field>
        <Field label="AI parses / month"><input type="number" min={0} value={limits.ai_parses_per_month} onChange={(e) => setLimit("ai_parses_per_month", e.target.value)} className={inputClass} /></Field>
      </div>
    </div>
  );
}

// ── Create company wizard (SRS Screen 3) ─────────────────────────────────────

const STEPS = ["Company details", "Admin & access", "Plan & limits", "Review"];

function CreateCompanyWizard({ existingSlugs, onSaved, onCancel }: { existingSlugs: string[]; onSaved: (c: Company) => void; onCancel: () => void }) {
  const { toast } = useFeedback();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileDraft>(draftOf());
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domains, setDomains] = useState("");
  const [admin, setAdmin] = useState({ full_name: "", email: "", password: "" });
  const [plan, setPlan] = useState("Trial");
  const [limits, setLimits] = useState<CompanyLimits>({ ...EMPTY_LIMITS, users: 10, active_jobs: 5 });
  const [saving, setSaving] = useState(false);

  const shownSlug = slugTouched ? slug : slugify(profile.name);
  const slugTaken = existingSlugs.includes(slugify(shownSlug));
  const domainList = parseDomains(domains);
  const emailDomain = admin.email.trim().toLowerCase().split("@")[1] || "";
  const emailMismatch = !!admin.email && domainList.length > 0 && !domainList.includes(emailDomain);

  const stepValid = [
    !!profile.name.trim() && !!slugify(shownSlug) && !slugTaken,
    admin.full_name.trim().length >= 2 && /\S+@\S+\.\S+/.test(admin.email) && admin.password.length >= 6 && !emailMismatch,
    true,
    true,
  ];

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    try {
      const saved = await createWorkspace({
        ...profile,
        name: profile.name.trim(),
        slug: slugify(shownSlug),
        email_domains: domainList,
        plan,
        limits,
        admin: { full_name: admin.full_name.trim(), email: admin.email.trim(), password: admin.password },
      });
      toast(`${saved.name} is ready. ${admin.email.trim()} can sign in now.`, "success");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : submit());

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create company</h2>
            <p className="text-xs text-slate-500">Set up the company's workspace, its first administrator and its plan.</p>
          </div>
          <button onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        <ol className="flex gap-2 overflow-x-auto border-b border-slate-100 px-6 py-3">
          {STEPS.map((label, i) => (
            <li key={label} className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={i > step && !stepValid.slice(0, i).every(Boolean)}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${i === step ? "bg-indigo-600 text-white" : i < step ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">{i < step ? <Check size={12} /> : i + 1}</span>
                {label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_300px]">
          <form onSubmit={(e) => { e.preventDefault(); if (stepValid[step]) next(); }} className="space-y-4">
            {step === 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company name">
                    <input required autoFocus maxLength={120} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="ABC Technologies" className={inputClass} />
                  </Field>
                  <Field label="Company slug" hint="careers page address">
                    <input
                      required
                      maxLength={60}
                      value={shownSlug}
                      onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                      onBlur={() => setSlug(slugify(shownSlug))}
                      placeholder="abc"
                      className={`${inputClass} ${slugTaken ? "border-rose-400" : ""}`}
                    />
                    <span className={`text-[11px] ${slugTaken ? "text-rose-600" : "text-slate-400"}`}>
                      {slugTaken ? "This address is already used by another company." : careersUrl(slugify(shownSlug) || "abc")}
                    </span>
                  </Field>
                </div>
                <ProfileFields value={profile} onChange={setProfile} />
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Email domains" hint="optional, comma separated">
                  <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="abc.com" className={inputClass} />
                  <span className="text-[11px] text-slate-400">
                    {domainList.length ? `Only ${domainList.map((d) => "@" + d).join(", ")} addresses can be this company's users.` : "Leave empty to allow any email address."}
                  </span>
                </Field>
                <h4 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">First administrator (Company Admin)</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Full name"><input required minLength={2} maxLength={100} value={admin.full_name} onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })} className={inputClass} /></Field>
                  <Field label="Email"><input required type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder={domainList[0] ? `hr@${domainList[0]}` : "hr@company.com"} className={inputClass} /></Field>
                  <Field label="Temporary password" hint="at least 6 characters"><input required minLength={6} type="text" autoComplete="new-password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className={inputClass} /></Field>
                </div>
                {emailMismatch && <p className="text-xs text-rose-600">The administrator's email must be at {domainList.map((d) => "@" + d).join(", ")}.</p>}
                <p className="text-xs text-slate-500">More administrators can be added from the company's Users page after it is created.</p>
              </>
            )}

            {step === 2 && <PlanFields plan={plan} limits={limits} onPlan={setPlan} onLimits={setLimits} />}

            {step === 3 && (
              <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                {[
                  ["Company", profile.name],
                  ["Careers page", careersUrl(slugify(shownSlug))],
                  ["Industry", profile.industry || "—"],
                  ["Website", profile.website || "—"],
                  ["Contact", [profile.contact.name, profile.contact.email, profile.contact.phone].filter(Boolean).join(" · ") || "—"],
                  ["City", [profile.address.city, profile.address.state, profile.address.country].filter(Boolean).join(", ") || "—"],
                  ["Email domains", domainList.length ? domainList.map((d) => "@" + d).join(", ") : "Any"],
                  ["Administrator", `${admin.full_name} (${admin.email})`],
                  ["Plan", plan],
                  ["Limits", `${limitText(limits.users)} users · ${limitText(limits.active_jobs)} active jobs`],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="truncate font-medium text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="flex justify-between gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => (step ? setStep(step - 1) : onCancel())} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <ChevronLeft size={14} /> {step ? "Back" : "Cancel"}
              </button>
              <button disabled={saving || !stepValid[step]} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : step === STEPS.length - 1 ? <Check size={14} /> : <ChevronRight size={14} />}
                {step === STEPS.length - 1 ? "Confirm & create" : "Next"}
              </button>
            </div>
          </form>

          {/* Live career-page preview (full branding arrives in Phase 2) */}
          <aside className="hidden lg:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Career page preview</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white">
                {profile.logo_url ? <img src={profile.logo_url} alt="" className="h-5 w-5 rounded bg-white object-contain" /> : <Building2 size={16} />}
                <span className="truncate text-xs font-semibold">{profile.name || "Company name"}</span>
                <span className="ml-auto text-[10px] opacity-70">Careers</span>
              </div>
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-4 py-6 text-white">
                <p className="text-sm font-bold">Join {profile.name || "our team"}</p>
                <p className="mt-1 line-clamp-3 text-[11px] opacity-80">{profile.description || "Tell candidates what it's like to work here."}</p>
              </div>
              <div className="space-y-2 bg-slate-50 p-3">
                {["Senior Developer", "QA Engineer"].map((t) => (
                  <div key={t} className="rounded-lg border border-slate-200 bg-white p-2">
                    <p className="text-xs font-semibold text-slate-800">{t}</p>
                    <p className="text-[10px] text-slate-500">{profile.address.city || "Location"} · Full time</p>
                  </div>
                ))}
              </div>
              <p className="truncate border-t border-slate-100 bg-white px-3 py-2 text-[10px] text-slate-400">{careersUrl(slugify(shownSlug) || "abc")}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Company side panel: details + edit (SRS Screen 2 §5) ─────────────────────

function CompanyPanel({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: (c: Company) => void }) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileDraft>(draftOf(company));
  const [domains, setDomains] = useState(company.email_domains.join(", "));
  const [plan, setPlan] = useState(company.plan);
  const [limits, setLimits] = useState<CompanyLimits>({ ...EMPTY_LIMITS, ...company.limits });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProfile(draftOf(company));
    setDomains(company.email_domains.join(", "));
    setPlan(company.plan);
    setLimits({ ...EMPTY_LIMITS, ...company.limits });
    setEditing(false);
  }, [company]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const changes: CompanyChanges = { ...profile, name: profile.name.trim(), email_domains: parseDomains(domains), plan, limits };
      onSaved(await updateCompany(company.id, changes));
      toast("Company saved.", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  const a = company.address;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-50 text-indigo-600">
            {company.logo_url ? <img src={company.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{company.name}</h2>
            <p className="truncate text-xs text-slate-500">{company.industry || "Industry not set"} · {company.plan || "No plan"}</p>
          </div>
          {!editing && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Pencil size={12} /> Edit
            </button>
          )}
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        {editing ? (
          <form onSubmit={save} className="space-y-5 p-5">
            <Field label="Company name"><input required maxLength={120} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} /></Field>
            <ProfileFields value={profile} onChange={setProfile} />
            <Field label="Email domains" hint="comma separated, empty = any"><input value={domains} onChange={(e) => setDomains(e.target.value)} className={inputClass} /></Field>
            <PlanFields plan={plan} limits={limits} onPlan={setPlan} onLimits={setLimits} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
              <button disabled={saving || !profile.name.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-6 p-5 text-sm">
            <section className="grid grid-cols-4 gap-2">
              {[["Jobs", company.roles_count], ["Candidates", company.resumes_count ?? 0], ["Interviews", company.interviews_count ?? 0], ["Users", company.users_count ?? 0]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-slate-50 p-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{(v as number).toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500">{k}</p>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company overview</h3>
              {company.description && <p className="text-slate-700">{company.description}</p>}
              <ul className="space-y-1.5 text-slate-700">
                <li className="flex items-center gap-2"><Globe size={14} className="text-slate-400" />{company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{company.website}</a> : "—"}</li>
                <li className="flex items-center gap-2"><ExternalLink size={14} className="text-slate-400" /><a href={careersUrl(company.slug)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{careersUrl(company.slug)}</a></li>
                <li className="flex items-center gap-2"><Mail size={14} className="text-slate-400" />{[company.contact.name, company.contact.email].filter(Boolean).join(" · ") || "—"}</li>
                <li className="flex items-center gap-2"><Phone size={14} className="text-slate-400" />{company.contact.phone || "—"}</li>
                <li className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-slate-400" />{[a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(", ") || "—"}</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan & limits</h3>
              <dl className="grid grid-cols-2 gap-2 text-slate-700">
                <div><dt className="text-xs text-slate-500">Plan</dt><dd className="font-medium">{company.plan || "—"} <span className="text-xs font-normal text-slate-400">(manual)</span></dd></div>
                <div><dt className="text-xs text-slate-500">Users</dt><dd className="font-medium">{company.users_count ?? 0} / {limitText(company.limits.users)}</dd></div>
                <div><dt className="text-xs text-slate-500">Active jobs</dt><dd className="font-medium">{company.open_roles_count} / {limitText(company.limits.active_jobs)}</dd></div>
                <div><dt className="text-xs text-slate-500">Storage</dt><dd className="font-medium">{company.limits.storage_mb ? `${company.limits.storage_mb} MB` : "No limit"}</dd></div>
              </dl>
            </section>

            <section className="space-y-1 text-slate-700">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</h3>
              <p>Email domains: {company.email_domains.length ? company.email_domains.map((d) => "@" + d).join(", ") : "any"}</p>
              <p>Status: {company.is_archived ? "Archived" : company.is_active ? "Active" : "Inactive"} · Created {dateText(company.created_at)}</p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "inactive" | "archived";

export default function Companies() {
  const { toast, confirm } = useFeedback();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [industry, setIndustry] = useState("");
  const [plan, setPlan] = useState("");
  const here = currentCompanyId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompanies(await fetchAllCompanies(true));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (changed: Company) => {
    setCompanies((list) => (list.some((c) => c.id === changed.id) ? list.map((c) => (c.id === changed.id ? { ...c, ...changed } : c)) : [...list, changed]));
    setSelected((s) => (s && s.id === changed.id ? { ...s, ...changed } : s));
  };

  const counts = useMemo(() => {
    const live = companies.filter((c) => !c.is_archived);
    return {
      total: live.length,
      active: live.filter((c) => c.is_active).length,
      inactive: live.filter((c) => !c.is_active).length,
      archived: companies.length - live.length,
      jobs: live.reduce((n, c) => n + (c.roles_count || 0), 0),
      candidates: live.reduce((n, c) => n + (c.resumes_count || 0), 0),
      interviews: live.reduce((n, c) => n + (c.interviews_count || 0), 0),
    };
  }, [companies]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (status === "archived" ? !c.is_archived : c.is_archived) return false;
      if (status === "active" && !c.is_active) return false;
      if (status === "inactive" && c.is_active) return false;
      if (industry && c.industry !== industry) return false;
      if (plan && c.plan !== plan) return false;
      if (!q) return true;
      return [c.name, c.slug, c.industry, c.contact?.email, ...(c.email_domains || [])].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [companies, search, status, industry, plan]);

  const industries = useMemo(() => [...new Set(companies.map((c) => c.industry).filter(Boolean))].sort(), [companies]);
  const plans = useMemo(() => [...new Set(companies.map((c) => c.plan).filter(Boolean))].sort(), [companies]);

  const toggleWorkspace = async (company: Company) => {
    if (company.is_active) {
      const ok = await confirm({
        title: `Turn off ${company.name}?`,
        message: "Its users are signed out and cannot sign in until you turn it back on. Its data is kept.",
        confirmLabel: "Turn off",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      replace(await updateCompany(company.id, { is_active: !company.is_active }));
      toast(company.is_active ? `${company.name} is turned off.` : `${company.name} is turned on.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the company.", "error");
    }
  };

  const toggleArchive = async (company: Company) => {
    if (!company.is_archived) {
      const ok = await confirm({
        title: `Archive ${company.name}?`,
        message: "Its users can no longer sign in and its careers page goes offline. All its data is kept and you can restore it later.",
        confirmLabel: "Archive",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      replace(await setCompanyArchived(company.id, !company.is_archived));
      toast(company.is_archived ? `${company.name} is restored. Turn it on when it should be used again.` : `${company.name} is archived.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the company.", "error");
    }
  };

  const open = async (company: Company) => {
    setOpening(company.id);
    try {
      await switchCompany(company.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open the workspace.", "error");
      setOpening(null);
    }
  };

  const statusPill = (c: Company) =>
    c.is_archived ? (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Archived</span>
    ) : c.is_active ? (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
    ) : (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Inactive</span>
    );

  return (
    <div className="space-y-6 font-sans text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500">Each company has its own workspace. Its candidates, jobs, users and settings are visible only to it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus size={16} /> Create company
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total companies", counts.total],
          ["Active", counts.active],
          ["Inactive", counts.inactive],
          ["Total jobs", counts.jobs],
          ["Total candidates", counts.candidates],
          ["Total interviews", counts.interviews],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{(value as number).toLocaleString()}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <section className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, industry, email or domain" className={`${inputClass} pl-9`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={filterClass}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived ({counts.archived})</option>
        </select>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={filterClass}>
          <option value="">All industries</option>
          {industries.map((i) => <option key={i}>{i}</option>)}
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={filterClass}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p}>{p}</option>)}
        </select>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading companies…
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No companies match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3 text-right">Jobs</th>
                  <th className="px-4 py-3 text-right">Candidates</th>
                  <th className="px-4 py-3 text-right">Interviews</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(c)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 text-indigo-600">
                          {c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-contain" /> : <Building2 size={16} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{c.name}</span>
                            {c.is_default && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Platform</span>}
                            {c.id === here && <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">You are here</span>}
                          </div>
                          <p className="text-xs text-slate-500">/careers/{c.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.industry || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.roles_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.resumes_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.interviews_count ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600">{c.plan || "—"}</td>
                    <td className="px-4 py-3">{statusPill(c)}</td>
                    <td className="px-4 py-3 text-slate-500">{dateText(c.created_at)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        {!c.is_default && !c.is_archived && (
                          <button onClick={() => toggleWorkspace(c)} title={c.is_active ? "Turn off" : "Turn on"} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50">
                            <Power size={14} />
                          </button>
                        )}
                        {!c.is_default && (
                          <button onClick={() => toggleArchive(c)} title={c.is_archived ? "Restore" : "Archive"} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50">
                            {c.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        )}
                        <button
                          disabled={c.id === here || opening !== null || c.is_archived}
                          onClick={() => open(c)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                        >
                          {opening === c.id ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />} Open
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && (
        <CreateCompanyWizard
          existingSlugs={companies.map((c) => c.slug)}
          onCancel={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            replace(c);
          }}
        />
      )}
      {selected && <CompanyPanel company={selected} onClose={() => setSelected(null)} onSaved={replace} />}
    </div>
  );
}
