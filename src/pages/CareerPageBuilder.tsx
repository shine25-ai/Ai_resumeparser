import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useFeedback } from "../components/ui/Feedback";
import { useTheme } from "../theme/ThemeProvider";
import { careerAssetUrl, type CareerItem, type CareerLink, type CareerPageContent, type CareerSection, type CareerSectionType } from "../careers/api";
import {
  discardCareerDraft,
  fetchCareerPageAdmin,
  fetchPublicCareerPage,
  publishCareerPage,
  saveCareerDraft,
  uploadBrandingImage,
  type CareerPageAdmin,
} from "../utils/adminApi";
import { PREVIEW_MESSAGE } from "./CareerPagePreviewFrame";

/** Career page builder (SRS Screen 15): sections, content, SEO, live desktop/phone preview, draft → publish. */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none";
const ADDABLE: CareerSectionType[] = ["about", "culture", "life", "benefits", "testimonials", "faq", "gallery", "video"];
const LABELS: Record<CareerSectionType, string> = {
  open_positions: "Open positions",
  about: "About us",
  culture: "Our culture",
  life: "Life at the company",
  benefits: "Benefits",
  testimonials: "Employee stories",
  faq: "FAQs",
  gallery: "Workplace gallery",
  video: "Culture video",
};

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
      <span className="text-xs font-medium text-slate-600">{label} {hint && <span className="font-normal text-slate-400">· {hint}</span>}</span>
      {children}
    </label>
  );
}

function ImageInput({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange((await uploadBrandingImage("career_image", file)).url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {value ? <img src={careerAssetUrl(value)} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={16} className="text-slate-300" />}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {label}
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
          <input value={l.label} maxLength={40} placeholder="Label" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} className={`${input} w-32`} />
          <input value={l.url} maxLength={300} placeholder="https://" onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} className={input} />
          <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Remove link"><X size={14} /></button>
        </div>
      ))}
      {value.length < 8 && <button type="button" onClick={() => onChange([...value, { label: "", url: "" }])} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus size={12} /> Add link</button>}
    </div>
  );
}

