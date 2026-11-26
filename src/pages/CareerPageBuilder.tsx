import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check, CheckCircle2, Code2, Copy, ExternalLink, Eye, GripVertical, ImagePlus, Loader2, Monitor, Plus, RotateCcw,
  Save, Send, Smartphone, Tablet, Trash2, Upload, X,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { useTheme } from "../theme/ThemeProvider";
import { careerAssetUrl, type CareerItem, type CareerLink, type CareerPageContent, type CareerSection, type CareerSectionType } from "../careers/api";
import { CAREER_ICONS } from "../careers/icons";
import {
  discardCareerDraft,
  fetchCareerDomains,
  fetchCareerPageAdmin,
  fetchPublicCareerPage,
  publishCareerPage,
  saveBranding,
  saveCareerDraft,
  uploadBrandingImage,
  type CareerPageAdmin,
} from "../utils/adminApi";
import { PREVIEW_MESSAGE } from "./CareerPagePreviewFrame";

/**
 * Career Page Builder (SRS Screen 15, as in the mockup): page sections with on/off switches and their settings on
 * the left, a live desktop / tablet / phone preview in the middle, and page status, template, brand colours and
 * images on the right. Changes are a draft until published.
 */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";
const ADDABLE: CareerSectionType[] = ["highlights", "about", "culture", "life", "benefits", "testimonials", "faq", "gallery", "video"];
const LABELS: Record<CareerSectionType, string> = {
  open_positions: "Open Positions",
  about: "About Us",
  culture: "Our Culture",
  life: "Life at the Company",
  benefits: "Why Work With Us",
  testimonials: "Employee Testimonials",
  faq: "FAQs",
  gallery: "Workplace Gallery",
  video: "Culture Video",
  highlights: "Highlights Strip",
};
const ITEM_TYPES = ["life", "benefits", "testimonials", "faq", "highlights"];
const ICON_TYPES = ["life", "benefits", "highlights"];
const HEX = /^#[0-9a-fA-F]{6}$/;

const me = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">{label} {hint && <span className="font-normal text-slate-400">· {hint}</span>}</span>
      {children}
    </label>
  );
}

