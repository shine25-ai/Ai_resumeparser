import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Award,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Globe,
  Laptop,
  Link2,
  Mail,
  MapPin,
  Quote,
  Users,
  Wallet,
} from "lucide-react";
import { careerAssetUrl, type CareerBranding, type CareerCompany, type CareerPageContent, type CareerSection, type PublicJob } from "./api";
import { Description, Meta, openingsLabel, postedAgo } from "./components";

/**
 * The branded parts of the public careers page (SRS Screens 16 and 17): header, hero, the builder's sections,
 * footer, and the full job detail page. Colours come from --cp-* variables set by CareersPage.
 */

export const brandVars = (branding?: CareerBranding | null): Record<string, string> => {
  const c = branding?.colors;
  return c
    ? {
        "--cp-brand": c.primary,
        "--cp-brand-dark": `color-mix(in oklab, ${c.primary} 82%, black)`,
        "--cp-brand-soft": `color-mix(in oklab, ${c.primary} 10%, white)`,
        "--cp-bg": c.background,
        "--cp-dark": c.sidebar_bg,
      }
    : {};
};

// ── Header and footer ─────────────────────────────────────────────────────────

function BrandMark({ branding, company, size = "h-10" }: { branding?: CareerBranding | null; company?: CareerCompany | null; size?: string }) {
  const logo = careerAssetUrl(branding?.logo_url);
  const name = company?.name || branding?.app_name || "Careers";
  return (
    <span className="flex items-center gap-2.5">
      {logo ? (
        <img src={logo} alt={name} className={`${size} w-auto max-w-[180px] object-contain`} draggable={false} />
      ) : (
        <span className={`flex ${size} aspect-square items-center justify-center rounded-lg bg-[var(--cp-brand)] text-white`}><Building2 size={18} /></span>
      )}
      <span className="text-base font-bold text-slate-900">{name}</span>
    </span>
  );
}

export function BrandedHeader({
  content,
  branding,
  company,
  homeHref,
  onHome,
}: {
  content: CareerPageContent;
  branding?: CareerBranding | null;
  company?: CareerCompany | null;
  homeHref: string;
  onHome: () => void;
}) {
  const goHome = (e: React.MouseEvent) => {
    e.preventDefault();
    onHome();
  };
  const site = content.footer.website || company?.website;
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href={homeHref} onClick={goHome} aria-label={`${company?.name || "Careers"} home`}><BrandMark branding={branding} company={company} /></a>
        <nav className="flex h-full items-center gap-5 overflow-x-auto text-sm font-medium">
          <a href={homeHref} onClick={goHome} aria-current="page" className="flex h-full items-center border-b-2 border-[var(--cp-brand)] text-[var(--cp-brand)]">Careers</a>
          {content.header.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="hidden h-full items-center border-b-2 border-transparent text-slate-700 hover:text-[var(--cp-brand)] sm:flex">{l.label}</a>
          ))}
          {site && !content.header.links.some((l) => l.url === site) && (
            <a href={site} target="_blank" rel="noreferrer" className="flex h-full items-center border-b-2 border-transparent text-slate-700 hover:text-[var(--cp-brand)]">About us</a>
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

export function Hero({ content, onCta, children }: { content: CareerPageContent; onCta: () => void; children?: ReactNode }) {
  const { hero, template } = content;
  const banner = careerAssetUrl(hero.banner_url);
  const dark = template === "modern" || (!!banner && template !== "minimal");
  return (
    <section className={`relative overflow-hidden border-b border-slate-200 ${dark ? "bg-[var(--cp-dark)] text-white" : "bg-white"}`}>
      {banner && template !== "minimal" && <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
      {dark && <div className="absolute inset-0 bg-gradient-to-r from-[var(--cp-dark)] via-[var(--cp-dark)]/80 to-transparent" />}
      <div className={`relative mx-auto max-w-6xl px-4 sm:px-6 ${template === "minimal" ? "py-8" : "py-14 md:py-20"}`}>
        {hero.eyebrow && <p className={`text-[11px] font-semibold uppercase tracking-widest ${dark ? "text-white/80" : "text-[var(--cp-brand)]"}`}>{hero.eyebrow}</p>}
        <h1 className={`mt-2 max-w-3xl font-bold tracking-tight ${template === "minimal" ? "text-3xl" : "text-4xl md:text-5xl"} ${dark ? "text-white" : "text-slate-900"}`}>{hero.title}</h1>
        {hero.subtitle && <p className={`mt-3 max-w-2xl text-base ${dark ? "text-white/80" : "text-slate-600"}`}>{hero.subtitle}</p>}
        {template !== "minimal" && (
          <button onClick={onCta} className="mt-6 rounded-lg bg-[var(--cp-brand)] px-5 py-3 text-sm font-semibold text-white shadow hover:bg-[var(--cp-brand-dark)]">
            {hero.cta_label}
          </button>
        )}
        {children}
      </div>
    </section>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function SectionShell({ section, children, tint = false }: { section: CareerSection; children: ReactNode; tint?: boolean }) {
  return (
    <section id={`cp-${section.id}`} className={tint ? "bg-white" : ""}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.title}</h2>
        {section.subtitle && <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function videoEmbedUrl(url: string): string {
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

/** One builder section (not Open positions, which the page renders with its search and job list). */
export function ContentSection({ section, index }: { section: CareerSection; index: number }) {
  const tint = index % 2 === 0;
  const items = section.items || [];
  switch (section.type) {
    case "about":
      return section.text ? <SectionShell section={section} tint={tint}><div className="max-w-3xl text-slate-700"><Description text={section.text} /></div></SectionShell> : null;
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
    case "benefits":
      return items.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {section.type === "life" && item.image_url && <img src={careerAssetUrl(item.image_url)} alt="" className="h-40 w-full object-cover" />}
                <div className="p-5">
                  {section.type === "benefits" && <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><Award size={18} /></span>}
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  {item.text && <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.text}</p>}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>
      ) : null;
    case "testimonials":
      return items.length ? (
        <SectionShell section={section} tint={tint}>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t, i) => (
              <figure key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <Quote size={20} className="text-[var(--cp-brand)]" />
                <blockquote className="mt-3 flex-1 text-sm leading-6 text-slate-700">“{t.quote}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  {t.photo_url ? (
                    <img src={careerAssetUrl(t.photo_url)} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cp-brand-soft)] text-sm font-bold text-[var(--cp-brand)]">{(t.name || "?").charAt(0)}</span>
                  )}
                  <span><span className="block text-sm font-semibold text-slate-900">{t.name}</span><span className="text-xs text-slate-500">{t.role}</span></span>
                </figcaption>
              </figure>
            ))}
          </div>
        </SectionShell>
      ) : null;
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

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 py-6 first:border-t-0">
      <h2 className="mb-3 border-l-[3px] border-[var(--cp-brand)] pl-2.5 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-6 text-slate-600">
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
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${text}&url=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${u}` },
    { label: "Email", href: `mailto:?subject=${text}&body=${u}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the share links below still work.
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Link copied" : "Copy link"}
      </button>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{l.label}</a>
      ))}
    </div>
  );
}

