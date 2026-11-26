import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Copy,
  Globe,
  Hash,
  Laptop,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  Play,
  Quote,
  Share2,
  Sparkles,
  Star,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { careerAssetUrl, type CareerBranding, type CareerCompany, type CareerPageContent, type CareerSection, type PublicJob } from "./api";
import { Description } from "./components";
import { CareerIcon } from "./icons";

/**
 * The branded parts of the public careers page (SRS Screens 16 and 17, as in the mockups): header with section
 * links, hero, the builder's sections, footer, and the job page. Colours come from --cp-* variables set by
 * CareersPage. `onTarget` handles buttons that point at a section ("#about") or a link.
 */

export type GoTo = (target: string) => void;

export const brandVars = (branding?: CareerBranding | null): Record<string, string> => {
  const c = branding?.colors;
  return c
    ? {
        "--cp-brand": c.primary,
        "--cp-brand-dark": `color-mix(in oklab, ${c.primary} 82%, black)`,
        "--cp-brand-soft": `color-mix(in oklab, ${c.primary} 10%, white)`,
        "--cp-secondary": c.secondary || c.accent || c.primary,
        "--cp-text": c.text || "#0f172a",
        "--cp-bg": c.background,
        "--cp-dark": c.sidebar_bg,
      }
    : {};
};

// ── Header and footer ─────────────────────────────────────────────────────────

function BrandMark({ branding, company, size = "h-10" }: { branding?: CareerBranding | null; company?: CareerCompany | null; size?: string }) {
  const logo = careerAssetUrl(branding?.logo_url);
  const name = company?.short_name || company?.name || branding?.app_name || "Careers";
  return (
    <span className="flex items-center gap-2.5">
      {logo ? (
        <img src={logo} alt={name} className={`${size} w-auto max-w-[180px] object-contain`} draggable={false} />
      ) : (
        <span className={`flex ${size} aspect-square items-center justify-center rounded-lg bg-[var(--cp-brand)] text-white`}><Building2 size={18} /></span>
      )}
      {!logo && <span className="text-base font-bold text-slate-900">{name}</span>}
    </span>
  );
}

/** Short menu labels for the page's sections ("Life at Acme" → shown as is, long titles trimmed). */
const navLabel = (s: CareerSection) => {
  const t = s.title || s.type;
  return t.length > 22 ? `${t.slice(0, 20)}…` : t;
};

