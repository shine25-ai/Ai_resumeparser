import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Link2,
  Loader2,
  MailCheck,
  MapPin,
  SearchCheck,
  Upload,
  Users,
} from "lucide-react";
import { fetchPublicJobs, type PublicJob } from "../utils/jobsApi";
import {
  ApplyModal,
  CareersFooter,
  CareersHeader,
  Description,
  Meta,
  Pill,
  openingsLabel,
  postedAgo,
  primaryBtn,
} from "../components/careers/CareersShared";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EEEAFE] text-[#5B3EF0]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-slate-900">{value}</dd>
      </div>
    </div>
  );
}

const HIRING_STEPS = [
  { icon: <MailCheck size={16} />, title: "Verify your email", text: "We send a 6-digit code to confirm it's you." },
  { icon: <Upload size={16} />, title: "Upload your resume", text: "PDF, DOC or DOCX, up to 10 MB." },
  { icon: <SearchCheck size={16} />, title: "Our team reviews it", text: "Shortlisted candidates are contacted for interviews." },
];

export default function PublicJobDetails() {
  const { jobId } = useParams();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPublicJobs()
      .then((data) => {
        setJobs(data);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this role."))
      .finally(() => setLoading(false));
  }, [jobId]);

  const job = jobs.find((j) => j.id === jobId);
  const others = jobs.filter((j) => j.id !== jobId).slice(0, 3);

  useEffect(() => {
    const previous = document.title;
    document.title = job ? `${job.title} · Careers at Shinelogics` : "Careers at Shinelogics";
    return () => {
      document.title = previous;
    };
  }, [job]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  const backLink = (
    <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#5B3EF0]">
      <ArrowLeft size={16} /> All open positions
    </Link>
  );

  if (loading || error || !job) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F4F4F8] text-slate-900">
        <CareersHeader />
        <main className="mx-auto w-full flex-1 max-w-6xl px-4 py-10 sm:px-6">
          {backLink}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center">
            {loading ? (
              <p className="flex items-center justify-center gap-2 text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading role…</p>
            ) : error ? (
              <p className="text-rose-700">{error}</p>
            ) : (
              <>
                <p className="font-semibold text-slate-900">This role is no longer open</p>
                <p className="mt-1 text-sm text-slate-500">It may have been filled or closed. Have a look at our other openings.</p>
                <Link to="/jobs" className="mt-4 inline-block rounded-lg bg-[#5B3EF0] px-4 py-2 text-sm font-medium text-white hover:bg-[#4A2FD8]">
                  View open positions
                </Link>
              </>
            )}
          </div>
        </main>
        <CareersFooter />
      </div>
    );
  }

  const posted = postedAgo(job.created_at);
  const details = [
    { icon: <Building2 size={16} />, label: "Department", value: job.department },
    { icon: <MapPin size={16} />, label: "Location", value: job.location },
    { icon: <Briefcase size={16} />, label: "Employment type", value: job.employment_type },
    { icon: <Clock3 size={16} />, label: "Experience", value: job.experience },
    { icon: <Users size={16} />, label: "Open positions", value: String(job.open_positions) },
    { icon: <CalendarDays size={16} />, label: "Posted", value: posted.replace(/^Posted /, "") },
  ].filter((d) => d.value);

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F4F8] text-slate-900">
      <CareersHeader />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {backLink}
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="border-l-4 border-[#5B3EF0] pl-3">
                  <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
                  {job.department && <p className="mt-0.5 text-sm text-slate-600">{job.department}</p>}
                </div>
                <Pill>{openingsLabel(job.open_positions)}</Pill>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {job.location && <Meta icon={<MapPin size={15} />}>{job.location}</Meta>}
                {job.employment_type && <Meta icon={<Briefcase size={15} />}>{job.employment_type}</Meta>}
                {job.experience && <Meta icon={<Clock3 size={15} />}>{job.experience}</Meta>}
                {posted && <Meta icon={<CalendarDays size={15} />}>{posted}</Meta>}
              </div>
            </div>
            <div className="flex shrink-0 gap-3">
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? <Check size={16} className="text-emerald-600" /> : <Link2 size={16} />} {copied ? "Link copied" : "Copy link"}
              </button>
              <button onClick={() => setApplying(true)} className="rounded-lg bg-[#5B3EF0] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#4A2FD8]">
                Apply Now
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full flex-1 grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card title="About the role">
            {job.description ? (
              <Description text={job.description} />
            ) : (
              <p className="text-sm text-slate-500">More details will be shared with shortlisted candidates.</p>
            )}
          </Card>

          <Card title="Experience">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEEAFE] text-[#5B3EF0]">
                <Clock3 size={20} />
              </span>
              <div>
                <p className="text-base font-semibold text-slate-900">{job.experience || "Open to all experience levels"}</p>
                <p className="text-sm text-slate-500">
                  {job.experience
                    ? `Relevant experience in ${job.department || "a similar role"} is expected.`
                    : "Freshers and experienced candidates are welcome to apply."}
                </p>
              </div>
            </div>
          </Card>

          <Card title="How to apply">
            <ol className="grid gap-4 sm:grid-cols-3">
              {HIRING_STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5B3EF0] text-xs font-semibold text-white">{i + 1}</span>
                    <span className="text-[#5B3EF0]">{s.icon}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{s.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.text}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Job details</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              {details.map((d) => <DetailRow key={d.label} {...d} />)}
            </dl>
            <button onClick={() => setApplying(true)} className={`${primaryBtn} mt-4`}>Apply Now</button>
          </section>

          {others.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Other open roles</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {others.map((o) => (
                  <li key={o.id}>
                    <Link to={`/jobs/${o.id}`} className="group block py-3">
                      <p className="text-sm font-medium text-slate-900 group-hover:text-[#5B3EF0]">{o.title}</p>
                      <p className="text-xs text-slate-500">{[o.department, o.location].filter(Boolean).join(" · ")}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/jobs" className="mt-2 inline-block text-sm font-medium text-[#5B3EF0] hover:underline">View all positions</Link>
            </section>
          )}
        </aside>
      </main>

      <CareersFooter />

      {applying && <ApplyModal job={job} onClose={() => setApplying(false)} />}
    </div>
  );
}