export function JobDetailPage({
  job,
  company,
  shareUrl,
  onBack,
  onApply,
}: {
  job: PublicJob;
  company?: CareerCompany | null;
  shareUrl: string;
  onBack: () => void;
  onApply: () => void;
}) {
  const posted = postedAgo(job.posted_at || job.created_at);
  const salary = job.salary ? [money(job.salary.min, job.salary.currency), money(job.salary.max, job.salary.currency)].filter(Boolean).join(" – ") : "";
  return (
    <div>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--cp-brand)] hover:underline"><ArrowLeft size={15} /> Back to open positions</button>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {job.department && <span className="rounded-md bg-[var(--cp-brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--cp-brand)]">{job.department}</span>}
                {job.code && <span className="text-xs text-slate-400">{job.code}</span>}
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{job.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {job.location && <Meta icon={<MapPin size={15} />}>{job.location}</Meta>}
                {job.work_mode && <Meta icon={<Laptop size={15} />}>{job.work_mode}</Meta>}
                {job.employment_type && <Meta icon={<Briefcase size={15} />}>{job.employment_type}</Meta>}
                {job.experience && <Meta icon={<Clock3 size={15} />}>{job.experience}</Meta>}
                {posted && <Meta icon={<CalendarDays size={15} />}>{posted}</Meta>}
                <Meta icon={<Users size={15} />}>{openingsLabel(job.open_positions)}</Meta>
              </div>
            </div>
            <button onClick={onApply} className="rounded-lg bg-[var(--cp-brand)] px-6 py-3 text-sm font-semibold text-white shadow hover:bg-[var(--cp-brand-dark)]">Apply now</button>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <article className="rounded-2xl border border-slate-200 bg-white px-6">
          {job.description.trim() && <DetailSection title="Job overview"><div className="text-slate-700"><Description text={job.description} /></div></DetailSection>}
          {job.responsibilities.length > 0 && <DetailSection title="Key responsibilities"><Bullets items={job.responsibilities} /></DetailSection>}
          {(job.qualifications.length > 0 || (job.certifications || []).length > 0) && (
            <DetailSection title="Requirements"><Bullets items={[...job.qualifications, ...(job.certifications || []).map((c) => `Certification: ${c}`)]} /></DetailSection>
          )}
          {job.required_skills.length > 0 && (
            <DetailSection title="Required skills">
              <div className="flex flex-wrap gap-2">{job.required_skills.map((s) => <span key={s} className="rounded-full bg-[var(--cp-brand-soft)] px-3 py-1 text-xs font-medium text-[var(--cp-brand)]">{s}</span>)}</div>
            </DetailSection>
          )}
          {job.preferred_skills.length > 0 && (
            <DetailSection title="Good-to-have skills">
              <div className="flex flex-wrap gap-2">{job.preferred_skills.map((s) => <span key={s} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">{s}</span>)}</div>
            </DetailSection>
          )}
          {(salary || (job.what_we_offer || []).length > 0) && (
            <DetailSection title="Salary & benefits">
              {salary && <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Wallet size={15} className="text-[var(--cp-brand)]" /> {salary}</p>}
              {(job.what_we_offer || []).length > 0 && <Bullets items={job.what_we_offer || []} />}
            </DetailSection>
          )}
          <div className="border-t border-slate-200 py-6">
            <button onClick={onApply} className="w-full rounded-lg bg-[var(--cp-brand)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--cp-brand-dark)] sm:w-auto">Apply for this job</button>
          </div>
        </article>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Share this job</p>
            <Share job={job} url={shareUrl} />
          </div>
          {company && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">About {company.name}</p>
              {company.description && <p className="text-sm leading-6 text-slate-600">{company.description}</p>}
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                {company.industry && <li className="flex items-center gap-2"><Building2 size={14} className="text-slate-400" />{company.industry}</li>}
                {company.city && <li className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{company.city}</li>}
                {company.website && <li className="flex items-center gap-2"><Globe size={14} className="text-slate-400" /><a href={company.website} target="_blank" rel="noreferrer" className="hover:text-[var(--cp-brand)]">{company.website.replace(/^https?:\/\//, "")}</a></li>}
              </ul>
            </div>
          )}
          {job.closing_date && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">Applications close on {new Date(`${job.closing_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
