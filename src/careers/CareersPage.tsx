import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, Briefcase, ChevronDown, Code2, Database, Info, Layers, Loader2, Megaphone, Monitor, PenTool, Search, Shield, Users } from "lucide-react";
import {
  DEFAULT_PAGE_SETTINGS,
  careerAssetUrl,
  contentFromOldSettings,
  fetchCareerPage,
  fetchPageSettings,
  fetchPublicJobs,
  type CareerBranding,
  type CareerCompany,
  type CareerPageContent,
  type CareerSection,
  type PublicJob,
} from "./api";
import { openingsLabel, postedAgo } from "./components";
import ApplyPage from "./ApplyPage";
import { OverlayContext } from "./overlay";
import { BrandedFooter, BrandedHeader, ContentSection, Hero, JobDetailPage, brandVars } from "./sections";

/**
 * Public careers page (SRS Screens 16 and 17). It does not use the router, so it can be embedded in any site:
 * the open job is kept in the page address as ?job=<id>, so a job link can be shared.
 * Everything comes from the resume portal: the published career page (builder), the company's branding and its
 * published jobs.
 */

const JOB_PARAM = "job";
const APPLY_PARAM = "apply";
const COMPANY_PARAM = "company";

const jobFromUrl = () => new URLSearchParams(window.location.search).get(JOB_PARAM);
const applyFromUrl = () => new URLSearchParams(window.location.search).get(APPLY_PARAM) === "1";
const companyFromUrl = () => new URLSearchParams(window.location.search).get(COMPANY_PARAM) || "";

/** The current page address with ?job set to id (and &apply=1 on the apply page), or both removed when id is null. */
const urlWithJob = (id: string | null, apply = false) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(JOB_PARAM, id);
  else url.searchParams.delete(JOB_PARAM);
  if (id && apply) url.searchParams.set(APPLY_PARAM, "1");
  else url.searchParams.delete(APPLY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
};

export interface CareersPagePreview {
  content: CareerPageContent;
  branding?: CareerBranding | null;
  company?: CareerCompany | null;
}

export interface CareersPageProps {
  /** Show the company header. Turn off when the host site has its own. */
  showHeader?: boolean;
  /** Show the company footer. */
  showFooter?: boolean;
  /** Set the browser tab title and description. Off when embedded, so the host page keeps its own. */
  manageTitle?: boolean;
  /**
   * Whose jobs to show: the company's page address in the resume portal, e.g. "acme".
   * When left out, ?company=<address> in the page address is used, else the default company.
   */
  company?: string;
  /** The builder's live preview: show this content instead of the published page. */
  preview?: CareersPagePreview;
}

type FilterKey = "department" | "location" | "employment_type" | "work_mode";