export function BrandedHeader({
  content,
  branding,
  company,
  homeHref,
  onHome,
  onTarget,
}: {
  content: CareerPageContent;
  branding?: CareerBranding | null;
  company?: CareerCompany | null;
  homeHref: string;
  onHome: () => void;
  onTarget: GoTo;
}) {
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    onHome();
  };
  // The page's own sections become menu items, as in the mockup (Home, About Us, Life at…, Open Positions, FAQs).
  const sectionLinks = content.sections.filter((s) => s.visible && s.type !== "highlights" && s.title).slice(0, 5);
  const cta = content.header.cta;
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href={homeHref} onClick={goHome} aria-label={`${company?.name || "Careers"} home`}><BrandMark branding={branding} company={company} /></a>
        <nav className="flex h-full min-w-0 items-center gap-5 overflow-x-auto text-sm font-medium [scrollbar-width:none]">
          <a href={homeHref} onClick={goHome} className="hidden h-full shrink-0 items-center border-b-2 border-transparent text-slate-700 hover:text-[var(--cp-brand)] md:flex">Home</a>
          {sectionLinks.map((s) => (
            <a
              key={s.id}
              href={`#cp-${s.id}`}
              onClick={(e) => { e.preventDefault(); onTarget(`#${s.id}`); }}
              className={`hidden h-full shrink-0 items-center border-b-2 lg:flex ${s.type === "open_positions" ? "border-[var(--cp-brand)] text-[var(--cp-brand)]" : "border-transparent text-slate-700 hover:text-[var(--cp-brand)]"}`}
            >
              {navLabel(s)}
            </a>
          ))}
          {content.header.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="hidden h-full shrink-0 items-center border-b-2 border-transparent text-slate-700 hover:text-[var(--cp-brand)] sm:flex">{l.label}</a>
          ))}
          {cta?.label && cta.target && (
            <button onClick={() => onTarget(cta.target)} className="shrink-0 rounded-lg bg-[var(--cp-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)]">{cta.label}</button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function BrandedFooter({ content, branding, company }: { content: CareerPageContent; branding?: CareerBranding | null; company?: CareerCompany | null }) {
  const f = content.footer;
  const site = f.website || company?.website;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="max-w-sm">
          <BrandMark branding={branding} company={company} />
          {(f.text || company?.description) && <p className="mt-4 text-sm leading-6 text-slate-600">{f.text || company?.description}</p>}
        </div>
        <ul className="space-y-2.5 text-sm text-slate-700">
          {site && <li className="flex items-center gap-2"><Globe size={14} className="text-slate-400" /><a href={site} target="_blank" rel="noreferrer" className="hover:text-[var(--cp-brand)]">{site.replace(/^https?:\/\//, "")}</a></li>}
          {f.linkedin && <li className="flex items-center gap-2"><Users size={14} className="text-slate-400" /><a href={f.linkedin} target="_blank" rel="noreferrer" className="hover:text-[var(--cp-brand)]">LinkedIn</a></li>}
          {f.email && <li className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /><a href={`mailto:${f.email}`} className="hover:text-[var(--cp-brand)]">{f.email}</a></li>}
          {f.links.map((l) => (
            <li key={l.url} className="flex items-center gap-2"><Link2 size={14} className="text-slate-400" /><a href={l.url} target="_blank" rel="noreferrer" className="hover:text-[var(--cp-brand)]">{l.label}</a></li>
          ))}
        </ul>
      </div>
      <div className="mx-auto max-w-6xl border-t border-slate-200 px-4 py-5 text-xs text-slate-500 sm:px-6">
        © {new Date().getFullYear()} {company?.name || branding?.app_name}. All rights reserved.
      </div>
    </footer>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

export function Hero({ content, onCta, onTarget, children }: { content: CareerPageContent; onCta: () => void; onTarget?: GoTo; children?: ReactNode }) {
  const { hero, template } = content;
  const banner = careerAssetUrl(hero.banner_url);
  const split = hero.layout === "split" && !!banner && template !== "minimal";
  const dark = !split && (template === "modern" || (!!banner && template !== "minimal"));
  const second = hero.secondary_cta_label && hero.secondary_cta_target && template !== "minimal";
  return (
    <section className={`relative overflow-hidden border-b border-slate-200 ${dark || split ? "bg-[var(--cp-dark)] text-white" : "bg-white"}`}>
      {banner && dark && <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      {dark && <div className="absolute inset-0 bg-gradient-to-r from-[var(--cp-dark)] via-[var(--cp-dark)]/80 to-transparent" />}
      {split && <div className="absolute inset-0 bg-gradient-to-br from-[var(--cp-dark)] to-[color-mix(in_oklab,var(--cp-brand)_45%,var(--cp-dark))]" />}
      <div className={`relative mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 ${split ? "py-10 md:grid-cols-[1.05fr_1fr] md:py-12" : template === "minimal" ? "py-8" : "py-14 md:py-20"}`}>
        <div>
          {hero.eyebrow && <p className={`text-[11px] font-semibold uppercase tracking-widest ${dark || split ? "text-white/80" : "text-[var(--cp-brand)]"}`}>{hero.eyebrow}</p>}
          <h1 className={`mt-2 max-w-3xl font-extrabold tracking-tight ${template === "minimal" ? "text-3xl" : "text-4xl md:text-5xl"} ${dark || split ? "text-white" : "text-slate-900"}`}>{hero.title}</h1>
          {hero.subtitle && <p className={`mt-3 max-w-2xl text-base ${dark || split ? "text-white/85" : "text-slate-600"}`}>{hero.subtitle}</p>}
          {template !== "minimal" && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={onCta} className="inline-flex items-center gap-2 rounded-lg bg-[var(--cp-brand)] px-5 py-3 text-sm font-semibold text-white shadow hover:bg-[var(--cp-brand-dark)]">
                {hero.cta_label} <ArrowRight size={16} />
              </button>
              {second && (
                <button
                  onClick={() => onTarget?.(hero.secondary_cta_target || "")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold ${dark || split ? "border-white/70 text-white hover:bg-white/10" : "border-slate-300 text-slate-800 hover:bg-slate-50"}`}
                >
                  {/(youtube|vimeo)/.test(hero.secondary_cta_target || "") && <Play size={15} />} {hero.secondary_cta_label}
                </button>
              )}
            </div>
          )}
          {children}
        </div>
        {split && (
          <div className="relative">
            <img src={banner} alt="" className="h-64 w-full rounded-2xl object-cover shadow-xl md:h-80" />
            {hero.badge_text && <span className="absolute -bottom-3 right-4 rotate-[-4deg] rounded-xl bg-white px-4 py-2 font-serif text-lg italic text-[var(--cp-brand)] shadow-lg">{hero.badge_text}</span>}
          </div>
        )}
      </div>
      {!split && hero.badge_text && template !== "minimal" && (
        <span className={`absolute bottom-6 right-6 hidden rotate-[-6deg] font-serif text-2xl italic md:block ${dark ? "text-white/90" : "text-[var(--cp-brand)]"}`}>{hero.badge_text}</span>
      )}
    </section>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function SectionShell({ section, children, tint = false }: { section: CareerSection; children: ReactNode; tint?: boolean }) {
  return (
    <section id={`cp-${section.id}`} className={`scroll-mt-20 ${tint ? "bg-white" : ""}`}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.title}</h2>
        {section.subtitle && <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export function videoEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return "";
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-slate-900" aria-expanded={open}>
        {q}
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="whitespace-pre-line px-5 pb-4 text-sm leading-6 text-slate-600">{a}</p>}
    </div>
  );
}

/** Figures such as "10+ Years", "200+ Team Members". */
export function Stats({ stats, compact = false }: { stats?: { value: string; label: string }[]; compact?: boolean }) {
  if (!stats?.length) return null;
  const icons = [Star, Users, Globe, Target];
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
      {stats.map((s, i) => {
        const Icon = icons[i % icons.length];
        return (
          <div key={i} className="flex items-center gap-2">
            <Icon size={compact ? 18 : 22} className="shrink-0 text-[var(--cp-brand)]" />
            <span>
              <span className={`block font-extrabold leading-tight text-slate-900 ${compact ? "text-sm" : "text-xl"}`}>{s.value}</span>
              <span className={`block text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>{s.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A photo or a video (click to play) beside the About text. */
function Media({ image, video, title }: { image?: string; video?: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const src = video ? videoEmbedUrl(video) : "";
  if (src && playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow">
        <iframe src={`${src}?autoplay=1`} title={title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (!image && !src) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[var(--cp-dark)] shadow">
      {image && <img src={careerAssetUrl(image)} alt="" className="h-full w-full object-cover" />}
      {src && (
        <button onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-[var(--cp-brand)] shadow-lg"><Play size={26} className="ml-1" /></span>
        </button>
      )}
    </div>
  );
}

function Testimonials({ section, tint }: { section: CareerSection; tint: boolean }) {
  const items = section.items || [];
  const [i, setI] = useState(0);
  const t = items[i % items.length];
  return (
    <SectionShell section={section} tint={tint}>
      <figure className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        {t.photo_url ? (
          <img src={careerAssetUrl(t.photo_url)} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--cp-brand-soft)] text-2xl font-bold text-[var(--cp-brand)]">{(t.name || "?").charAt(0)}</span>
        )}
        <div className="min-w-0 flex-1">
          <Quote size={22} className="text-[var(--cp-brand)]" />
          <blockquote className="mt-1 text-base italic leading-7 text-slate-700">{t.quote}</blockquote>
          <figcaption className="mt-2 text-sm font-semibold text-slate-900">— {t.name}{t.role ? <span className="font-normal text-slate-500">, {t.role}</span> : null}</figcaption>
        </div>
        {items.length > 1 && (
          <div className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
            <button onClick={() => setI((i - 1 + items.length) % items.length)} aria-label="Previous story" className="rounded-full border border-slate-300 p-2 hover:bg-slate-50"><ChevronLeft size={16} /></button>
            <span className="tabular-nums">{(i % items.length) + 1} / {items.length}</span>
            <button onClick={() => setI((i + 1) % items.length)} aria-label="Next story" className="rounded-full border border-slate-300 p-2 hover:bg-slate-50"><ChevronRight size={16} /></button>
          </div>
        )}
      </figure>
    </SectionShell>
  );
}

/** One builder section (not Open positions, which the page renders with its search and job list). */
export function ContentSection({ section, index }: { section: CareerSection; index: number }) {
  const tint = index % 2 === 0;
  const items = section.items || [];
  switch (section.type) {
    case "highlights":
      return items.length ? (
        <section id={`cp-${section.id}`} className="border-b border-slate-200 bg-[color-mix(in_oklab,var(--cp-brand)_5%,white)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 md:grid-cols-3 lg:grid-cols-6">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <CareerIcon name={it.icon} text={it.title} size={28} className="shrink-0 text-[var(--cp-brand)]" />
                <span className="text-sm font-semibold leading-snug text-slate-800">{it.title}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null;
    case "about": {
      const media = section.image_url || section.video_url;
      if (!section.text && !media && !section.stats?.length) return null;
      return (
        <SectionShell section={section} tint={tint}>
          <div className={`grid items-center gap-8 ${media ? "md:grid-cols-2" : ""}`}>
            {media && <Media image={section.image_url} video={section.video_url} title={section.title} />}
            <div className="space-y-6">
              {section.text && <div className="max-w-3xl text-slate-700"><Description text={section.text} /></div>}
              <Stats stats={section.stats} />
            </div>
          </div>
        </SectionShell>
      );
    }
    case "culture":
      return (
        <SectionShell section={section} tint={tint}>
          <div className={`grid items-center gap-8 ${section.image_url ? "md:grid-cols-2" : ""}`}>
            <div className="text-slate-700"><Description text={section.text || ""} /></div>
            {section.image_url && <img src={careerAssetUrl(section.image_url)} alt="" className="h-72 w-full rounded-2xl object-cover shadow-sm" />}
          </div>
        </SectionShell>
      );
    case "life":
      return items.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {items.map((item, i) => (
              <figure key={i} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                {item.image_url ? (
                  <img src={careerAssetUrl(item.image_url)} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <span className="flex h-36 items-center justify-center bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><CareerIcon name={item.icon} text={item.title} size={32} /></span>
                )}
                <figcaption className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  {item.text && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.text}</p>}
                </figcaption>
              </figure>
            ))}
          </div>
        </SectionShell>
      ) : null;
    case "benefits":
      return items.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <div key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><CareerIcon name={item.icon} text={item.title} /></span>
                <div>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  {item.text && <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>
      ) : null;
    case "testimonials":
      return items.length ? <Testimonials section={section} tint={tint} /> : null;
    case "faq":
      return items.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="max-w-3xl space-y-3">{items.map((f, i) => <Faq key={i} q={f.q || ""} a={f.a || ""} />)}</div>
        </SectionShell>
      ) : null;
    case "gallery":
      return section.images?.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {section.images.map((src, i) => <img key={i} src={careerAssetUrl(src)} alt="" className={`w-full rounded-xl object-cover ${i === 0 ? "col-span-2 row-span-2 h-full min-h-48" : "h-40"}`} />)}
          </div>
        </SectionShell>
      ) : null;
    case "video": {
      const src = section.url ? videoEmbedUrl(section.url) : "";
      return src ? (
        <SectionShell section={section} tint={tint}>
          <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow">
            <iframe src={src} title={section.title} className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          </div>
        </SectionShell>
      ) : null;
    }
    default:
      return null;
  }
}

// ── Job detail page (SRS Screen 17) ──────────────────────────────────────────

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><span className="text-[var(--cp-brand)]">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-6 text-slate-700">
          <Check size={16} className="mt-1 shrink-0 text-[var(--cp-brand)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Dots({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-6 text-slate-700">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cp-brand)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const money = (n: number | null | undefined, currency: string) =>
  n == null ? "" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(n);

function Share({ job, url }: { job: PublicJob; url: string }) {
  const [copied, setCopied] = useState(false);
  const text = encodeURIComponent(`${job.title}: we're hiring`);
  const u = encodeURIComponent(url);
  const links = [
    { label: "LinkedIn", short: "in", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, tone: "bg-[#0a66c2]" },
    { label: "WhatsApp", short: "WA", href: `https://wa.me/?text=${text}%20${u}`, tone: "bg-[#25d366]" },
    { label: "Facebook", short: "f", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, tone: "bg-[#1877f2]" },
    { label: "X", short: "X", href: `https://twitter.com/intent/tweet?text=${text}&url=${u}`, tone: "bg-black" },
    { label: "Email", short: "@", href: `mailto:?subject=${text}&body=${u}`, tone: "bg-slate-600" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer" title={`Share on ${l.label}`} aria-label={`Share on ${l.label}`} className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white ${l.tone} hover:opacity-90`}>{l.short}</a>
      ))}
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the share links still work.
          }
        }}
        title="Copy link"
        aria-label="Copy link"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export function JobDetailPage({
  job,
  content,
  company,
  shareUrl,
  onBack,
  onApply,
  onTarget,
}: {
  job: PublicJob;
  content: CareerPageContent;
  company?: CareerCompany | null;
  shareUrl: string;
  onBack: () => void;
  onApply: () => void;
  onTarget: GoTo;
}) {
  const salary = job.salary
    ? [money(job.salary.min, job.salary.currency), money(job.salary.max, job.salary.currency)].filter(Boolean).join(" – ") +
      (job.salary.period === "month" ? " per month" : job.salary.period === "hour" ? " per hour" : " per year")
    : "";
  const banner = careerAssetUrl(content.hero.banner_url);
  const about = content.sections.find((s) => s.type === "about" && s.visible);
  const requirements = [...(job.requirements || []), ...job.qualifications, ...(job.certifications || []).map((c) => `Certification: ${c}`)];
  const goodToHave = job.nice_to_have || [];
  const facts: [ReactNode, string, string][] = [
    [<Hash size={18} />, "Job ID", job.code || ""],
    [<Building2 size={18} />, "Department", job.department],
    [<MapPin size={18} />, "Location", job.location],
    [<Briefcase size={18} />, "Experience", job.experience],
    [<Laptop size={18} />, "Work Mode", job.work_mode || job.employment_type],
    [<CalendarDays size={18} />, "Posted On", fmtDay(job.posted_at || job.created_at)],
  ].filter(([, , v]) => v) as [ReactNode, string, string][];

  return (
    <div>
      {/* Title band */}
      <section className="relative overflow-hidden bg-[var(--cp-dark)] text-white">
        {banner && <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--cp-dark)] via-[var(--cp-dark)]/85 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-9 sm:px-6">
          <nav className="flex items-center gap-1.5 text-sm text-white/80">
            <button onClick={onBack} className="hover:text-white">Open Positions</button>
            <ChevronRight size={14} />
            <span className="truncate text-white">{job.title}</span>
          </nav>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{job.title}</h1>
          {job.tagline && <p className="mt-2 max-w-2xl text-white/85">{job.tagline}</p>}
        </div>
        {content.hero.badge_text && <span className="absolute bottom-5 right-8 hidden rotate-[-6deg] font-serif text-2xl italic text-white/90 md:block">{content.hero.badge_text}</span>}
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Facts strip */}
          {facts.length > 0 && (
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 xl:grid-cols-6">
              {facts.map(([icon, label, value]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[var(--cp-brand)]">{icon}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-900">{label}</span>
                    <span className="block truncate text-xs text-slate-600">{value}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              {job.description.trim() && <Card icon={<Target size={20} />} title="Job Overview"><div className="text-sm text-slate-700"><Description text={job.description} /></div></Card>}
              {job.responsibilities.length > 0 && <Card icon={<ListChecks size={20} />} title="Key Responsibilities"><Checks items={job.responsibilities} /></Card>}
              {requirements.length > 0 && <Card icon={<Users size={20} />} title="Requirements"><Checks items={requirements} /></Card>}
            </div>
            <div className="space-y-5">
              {job.required_skills.length > 0 && (
                <Card icon={<Sparkles size={20} />} title="Required Skills">
                  <div className="flex flex-wrap gap-2">{job.required_skills.map((s) => <span key={s} className="rounded-full bg-[var(--cp-brand-soft)] px-3 py-1.5 text-sm font-medium text-[var(--cp-brand)]">{s}</span>)}</div>
                </Card>
              )}
              {(goodToHave.length > 0 || job.preferred_skills.length > 0) && (
                <Card icon={<Star size={20} />} title="Good to Have">
                  {goodToHave.length > 0 && <Dots items={goodToHave} />}
                  {job.preferred_skills.length > 0 && (
                    <div className={`flex flex-wrap gap-2 ${goodToHave.length ? "mt-3" : ""}`}>{job.preferred_skills.map((s) => <span key={s} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">{s}</span>)}</div>
                  )}
                </Card>
              )}
              {(salary || (job.what_we_offer || []).length > 0) && (
                <Card icon={<Wallet size={20} />} title="What We Offer">
                  {salary && <p className="mb-3 text-sm font-semibold text-slate-900">{salary}</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(job.what_we_offer || []).map((o) => (
                      <div key={o} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <CareerIcon text={o} size={20} className="shrink-0 text-[var(--cp-brand)]" />
                        <span className="text-sm font-medium leading-snug text-slate-800">{o}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <button onClick={onApply} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cp-brand)] px-6 py-4 text-lg font-bold text-white shadow hover:bg-[var(--cp-brand-dark)]">
            Apply Now <ArrowRight size={20} />
          </button>
          {job.closing_date && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">Applications close on {new Date(`${job.closing_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.</p>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Share2 size={16} className="text-[var(--cp-brand)]" /> Share this Job</p>
            <Share job={job} url={shareUrl} />
          </div>
          {company && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 font-bold text-slate-900"><Building2 size={16} className="text-[var(--cp-brand)]" /> About {company.short_name || company.name}</p>
              {(company.description || about?.text) && <p className="line-clamp-5 text-sm leading-6 text-slate-600">{company.description || about?.text}</p>}
              <Stats stats={about?.stats} compact />
              {about && (about.image_url || about.video_url) && <Media image={about.image_url} video={about.video_url} title={about.title} />}
              {about && (
                <button onClick={() => onTarget(`#${about.id}`)} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--cp-brand)] hover:underline">Know More About Us <ArrowRight size={14} /></button>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Closing banner */}
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[var(--cp-brand-soft)] px-6 py-5">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[var(--cp-brand)]"><CircleCheck size={24} /></span>
            <div>
              <p className="text-lg font-bold text-slate-900">{content.texts.job_cta_title || "Be part of our journey"}</p>
              <p className="text-sm text-slate-600">{content.texts.job_cta_text || ""}</p>
            </div>
          </div>
          <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-slate-400 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ArrowLeft size={16} /> Back to Open Positions</button>
        </div>
      </div>
    </div>
  );
}
