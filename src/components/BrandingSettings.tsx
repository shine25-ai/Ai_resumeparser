import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, Eye, Image as ImageIcon, Loader2, Mail, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { useFeedback } from "./ui/Feedback";
import { DEFAULT_BRANDING, assetUrl, useTheme, type Branding } from "../theme/ThemeProvider";
import {
  fetchBranding,
  fetchPlatformSettings,
  resetBranding,
  saveBranding,
  savePlatformSettings,
  uploadBrandingImage,
  type BrandingChanges,
} from "../utils/adminApi";

/**
 * Settings → Branding (plan §3.6): colours (light and dark), logo and favicon, app name, font and corners,
 * the sign-in page and emails. A live preview shows the result, and "Preview across the app" applies the
 * unsaved look everywhere until it is saved or cancelled.
 *
 * Empty values go back to the default (the platform's branding, or the built-in look).
 */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";
const FONTS = ["Inter", "Roboto", "Poppins", "Open Sans", "Lato", "Nunito", "Source Sans 3"];

const isSuperAdmin = () => {
  try {
    const me = JSON.parse(localStorage.getItem("user") || "{}");
    return !!me?.is_superadmin || String(me?.role || "").toLowerCase() === "superadmin";
  } catch {
    return false;
  }
};

// WCAG contrast, mirrors the server's check so the warning shows while editing.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return 21;
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

/** Deep-merge the company's changes over the defaults: what the screen shows. */
const merged = (defaults: Branding, own: BrandingChanges): Branding => ({
  ...defaults,
  ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== "" && typeof v !== "object")),
  colors: { ...defaults.colors, ...strip(own.colors) },
  dark: { ...defaults.dark, ...strip(own.dark) },
  login: { ...defaults.login, ...strip(own.login) },
  email: { ...(defaults.email || { from_name: "", reply_to: "", footer_text: "" }), ...strip(own.email) },
} as Branding);
function strip<T extends object>(o?: T): Partial<T> {
  return Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== "" && v !== undefined)) as Partial<T>;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function ColorField({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const shown = value || fallback;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(shown) ? shown : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" aria-label={`${label} colour`} />
        <input value={value} placeholder={fallback || "default"} maxLength={7} onChange={(e) => onChange(e.target.value.trim())} className={`${input} font-mono`} />
        {value && (
          <button type="button" onClick={() => onChange("")} title="Back to default" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <RotateCcw size={14} />
          </button>
        )}
      </span>
    </label>
  );
}