const uniqueValues = (jobs: PublicJob[], key: FilterKey) =>
  Array.from(new Set(jobs.map((j) => ((j[key] as string) || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

/** "5-8 years" / "3+ years" / "Up to 2 years" -> the lowest number of years asked for. */
const minYears = (job: PublicJob) => {
  const m = (job.experience || "").match(/(\d+(?:\.\d+)?)/);
  return m && !/^up to/i.test(job.experience) ? Number(m[1]) : 0;
};
const EXPERIENCE = [
  { value: "0-2", label: "0–2 years" },
  { value: "2-5", label: "2–5 years" },
  { value: "5-10", label: "5–10 years" },
  { value: "10-", label: "10+ years" },
];

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-700 focus:border-[var(--cp-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--cp-brand)]/20"
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

/** An icon for the job's department (the mockup's job rows). */
function DeptIcon({ job }: { job: PublicJob }) {
  const d = `${job.department} ${job.category || ""} ${job.title}`.toLowerCase();
  const Icon = /design|ui|ux/.test(d) ? PenTool : /data|analytics|ai|ml/.test(d) ? Database : /qa|test|quality/.test(d) ? Shield
    : /market|sales/.test(d) ? Megaphone : /hr|people|human/.test(d) ? Users : /product|manager/.test(d) ? Layers
    : /devops|cloud|infra|platform/.test(d) ? Monitor : /finance|account/.test(d) ? BarChart3 : /engineer|developer|software/.test(d) ? Code2 : Briefcase;
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--cp-brand-soft)] text-[var(--cp-brand)]"><Icon size={22} /></span>;
}

function JobRow({ job, onDetails, onApply }: { job: PublicJob; onDetails: () => void; onApply: () => void }) {
  const posted = postedAgo(job.posted_at || job.created_at);
  const meta = [job.department, job.location, job.experience, job.work_mode].filter(Boolean);
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center">
      <DeptIcon job={job} />
      <div className="min-w-0 flex-1">
        <a
          href={urlWithJob(job.id)}
          onClick={(e) => {
            e.preventDefault();
            onDetails();
          }}
          className="text-lg font-bold text-slate-900 hover:text-[var(--cp-brand)]"
        >
          {job.title}
        </a>
        <p className="mt-0.5 text-sm text-slate-600">{meta.join("  |  ")}</p>
        {job.required_skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.required_skills.slice(0, 5).map((s) => <span key={s} className="rounded-full bg-[var(--cp-brand-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--cp-brand)]">{s}</span>)}
            {job.required_skills.length > 5 && <span className="text-xs text-slate-400">+{job.required_skills.length - 5}</span>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
        <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[var(--cp-brand)] px-4 py-2 text-sm font-semibold text-[var(--cp-brand)] hover:bg-[var(--cp-brand)] hover:text-white">
          Apply Now <ArrowRight size={15} />
        </button>
        <span className="text-center text-[11px] text-slate-400 sm:text-right">{[openingsLabel(job.open_positions), posted].filter(Boolean).join(" · ")}</span>
      </div>
    </article>
  );
}

function setMeta(name: string, value: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = value;
}

export default function CareersPage({ showHeader = true, showFooter = true, manageTitle = false, company: companyProp, preview }: CareersPageProps) {
  const company = (companyProp || companyFromUrl()).trim().toLowerCase();
  const overlay = useContext(OverlayContext);
  const [jobId, setJobId] = useState<string | null>(preview ? null : jobFromUrl);
  const [loaded, setLoaded] = useState<CareersPagePreview | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<boolean>(preview ? false : applyFromUrl);
  const positionsRef = useRef<HTMLDivElement | null>(null);

  // Draft filters change as the user types; the keyword applies on "Search jobs" (or Enter).
  const emptyFilters = { query: "", department: "", location: "", employment_type: "", work_mode: "", experience: "" };
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);

  const page: CareersPagePreview = preview || loaded || { content: contentFromOldSettings(DEFAULT_PAGE_SETTINGS) };
  const { content, branding } = page;
  const companyInfo = page.company || null;

  const load = () => {
    setLoading(true);
    fetchPublicJobs(company)
      .then((data) => {
        setJobs(data);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load open positions."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [company]);

  useEffect(() => {
    if (preview) return;
    // An older portal has no career page yet: fall back to its page text. The defaults stay on any error.
    fetchCareerPage(company)
      .then((data) => setLoaded({ content: data.content, branding: data.branding, company: data.company }))
      .catch(() =>
        fetchPageSettings(company)
          .then((s) => setLoaded({ content: contentFromOldSettings(s), company: s.company ? { ...s.company, website: "", industry: "", description: "", city: "" } : null }))
          .catch(() => undefined)
      );
  }, [company, preview]);

  // Back / forward buttons open and close jobs.
  useEffect(() => {
    if (preview) return;
    const onPop = () => {
      setJobId(jobFromUrl());
      setApplying(applyFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [preview]);

  // Pop-ups in the embed render in a layer outside this tree: give it the same brand colours.
  const vars = useMemo(() => brandVars(branding), [branding]);
  useEffect(() => {
    if (!overlay) return;
    Object.entries(vars).forEach(([k, v]) => overlay.style.setProperty(k, v));
  }, [overlay, vars]);

  const showJob = (id: string | null, apply = false) => {
    if (id === jobId && apply === applying) return;
    if (!preview) window.history.pushState(window.history.state, "", urlWithJob(id, apply));
    setJobId(id);
    setApplying(!!id && apply);
    window.scrollTo({ top: 0 });
  };

  const viewing = jobId ? jobs.find((j) => j.id === jobId) ?? null : null;
  const missingRole = !!jobId && !loading && !error && !viewing;

  useEffect(() => {
    if (!manageTitle || preview) return;
    const previous = document.title;
    const name = companyInfo?.name || branding?.app_name || "";
    document.title = viewing ? `${viewing.title} · ${name || content.seo.title}` : content.seo.title || content.hero.eyebrow;
    const description = viewing ? (viewing.description || "").slice(0, 160) : content.seo.description;
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
      setMeta("twitter:description", description);
    }
    setMeta("og:title", document.title, "property");
    setMeta("twitter:title", document.title);
    setMeta("twitter:card", "summary_large_image");

    const image = careerAssetUrl(content.seo.share_image_url || content.hero.banner_url);
    if (image) {
      setMeta("og:image", image, "property");
      setMeta("twitter:image", image);
    }

    // Set canonical URL
    let canonicalEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.href = window.location.href.split("#")[0];

    // Schema.org JobPosting structured data for Google for Jobs
    let schemaEl = document.getElementById("jobposting-schema") as HTMLScriptElement | null;
    if (viewing) {
      if (!schemaEl) {
        schemaEl = document.createElement("script");
        schemaEl.id = "jobposting-schema";
        schemaEl.type = "application/ld+json";
        document.head.appendChild(schemaEl);
      }
      const sal = viewing.salary;
      const schemaData = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": viewing.title,
        "description": viewing.description || `${viewing.title} opening at ${name}`,
        "datePosted": viewing.posted_at || viewing.created_at || new Date().toISOString(),
        "validThrough": viewing.closing_date || undefined,
        "employmentType": (viewing.employment_type || "FULL_TIME").toUpperCase().replace(/\s+/g, "_"),
        "hiringOrganization": {
          "@type": "Organization",
          "name": name || "Company",
          "sameAs": companyInfo?.website || undefined,
          "logo": branding?.logo_url ? careerAssetUrl(branding.logo_url) : undefined,
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": viewing.location || companyInfo?.city || "Remote",
          },
        },
        "baseSalary": (sal && (sal.min || sal.max)) ? {
          "@type": "MonetaryAmount",
          "currency": sal.currency || "INR",   // jobs store salary_currency, INR by default
          "value": {
            "@type": "QuantitativeValue",
            "minValue": sal.min ?? undefined,
            "maxValue": sal.max ?? undefined,
            "unitText": (sal.period || "year").toUpperCase(),
          },
        } : undefined,
        "skills": viewing.required_skills?.join(", "),
      };
      schemaEl.textContent = JSON.stringify(schemaData);
    } else if (schemaEl) {
      schemaEl.remove();
    }

    return () => {
      document.title = previous;
      const el = document.getElementById("jobposting-schema");
      if (el) el.remove();
    };
  }, [manageTitle, preview, viewing, content, companyInfo, branding]);

  const departments = useMemo(() => uniqueValues(jobs, "department"), [jobs]);
  const locations = useMemo(() => uniqueValues(jobs, "location"), [jobs]);
  const types = useMemo(() => uniqueValues(jobs, "employment_type"), [jobs]);
  const modes = useMemo(() => uniqueValues(jobs, "work_mode"), [jobs]);
  const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return jobs.filter((j) => {
      for (const key of ["department", "location", "employment_type", "work_mode"] as FilterKey[]) {
        if (filters[key] && j[key] !== filters[key]) return false;
      }
      if (filters.experience) {
        const [lo, hi] = filters.experience.split("-").map(Number);
        const y = minYears(j);
        if (y < lo || (hi && y > hi)) return false;
      }
      if (!q) return true;
      return [j.title, j.department, j.description, j.location, ...j.required_skills, ...j.preferred_skills, ...(j.tags || [])].some((v) =>
        (v || "").toLowerCase().includes(q)
      );
    });
  }, [jobs, filters]);

  const filtered = Object.values(filters).some(Boolean);
  const setSelect = (key: keyof typeof emptyFilters, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFilters((f) => ({ ...f, [key]: value }));
  };
  const scrollToPositions = () => positionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  /** A button's target: a section on the page ("#about") or a link. From a job page, sections open on the list page. */
  const goTo = (target: string) => {
    if (!target) return;
    if (target.startsWith("#")) {
      const find = () => document.getElementById(`cp-${target.slice(1)}`) || (overlay?.getRootNode() as Document | ShadowRoot | undefined)?.getElementById?.(`cp-${target.slice(1)}`);
      const scroll = () => find()?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (viewing) {
        showJob(null);
        setTimeout(scroll, 60);
      } else scroll();
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const positions = (section: CareerSection) => (
    <section key={section.id} id={`cp-${section.id}`} ref={positionsRef} className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.title}{!loading && !error && jobs.length > 0 && <span className="text-slate-500"> ({jobs.length})</span>}</h2>
            {section.subtitle && <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>}
          </div>
          {!loading && !error && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{visible.length}</span> of {jobs.length} positions
            </span>
          )}
        </div>

        <form
          className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(draft);
          }}
        >
          <div className="relative md:col-span-3 xl:col-span-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label={content.texts.search_placeholder}
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
              placeholder={content.texts.search_placeholder}
              className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-[var(--cp-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--cp-brand)]/20"
            />
          </div>
          <FilterSelect label="Department" value={draft.department} options={opts(departments)} onChange={(v) => setSelect("department", v)} />
          <FilterSelect label="Location" value={draft.location} options={opts(locations)} onChange={(v) => setSelect("location", v)} />
          <FilterSelect label="Experience" value={draft.experience} options={EXPERIENCE} onChange={(v) => setSelect("experience", v)} />
          <FilterSelect label="Work mode" value={draft.work_mode} options={opts(modes)} onChange={(v) => setSelect("work_mode", v)} />
          <FilterSelect label="Job type" value={draft.employment_type} options={opts(types)} onChange={(v) => setSelect("employment_type", v)} />
          <button type="submit" className="h-10 rounded-lg bg-[var(--cp-brand)] px-5 text-sm font-medium text-white hover:bg-[var(--cp-brand-dark)]">Search jobs</button>
        </form>

        <div className="mt-6">
          {missingRole && (
            <p className="mb-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info size={16} className="shrink-0" /> That job is no longer open. Have a look at the jobs below.
            </p>
          )}
          {loading && <p className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading jobs…</p>}
          {!loading && error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          {!loading && !error && jobs.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">{content.texts.empty_message}</p>
          )}
          {!loading && !error && jobs.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-slate-600">No jobs match your search.</p>
              {filtered && (
                <button onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); }} className="mt-3 text-sm font-medium text-[var(--cp-brand)] hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          )}
          <div className="space-y-3">
            {visible.map((job) => <JobRow key={job.id} job={job} onDetails={() => showJob(job.id)} onApply={() => showJob(job.id, true)} />)}
          </div>
        </div>
      </div>
    </section>
  );

  const shownSections = content.sections.filter((s) => s.visible);

  return (
    <div
      className={`flex flex-col bg-[var(--cp-bg)] text-slate-900 ${showHeader ? "min-h-screen" : ""}`}
      style={{ ...vars, fontFamily: branding?.font_family ? `"${branding.font_family}", Inter, sans-serif` : undefined } as React.CSSProperties}
    >
      {showHeader && content.header.show && (
        <BrandedHeader content={content} branding={branding} company={companyInfo} homeHref={urlWithJob(null)} onHome={() => { showJob(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} onTarget={goTo} />
      )}

      {viewing && applying ? (
        <ApplyPage
          job={viewing}
          content={content}
          company={companyInfo}
          companySlug={company}
          onBack={() => showJob(viewing.id)}
          onBrowse={() => { showJob(null); load(); }}
        />
      ) : viewing ? (
        <JobDetailPage
          job={viewing}
          content={content}
          company={companyInfo}
          onTarget={goTo}
          shareUrl={new URL(urlWithJob(viewing.id), window.location.href).href}
          onBack={() => showJob(null)}
          onApply={() => showJob(viewing.id, true)}
        />
      ) : (
        <main className="flex-1">
          <Hero content={content} onCta={scrollToPositions} onTarget={goTo} />
          {shownSections.map((section, i) => (section.type === "open_positions" ? positions(section) : <ContentSection key={section.id} section={section} index={i} />))}
        </main>
      )}

      {showFooter && content.footer.show && <BrandedFooter content={content} branding={branding} company={companyInfo} />}

    </div>
  );
}