function Panel({ title, action, children, className = "" }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-indigo-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function ImageInput({ value, onChange, label, kind = "career_image", wide = false }: { value: string; onChange: (url: string) => void; label: string; kind?: "career_image" | "logo" | "favicon"; wide?: boolean }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await uploadBrandingImage(kind, file)).url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${wide ? "w-24" : "w-14"}`}>
        {value ? <img src={careerAssetUrl(value)} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={16} className="text-slate-300" />}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {value ? "Change" : label}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {value && <button type="button" onClick={() => onChange("")} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Remove image"><X size={13} /></button>}
    </div>
  );
}

function LinksEditor({ value, onChange }: { value: CareerLink[]; onChange: (v: CareerLink[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={i} className="flex gap-2">
          <input value={l.label} maxLength={40} placeholder="Label" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className={`${input} w-28`} />
          <input value={l.url} maxLength={300} placeholder="https://" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} className={input} />
          <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Remove link"><X size={14} /></button>
        </div>
      ))}
      {value.length < 8 && <button type="button" onClick={() => onChange([...value, { label: "", url: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus size={12} /> Add link</button>}
    </div>
  );
}

/** Where a button goes: one of the page's sections, or a link. */
function TargetInput({ value, onChange, sections }: { value: string; onChange: (v: string) => void; sections: CareerSection[] }) {
  const isLink = !!value && !value.startsWith("#");
  return (
    <div className="space-y-1.5">
      <select value={isLink ? "link" : value} onChange={(e) => onChange(e.target.value === "link" ? "https://" : e.target.value)} className={input}>
        <option value="">Choose…</option>
        {sections.filter((s) => s.visible).map((s) => <option key={s.id} value={`#${s.id}`}>Section: {s.title || LABELS[s.type]}</option>)}
        <option value="link">A link (video, website…)</option>
      </select>
      {isLink && <input value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={input} />}
    </div>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${input} w-32 py-1.5 text-xs`} aria-label="Icon">
      <option value="">Auto icon</option>
      {Object.entries(CAREER_ICONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>
  );
}

/** The editable fields of one section. */
function SectionEditor({ section, onChange }: { section: CareerSection; onChange: (s: CareerSection) => void }) {
  const set = (patch: Partial<CareerSection>) => onChange({ ...section, ...patch });
  const items = section.items || [];
  const setItem = (i: number, patch: Partial<CareerItem>) => set({ items: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const blank: Record<string, CareerItem> = {
    life: { title: "", text: "", image_url: "", icon: "" },
    benefits: { title: "", text: "", icon: "" },
    highlights: { title: "", icon: "" },
    testimonials: { name: "", role: "", quote: "", photo_url: "" },
    faq: { q: "", a: "" },
  };
  const stats = section.stats || [];
  return (
    <div className="space-y-3">
      {section.type !== "highlights" && <Field label="Heading"><input value={section.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={input} /></Field>}
      {section.type === "open_positions" && (
        <Field label="Subheading"><input value={section.subtitle || ""} maxLength={300} onChange={(e) => set({ subtitle: e.target.value })} className={input} /></Field>
      )}
      {(section.type === "about" || section.type === "culture") && (
        <Field label="Text" hint="blank lines start a new paragraph"><textarea rows={5} maxLength={5000} value={section.text || ""} onChange={(e) => set({ text: e.target.value })} className={input} /></Field>
      )}
      {section.type === "about" && (
        <>
          <Field label="Figures" hint="up to 4, e.g. 200+ · Team Members">
            <div className="space-y-1.5">
              {stats.map((st, i) => (
                <div key={i} className="flex gap-1.5">
                  <input value={st.value} maxLength={20} placeholder="10+" onChange={(e) => set({ stats: stats.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} className={`${input} w-20`} />
                  <input value={st.label} maxLength={40} placeholder="Years" onChange={(e) => set({ stats: stats.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className={input} />
                  <button type="button" onClick={() => set({ stats: stats.filter((_, k) => k !== i) })} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Remove figure"><X size={14} /></button>
                </div>
              ))}
              {stats.length < 4 && <button type="button" onClick={() => set({ stats: [...stats, { value: "", label: "" }] })} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus size={12} /> Add figure</button>}
            </div>
          </Field>
          <Field label="Photo"><ImageInput label="Upload" value={section.image_url || ""} onChange={(v) => set({ image_url: v })} wide /></Field>
          <Field label="Video" hint="YouTube or Vimeo; plays over the photo">
            <input value={section.video_url || ""} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => set({ video_url: e.target.value })} className={input} />
          </Field>
        </>
      )}
      {section.type === "culture" && <ImageInput label="Image" value={section.image_url || ""} onChange={(v) => set({ image_url: v })} wide />}
      {section.type === "video" && (
        <Field label="YouTube or Vimeo link"><input value={section.url || ""} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => set({ url: e.target.value })} className={input} /></Field>
      )}
      {section.type === "gallery" && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {(section.images || []).map((src, i) => (
              <div key={i} className="group relative h-14 overflow-hidden rounded-lg border border-slate-200">
                <img src={careerAssetUrl(src)} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => set({ images: (section.images || []).filter((_, k) => k !== i) })} className="absolute right-1 top-1 hidden rounded bg-white/90 p-0.5 text-slate-600 group-hover:block" aria-label="Remove photo"><X size={12} /></button>
              </div>
            ))}
          </div>
          {(section.images || []).length < 12 && <ImageInput label="Add photo" value="" onChange={(v) => v && set({ images: [...(section.images || []), v] })} />}
        </div>
      )}
      {section.type in blank && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {section.type === "faq" ? (
                <>
                  <div className="flex gap-1.5"><input value={it.q || ""} maxLength={200} placeholder="Question" onChange={(e) => setItem(i, { q: e.target.value })} className={input} /><RemoveItem onClick={() => set({ items: items.filter((_, k) => k !== i) })} /></div>
                  <textarea rows={2} value={it.a || ""} maxLength={1500} placeholder="Answer" onChange={(e) => setItem(i, { a: e.target.value })} className={input} />
                </>
              ) : section.type === "testimonials" ? (
                <>
                  <div className="flex gap-1.5">
                    <input value={it.name || ""} maxLength={80} placeholder="Name" onChange={(e) => setItem(i, { name: e.target.value })} className={input} />
                    <input value={it.role || ""} maxLength={80} placeholder="Role" onChange={(e) => setItem(i, { role: e.target.value })} className={input} />
                    <RemoveItem onClick={() => set({ items: items.filter((_, k) => k !== i) })} />
                  </div>
                  <textarea rows={2} value={it.quote || ""} maxLength={600} placeholder="What they say about working here" onChange={(e) => setItem(i, { quote: e.target.value })} className={input} />
                  <ImageInput label="Photo" value={it.photo_url || ""} onChange={(v) => setItem(i, { photo_url: v })} />
                </>
              ) : (
                <>
                  <div className="flex gap-1.5">
                    <input value={it.title || ""} maxLength={80} placeholder="Title" onChange={(e) => setItem(i, { title: e.target.value })} className={input} />
                    {ICON_TYPES.includes(section.type) && <IconSelect value={it.icon || ""} onChange={(v) => setItem(i, { icon: v })} />}
                    <RemoveItem onClick={() => set({ items: items.filter((_, k) => k !== i) })} />
                  </div>
                  {section.type !== "highlights" && <textarea rows={2} value={it.text || ""} maxLength={600} placeholder="Short description" onChange={(e) => setItem(i, { text: e.target.value })} className={input} />}
                  {section.type === "life" && <ImageInput label="Image" value={it.image_url || ""} onChange={(v) => setItem(i, { image_url: v })} />}
                </>
              )}
            </div>
          ))}
          {items.length < 12 && (
            <button type="button" onClick={() => set({ items: [...items, { ...blank[section.type] }] })} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
              <Plus size={12} /> Add {section.type === "faq" ? "question" : section.type === "testimonials" ? "story" : "item"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RemoveItem({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove item"><Trash2 size={14} /></button>;
}

/** Small drawings of the three templates. */
function TemplateThumb({ kind, on, onClick }: { kind: CareerPageContent["template"]; on: boolean; onClick: () => void }) {
  const hero = kind === "modern" ? "bg-[var(--sidebar-bg)]" : kind === "classic" ? "bg-gradient-to-r from-[var(--sidebar-bg)] to-indigo-500" : "bg-white";
  return (
    <button type="button" onClick={onClick} className={`relative overflow-hidden rounded-xl border-2 text-left ${on ? "border-indigo-600" : "border-slate-200 hover:border-slate-300"}`}>
      <div className="h-2 border-b border-slate-100 bg-white" />
      <div className={`h-9 ${hero} ${kind === "minimal" ? "border-b border-slate-200" : ""}`}>
        <div className={`ml-2 mt-2 h-1.5 w-12 rounded ${kind === "minimal" ? "bg-slate-700" : "bg-white/90"}`} />
        <div className={`ml-2 mt-1 h-1 w-8 rounded ${kind === "minimal" ? "bg-slate-300" : "bg-white/60"}`} />
      </div>
      <div className="space-y-1 bg-slate-50 p-2">
        <div className="h-1.5 w-full rounded bg-slate-200" />
        <div className="h-1.5 w-3/4 rounded bg-slate-200" />
      </div>
      <p className="bg-white px-2 py-1 text-[11px] font-semibold capitalize text-slate-700">{kind}</p>
      {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white"><Check size={12} /></span>}
    </button>
  );
}

type Tab = "design" | "jobs" | "page" | "seo";
type Device = "desktop" | "tablet" | "mobile";

export default function CareerPageBuilder() {
  const { toast, confirm } = useFeedback();
  const { branding, refresh: refreshTheme } = useTheme();
  const slug: string = me().company_slug || "";
  const [admin, setAdmin] = useState<CareerPageAdmin | null>(null);
  const [draft, setDraft] = useState<CareerPageContent | null>(null);
  const [company, setCompany] = useState<import("../careers/api").CareerCompany | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [selected, setSelected] = useState<string>("hero");
  const [device, setDevice] = useState<Device>("desktop");
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | "brand" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [colors, setColors] = useState({ primary: branding.colors.primary, secondary: branding.colors.secondary, text: branding.colors.text, background: branding.colors.background });
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setColors({ primary: branding.colors.primary, secondary: branding.colors.secondary, text: branding.colors.text, background: branding.colors.background });
  }, [branding.colors.primary, branding.colors.secondary, branding.colors.text, branding.colors.background]);

  const load = useCallback(async () => {
    try {
      const data = await fetchCareerPageAdmin();
      setAdmin(data);
      setDraft(data.draft);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the career page.", "error");
    }
  }, [toast]);

  useEffect(() => {
    load();
    if (slug) fetchPublicCareerPage(slug).then((p) => setCompany(p.company)).catch(() => undefined);
    fetchCareerDomains()
      .then((d) => setLiveUrl(d.custom_status === "verified" ? `https://${d.custom_domain}` : d.subdomain_enabled ? `https://${d.subdomain}` : ""))
      .catch(() => undefined);
  }, [load, slug]);

  const careersUrl = liveUrl || (slug ? `${window.location.origin}/careers/${slug}` : "");
  const dirty = useMemo(() => !!admin && JSON.stringify(draft) !== JSON.stringify(admin.draft), [admin, draft]);
  const colorsDirty = colors.primary !== branding.colors.primary || colors.secondary !== branding.colors.secondary || colors.text !== branding.colors.text || colors.background !== branding.colors.background;
  const colorsValid = Object.values(colors).every((c) => HEX.test(c));

  // Live preview: the draft and the colours being edited go into the preview frame (same site only).
  const send = useCallback(() => {
    if (!draft || !frame.current?.contentWindow) return;
    const previewColors = colorsValid ? { ...branding.colors, ...colors } : branding.colors;
    frame.current.contentWindow.postMessage(
      { type: PREVIEW_MESSAGE, preview: { content: draft, branding: { ...branding, colors: previewColors }, company } },
      window.location.origin
    );
  }, [draft, branding, company, colors, colorsValid]);
  useEffect(() => {
    const t = setTimeout(send, 150);
    return () => clearTimeout(t);
  }, [send]);
  useEffect(() => {
    const onReady = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === `${PREVIEW_MESSAGE}-ready`) send();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [send]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!draft || !admin) {
    return <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading the career page…</p>;
  }

  const set = <K extends keyof CareerPageContent>(key: K, value: CareerPageContent[K]) => setDraft({ ...draft, [key]: value });
  const setHero = (patch: Partial<CareerPageContent["hero"]>) => set("hero", { ...draft.hero, ...patch });
  const setSection = (id: string, s: CareerSection) => set("sections", draft.sections.map((x) => (x.id === id ? s : x)));
  const addSection = (type: CareerSectionType) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const base: CareerSection = { id, type, visible: true, title: LABELS[type] };
    if (ITEM_TYPES.includes(type)) base.items = [];
    if (type === "gallery") base.images = [];
    if (type === "video") base.url = "";
    if (type === "about") Object.assign(base, { text: "", stats: [], image_url: "", video_url: "" });
    if (type === "culture") base.text = "";
    // The highlights strip sits right under the banner.
    set("sections", type === "highlights" ? [base, ...draft.sections] : [...draft.sections, base]);
    setSelected(id);
    setTab("design");
  };
  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = [...draft.sections];
    const from = list.findIndex((s) => s.id === fromId);
    const to = list.findIndex((s) => s.id === toId);
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    set("sections", list);
  };

  const save = async () => {
    setBusy("save");
    try {
      const data = await saveCareerDraft(draft);
      setAdmin(data);
      setDraft(data.draft);
      toast("Draft saved. Candidates still see the published page.", "success");
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save.", "error");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const publish = async () => {
    if (dirty && !(await save())) return;
    if (!(await confirm({ title: "Publish the career page?", message: "Candidates will see these changes straight away.", confirmLabel: "Publish" }))) return;
    setBusy("publish");
    try {
      const data = await publishCareerPage();
      setAdmin(data);
      setDraft(data.draft);
      toast("Career page published.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not publish.", "error");
    } finally {
      setBusy(null);
    }
  };
  const discard = async () => {
    if (!(await confirm({ title: "Discard unpublished changes?", message: "The draft goes back to what candidates see now.", confirmLabel: "Discard", danger: true }))) return;
    setBusy("discard");
    try {
      const data = await discardCareerDraft();
      setAdmin(data);
      setDraft(data.draft);
    } finally {
      setBusy(null);
    }
  };
  /** Colours, logo and favicon are the company's branding (also used in the portal and emails). */
  const saveBrand = async (changes: Parameters<typeof saveBranding>[0], message: string) => {
    setBusy("brand");
    try {
      await saveBranding(changes);
      await refreshTheme();
      toast(message, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the branding.", "error");
    } finally {
      setBusy(null);
    }
  };

  const published = !dirty && !admin.has_unpublished_changes;
  const statusText = dirty ? "Unsaved changes" : admin.has_unpublished_changes ? "Draft saved, not published" : "Published";
  const selectedSection = draft.sections.find((s) => s.id === selected);
  const previewWidth = device === "mobile" ? "max-w-[390px]" : device === "tablet" ? "max-w-[820px]" : "max-w-none";

  return (
    <div className="space-y-4 font-sans text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Career Page Builder</h1>
          <p className="text-sm text-slate-500">Create a branded career page for your company, customize content, design and publish job openings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {slug && <a href={`/careers/${slug}/preview`} onClick={(e) => { e.preventDefault(); setDevice("desktop"); frame.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><Eye size={15} /> Preview</a>}
          {careersUrl && <a href={careersUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"><ExternalLink size={15} /> View Live Page</a>}
          {(dirty || admin.has_unpublished_changes) && <button onClick={discard} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={15} /> Discard</button>}
          <button onClick={save} disabled={!dirty || !!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">{busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save Draft</button>
          <button onClick={publish} disabled={(!dirty && !admin.has_unpublished_changes) || !!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publish / Update</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {([["design", "Design & Content"], ["jobs", "Job Listings"], ["page", "Page Settings"], ["seo", "SEO & Sharing"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_270px]">
        {/* Left: content */}
        <div className="space-y-4">
          {tab === "design" && (
            <>
              <Panel title="Page Sections">
                <ul className="-mx-1 space-y-1">
                  <li>
                    <button onClick={() => setSelected("hero")} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${selected === "hero" ? "bg-indigo-50 font-semibold text-indigo-800" : "hover:bg-slate-50"}`}>
                      <GripVertical size={14} className="text-slate-200" /> <span className="flex-1">Hero Banner</span> <Switch on label="Hero banner is always shown" onChange={() => undefined} disabled />
                    </button>
                  </li>
                  {draft.sections.map((s) => (
                    <li
                      key={s.id}
                      draggable
                      onDragStart={() => setDragId(s.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => dragId && move(dragId, s.id)}
                      onDragEnd={() => setDragId(null)}
                      className={dragId === s.id ? "opacity-50" : ""}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(s.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelected(s.id)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${selected === s.id ? "bg-indigo-50 font-semibold text-indigo-800" : "hover:bg-slate-50"}`}
                      >
                        <GripVertical size={14} className="cursor-grab text-slate-300" aria-label="Drag to reorder" />
                        <span className={`min-w-0 flex-1 truncate ${s.visible ? "" : "text-slate-400"}`}>{s.type === "highlights" ? LABELS.highlights : s.title || LABELS[s.type]}</span>
                        {s.type !== "open_positions" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); set("sections", draft.sections.filter((x) => x.id !== s.id)); if (selected === s.id) setSelected("hero"); }} className="rounded p-0.5 text-slate-300 hover:text-rose-600" aria-label={`Remove ${s.title}`}><Trash2 size={13} /></button>
                        )}
                        <Switch on={s.visible} disabled={s.type === "open_positions"} label={s.visible ? `Hide ${s.title}` : `Show ${s.title}`} onChange={(v) => setSection(s.id, { ...s, visible: v })} />
                      </div>
                    </li>
                  ))}
                </ul>
                <select
                  value=""
                  onChange={(e) => e.target.value && addSection(e.target.value as CareerSectionType)}
                  className="mt-3 w-full rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2 text-center text-sm font-semibold text-indigo-700"
                  aria-label="Add a section"
                >
                  <option value="">+ Add Section</option>
                  {ADDABLE.map((t) => <option key={t} value={t}>{LABELS[t]}</option>)}
                </select>
              </Panel>

              <Panel title={<>Section Settings – <span className="text-indigo-700">{selected === "hero" ? "Hero Banner" : selectedSection ? (selectedSection.type === "highlights" ? LABELS.highlights : selectedSection.title) : ""}</span></>}>
                {selected === "hero" ? (
                  <div className="space-y-3">
                    <Field label="Headline"><input value={draft.hero.title} maxLength={150} onChange={(e) => setHero({ title: e.target.value })} className={input} /></Field>
                    <Field label="Subheadline"><textarea rows={2} maxLength={300} value={draft.hero.subtitle} onChange={(e) => setHero({ subtitle: e.target.value })} className={input} /></Field>
                    <Field label="Small heading above"><input value={draft.hero.eyebrow} maxLength={100} onChange={(e) => setHero({ eyebrow: e.target.value })} className={input} /></Field>
                    <Field label="Banner image"><ImageInput label="Upload" value={draft.hero.banner_url} onChange={(v) => setHero({ banner_url: v })} wide /></Field>
                    <Field label="Layout">
                      <div className="grid grid-cols-2 gap-2">
                        {([["background", "Photo behind text"], ["split", "Text and photo side by side"]] as const).map(([k, label]) => (
                          <button key={k} type="button" onClick={() => setHero({ layout: k })} className={`rounded-lg border px-2 py-1.5 text-xs ${(draft.hero.layout || "background") === k ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300"}`}>{label}</button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Primary button"><input value={draft.hero.cta_label} maxLength={40} onChange={(e) => setHero({ cta_label: e.target.value })} className={input} /></Field>
                    <Field label="Secondary button" hint="optional">
                      <input value={draft.hero.secondary_cta_label || ""} maxLength={40} placeholder="Know Our Culture" onChange={(e) => setHero({ secondary_cta_label: e.target.value })} className={input} />
                    </Field>
                    {draft.hero.secondary_cta_label && (
                      <Field label="Secondary button goes to"><TargetInput value={draft.hero.secondary_cta_target || ""} onChange={(v) => setHero({ secondary_cta_target: v })} sections={draft.sections} /></Field>
                    )}
                    <Field label="Badge text" hint="short, e.g. People · Products · Impact"><input value={draft.hero.badge_text || ""} maxLength={60} onChange={(e) => setHero({ badge_text: e.target.value })} className={input} /></Field>
                  </div>
                ) : selectedSection ? (
                  <SectionEditor section={selectedSection} onChange={(next) => setSection(selectedSection.id, next)} />
                ) : (
                  <p className="text-sm text-slate-500">Choose a section above.</p>
                )}
              </Panel>
            </>
          )}

          {tab === "jobs" && (() => {
            const pos = draft.sections.find((s) => s.type === "open_positions");
            return (
              <Panel title="Job Listings">
                <div className="space-y-3">
                  {pos && <SectionEditor section={pos} onChange={(next) => setSection(pos.id, next)} />}
                  <Field label="Search box hint"><input value={draft.texts.search_placeholder} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, search_placeholder: e.target.value })} className={input} /></Field>
                  <Field label="When there are no open jobs"><input value={draft.texts.empty_message} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, empty_message: e.target.value })} className={input} /></Field>
                  <Field label="After applying: title"><input value={draft.texts.success_title} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, success_title: e.target.value })} className={input} /></Field>
                  <Field label="After applying: message"><textarea rows={2} maxLength={300} value={draft.texts.success_message} onChange={(e) => set("texts", { ...draft.texts, success_message: e.target.value })} className={input} /></Field>
                  <Field label="Job page closing banner: title"><input value={draft.texts.job_cta_title || ""} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, job_cta_title: e.target.value })} className={input} /></Field>
                  <Field label="Job page closing banner: text"><input value={draft.texts.job_cta_text || ""} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, job_cta_text: e.target.value })} className={input} /></Field>
                  <p className="text-xs text-slate-500">The jobs themselves come from <Link to="/job-openings" className="font-semibold text-indigo-600 hover:underline">Job Openings</Link>: published jobs that take applications are listed.</p>
                </div>
              </Panel>
            );
          })()}

          {tab === "page" && (
            <Panel title="Page Settings">
              <div className="space-y-5">
                <section className="space-y-2">
                  <label className="flex items-center justify-between text-sm font-semibold">Show header <Switch on={draft.header.show} label="Show header" onChange={(v) => set("header", { ...draft.header, show: v })} /></label>
                  <p className="text-xs text-slate-500">The menu lists the page's sections. Logo and name come from Branding.</p>
                  <Field label="Header button" hint="e.g. Join Our Team">
                    <input value={draft.header.cta?.label || ""} maxLength={30} onChange={(e) => set("header", { ...draft.header, cta: { target: draft.header.cta?.target || "#open_positions", label: e.target.value } })} className={input} />
                  </Field>
                  {draft.header.cta?.label && (
                    <Field label="Header button goes to"><TargetInput value={draft.header.cta?.target || ""} onChange={(v) => set("header", { ...draft.header, cta: { label: draft.header.cta?.label || "", target: v } })} sections={draft.sections} /></Field>
                  )}
                  <p className="pt-1 text-xs font-semibold text-slate-700">Extra menu links</p>
                  <LinksEditor value={draft.header.links} onChange={(links) => set("header", { ...draft.header, links })} />
                </section>
                <section className="space-y-3">
                  <label className="flex items-center justify-between text-sm font-semibold">Show footer <Switch on={draft.footer.show} label="Show footer" onChange={(v) => set("footer", { ...draft.footer, show: v })} /></label>
                  <Field label="About text" hint="empty: the company description"><textarea rows={2} maxLength={300} value={draft.footer.text} onChange={(e) => set("footer", { ...draft.footer, text: e.target.value })} className={input} /></Field>
                  <Field label="Website"><input value={draft.footer.website} placeholder="https://acme.com" onChange={(e) => set("footer", { ...draft.footer, website: e.target.value })} className={input} /></Field>
                  <Field label="Careers email"><input value={draft.footer.email} placeholder="careers@acme.com" onChange={(e) => set("footer", { ...draft.footer, email: e.target.value })} className={input} /></Field>
                  <Field label="LinkedIn"><input value={draft.footer.linkedin} placeholder="https://www.linkedin.com/company/…" onChange={(e) => set("footer", { ...draft.footer, linkedin: e.target.value })} className={input} /></Field>
                  <LinksEditor value={draft.footer.links} onChange={(links) => set("footer", { ...draft.footer, links })} />
                </section>
              </div>
            </Panel>
          )}

          {tab === "seo" && (
            <Panel title="SEO & Sharing">
              <div className="space-y-3">
                <p className="text-xs text-slate-500">How the page appears in search results and when its link is shared.</p>
                <Field label="Page title" hint={`${draft.seo.title.length}/70`}><input value={draft.seo.title} maxLength={70} onChange={(e) => set("seo", { ...draft.seo, title: e.target.value })} className={input} /></Field>
                <Field label="Description" hint={`${draft.seo.description.length}/160`}><textarea rows={3} maxLength={160} value={draft.seo.description} onChange={(e) => set("seo", { ...draft.seo, description: e.target.value })} className={input} /></Field>
                <Field label="Share image"><ImageInput label="Upload" value={draft.seo.share_image_url} onChange={(v) => set("seo", { ...draft.seo, share_image_url: v })} wide /></Field>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="truncate text-sm font-medium text-indigo-700">{draft.seo.title || draft.hero.eyebrow}</p>
                  <p className="truncate text-xs text-emerald-700">{careersUrl}</p>
                  <p className="line-clamp-2 text-xs text-slate-600">{draft.seo.description}</p>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* Middle: preview */}
        <section className="flex min-h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-0 xl:h-[calc(100vh-170px)]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-bold text-slate-900">Career Page Preview <span className="font-normal capitalize text-slate-500">({device})</span></h2>
            <div className="flex gap-1">
              {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
                <button key={d} onClick={() => setDevice(d)} className={`rounded-lg border p-1.5 ${device === d ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`} aria-label={`${d} preview`}><Icon size={15} /></button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 bg-slate-100 p-3">
            <div className={`mx-auto h-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm transition-all ${previewWidth}`}>
              {slug ? (
                <iframe ref={frame} title="Career page preview" src={`/careers/${slug}/preview`} className="h-full w-full" onLoad={send} />
              ) : (
                <p className="p-6 text-sm text-slate-500">Sign in again to see the preview.</p>
              )}
            </div>
          </div>
        </section>

        {/* Right: status, template, branding */}
        <div className="space-y-4">
          <Panel
            title="Page Status"
            action={
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${published ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {published ? <CheckCircle2 size={12} /> : null}{statusText}
              </span>
            }
          >
            <p className="text-xs text-slate-500">{admin.published_at ? `Last published ${new Date(admin.published_at).toLocaleString()}` : "Not published yet"}</p>
            <p className="mt-3 text-xs font-semibold text-slate-700">Career Page URL</p>
            <div className="mt-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{careersUrl}</span>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(careersUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    // select and copy by hand
                  }
                }}
                className="rounded p-1 text-slate-500 hover:bg-white"
                aria-label="Copy the address"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <Link to="/career-page/integrate" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"><Code2 size={12} /> Add to your website · own domain</Link>
          </Panel>

          <Panel title="Choose a Template">
            <div className="grid grid-cols-3 gap-2">
              {(["classic", "modern", "minimal"] as const).map((t) => <TemplateThumb key={t} kind={t} on={draft.template === t} onClick={() => set("template", t)} />)}
            </div>
          </Panel>

          <Panel
            title="Brand Customization"
            action={colorsDirty && (
              <button disabled={!colorsValid || busy === "brand"} onClick={() => saveBrand({ colors }, "Colours saved for the portal, careers page and emails.")} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
                {busy === "brand" ? <Loader2 size={12} className="animate-spin" /> : "Save"}
              </button>
            )}
          >
            <div className="space-y-2">
              {([["primary", "Primary Color"], ["secondary", "Secondary Color"], ["text", "Text Color"], ["background", "Background"]] as const).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-slate-700">{label}</span>
                  <input type="color" value={HEX.test(colors[k]) ? colors[k] : "#000000"} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} className="h-7 w-8 cursor-pointer rounded border border-slate-300" aria-label={label} />
                  <input value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} className={`w-[88px] rounded-md border px-2 py-1 font-mono text-xs ${HEX.test(colors[k]) ? "border-slate-300" : "border-rose-400"}`} />
                </div>
              ))}
              {colorsDirty && <p className="text-[11px] text-slate-500">The preview shows the new colours. Save to use them everywhere.</p>}
            </div>
          </Panel>

          <Panel title="Company Branding">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-700">Company Logo</span>
                <ImageInput kind="logo" label="Upload" value={branding.logo_url} onChange={(v) => saveBrand({ logo_url: v }, v ? "Logo updated." : "Logo removed.")} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-700">Favicon</span>
                <ImageInput kind="favicon" label="Upload" value={branding.favicon_url} onChange={(v) => saveBrand({ favicon_url: v }, v ? "Favicon updated." : "Favicon removed.")} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-700">Banner / OG Image</span>
                <ImageInput label="Upload" value={draft.hero.banner_url} onChange={(v) => setDraft({ ...draft, hero: { ...draft.hero, banner_url: v }, seo: { ...draft.seo, share_image_url: draft.seo.share_image_url || v } })} />
              </div>
              <p className="text-[11px] text-slate-400">More (dark mode, sign-in page, emails) in <Link to="/settings?tab=branding" className="font-semibold text-indigo-600 hover:underline">Settings → Branding</Link>.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