function ImageField({
  label,
  hint,
  value,
  kind,
  scope,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  kind: "logo" | "logo_dark" | "favicon" | "login_background";
  scope: "company" | "platform";
  onChange: (url: string) => void;
}) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await uploadBrandingImage(kind, file, scope)).url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 ${kind === "logo_dark" ? "bg-slate-800" : "bg-slate-50"}`}>
        {value ? <img src={assetUrl(value)} alt="" className="h-full w-full object-contain p-1" /> : <ImageIcon size={18} className="text-slate-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-400">{hint}</p>
        <div className="mt-1 flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
            <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {value && (
            <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <X size={12} /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small picture of the app, the sign-in page and an email in the edited look. */
function Preview({ b }: { b: Branding }) {
  const logo = assetUrl(b.logo_url);
  const r = b.radius === "sm" ? 4 : b.radius === "lg" ? 14 : 9;
  return (
    <div className="space-y-4" style={{ fontFamily: `"${b.font_family}", Inter, sans-serif` }}>
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div className="flex h-44">
          <div className="flex w-24 flex-col gap-1.5 p-2" style={{ background: b.colors.sidebar_bg, color: b.colors.sidebar_text }}>
            <div className="mb-1 flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-white">{logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Sparkles size={10} style={{ color: b.colors.primary }} />}</span>
              <span className="truncate text-[9px] font-bold text-white">{b.app_name}</span>
            </div>
            <span className="rounded px-1.5 py-1 text-[9px] font-semibold text-white" style={{ background: b.colors.primary, borderRadius: r / 2 }}>Dashboard</span>
            {["Jobs", "Candidates", "Interviews"].map((x) => <span key={x} className="px-1.5 py-0.5 text-[9px]">{x}</span>)}
          </div>
          <div className="flex-1 space-y-2 p-3" style={{ background: b.colors.background }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800">Dashboard</span>
              <span className="px-2 py-1 text-[9px] font-semibold text-white" style={{ background: b.colors.primary, borderRadius: r / 2 }}>+ Create job</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {["24", "180", "12"].map((n, i) => (
                <div key={n} className="border border-slate-200 bg-white p-1.5" style={{ borderRadius: r / 1.5 }}>
                  <p className="text-[11px] font-bold" style={{ color: i === 0 ? b.colors.primary : "#0f172a" }}>{n}</p>
                  <p className="text-[8px] text-slate-400">{["Jobs", "Candidates", "Interviews"][i]}</p>
                </div>
              ))}
            </div>
            <div className="border border-slate-200 bg-white p-1.5 text-[9px]" style={{ borderRadius: r / 1.5 }}>
              <span className="mr-1 rounded-full px-1.5 py-0.5 font-semibold" style={{ background: `color-mix(in oklab, ${b.colors.primary} 12%, white)`, color: b.colors.primary }}>Shortlisted</span>
              <span style={{ color: b.colors.primary }} className="font-semibold underline">View profile</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <p className="bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">Sign-in page</p>
          <div className="flex h-24">
            <div className="flex w-1/2 flex-col justify-center p-2 text-white" style={{ background: b.colors.sidebar_bg }}>
              <p className="truncate text-[9px] font-bold">{b.login.welcome_title}</p>
              <p className="line-clamp-2 text-[7px] opacity-70">{b.login.welcome_text}</p>
            </div>
            <div className="flex w-1/2 flex-col justify-center gap-1 p-2" style={{ background: b.colors.background }}>
              <span className="h-2.5 rounded bg-white ring-1 ring-slate-200" />
              <span className="h-2.5 rounded bg-white ring-1 ring-slate-200" />
              <span className="h-3 rounded" style={{ background: b.colors.primary }} />
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <p className="bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">Email</p>
          <div className="h-24 bg-slate-100 p-2">
            <div className="overflow-hidden rounded bg-white">
              <div className="px-2 py-1 text-[8px] font-bold text-white" style={{ background: b.colors.primary }}>{b.app_name}</div>
              <div className="space-y-1 p-2">
                <span className="block h-1.5 w-3/4 rounded bg-slate-200" />
                <span className="inline-block rounded px-1.5 py-0.5 text-[7px] font-semibold text-white" style={{ background: b.colors.primary }}>Accept invitation</span>
                <p className="truncate text-[6px] text-slate-400">{b.email?.footer_text || b.email?.from_name}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandingSettings() {
  const { toast, confirm } = useFeedback();
  const { preview, refresh: refreshTheme } = useTheme();
  const superAdmin = isSuperAdmin();
  const [scope, setScope] = useState<"company" | "platform">("company");
  const [defaults, setDefaults] = useState<Branding>(DEFAULT_BRANDING);
  const [draft, setDraft] = useState<BrandingChanges>({});
  const [saved, setSaved] = useState<BrandingChanges>({});
  const [companySlug, setCompanySlug] = useState("");
  const [platform, setPlatform] = useState({ platform_name: "", support_email: "", platform_url: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [livePreview, setLivePreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (scope === "company") {
        const data = await fetchBranding();
        setDefaults(data.defaults);
        setDraft(data.company || {});
        setSaved(data.company || {});
        setCompanySlug(data.company_slug);
      } else {
        const p = await fetchPlatformSettings();
        setDefaults(DEFAULT_BRANDING);
        setDraft(p.branding || {});
        setSaved(p.branding || {});
        setPlatform({ platform_name: p.platform_name, support_email: p.support_email, platform_url: p.platform_url });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load branding.", "error");
    } finally {
      setLoading(false);
    }
  }, [scope, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => merged(defaults, draft), [defaults, draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // "Preview across the app": the whole app shows the unsaved look; stop when leaving the screen.
  useEffect(() => {
    preview(livePreview && scope === "company" ? view : null);
  }, [livePreview, view, scope, preview]);
  useEffect(() => () => preview(null), [preview]);

  const set = <K extends keyof BrandingChanges>(key: K, value: BrandingChanges[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setIn = <K extends "colors" | "dark" | "login" | "email">(group: K, key: string, value: string) =>
    setDraft((d) => ({ ...d, [group]: { ...((d[group] as object) || {}), [key]: value } }));

  const warnings = [
    { label: "White text on the primary colour", r: ratio("#ffffff", view.colors.primary), need: 4.5 },
    { label: "Primary colour as link text on the page background", r: ratio(view.colors.primary, view.colors.background), need: 3 },
    { label: "Sidebar text on the sidebar", r: ratio(view.colors.sidebar_text, view.colors.sidebar_bg), need: 4.5 },
  ].filter((w) => w.r < w.need);

  const save = async () => {
    setSaving(true);
    try {
      if (scope === "company") {
        const data = await saveBranding(draft);
        setSaved(data.company);
        setDraft(data.company);
        setLivePreview(false);
        await refreshTheme();
      } else {
        await savePlatformSettings({ ...platform, branding: draft });
        setSaved(draft);
      }
      toast("Branding saved.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!(await confirm({ title: "Reset branding to the default?", message: "Colours, logos, sign-in and email settings go back to the platform default.", confirmLabel: "Reset", danger: true }))) return;
    try {
      const data = await resetBranding();
      setDraft(data.company);
      setSaved(data.company);
      await refreshTheme();
      toast("Branding reset.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not reset.", "error");
    }
  };

  if (loading) {
    return <p className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading branding…</p>;
  }

  const c = draft.colors || {};
  const dk = draft.dark || {};
  const lg = draft.login || {};
  const em = draft.email || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {superAdmin && (
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              {(["company", "platform"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`rounded-md px-3 py-1.5 ${scope === s ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"}`}>
                  {s === "company" ? "This company" : "Platform default"}
                </button>
              ))}
            </div>
          )}
          {scope === "company" && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} className="accent-indigo-600" />
              <Eye size={13} /> Preview across the app
            </label>
          )}
        </div>
        <div className="flex gap-2">
          {scope === "company" && (
            <button onClick={resetAll} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <RotateCcw size={14} /> Reset to default
            </button>
          )}
          <button onClick={() => { setDraft(saved); setLivePreview(false); }} disabled={!dirty} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            Discard changes
          </button>
          <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save branding
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {scope === "platform" && (
            <Section title="Platform" hint="The product name and contact shown when a company has no branding of its own.">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Platform name
                  <input value={platform.platform_name} maxLength={60} onChange={(e) => setPlatform({ ...platform, platform_name: e.target.value })} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Support email
                  <input value={platform.support_email} maxLength={120} onChange={(e) => setPlatform({ ...platform, support_email: e.target.value })} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Platform address
                  <input value={platform.platform_url} maxLength={200} placeholder="https://hirelogics.example.com" onChange={(e) => setPlatform({ ...platform, platform_url: e.target.value })} className={input} />
                </label>
              </div>
            </Section>
          )}

          <Section title="Identity" hint="The name in the sidebar, browser tab and emails, and your logos.">
            <label className="mb-4 flex flex-col gap-1 text-xs font-medium text-slate-600">App name
              <input value={draft.app_name || ""} placeholder={defaults.app_name} maxLength={60} onChange={(e) => set("app_name", e.target.value)} className={input} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <ImageField label="Logo" hint="PNG/JPG/WebP, up to 500 KB" kind="logo" scope={scope} value={draft.logo_url || ""} onChange={(v) => set("logo_url", v)} />
              <ImageField label="Logo for dark mode" hint="Optional" kind="logo_dark" scope={scope} value={draft.logo_dark_url || ""} onChange={(v) => set("logo_dark_url", v)} />
              <ImageField label="Favicon" hint="PNG or ICO, square" kind="favicon" scope={scope} value={draft.favicon_url || ""} onChange={(v) => set("favicon_url", v)} />
            </div>
          </Section>

          <Section title="Colours" hint="Pick one primary colour: lighter and darker shades are made from it. Empty = default.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ColorField label="Primary (buttons, links)" value={c.primary || ""} fallback={defaults.colors.primary} onChange={(v) => setIn("colors", "primary", v)} />
              <ColorField label="Accent (charts)" value={c.accent || ""} fallback={defaults.colors.accent} onChange={(v) => setIn("colors", "accent", v)} />
              <ColorField label="Page background" value={c.background || ""} fallback={defaults.colors.background} onChange={(v) => setIn("colors", "background", v)} />
              <ColorField label="Sidebar" value={c.sidebar_bg || ""} fallback={defaults.colors.sidebar_bg} onChange={(v) => setIn("colors", "sidebar_bg", v)} />
              <ColorField label="Sidebar text" value={c.sidebar_text || ""} fallback={defaults.colors.sidebar_text} onChange={(v) => setIn("colors", "sidebar_text", v)} />
            </div>
            {warnings.length > 0 && (
              <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {warnings.map((w) => (
                  <p key={w.label} className="flex items-center gap-1.5"><AlertTriangle size={12} /> {w.label} is hard to read ({w.r}:1, needs {w.need}:1). You can still save.</p>
                ))}
              </div>
            )}
          </Section>

          <Section title="Dark mode" hint="Whether people can switch to dark, and its colours.">
            <div className="mb-3 flex flex-wrap gap-2">
              {([["user_choice", "Each user chooses"], ["system", "Follow the device"], ["off", "Always light"]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => set("dark_mode", v)} className={`rounded-lg border px-3 py-1.5 text-sm ${view.dark_mode === v ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 bg-white text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
            {view.dark_mode !== "off" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ColorField label="Primary in dark" value={dk.primary || ""} fallback={view.colors.primary} onChange={(v) => setIn("dark", "primary", v)} />
                <ColorField label="Background" value={dk.background || ""} fallback={defaults.dark.background} onChange={(v) => setIn("dark", "background", v)} />
                <ColorField label="Cards" value={dk.surface || ""} fallback={defaults.dark.surface} onChange={(v) => setIn("dark", "surface", v)} />
                <ColorField label="Sidebar" value={dk.sidebar_bg || ""} fallback={defaults.dark.sidebar_bg} onChange={(v) => setIn("dark", "sidebar_bg", v)} />
              </div>
            )}
          </Section>

          <Section title="Type & corners">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Font
                <select value={draft.font_family || ""} onChange={(e) => set("font_family", e.target.value)} className={input}>
                  <option value="">Default ({defaults.font_family})</option>
                  {FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <div className="flex flex-col gap-1 text-xs font-medium text-slate-600">Corners
                <div className="flex gap-2">
                  {(["sm", "md", "lg"] as const).map((r) => (
                    <button key={r} type="button" onClick={() => set("radius", r)} className={`flex-1 border px-3 py-2 text-sm ${view.radius === r ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 bg-white text-slate-700"}`} style={{ borderRadius: r === "sm" ? 4 : r === "md" ? 8 : 14 }}>
                      {r === "sm" ? "Sharp" : r === "md" ? "Rounded" : "Soft"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Sign-in page" hint={companySlug && scope === "company" ? "Share this address with your staff:" : "The platform sign-in page."}>
            {companySlug && scope === "company" && (
              <a href={`/${companySlug}/login`} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
                {window.location.origin}/{companySlug}/login <ExternalLink size={13} />
              </a>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Welcome title
                <input value={lg.welcome_title || ""} placeholder={defaults.login.welcome_title} maxLength={80} onChange={(e) => setIn("login", "welcome_title", e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Welcome text
                <input value={lg.welcome_text || ""} placeholder={defaults.login.welcome_text} maxLength={240} onChange={(e) => setIn("login", "welcome_text", e.target.value)} className={input} />
              </label>
            </div>
            <div className="mt-3">
              <ImageField label="Background image" hint="Optional, up to 2 MB" kind="login_background" scope={scope} value={lg.background_url || ""} onChange={(v) => setIn("login", "background_url", v)} />
            </div>
          </Section>

          <Section title="Emails" hint="Every email (invitations, interview invites, codes) uses your logo, colour and footer.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600"><span className="flex items-center gap-1"><Mail size={12} /> Sender name</span>
                <input value={em.from_name || ""} placeholder={defaults.email?.from_name || "Your company name"} maxLength={80} onChange={(e) => setIn("email", "from_name", e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Reply-to address
                <input type="email" value={em.reply_to || ""} placeholder="hr@yourcompany.com" maxLength={120} onChange={(e) => setIn("email", "reply_to", e.target.value)} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">Footer
                <textarea rows={2} value={em.footer_text || ""} placeholder="Company address, website, unsubscribe note…" maxLength={500} onChange={(e) => setIn("email", "footer_text", e.target.value)} className={input} />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Emails are sent from the address in Email Configuration; the sender name and reply-to come from here.</p>
          </Section>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p>
          <Preview b={view} />
          {dirty && <p className="mt-3 text-xs text-amber-700">You have unsaved changes.</p>}
        </aside>
      </div>
    </div>
  );
}