/** The editable fields of one section. */
function SectionEditor({ section, onChange }: { section: CareerSection; onChange: (s: CareerSection) => void }) {
  const set = (patch: Partial<CareerSection>) => onChange({ ...section, ...patch });
  const items = section.items || [];
  const setItem = (i: number, patch: Partial<CareerItem>) => set({ items: items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const blank: Record<string, CareerItem> = {
    life: { title: "", text: "", image_url: "" },
    benefits: { title: "", text: "" },
    testimonials: { name: "", role: "", quote: "", photo_url: "" },
    faq: { q: "", a: "" },
  };
  return (
    <div className="space-y-3">
      <Field label="Heading"><input value={section.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={input} /></Field>
      {section.type === "open_positions" && (
        <Field label="Subheading"><input value={section.subtitle || ""} maxLength={300} onChange={(e) => set({ subtitle: e.target.value })} className={input} /></Field>
      )}
      {(section.type === "about" || section.type === "culture") && (
        <Field label="Text" hint="blank lines start a new paragraph"><textarea rows={5} maxLength={5000} value={section.text || ""} onChange={(e) => set({ text: e.target.value })} className={input} /></Field>
      )}
      {section.type === "culture" && <ImageInput label="Image" value={section.image_url || ""} onChange={(v) => set({ image_url: v })} />}
      {section.type === "video" && (
        <Field label="YouTube or Vimeo link"><input value={section.url || ""} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => set({ url: e.target.value })} className={input} /></Field>
      )}
      {section.type === "gallery" && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {(section.images || []).map((src, i) => (
              <div key={i} className="group relative h-16 overflow-hidden rounded-lg border border-slate-200">
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
              <div className="flex justify-end"><button type="button" onClick={() => set({ items: items.filter((_, k) => k !== i) })} className="text-slate-400 hover:text-rose-600" aria-label="Remove item"><Trash2 size={13} /></button></div>
              {section.type === "faq" ? (
                <>
                  <input value={it.q || ""} maxLength={200} placeholder="Question" onChange={(e) => setItem(i, { q: e.target.value })} className={input} />
                  <textarea rows={2} value={it.a || ""} maxLength={1500} placeholder="Answer" onChange={(e) => setItem(i, { a: e.target.value })} className={input} />
                </>
              ) : section.type === "testimonials" ? (
                <>
                  <div className="flex gap-2">
                    <input value={it.name || ""} maxLength={80} placeholder="Name" onChange={(e) => setItem(i, { name: e.target.value })} className={input} />
                    <input value={it.role || ""} maxLength={80} placeholder="Role" onChange={(e) => setItem(i, { role: e.target.value })} className={input} />
                  </div>
                  <textarea rows={2} value={it.quote || ""} maxLength={600} placeholder="What they say about working here" onChange={(e) => setItem(i, { quote: e.target.value })} className={input} />
                  <ImageInput label="Photo" value={it.photo_url || ""} onChange={(v) => setItem(i, { photo_url: v })} />
                </>
              ) : (
                <>
                  <input value={it.title || ""} maxLength={80} placeholder="Title" onChange={(e) => setItem(i, { title: e.target.value })} className={input} />
                  <textarea rows={2} value={it.text || ""} maxLength={600} placeholder="Short description" onChange={(e) => setItem(i, { text: e.target.value })} className={input} />
                  {section.type === "life" && <ImageInput label="Image" value={it.image_url || ""} onChange={(v) => setItem(i, { image_url: v })} />}
                </>
              )}
            </div>
          ))}
          {items.length < 12 && (
            <button type="button" onClick={() => set({ items: [...items, { ...blank[section.type] }] })} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus size={12} /> Add {section.type === "faq" ? "question" : section.type === "testimonials" ? "story" : "item"}</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CareerPageBuilder() {
  const { toast, confirm } = useFeedback();
  const { branding } = useTheme();
  const slug: string = me().company_slug || "";
  const [admin, setAdmin] = useState<CareerPageAdmin | null>(null);
  const [draft, setDraft] = useState<CareerPageContent | null>(null);
  const [company, setCompany] = useState<import("../careers/api").CareerCompany | null>(null);
  const [tab, setTab] = useState<"sections" | "page" | "seo">("sections");
  const [open, setOpen] = useState<string | null>("hero");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);

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
  }, [load, slug]);

  const dirty = useMemo(() => !!admin && JSON.stringify(draft) !== JSON.stringify(admin.draft), [admin, draft]);

  // Live preview: send the draft into the preview frame (same site only).
  const send = useCallback(() => {
    if (!draft || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage(
      { type: PREVIEW_MESSAGE, preview: { content: draft, branding: { ...branding, colors: branding.colors }, company } },
      window.location.origin
    );
  }, [draft, branding, company]);
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
  const setSection = (id: string, s: CareerSection) => set("sections", draft.sections.map((x) => (x.id === id ? s : x)));
  const addSection = (type: CareerSectionType) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const base: CareerSection = { id, type, visible: true, title: LABELS[type] };
    if (["life", "benefits", "testimonials", "faq"].includes(type)) base.items = [];
    if (type === "gallery") base.images = [];
    if (type === "video") base.url = "";
    if (type === "about" || type === "culture") base.text = "";
    set("sections", [...draft.sections, base]);
    setOpen(id);
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

  const status = dirty
    ? "Unsaved changes"
    : admin.has_unpublished_changes
      ? "Draft saved, not published"
      : `Published ${admin.published_at ? new Date(admin.published_at).toLocaleString() : ""}`;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col font-sans text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Career page</h1>
          <p className={`text-xs ${dirty || admin.has_unpublished_changes ? "text-amber-700" : "text-slate-500"}`}>{status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={draft.template} onChange={(e) => set("template", e.target.value as CareerPageContent["template"])} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" aria-label="Template">
            <option value="classic">Classic template</option>
            <option value="modern">Modern template</option>
            <option value="minimal">Minimal template</option>
          </select>
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button onClick={() => setDevice("desktop")} className={`rounded-md p-1.5 ${device === "desktop" ? "bg-slate-100 text-slate-900" : "text-slate-400"}`} aria-label="Desktop preview"><Monitor size={15} /></button>
            <button onClick={() => setDevice("mobile")} className={`rounded-md p-1.5 ${device === "mobile" ? "bg-slate-100 text-slate-900" : "text-slate-400"}`} aria-label="Phone preview"><Smartphone size={15} /></button>
          </div>
          {slug && <a href={`/careers/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"><ExternalLink size={14} /> View live</a>}
          <Link to="/career-page/integrate" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"><Code2 size={14} /> Add to your website</Link>
          {(dirty || admin.has_unpublished_changes) && <button onClick={discard} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={14} /> Discard</button>}
          <button onClick={save} disabled={!dirty || !!busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft</button>
          <button onClick={publish} disabled={(!dirty && !admin.has_unpublished_changes) || !!busy} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">{busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish</button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white px-3 pt-2 text-sm">
            {(["sections", "page", "seo"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 font-medium ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"}`}>
                {t === "sections" ? "Sections" : t === "page" ? "Header, footer & text" : "SEO & sharing"}
              </button>
            ))}
          </div>

          {tab === "sections" && (
            <div className="space-y-2 p-3">
              {/* Hero */}
              <div className="rounded-xl border border-slate-200">
                <button onClick={() => setOpen(open === "hero" ? null : "hero")} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold">
                  {open === "hero" ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Hero banner
                </button>
                {open === "hero" && (
                  <div className="space-y-3 border-t border-slate-100 p-3">
                    <Field label="Small heading"><input value={draft.hero.eyebrow} maxLength={100} onChange={(e) => set("hero", { ...draft.hero, eyebrow: e.target.value })} className={input} /></Field>
                    <Field label="Headline"><input value={draft.hero.title} maxLength={150} onChange={(e) => set("hero", { ...draft.hero, title: e.target.value })} className={input} /></Field>
                    <Field label="Message"><textarea rows={2} maxLength={300} value={draft.hero.subtitle} onChange={(e) => set("hero", { ...draft.hero, subtitle: e.target.value })} className={input} /></Field>
                    <Field label="Button text"><input value={draft.hero.cta_label} maxLength={40} onChange={(e) => set("hero", { ...draft.hero, cta_label: e.target.value })} className={input} /></Field>
                    <ImageInput label="Banner image" value={draft.hero.banner_url} onChange={(v) => set("hero", { ...draft.hero, banner_url: v })} />
                  </div>
                )}
              </div>

              <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Page sections · drag to reorder</p>
              {draft.sections.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dragId && move(dragId, s.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`rounded-xl border bg-white ${dragId === s.id ? "border-indigo-400 opacity-60" : "border-slate-200"}`}
                >
                  <div className="flex items-center gap-1.5 px-2 py-2">
                    <span className="cursor-grab text-slate-300" title="Drag to reorder"><GripVertical size={15} /></span>
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} className="flex flex-1 items-center gap-1.5 text-left text-sm">
                      {open === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className={`font-medium ${s.visible ? "text-slate-800" : "text-slate-400 line-through"}`}>{s.title || LABELS[s.type]}</span>
                      <span className="text-[10px] text-slate-400">{LABELS[s.type]}</span>
                    </button>
                    {s.type !== "open_positions" && (
                      <>
                        <button onClick={() => setSection(s.id, { ...s, visible: !s.visible })} className="rounded p-1 text-slate-400 hover:bg-slate-100" title={s.visible ? "Hide" : "Show"} aria-label={s.visible ? `Hide ${s.title}` : `Show ${s.title}`}>{s.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                        <button onClick={() => set("sections", draft.sections.filter((x) => x.id !== s.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove" aria-label={`Remove ${s.title}`}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                  {open === s.id && <div className="border-t border-slate-100 p-3"><SectionEditor section={s} onChange={(next) => setSection(s.id, next)} /></div>}
                </div>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && addSection(e.target.value as CareerSectionType)}
                className="mt-1 w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600"
                aria-label="Add a section"
              >
                <option value="">+ Add a section…</option>
                {ADDABLE.map((t) => <option key={t} value={t}>{LABELS[t]}</option>)}
              </select>
            </div>
          )}

          {tab === "page" && (
            <div className="space-y-5 p-4">
              <section className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.header.show} onChange={(e) => set("header", { ...draft.header, show: e.target.checked })} className="accent-indigo-600" /> Show header</label>
                <p className="text-xs text-slate-500">Logo and name come from Settings → Branding. Extra menu links:</p>
                <LinksEditor value={draft.header.links} onChange={(links) => set("header", { ...draft.header, links })} />
              </section>
              <section className="space-y-3">
                <p className="text-sm font-semibold">Page text</p>
                <Field label="Search box hint"><input value={draft.texts.search_placeholder} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, search_placeholder: e.target.value })} className={input} /></Field>
                <Field label="When there are no open jobs"><input value={draft.texts.empty_message} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, empty_message: e.target.value })} className={input} /></Field>
                <Field label="After applying: title"><input value={draft.texts.success_title} maxLength={300} onChange={(e) => set("texts", { ...draft.texts, success_title: e.target.value })} className={input} /></Field>
                <Field label="After applying: message"><textarea rows={2} maxLength={300} value={draft.texts.success_message} onChange={(e) => set("texts", { ...draft.texts, success_message: e.target.value })} className={input} /></Field>
              </section>
              <section className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.footer.show} onChange={(e) => set("footer", { ...draft.footer, show: e.target.checked })} className="accent-indigo-600" /> Show footer</label>
                <Field label="About text" hint="empty: the company description"><textarea rows={2} maxLength={300} value={draft.footer.text} onChange={(e) => set("footer", { ...draft.footer, text: e.target.value })} className={input} /></Field>
                <Field label="Website"><input value={draft.footer.website} placeholder="https://acme.com" onChange={(e) => set("footer", { ...draft.footer, website: e.target.value })} className={input} /></Field>
                <Field label="Careers email"><input value={draft.footer.email} placeholder="careers@acme.com" onChange={(e) => set("footer", { ...draft.footer, email: e.target.value })} className={input} /></Field>
                <Field label="LinkedIn"><input value={draft.footer.linkedin} placeholder="https://www.linkedin.com/company/…" onChange={(e) => set("footer", { ...draft.footer, linkedin: e.target.value })} className={input} /></Field>
                <LinksEditor value={draft.footer.links} onChange={(links) => set("footer", { ...draft.footer, links })} />
              </section>
            </div>
          )}

          {tab === "seo" && (
            <div className="space-y-3 p-4">
              <p className="text-xs text-slate-500">How the page appears in search results and when its link is shared.</p>
              <Field label="Page title" hint={`${draft.seo.title.length}/70`}><input value={draft.seo.title} maxLength={70} onChange={(e) => set("seo", { ...draft.seo, title: e.target.value })} className={input} /></Field>
              <Field label="Description" hint={`${draft.seo.description.length}/160`}><textarea rows={3} maxLength={160} value={draft.seo.description} onChange={(e) => set("seo", { ...draft.seo, description: e.target.value })} className={input} /></Field>
              <ImageInput label="Share image" value={draft.seo.share_image_url} onChange={(v) => set("seo", { ...draft.seo, share_image_url: v })} />
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="truncate text-sm font-medium text-indigo-700">{draft.seo.title || draft.hero.eyebrow}</p>
                <p className="truncate text-xs text-emerald-700">{window.location.origin}/careers/{slug}</p>
                <p className="line-clamp-2 text-xs text-slate-600">{draft.seo.description}</p>
              </div>
            </div>
          )}
        </aside>

        <section className="min-h-0 overflow-auto bg-slate-100 p-4">
          <div className={`mx-auto h-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm transition-all ${device === "mobile" ? "max-w-[390px]" : "max-w-none"}`}>
            {slug ? (
              <iframe ref={frame} title="Career page preview" src={`/careers/${slug}/preview`} className="h-full w-full" onLoad={send} />
            ) : (
              <p className="p-6 text-sm text-slate-500">Sign in again to see the preview.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
