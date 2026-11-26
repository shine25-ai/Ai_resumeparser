import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, Building2, Check, ChevronLeft, CircleCheck, Eye, Loader2, Upload } from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { uploadBrandingImage } from "../utils/adminApi";
import { createWorkspace, fetchAllCompanies, type CompanyLimits } from "../utils/jobsApi";
import { useTheme } from "../theme/ThemeProvider";
import {
  EMPTY_LIMITS, Field, PlanFields, ProfileFields, careersUrl, draftOf, inputClass, limitText, parseDomains, slugify,
  type ProfileDraft,
} from "../components/companies/companyForm";

/** Super admin: Companies → Create Company (SRS Screen 3), a full page with a live careers page preview. */

const STEPS = [
  { title: "Company Details", sub: "Basic information" },
  { title: "Admin & Access", sub: "Company users" },
  { title: "Branding & Career Page", sub: "Career site setup" },
  { title: "Plan & Review", sub: "Confirm & create" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function Preview({ profile, slug, primary, secondary, logo, headline }: { profile: ProfileDraft; slug: string; primary: string; secondary: string; logo: string; headline: string }) {
  const name = profile.short_name || profile.name || "Your company";
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        {logo ? <img src={logo} alt="" className="h-7 w-7 rounded object-contain" /> : <span className="flex h-7 w-7 items-center justify-center rounded text-white" style={{ background: primary }}><Building2 size={14} /></span>}
        <span className="truncate text-sm font-bold text-slate-900">{name}</span>
        <span className="ml-auto flex gap-3 text-[11px] text-slate-500"><span>About Us</span><span>Jobs</span></span>
      </div>
      <div className="px-5 py-6 text-white" style={{ background: `linear-gradient(120deg, ${primary}, ${secondary})` }}>
        <p className="text-lg font-extrabold leading-snug">{headline || `Build your career with ${name}`}</p>
        <p className="mt-1 line-clamp-2 text-[11px] opacity-85">{profile.description || "Tell candidates what it's like to work here."}</p>
        <span className="mt-3 inline-block rounded-lg bg-white/95 px-3 py-1.5 text-[11px] font-semibold" style={{ color: primary }}>View Openings</span>
      </div>
      <div className="space-y-2 bg-slate-50 p-3">
        <p className="text-xs font-bold text-slate-800">Open Positions</p>
        {["Senior Developer", "Data Engineer", "UI/UX Designer"].map((t) => (
          <div key={t} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <Briefcase size={14} className="text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{t}</p>
              <p className="text-[10px] text-slate-500">{profile.address.city || "Location"} · Full time</p>
            </div>
            <span className="rounded-md px-2 py-1 text-[10px] font-semibold text-white" style={{ background: secondary }}>Apply Now</span>
          </div>
        ))}
      </div>
      <p className="truncate border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400">{careersUrl(slug || "your-company")}</p>
    </div>
  );
}

export default function CreateCompany() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const { branding } = useTheme();
  const [step, setStep] = useState(0);
  const [existing, setExisting] = useState<string[]>([]);
  const [profile, setProfile] = useState<ProfileDraft>(draftOf());
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domains, setDomains] = useState("");
  const [admin, setAdmin] = useState({ full_name: "", email: "", password: "" });
  const [primary, setPrimary] = useState(branding.colors.primary);
  const [secondary, setSecondary] = useState(branding.colors.secondary || "#2563eb");
  const [logo, setLogo] = useState("");
  const [headline, setHeadline] = useState("");
  const [uploading, setUploading] = useState(false);
  const [plan, setPlan] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [limits, setLimits] = useState<CompanyLimits>({ ...EMPTY_LIMITS, users: 10, active_jobs: 5 });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAllCompanies(true).then((c) => setExisting(c.map((x) => x.slug))).catch(() => undefined);
  }, []);

  const shownSlug = slugTouched ? slug : slugify(profile.name);
  const cleanSlug = slugify(shownSlug);
  const slugTaken = existing.includes(cleanSlug);
  const domainList = parseDomains(domains);
  const emailDomain = admin.email.trim().toLowerCase().split("@")[1] || "";
  const emailMismatch = !!admin.email && domainList.length > 0 && !domainList.includes(emailDomain);

  const valid = useMemo(() => [
    !!profile.name.trim() && !!cleanSlug && !slugTaken && !!profile.industry && !!profile.contact.name.trim() && /\S+@\S+\.\S+/.test(profile.contact.email),
    admin.full_name.trim().length >= 2 && /\S+@\S+\.\S+/.test(admin.email) && admin.password.length >= 6 && !emailMismatch,
    HEX.test(primary) && HEX.test(secondary),
    true,
  ], [profile, cleanSlug, slugTaken, admin, emailMismatch, primary, secondary]);

  const submit = async () => {
    setSaving(true);
    try {
      const saved = await createWorkspace({
        ...profile,
        name: profile.name.trim(),
        logo_url: logo || profile.logo_url,
        slug: cleanSlug,
        email_domains: domainList,
        plan,
        plan_valid_until: validUntil || null,
        limits,
        admin: { full_name: admin.full_name.trim(), email: admin.email.trim(), password: admin.password },
        branding: { colors: { primary: primary.toLowerCase(), secondary: secondary.toLowerCase() }, ...(logo ? { logo_url: logo } : {}) },
        career_headline: headline.trim() || undefined,
      });
      toast(`${saved.name} is ready. ${admin.email.trim()} can sign in now.`, "success");
      navigate(`/companies?company=${saved.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create the company.", "error");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid[step]) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      // Platform scope: the new company doesn't exist yet. Images are served by a public link either way.
      const asset = await uploadBrandingImage("logo", file, "platform");
      setLogo(asset.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not upload the logo.", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5 font-sans text-slate-800">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Company</h1>
        <p className="text-sm text-slate-500">Add a new company and set up its recruitment portal, career page and admin access.</p>
      </div>

      {/* Stepper */}
      <ol className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:grid-cols-4">
        {STEPS.map((s, i) => {
          const reachable = i <= step || valid.slice(0, i).every(Boolean);
          return (
            <li key={s.title} className="flex items-center gap-3">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(i)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${i === step ? "bg-indigo-600 text-white shadow" : i < step ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}
              >
                {i < step ? <Check size={16} /> : i + 1}
              </button>
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${i === step ? "text-slate-900" : "text-slate-600"}`}>{s.title}</p>
                <p className="truncate text-xs text-slate-400">{s.sub}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{step + 1}</span>
            <h2 className="text-lg font-bold text-slate-900">{STEPS[step].title}</h2>
          </div>

          <div className="space-y-5 p-5">
            {step === 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company name" required>
                    <input required autoFocus maxLength={120} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="ABC Technologies Pvt. Ltd." className={inputClass} />
                  </Field>
                  <Field label="Company slug (for URL)" required>
                    <input
                      required
                      maxLength={60}
                      value={shownSlug}
                      onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                      onBlur={() => setSlug(cleanSlug)}
                      placeholder="abc"
                      className={`${inputClass} ${slugTaken ? "border-rose-400" : ""}`}
                    />
                    <span className={`inline-flex items-center gap-1 text-[11px] ${slugTaken ? "text-rose-600" : "text-emerald-700"}`}>
                      {slugTaken ? "This address is already used by another company." : <><CircleCheck size={12} /> Career page URL: {careersUrl(cleanSlug || "abc")}</>}
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
                <h3 className="pt-1 text-sm font-bold text-slate-900">First administrator (Company Admin)</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Full name" required><input required minLength={2} maxLength={100} value={admin.full_name} onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })} className={inputClass} /></Field>
                  <Field label="Email" required><input required type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder={domainList[0] ? `hr@${domainList[0]}` : "hr@company.com"} className={inputClass} /></Field>
                  <Field label="Temporary password" hint="at least 6 characters" required><input required minLength={6} type="text" autoComplete="new-password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} className={inputClass} /></Field>
                </div>
                {emailMismatch && <p className="text-xs text-rose-600">The administrator's email must be at {domainList.map((d) => "@" + d).join(", ")}.</p>}
                <p className="text-xs text-slate-500">More users (HR, recruiters, interviewers) can be invited from the company's Users page after it is created.</p>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-slate-700">Company logo</p>
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                      {logo ? <img src={logo} alt="" className="max-h-20 max-w-[160px] object-contain" /> : <Building2 size={28} className="text-slate-300" />}
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                    <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload logo
                    </button>
                    <p className="mt-1 text-[10px] text-slate-400">PNG, JPG or WebP · up to 500 KB</p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([["Primary colour", primary, setPrimary], ["Secondary colour", secondary, setSecondary]] as const).map(([label, value, set]) => (
                        <Field key={label} label={label}>
                          <div className="flex items-center gap-2">
                            <input type="color" value={HEX.test(value) ? value : "#000000"} onChange={(e) => set(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-slate-300" />
                            <input value={value} onChange={(e) => set(e.target.value)} className={`${inputClass} font-mono ${HEX.test(value) ? "" : "border-rose-400"}`} />
                          </div>
                        </Field>
                      ))}
                    </div>
                    <Field label="Career page headline" hint="you can change everything later in the Career Page Builder">
                      <input value={headline} maxLength={150} onChange={(e) => setHeadline(e.target.value)} placeholder={`Build your career with ${profile.short_name || profile.name || "us"}`} className={inputClass} />
                    </Field>
                  </div>
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  The company admin can add a banner, sections, a favicon, dark mode and a custom domain later (Settings → Branding and Career Page).
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <PlanFields plan={plan} validUntil={validUntil} limits={limits} onPlan={setPlan} onValidUntil={setValidUntil} onLimits={setLimits} />
                <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                  {[
                    ["Company", profile.name],
                    ["Career page", careersUrl(cleanSlug)],
                    ["Industry", profile.industry || "—"],
                    ["Contact", [profile.contact.name, profile.contact.email].filter(Boolean).join(" · ") || "—"],
                    ["Address", [profile.address.city, profile.address.state, profile.address.country].filter(Boolean).join(", ") || "—"],
                    ["Email domains", domainList.length ? domainList.map((d) => "@" + d).join(", ") : "Any"],
                    ["Administrator", `${admin.full_name} (${admin.email})`],
                    ["Plan", `${plan || "—"}${validUntil ? ` · until ${validUntil}` : ""}`],
                    ["Limits", `${limitText(limits.users)} users · ${limitText(limits.active_jobs)} active jobs`],
                    ["Colours", `${primary} · ${secondary}`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-xs text-slate-500">{k}</dt>
                      <dd className="truncate font-medium text-slate-800">{v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <button type="button" onClick={() => (step ? setStep(step - 1) : navigate("/companies"))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {step ? <><ChevronLeft size={14} /> Back</> : "Cancel"}
            </button>
            <button disabled={saving || !valid[step]} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : step === STEPS.length - 1 ? <Check size={14} /> : null}
              {step === STEPS.length - 1 ? "Create company" : <>Save & Next <ArrowRight size={14} /></>}
            </button>
          </div>
        </form>

        <aside className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Eye size={16} className="text-indigo-600" /> Career Page Preview <span className="font-normal text-slate-500">(Live)</span></p>
          <Preview profile={profile} slug={cleanSlug} primary={HEX.test(primary) ? primary : "#1c7975"} secondary={HEX.test(secondary) ? secondary : "#2563eb"} logo={logo} headline={headline} />
        </aside>
      </div>
    </div>
  );
}
