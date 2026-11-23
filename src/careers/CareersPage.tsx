import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, CalendarDays, ChevronDown, Clock3, Info, Laptop, Loader2, MapPin, Search } from "lucide-react";
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
import { ApplyModal, Meta, Pill, openingsLabel, postedAgo } from "./components";
import { OverlayContext } from "./overlay";
import { BrandedFooter, BrandedHeader, ContentSection, Hero, JobDetailPage, brandVars } from "./sections";

/**
 * Public careers page (SRS Screens 16 and 17). It does not use the router, so it can be embedded in any site:
 * the open job is kept in the page address as ?job=<id>, so a job link can be shared.
 * Everything comes from the resume portal: the published career page (builder), the company's branding and its
 * published jobs.
 */

const JOB_PARAM = "job";
const COMPANY_PARAM = "company";

const jobFromUrl = () => new URLSearchParams(window.location.search).get(JOB_PARAM);
const companyFromUrl = () => new URLSearchParams(window.location.search).get(COMPANY_PARAM) || "";

/** The current page address with ?job set to id, or removed when id is null. */
const urlWithJob = (id: string | null) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(JOB_PARAM, id);
  else url.searchParams.delete(JOB_PARAM);
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

function JobCard({ job, onDetails, onApply }: { job: PublicJob; onDetails: () => void; onApply: () => void }) {
  const posted = postedAgo(job.posted_at || job.created_at);
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 border-l-[3px] border-[var(--cp-brand)] pl-3">
          <h3 className="truncate text-lg font-semibold text-slate-900">{job.title}</h3>
          {job.department && <p className="truncate text-sm text-slate-600">{job.department}</p>}
        </div>
        <Pill>{openingsLabel(job.open_positions)}</Pill>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        {job.location && <Meta icon={<MapPin size={15} />}>{job.location}</Meta>}
        {job.work_mode ? <Meta icon={<Laptop size={15} />}>{job.work_mode}</Meta> : job.employment_type && <Meta icon={<Briefcase size={15} />}>{job.employment_type}</Meta>}
        {job.experience && <Meta icon={<Clock3 size={15} />}>{job.experience}</Meta>}
        {posted && <Meta icon={<CalendarDays size={15} />}>{posted}</Meta>}
      </div>

      {job.required_skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.required_skills.slice(0, 5).map((s) => <span key={s} className="rounded-md bg-[var(--cp-brand-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--cp-brand)]">{s}</span>)}
          {job.required_skills.length > 5 && <span className="text-[11px] text-slate-400">+{job.required_skills.length - 5}</span>}
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-4" style={{ marginTop: "1.25rem" }}>
        <a
          href={urlWithJob(job.id)}
          onClick={(e) => {
            e.preventDefault();
            onDetails();
          }}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          View details
        </a>
        <button onClick={onApply} className="rounded-lg bg-[var(--cp-brand)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cp-brand-dark)]">
          Apply now
        </button>
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
  const [applying, setApplying] = useState<PublicJob | null>(null);
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
    const onPop = () => setJobId(jobFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [preview]);

  // Pop-ups in the embed render in a layer outside this tree: give it the same brand colours.
  const vars = useMemo(() => brandVars(branding), [branding]);
  useEffect(() => {
    if (!overlay) return;
    Object.entries(vars).forEach(([k, v]) => overlay.style.setProperty(k, v));
  }, [overlay, vars]);

  const showJob = (id: string | null) => {
    if (id === jobId) return;
    if (!preview) window.history.pushState(window.history.state, "", urlWithJob(id));
    setJobId(id);
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
    }
    setMeta("og:title", document.title, "property");
    const image = careerAssetUrl(content.seo.share_image_url || content.hero.banner_url);
    if (image) setMeta("og:image", image, "property");
    return () => {
      document.title = previous;
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

  const positions = (section: CareerSection) => (
    <section key={section.id} id={`cp-${section.id}`} ref={positionsRef} className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.title}</h2>
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
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((job) => <JobCard key={job.id} job={job} onDetails={() => showJob(job.id)} onApply={() => setApplying(job)} />)}
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
        <BrandedHeader content={content} branding={branding} company={companyInfo} homeHref={urlWithJob(null)} onHome={() => { showJob(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}

      {viewing ? (
        <JobDetailPage
          job={viewing}
          company={companyInfo}
          shareUrl={new URL(urlWithJob(viewing.id), window.location.href).href}
          onBack={() => showJob(null)}
          onApply={() => setApplying(viewing)}
        />
      ) : (
        <main className="flex-1">
          <Hero content={content} onCta={scrollToPositions} />
          {shownSections.map((section, i) => (section.type === "open_positions" ? positions(section) : <ContentSection key={section.id} section={section} index={i} />))}
        </main>
      )}

      {showFooter && content.footer.show && <BrandedFooter content={content} branding={branding} company={companyInfo} />}

      {applying && (
        <ApplyModal
          job={applying}
          successTitle={content.texts.success_title}
          successMessage={content.texts.success_message}
          companyName={companyInfo?.name}
          onClose={() => {
            setApplying(null);
            load();
          }}
        />
      )}
    </div>
  );
}
