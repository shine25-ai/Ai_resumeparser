import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, CalendarDays, ChevronDown, Clock3, Loader2, MapPin, Search } from "lucide-react";
import { fetchPublicJobs, type PublicJob } from "../utils/jobsApi";
import { ApplyModal, CareersHeader, Meta, Pill, openingsLabel, postedAgo } from "../components/careers/CareersShared";

const uniqueValues = (jobs: PublicJob[], key: "department" | "location" | "employment_type") =>
  Array.from(new Set(jobs.map((j) => (j[key] || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

// ── Page ────────────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-700 focus:border-[#5B3EF0] focus:outline-none focus:ring-2 focus:ring-[#5B3EF0]/20"
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

function JobCard({ job, onApply }: { job: PublicJob; onApply: () => void }) {
  const posted = postedAgo(job.created_at);
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 border-l-[3px] border-[#5B3EF0] pl-3">
          <h3 className="truncate text-lg font-semibold text-slate-900">{job.title}</h3>
          {job.department && <p className="truncate text-sm text-slate-600">{job.department}</p>}
        </div>
        <Pill>{openingsLabel(job.open_positions)}</Pill>
      </div>

      <div className="mb-5 mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        {job.location && <Meta icon={<MapPin size={15} />}>{job.location}</Meta>}
        {job.employment_type && <Meta icon={<Briefcase size={15} />}>{job.employment_type}</Meta>}
        {job.experience && <Meta icon={<Clock3 size={15} />}>{job.experience}</Meta>}
        {posted && <Meta icon={<CalendarDays size={15} />}>{posted}</Meta>}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <Link to={`/jobs/${job.id}`} className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-800 hover:bg-slate-50">
          View Details
        </Link>
        <button onClick={onApply} className="rounded-lg bg-[#5B3EF0] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4A2FD8]">
          Apply Now
        </button>
      </div>
    </article>
  );
}

export default function PublicJobs() {
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<PublicJob | null>(null);

  // Draft filters change as the user types; applied filters change on "Search Jobs" (or Enter).
  const emptyFilters = { query: "", department: "", location: "", employment_type: "" };
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);

  const load = () => {
    setLoading(true);
    fetchPublicJobs()
      .then((data) => {
        setJobs(data);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load open roles."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const departments = useMemo(() => uniqueValues(jobs, "department"), [jobs]);
  const locations = useMemo(() => uniqueValues(jobs, "location"), [jobs]);
  const types = useMemo(() => uniqueValues(jobs, "employment_type"), [jobs]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filters.department && j.department !== filters.department) return false;
      if (filters.location && j.location !== filters.location) return false;
      if (filters.employment_type && j.employment_type !== filters.employment_type) return false;
      if (!q) return true;
      return [j.title, j.department, j.description, j.location].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [jobs, filters]);

  const filtered = Object.values(filters).some(Boolean);

  // Select filters apply at once; the keyword applies on Search / Enter.
  const setSelect = (key: "department" | "location" | "employment_type", value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFilters((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-[#F4F4F8] text-slate-900">
      <CareersHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#5B3EF0]">Careers at Shinelogics</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Find work that moves you forward.</h1>
          <p className="mt-2 text-sm text-slate-600">Explore opportunities, build your skills and make an impact with us.</p>

          <form
            className="mt-6 grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
            }}
          >
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Search by job title or keyword"
                value={draft.query}
                onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                placeholder="Search by job title or keyword..."
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-[#5B3EF0] focus:outline-none focus:ring-2 focus:ring-[#5B3EF0]/20"
              />
            </div>
            <FilterSelect label="Department" value={draft.department} options={departments} onChange={(v) => setSelect("department", v)} />
            <FilterSelect label="Location" value={draft.location} options={locations} onChange={(v) => setSelect("location", v)} />
            <FilterSelect label="Employment Type" value={draft.employment_type} options={types} onChange={(v) => setSelect("employment_type", v)} />
            <button type="submit" className="h-10 rounded-lg bg-[#5B3EF0] px-6 text-sm font-medium text-white hover:bg-[#4A2FD8]">
              Search Jobs
            </button>
          </form>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Explore Open Positions</h2>
            <p className="mt-1 text-sm text-slate-600">Find the right opportunity to grow your career with us.</p>
          </div>
          {!loading && !error && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{visible.length}</span> of {jobs.length} positions
            </span>
          )}
        </div>

        <div className="mt-6">
          {loading && (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading roles…</p>
          )}
          {!loading && error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          {!loading && !error && jobs.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
              There are no open roles right now. Please check back later.
            </p>
          )}
          {!loading && !error && jobs.length > 0 && visible.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-slate-600">No roles match your search.</p>
              {filtered && (
                <button
                  onClick={() => {
                    setDraft(emptyFilters);
                    setFilters(emptyFilters);
                  }}
                  className="mt-3 text-sm font-medium text-[#5B3EF0] hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {visible.map((job) => (
              <JobCard key={job.id} job={job} onApply={() => setApplying(job)} />
            ))}
          </div>
        </div>
      </main>

      {applying && (
        <ApplyModal
          job={applying}
          onClose={() => {
            setApplying(null);
            load();
          }}
        />
      )}
    </div>
  );
}

